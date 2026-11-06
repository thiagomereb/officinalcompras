import { createClient } from 'npm:@supabase/supabase-js@2.105.4'

const PROMPT_VISAO = `Você é um extrator especializado de tabelas de preços de insumos para farmácias de manipulação.
Analise o documento fornecido (imagem ou PDF) e extraia todos os produtos com seus preços.

INSTRUÇÕES DE LEITURA:
- Leia o documento inteiro, incluindo cabeçalho, rodapé e todas as páginas
- Identifique colunas mesmo que estejam mal alinhadas, mescladas ou com texto rotacionado
- Ignore linhas de cabeçalho, subtítulos, totais e linhas em branco — extraia apenas produtos reais com preço
- Se um item aparecer duplicado, mantenha o de menor preço e ignore os demais
- Números com vírgula decimal (ex: "1.200,50") devem ser convertidos para float (ex: 1200.50)

Retorne SOMENTE um JSON válido neste formato, sem texto antes ou depois:
{
  "fornecedor": {
    "nome": "Nome da empresa como aparece no documento",
    "cnpj": "00.000.000/0000-00",
    "data_tabela": "YYYY-MM-DD"
  },
  "itens": [
    {
      "descricao": "nome do produto como aparece no documento",
      "preco_unitario": 0.00,
      "quantidade_embalagem": 100,
      "quantidade": 1,
      "unidade": "g",
      "pais_origem": "Brasil",
      "ipi": 0,
      "st": 0,
      "validade": "2027-05-01"
    }
  ]
}

REGRAS DOS CAMPOS:
- preco_unitario: preço da embalagem/produto EXATAMENTE como aparece no documento — NÃO divida pelo tamanho da embalagem
- quantidade: quantidade do pedido (coluna "Qtde" ou similar); use 1 se não houver
- quantidade_embalagem: valor numérico da embalagem (ex: 100 para "100g", 500 para "500mL")
- unidade: use EXATAMENTE estas formas — "mg", "g", "kg", "mL", "L", "mcg", "UI", "un", "cáps", "comp" — NUNCA use variações como "GR", "Gr", "KG", "ML"
- pais_origem: país de origem se disponível; use null se não houver
- ipi: percentual como número (ex: 5 para 5%); use 0 se não informado
- st: percentual como número (ex: 12 para 12%); use 0 se não informado
- validade: formato YYYY-MM-DD; use null se não houver
- fornecedor.cnpj: use null se não houver
- fornecedor.data_tabela: use null se não houver

TRATAMENTO DE AMBIGUIDADE:
- Se um campo estiver ilegível ou rasurado, use null
- Se a unidade não se encaixar nas opções padronizadas, use "un"
- Se o documento não tiver nome de fornecedor identificável, use null
- Extraia TODOS os itens com preço visível, sem exceção`


type ItemOCR = {
  descricao: string
  preco_unitario: number
  quantidade_embalagem: number | null
  quantidade: number | null
  unidade: string | null
  pais_origem: string | null
  ipi: number | null
  st: number | null
  validade: string | null
}

// Por modelo. A Edge Function tem 150s de wall clock no total, então os dois
// modelos da lista cabem numa tentativa cada, ainda sobrando margem para o
// download da imagem. Medido: 9-29s por chamada.
const GEMINI_TIMEOUT_MS = 60_000
const GEMINI_MAX_RETRIES = 3
const MAX_FILE_BYTES = 5 * 1024 * 1024  // 5 MB
const RATE_LIMIT_RPM = 10
const RATE_LIMIT_RPD = 50
const USAGE_CHAVE = 'ocr-extrair'
// O limite diário vira à meia-noite de Brasília (UTC-3, sem horário de verão
// desde 2019), não à meia-noite UTC — que seria 21h para quem usa o sistema.
const OFFSET_BRASILIA_MS = 3 * 3600_000

function classify429(message: string): string {
  const msg = message.toLowerCase()
  if (msg.includes('free_tier') || msg.includes('free tier')) return 'Quota do plano gratuito do Gemini esgotada. É necessário ativar o faturamento em aistudio.google.com para continuar usando o OCR.'
  if (msg.includes('per minute') && msg.includes('token')) return 'Limite de tokens por minuto atingido. Aguarde 1 minuto e tente novamente.'
  if (msg.includes('per minute')) return 'Limite de requisições por minuto atingido. Aguarde 1 minuto e tente novamente.'
  if (msg.includes('per day') || msg.includes('daily')) return 'Limite diário de requisições atingido. Tente novamente amanhã.'
  return 'Quota da API Gemini excedida. Verifique o faturamento em aistudio.google.com.'
}

type UsageCheck = { bloqueado: false } | { bloqueado: true; mensagem: string; retryAfterMinutos: number }

