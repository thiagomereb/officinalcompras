import { createClient } from 'npm:@supabase/supabase-js'

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
      "validade": "2027-05-01",
      "cas": "50-00-0"
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
- cas: número CAS (ex: "50-00-0"); use null se não houver
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
  cas: string | null
}

type ItemEnriquecido = ItemOCR & {
  insumo_id: string | null
  insumo_sugerido: string | null
  similaridade: number | null
}

const SIMILARIDADE_MINIMA = 0.35

async function matchInsumo(
  supabase: ReturnType<typeof createClient>,
  descricao: string,
): Promise<{ insumo_id: string | null; insumo_sugerido: string | null; similaridade: number | null }> {
  const { data, error } = await supabase.rpc('buscar_insumo_por_descricao', {
    p_descricao: descricao,
    p_limite: 1,
  })

  if (error) {
    console.warn(`[matchInsumo] erro na busca: ${error.message}`)
    return { insumo_id: null, insumo_sugerido: null, similaridade: null }
  }

  const melhor = data?.[0]
  if (!melhor || melhor.similaridade < SIMILARIDADE_MINIMA) {
    return { insumo_id: null, insumo_sugerido: null, similaridade: null }
  }

  return {
    insumo_id: melhor.insumo_id,
    insumo_sugerido: melhor.nome_padrao,
    similaridade: melhor.similaridade,
  }
}

function jaroWinkler(s1: string, s2: string): number {
  if (s1 === s2) return 1
  const len1 = s1.length, len2 = s2.length
  const matchDist = Math.max(Math.floor(Math.max(len1, len2) / 2) - 1, 0)
  const s1Matches = new Array(len1).fill(false)
  const s2Matches = new Array(len2).fill(false)
  let matches = 0, transpositions = 0
  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - matchDist)
    const end = Math.min(i + matchDist + 1, len2)
    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue
      s1Matches[i] = s2Matches[j] = true
      matches++
      break
    }
  }
  if (!matches) return 0
  let k = 0
  for (let i = 0; i < len1; i++) {
    if (!s1Matches[i]) continue
    while (!s2Matches[k]) k++
    if (s1[i] !== s2[k]) transpositions++
    k++
  }
  const jaro = (matches / len1 + matches / len2 + (matches - transpositions / 2) / matches) / 3
  let prefix = 0
  for (let i = 0; i < Math.min(4, Math.min(len1, len2)); i++) {
    if (s1[i] === s2[i]) prefix++; else break
  }
  return jaro + prefix * 0.1 * (1 - jaro)
}


const GEMINI_TIMEOUT_MS = 60_000
const GEMINI_MAX_RETRIES = 3
const MAX_FILE_BYTES = 5 * 1024 * 1024  // 5 MB
const RATE_LIMIT_RPM = 10
const RATE_LIMIT_RPD = 50
const USAGE_CHAVE = 'ocr-extrair'

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
  const inicioDia = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate()).toISOString()

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
    const horasRestantes = 24 - agora.getHours()
    console.warn(`[ocr-extrair] Circuit breaker RPD ativado: ${rpd}/${RATE_LIMIT_RPD} req/dia`)
    return { bloqueado: true, mensagem: `Limite diário de processamento atingido (${RATE_LIMIT_RPD}/dia). Tente novamente em ~${horasRestantes}h.`, retryAfterMinutos: horasRestantes * 60 }
  }

  // Registra a requisição e limpa registros com mais de 2 dias
  await supabase.from('api_usage_limits').insert({ chave: USAGE_CHAVE })
  supabase.from('api_usage_limits').delete()
    .eq('chave', USAGE_CHAVE)
    .lt('created_at', new Date(agora.getTime() - 48 * 3600_000).toISOString())

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