async function verificarRateLimit(supabase: ReturnType<typeof createClient>): Promise<UsageCheck> {
  const agora = new Date()
  const umMinutoAtras = new Date(agora.getTime() - 60_000).toISOString()
  const agoraBrasilia = new Date(agora.getTime() - OFFSET_BRASILIA_MS)
  const inicioDiaMs =
    Date.UTC(agoraBrasilia.getUTCFullYear(), agoraBrasilia.getUTCMonth(), agoraBrasilia.getUTCDate()) +
    OFFSET_BRASILIA_MS
  const inicioDia = new Date(inicioDiaMs).toISOString()

  const [{ count: rpm }, { count: rpd }] = await Promise.all([
    supabase.from('api_usage_limits').select('*', { count: 'exact', head: true })
      .eq('chave', USAGE_CHAVE).gte('created_at', umMinutoAtras),
    supabase.from('api_usage_limits').select('*', { count: 'exact', head: true })
      .eq('chave', USAGE_CHAVE).gte('created_at', inicioDia),
  ])

  if ((rpm ?? 0) >= RATE_LIMIT_RPM) {
    console.warn(`[ocr-extrair] Circuit breaker RPM ativado: ${rpm}/${RATE_LIMIT_RPM} req/min`)
    return { bloqueado: true, mensagem: `Limite de processamento atingido (${RATE_LIMIT_RPM} por minuto). Aguarde 1 minuto.`, retryAfterMinutos: 1 }
  }
  if ((rpd ?? 0) >= RATE_LIMIT_RPD) {
    const horasRestantes = Math.ceil((inicioDiaMs + 24 * 3600_000 - agora.getTime()) / 3600_000)
    console.warn(`[ocr-extrair] Circuit breaker RPD ativado: ${rpd}/${RATE_LIMIT_RPD} req/dia`)
    return { bloqueado: true, mensagem: `Limite diário de processamento atingido (${RATE_LIMIT_RPD}/dia). Tente novamente em ~${horasRestantes}h.`, retryAfterMinutos: horasRestantes * 60 }
  }

  // Registra a requisição e limpa registros com mais de 2 dias
  await supabase.from('api_usage_limits').insert({ chave: USAGE_CHAVE })
  const { error: erroLimpeza } = await supabase.from('api_usage_limits').delete()
    .eq('chave', USAGE_CHAVE)
    .lt('created_at', new Date(agora.getTime() - 48 * 3600_000).toISOString())
  if (erroLimpeza) console.warn(`[ocr-extrair] limpeza de api_usage_limits falhou: ${erroLimpeza.message}`)

  return { bloqueado: false }
}

// Impede SSRF: só permite baixar de signed URLs do próprio bucket de storage
// deste projeto, nunca de um host arbitrário informado pelo caller.
function validarArquivoUrl(urlStr: unknown, supabaseUrl: string): string {
  if (typeof urlStr !== 'string') throw new Error('arquivo_url inválida.')

  let url: URL
  try {
    url = new URL(urlStr)
  } catch {
    throw new Error('arquivo_url inválida.')
  }

  const storageHost = new URL(supabaseUrl).host
  const isStorageUrl =
    url.protocol === 'https:' &&
    url.host === storageHost &&
    url.pathname.startsWith('/storage/v1/object/sign/cotacoes/')

  if (!isStorageUrl) {
    throw new Error('arquivo_url deve ser uma signed URL do storage deste projeto.')
  }

  return url.toString()
}

async function fetchGeminiWithRetry(url: string, apiKey: string, body: string, tentativa = 1): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS)

  let resp: Response
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body,
      signal: controller.signal,
    })
  } catch (err) {
    clearTimeout(timeoutId)
    if ((err as Error).name === 'AbortError') {
      throw new Error(
        `A IA não respondeu em ${GEMINI_TIMEOUT_MS / 1000}s. Tente uma imagem menor ou recorte a tabela em partes.`,
      )
    }
    throw err
  }
  clearTimeout(timeoutId)

  const retryCodes = new Set([429, 503, 529])

  if (retryCodes.has(resp.status) && tentativa <= GEMINI_MAX_RETRIES) {
    const errBody = await resp.json().catch(() => ({ error: { message: '' } }))
    const apiMsg = errBody?.error?.message ?? ''

    let motivo: string
    if (resp.status === 429) {
      motivo = classify429(apiMsg)
    } else {
      motivo = `${resp.status} — modelo sobrecarregado, tentando novamente`
    }

    const delay = Math.pow(2, tentativa) * 1000 + Math.random() * 1000
    console.warn(`[ocr-extrair] ${motivo} | tentativa ${tentativa}/${GEMINI_MAX_RETRIES} | aguardando ${Math.round(delay)}ms`)
    await new Promise((r) => setTimeout(r, delay))
    return fetchGeminiWithRetry(url, apiKey, body, tentativa + 1)
  }

  return resp
}