async function fetchGeminiWithRetry(url: string, body: string, tentativa = 1): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS)

  let resp: Response
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: controller.signal,
    })
  } catch (err) {
    clearTimeout(timeoutId)
    if ((err as Error).name === 'AbortError') {
      throw new Error(`Timeout: Gemini não respondeu em ${GEMINI_TIMEOUT_MS / 1000}s`)
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
    return fetchGeminiWithRetry(url, body, tentativa + 1)
  }

  return resp
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    })
  }

  try {
    const apiKey = Deno.env.get('GEMINI_API_KEY')
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'Secret GEMINI_API_KEY não configurado.' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      )
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
    const supabase = createClient(
      SUPABASE_URL,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { arquivo_url: arquivoUrlRaw, arquivo_nome } = await req.json()

    if (!arquivoUrlRaw || !arquivo_nome) {
      return new Response(
        JSON.stringify({ error: 'arquivo_url e arquivo_nome são obrigatórios.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      )
    }

    let arquivo_url: string
    try {
      arquivo_url = validarArquivoUrl(arquivoUrlRaw, SUPABASE_URL)
    } catch (err) {
      return new Response(
        JSON.stringify({ error: (err as Error).message }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      )
    }

    const ext = String(arquivo_nome).split('.').pop()?.toLowerCase() ?? ''
    const isImage = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)

    if (!isImage) {
      return new Response(
        JSON.stringify({ error: `Formato "${ext}" não suportado. Envie como imagem (JPEG, PNG ou WebP).` }),
        { status: 422, headers: { 'Content-Type': 'application/json' } },
      )
    }

    // 1. PRE-FLIGHT: verifica tamanho pelo Content-Length antes de baixar
    const headResp = await fetch(arquivo_url, { method: 'HEAD' })
    const contentLength = Number(headResp.headers.get('content-length') ?? 0)
    if (contentLength > MAX_FILE_BYTES) {
      const sizeMB = (contentLength / 1024 / 1024).toFixed(1)
      console.warn(`[ocr-extrair] Arquivo rejeitado: ${sizeMB}MB > limite de ${MAX_FILE_BYTES / 1024 / 1024}MB`)
      return new Response(
        JSON.stringify({ error: `Arquivo muito grande (${sizeMB}MB). O limite é ${MAX_FILE_BYTES / 1024 / 1024}MB. Comprima a imagem ou divida o PDF em partes menores.` }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      )
    }

    // 2. CIRCUIT BREAKER: verifica rate limit antes de chamar a API
    const rateCheck = await verificarRateLimit(supabase)
    if (rateCheck.bloqueado) {
      return new Response(
        JSON.stringify({ error: rateCheck.mensagem }),
        { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': String(rateCheck.retryAfterMinutos * 60) } },
      )
    }

    // Baixa a imagem e converte para base64
    const imgResp = await fetch(arquivo_url)
    if (!imgResp.ok) throw new Error(`Não foi possível baixar a imagem: ${imgResp.status}`)
    const imgBuffer = await imgResp.arrayBuffer()

    // Valida tamanho real após download (caso HEAD não tenha retornado Content-Length)
    if (imgBuffer.byteLength > MAX_FILE_BYTES) {
      const sizeMB = (imgBuffer.byteLength / 1024 / 1024).toFixed(1)
      return new Response(
        JSON.stringify({ error: `Arquivo muito grande (${sizeMB}MB). O limite é ${MAX_FILE_BYTES / 1024 / 1024}MB. Comprima a imagem ou divida o PDF em partes menores.` }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
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
      },
    })

    // gemini-2.0-flash e gemini-1.5-flash foram desativados pelo Google — ambos
    // devolvem 404 hoje. Modelos abaixo têm tier gratuito confirmado na API.
    const MODELOS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite']
    let geminiResp: Response | null = null

    for (const modelo of MODELOS) {
      const r = await fetchGeminiWithRetry(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${apiKey}`,
        requestBody,
      )
      if (r.status === 503 || r.status === 529) {
        console.warn(`[ocr-extrair] ${modelo} sobrecarregado, tentando próximo modelo...`)
        continue
      }
      geminiResp = r
      break
    }

    if (!geminiResp) {
      return new Response(
        JSON.stringify({ error: 'Todos os modelos de IA estão sobrecarregados no momento. Tente novamente em alguns minutos.' }),
        { status: 503, headers: { 'Content-Type': 'application/json' } },
      )
    }

    if (!geminiResp.ok) {
      const errBody = await geminiResp.json().catch(() => ({ error: { message: '' } }))
      const apiMsg = errBody?.error?.message ?? ''
      if (geminiResp.status === 429) {
        const motivo = classify429(apiMsg)
        console.error(`[ocr-extrair] Esgotadas ${GEMINI_MAX_RETRIES} retentativas. ${motivo} | mensagem: ${apiMsg}`)
        return new Response(
          JSON.stringify({ error: `${motivo}. Tente novamente em alguns minutos.` }),
          { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': '120' } },
        )
      }
      if (geminiResp.status === 503 || geminiResp.status === 529) {
        console.error(`[ocr-extrair] Modelo sobrecarregado após ${GEMINI_MAX_RETRIES} tentativas. status=${geminiResp.status}`)
        return new Response(
          JSON.stringify({ error: 'O modelo de IA está com alta demanda no momento. Aguarde alguns segundos e tente novamente.' }),
          { status: 503, headers: { 'Content-Type': 'application/json', 'Retry-After': '30' } },
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

    if (finishReason === 'MAX_TOKENS') {
      console.warn('[ocr-extrair] ALERTA: resposta cortada por MAX_TOKENS — JSON pode estar incompleto')
    }

    if (!content) throw new Error('O modelo não retornou nenhuma resposta.')

    const parsed = JSON.parse(content) as { itens?: unknown; fornecedor?: unknown }
    if (!Array.isArray(parsed.itens)) throw new Error('Formato de resposta inesperado.')

    const itensOCR = (parsed.itens as ItemOCR[]).filter(
      (i) => i.descricao && typeof i.preco_unitario === 'number' && i.preco_unitario > 0,
    )

    if (itensOCR.length === 0) throw new Error('Nenhum item com preço encontrado no documento.')

    const itens: ItemEnriquecido[] = await Promise.all(
      itensOCR.map(async (item) => {
        const match = await matchInsumo(supabase, item.descricao)
        return { ...item, ...match }
      }),
    )

    return new Response(JSON.stringify({ itens, fornecedor: parsed.fornecedor ?? null }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro inesperado.'
    console.error(`[ocr-extrair] erro fatal: ${msg}`)
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