// Esta função é chamada direto do navegador, então TODA resposta precisa dos
// headers de CORS — inclusive as de erro, senão o browser bloqueia a resposta
// e o cliente recebe um "Failed to fetch" sem a mensagem real.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', ...extraHeaders },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS })
  }

  try {
    const apiKey = Deno.env.get('GEMINI_API_KEY')
    if (!apiKey) {
      return jsonResponse({ error: 'Secret GEMINI_API_KEY não configurado.' }, 500)
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
    const supabase = createClient(
      SUPABASE_URL,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // A anon key é pública (vai no bundle do app), então ela sozinha não pode
    // bastar para gastar a cota do Gemini: exige o JWT de um usuário logado.
    const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? ''
    const { data: auth } = token ? await supabase.auth.getUser(token) : { data: { user: null } }
    if (!auth.user) {
      return jsonResponse({ error: 'Sessão expirada. Entre novamente no sistema.' }, 401)
    }

    const { arquivo_url: arquivoUrlRaw, arquivo_nome } = await req.json()

    if (!arquivoUrlRaw || !arquivo_nome) {
      return jsonResponse({ error: 'arquivo_url e arquivo_nome são obrigatórios.' }, 400)
    }

    let arquivo_url: string
    try {
      arquivo_url = validarArquivoUrl(arquivoUrlRaw, SUPABASE_URL)
    } catch (err) {
      return jsonResponse({ error: (err as Error).message }, 400)
    }

    const ext = String(arquivo_nome).split('.').pop()?.toLowerCase() ?? ''
    const isImage = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)

    if (!isImage) {
      return jsonResponse(
        { error: `Formato "${ext}" não suportado. Envie como imagem (JPEG, PNG ou WebP).` },
        422,
      )
    }

    // 1. PRE-FLIGHT: verifica tamanho pelo Content-Length antes de baixar
    const headResp = await fetch(arquivo_url, { method: 'HEAD' })
    const contentLength = Number(headResp.headers.get('content-length') ?? 0)
    if (contentLength > MAX_FILE_BYTES) {
      const sizeMB = (contentLength / 1024 / 1024).toFixed(1)
      console.warn(`[ocr-extrair] Arquivo rejeitado: ${sizeMB}MB > limite de ${MAX_FILE_BYTES / 1024 / 1024}MB`)
      return jsonResponse(
        { error: `Arquivo muito grande (${sizeMB}MB). O limite é ${MAX_FILE_BYTES / 1024 / 1024}MB. Comprima a imagem ou divida o PDF em partes menores.` },
        400,
      )
    }

    // 2. CIRCUIT BREAKER: verifica rate limit antes de chamar a API
    const rateCheck = await verificarRateLimit(supabase)
    if (rateCheck.bloqueado) {
      return jsonResponse({ error: rateCheck.mensagem }, 429, {
        'Retry-After': String(rateCheck.retryAfterMinutos * 60),
      })
    }

    // Baixa a imagem e converte para base64
    const imgResp = await fetch(arquivo_url)
    if (!imgResp.ok) throw new Error(`Não foi possível baixar a imagem: ${imgResp.status}`)
    const imgBuffer = await imgResp.arrayBuffer()

    // Valida tamanho real após download (caso HEAD não tenha retornado Content-Length)
    if (imgBuffer.byteLength > MAX_FILE_BYTES) {
      const sizeMB = (imgBuffer.byteLength / 1024 / 1024).toFixed(1)
      return jsonResponse(
        { error: `Arquivo muito grande (${sizeMB}MB). O limite é ${MAX_FILE_BYTES / 1024 / 1024}MB. Comprima a imagem ou divida o PDF em partes menores.` },
        400,
      )
    }
    const bytes = new Uint8Array(imgBuffer)
    let binary = ''
    const chunkSize = 8192
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
    }
    const imgBase64 = btoa(binary)
    const mimeMap: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' }
    const mimeType = mimeMap[ext] ?? 'image/jpeg'

    const requestBody = JSON.stringify({
      contents: [{
        parts: [
          { text: PROMPT_VISAO },
          { inline_data: { mime_type: mimeType, data: imgBase64 } },
        ],
      }],
      generationConfig: {
        response_mime_type: 'application/json',
        temperature: 0,
        // O 2.5-flash liga "thinking" por padrão, o que dobrava/triplicava a
        // latência e estourava o timeout. Extrair tabela é tarefa de leitura,
        // não de raciocínio — budget 0 desliga e volta a responder rápido.
        thinkingConfig: { thinkingBudget: 0 },
      },
    })

    // Medido nesta base de tabelas: o 3.1-flash-lite extrai os mesmos itens que
    // o 3.5-flash em ~1/3 do tempo (9-19s contra 28-29s), e o 2.5-flash chegava
    // a estourar 110s na mesma imagem. O 3.5-flash fica como reserva de
    // qualidade. Evite voltar para 2.5-flash-lite: foi descontinuado e responde
    // 400 "no longer available to new users".
    const MODELOS = ['gemini-3.1-flash-lite', 'gemini-3.5-flash']
    let geminiResp: Response | null = null
    let ultimoErro: Error | null = null

    for (const modelo of MODELOS) {
      try {
        const r = await fetchGeminiWithRetry(
          `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`,
          apiKey,
          requestBody,
        )
        if (r.status === 503 || r.status === 529) {
          console.warn(`[ocr-extrair] ${modelo} sobrecarregado, tentando próximo modelo...`)
          continue
        }
        geminiResp = r
        break
      } catch (err) {
        // Timeout ou falha de rede não devem abortar tudo: o próximo modelo da
        // lista ainda pode dar conta.
        ultimoErro = err as Error
        console.warn(`[ocr-extrair] ${modelo} falhou: ${ultimoErro.message}`)
      }
    }

    if (!geminiResp) {
      return jsonResponse(
        {
          error:
            ultimoErro?.message ??
            'Todos os modelos de IA estão sobrecarregados no momento. Tente novamente em alguns minutos.',
        },
        503,
      )
    }

    if (!geminiResp.ok) {
      const errBody = await geminiResp.json().catch(() => ({ error: { message: '' } }))
      const apiMsg = errBody?.error?.message ?? ''
      if (geminiResp.status === 429) {
        const motivo = classify429(apiMsg)
        console.error(`[ocr-extrair] Esgotadas ${GEMINI_MAX_RETRIES} retentativas. ${motivo} | mensagem: ${apiMsg}`)
        return jsonResponse({ error: `${motivo}. Tente novamente em alguns minutos.` }, 429, {
          'Retry-After': '120',
        })
      }
      if (geminiResp.status === 503 || geminiResp.status === 529) {
        console.error(`[ocr-extrair] Modelo sobrecarregado após ${GEMINI_MAX_RETRIES} tentativas. status=${geminiResp.status}`)
        return jsonResponse(
          { error: 'O modelo de IA está com alta demanda no momento. Aguarde alguns segundos e tente novamente.' },
          503,
          { 'Retry-After': '30' },
        )
      }
      console.error(`[ocr-extrair] Erro da API Gemini status=${geminiResp.status} | mensagem: ${apiMsg}`)
      throw new Error(apiMsg || `Gemini retornou status ${geminiResp.status}`)
    }

    const geminiData = await geminiResp.json()
    const candidate = geminiData?.candidates?.[0]
    const content = candidate?.content?.parts?.[0]?.text
    const finishReason: string = candidate?.finishReason ?? 'UNKNOWN'
    const usage = geminiData?.usageMetadata ?? {}

    console.log(`[ocr-extrair] sucesso | finishReason=${finishReason} | promptTokens=${usage.promptTokenCount} | candidatesTokens=${usage.candidatesTokenCount} | totalTokens=${usage.totalTokenCount}`)

    // Resposta cortada vem com JSON incompleto; melhor uma mensagem acionável
    // do que o "Unexpected end of JSON input" do parse
    if (finishReason === 'MAX_TOKENS') {
      console.warn('[ocr-extrair] resposta cortada por MAX_TOKENS')
      return jsonResponse(
        { error: 'A tabela tem itens demais para uma única leitura. Divida o arquivo em partes menores (ex: recorte a imagem ao meio) e envie cada uma.' },
        422,
      )
    }

    if (!content) throw new Error('O modelo não retornou nenhuma resposta.')

    let parsed: { itens?: unknown; fornecedor?: unknown }
    try {
      parsed = JSON.parse(content)
    } catch {
      throw new Error('A IA devolveu uma resposta em formato inválido. Tente novamente.')
    }
    if (!Array.isArray(parsed.itens)) throw new Error('Formato de resposta inesperado.')

    const itensOCR = (parsed.itens as ItemOCR[]).filter(
      (i) => i.descricao && typeof i.preco_unitario === 'number' && i.preco_unitario > 0,
    )

    if (itensOCR.length === 0) throw new Error('Nenhum item com preço encontrado no documento.')

    return jsonResponse({ itens: itensOCR, fornecedor: parsed.fornecedor ?? null })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro inesperado.'
    console.error(`[ocr-extrair] erro fatal: ${msg}`)
    return jsonResponse({ error: msg }, 500)
  }
})
