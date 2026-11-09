import { createClient } from 'npm:@supabase/supabase-js@2.105.4'

// Lê uma página do orçamento de um fornecedor e liga cada item ao produto que
// a farmácia pediu na cotação própria, numa chamada só ao Gemini.
//
// O navegador manda a página como TEXTO (PDF com texto, planilha) — mais
// rápido e exato que imagem — ou como IMAGEM (PDF escaneado, foto). O preço por
// g/mL não é pedido à IA: ela devolve o total do item e as embalagens, e o app
// faz a conta (lib/orcamento.ts), o que evita confundir preço por kg com preço
// da embalagem.
//
// Medido com orçamentos reais (Fagron, 102 itens; Galena, 31): o
// gemini-3.5-flash leu todos os itens e a soma bateu com o total do documento;
// o 3.1-flash-lite pulou itens quando também tinha de vincular, por isso não
// entra como reserva. Uma página por chamada mantém cada uma bem abaixo dos
// 150s da Edge Function.

const MODELO = 'gemini-3.5-flash'
const GEMINI_TIMEOUT_MS = 110_000
const GEMINI_MAX_RETRIES = 2
const MAX_TEXTO = 60_000
const MAX_IMAGEM_BYTES = 5 * 1024 * 1024
const RATE_LIMIT_RPM = 20
const RATE_LIMIT_RPD = 400
const USAGE_CHAVE = 'ler-orcamento'
// Sinônimos por produto mandados à IA (o suficiente para reconhecer, sem inchar o prompt)
const MAX_SINONIMOS = 10
const OFFSET_BRASILIA_MS = 3 * 3600_000

const INSTRUCOES = `Você lê orçamentos de fornecedores de insumos para uma farmácia de manipulação e liga cada item ao produto que a farmácia pediu.

Você recebe:
1. PRODUTOS PEDIDOS: a lista da farmácia, "código | nome | também: sinônimos" (o [x%] é o teor do produto em estoque; os sinônimos são outros nomes do mesmo produto, inclusive descrições de fornecedores já confirmadas pela farmácia — se a descrição do orçamento bater com um sinônimo, é esse produto).
2. Uma página do ORÇAMENTO do fornecedor: em texto, linha a linha, com " | " separando as colunas (descrições longas podem continuar na linha de cima ou de baixo — junte-as), ou em imagem.

Extraia TODOS os itens com preço desta página, um por linha da tabela. Se o mesmo produto aparecer em embalagens diferentes (ex.: 1 KG e 5 KG), devolva cada embalagem como um item separado.

Campos de cada item:
- descricao: como está no orçamento (sem o tamanho da embalagem quando ele vier no fim, ex.: "- 0,250 KG")
- embalagem_quantidade e embalagem_unidade: o tamanho de UMA embalagem (ex.: 100 e "g" para "100 G"; 0.25 e "kg" para "- 0,250 KG" na descrição; 5 e "mil" para "5 MIL" cápsulas; 5.385 e "kg" para "5,385K"). Unidade: "mg", "g", "kg", "mL", "L", "un", "mil" ou "UI".
- quantidade_embalagens: quantas embalagens desse tamanho foram cotadas (ex.: Quant. 4,00 de 250 g = 4; Qtd. 0,2500 KG com embalagem de 0,250 KG = 1)
- valor_total: o total do item SEM impostos, como aparece ("Total do Item", "Valor Item")
- validade (AAAA-MM-DD), pais_origem, ipi (%), st (%): null/0 se não houver
- codigo_pedido: o código do produto pedido que é o MESMO produto, ou null. Mesmo produto = mesma substância e mesma forma; ignore marca, embalagem e grafia. Sal, forma (pó, solução, extrato seco, glicólico), teor/padronização e uso (interno/externo) podem fazer de dois itens produtos diferentes: na dúvida entre variantes, escolha a que corresponde e explique em obs. Não chute: se não foi pedido, null.
- obs: até 12 palavras, só quando houver ressalva no vínculo (forma, teor, sal) ou quando codigo_pedido for null e houver um pedido parecido.

Cabeçalho (null no que não aparecer nesta página): fornecedor_nome (a marca/nome com que o FORNECEDOR se apresenta, ex.: "Fagron Brazil") e fornecedor_razao_social (a razão social dele, se aparecer) — nunca os da farmácia cliente; numero do orçamento, data (AAAA-MM-DD), cnpj do FORNECEDOR (não o da farmácia), validade da proposta como texto, pedido_minimo (R$), frete ("CIF", "FOB" ou null) e o total do documento.`

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    fornecedor_nome: { type: 'STRING', nullable: true },
    fornecedor_razao_social: { type: 'STRING', nullable: true },
    numero: { type: 'STRING', nullable: true },
    data: { type: 'STRING', nullable: true },
    cnpj: { type: 'STRING', nullable: true },
    validade_proposta: { type: 'STRING', nullable: true },
    pedido_minimo: { type: 'NUMBER', nullable: true },
    frete: { type: 'STRING', nullable: true },
    total_documento: { type: 'NUMBER', nullable: true },
    itens: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          descricao: { type: 'STRING' },
          embalagem_quantidade: { type: 'NUMBER' },
          embalagem_unidade: { type: 'STRING' },
          quantidade_embalagens: { type: 'NUMBER' },
          valor_total: { type: 'NUMBER' },
          validade: { type: 'STRING', nullable: true },
          pais_origem: { type: 'STRING', nullable: true },
          ipi: { type: 'NUMBER', nullable: true },
          st: { type: 'NUMBER', nullable: true },
          codigo_pedido: { type: 'STRING', nullable: true },
          obs: { type: 'STRING', nullable: true },
        },
        required: ['descricao', 'embalagem_quantidade', 'embalagem_unidade', 'quantidade_embalagens', 'valor_total', 'codigo_pedido'],
      },
    },
  },
  required: ['itens'],
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', ...extra },
  })
}

function classify429(message: string): string {
  const msg = message.toLowerCase()
  if (msg.includes('free_tier') || msg.includes('free tier')) return 'Quota do plano gratuito do Gemini esgotada. É preciso ativar o faturamento em aistudio.google.com.'
  if (msg.includes('per minute')) return 'Limite por minuto da IA atingido. Aguarde 1 minuto.'
  if (msg.includes('per day') || msg.includes('daily')) return 'Limite diário da IA atingido. Tente novamente amanhã.'
  return 'Quota da API Gemini excedida.'
}

type Supabase = ReturnType<typeof createClient>

async function verificarRateLimit(supabase: Supabase): Promise<string | null> {
  const agora = new Date()
  const agoraBrasilia = new Date(agora.getTime() - OFFSET_BRASILIA_MS)
  const inicioDia = new Date(
    Date.UTC(agoraBrasilia.getUTCFullYear(), agoraBrasilia.getUTCMonth(), agoraBrasilia.getUTCDate()) + OFFSET_BRASILIA_MS,
  ).toISOString()
  const [{ count: rpm }, { count: rpd }] = await Promise.all([
    supabase.from('api_usage_limits').select('*', { count: 'exact', head: true })
      .eq('chave', USAGE_CHAVE).gte('created_at', new Date(agora.getTime() - 60_000).toISOString()),
    supabase.from('api_usage_limits').select('*', { count: 'exact', head: true })
      .eq('chave', USAGE_CHAVE).gte('created_at', inicioDia),
  ])
  if ((rpm ?? 0) >= RATE_LIMIT_RPM) return `Limite de leitura atingido (${RATE_LIMIT_RPM} páginas por minuto). Aguarde 1 minuto.`
  if ((rpd ?? 0) >= RATE_LIMIT_RPD) return `Limite diário de leitura atingido (${RATE_LIMIT_RPD} páginas). Tente novamente amanhã.`

  await supabase.from('api_usage_limits').insert({ chave: USAGE_CHAVE })
  await supabase.from('api_usage_limits').delete()
    .eq('chave', USAGE_CHAVE).lt('created_at', new Date(agora.getTime() - 48 * 3600_000).toISOString())
  return null
}

// Só aceita signed URLs do bucket do próprio projeto (evita SSRF)
function validarImagemUrl(urlStr: unknown, supabaseUrl: string): string | null {
  if (typeof urlStr !== 'string') return null
  try {
    const url = new URL(urlStr)
    const ok = url.protocol === 'https:' && url.host === new URL(supabaseUrl).host &&
      url.pathname.startsWith('/storage/v1/object/sign/cotacoes/')
    return ok ? url.toString() : null
  } catch {
    return null
  }
}

async function chamarGemini(apiKey: string, body: string, tentativa = 1): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS)
  let resp: Response
  try {
    resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body,
      signal: controller.signal,
    })
  } catch (err) {
    clearTimeout(timeout)
    if ((err as Error).name === 'AbortError') throw new Error(`A IA não respondeu em ${GEMINI_TIMEOUT_MS / 1000}s.`)
    throw err
  }
  clearTimeout(timeout)

  if ([429, 503, 529].includes(resp.status) && tentativa <= GEMINI_MAX_RETRIES) {
    const atraso = Math.pow(2, tentativa) * 1500 + Math.random() * 1000
    console.warn(`[ler-orcamento] status ${resp.status}, tentativa ${tentativa}, aguardando ${Math.round(atraso)}ms`)
    await new Promise((r) => setTimeout(r, atraso))
    return chamarGemini(apiKey, body, tentativa + 1)
  }
  return resp
}

function base64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binario = ''
  for (let i = 0; i < bytes.length; i += 8192) binario += String.fromCharCode(...bytes.subarray(i, i + 8192))
  return btoa(binario)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS })

  try {
    const apiKey = Deno.env.get('GEMINI_API_KEY')
    if (!apiKey) return jsonResponse({ error: 'Secret GEMINI_API_KEY não configurado.' }, 500)

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
    const supabase = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    // A anon key é pública: só usuário logado gasta a cota do Gemini
    const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? ''
    const { data: auth } = token ? await supabase.auth.getUser(token) : { data: { user: null } }
    if (!auth.user) return jsonResponse({ error: 'Sessão expirada. Entre novamente no sistema.' }, 401)

    const { cotacao_propria_id, pagina, total_paginas, texto, imagem_url, imagem_tipo } = await req.json()
    if (typeof cotacao_propria_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(cotacao_propria_id)) {
      return jsonResponse({ error: 'cotacao_propria_id inválido.' }, 400)
    }
    const temTexto = typeof texto === 'string' && texto.trim().length > 0
    const imagemUrl = temTexto ? null : validarImagemUrl(imagem_url, SUPABASE_URL)
    if (!temTexto && !imagemUrl) return jsonResponse({ error: 'Envie o texto ou a imagem da página.' }, 400)
    if (temTexto && texto.length > MAX_TEXTO) return jsonResponse({ error: 'Página com texto demais para uma leitura.' }, 400)

    const { data: pedidos, error: erroPedidos } = await supabase
      .from('cotacao_propria_itens')
      .select('codigo, nome, teor, insumo_id')
      .eq('cotacao_propria_id', cotacao_propria_id)
      .order('ordem')
    if (erroPedidos) throw new Error(erroPedidos.message)
    if (!pedidos?.length) return jsonResponse({ error: 'Cotação própria sem produtos.' }, 404)

    const bloqueio = await verificarRateLimit(supabase)
    if (bloqueio) return jsonResponse({ error: bloqueio }, 429, { 'Retry-After': '60' })

    // Sinônimos do insumo de cada produto pedido (inclusive os aprendidos com
    // as correções do comprador): é por eles que muita descrição de fornecedor bate
    const insumos = [...new Set(pedidos.map((p) => p.insumo_id))]
    const sinonimosPorInsumo = new Map<string, string[]>()
    for (let i = 0; i < insumos.length; i += 100) {
      const { data: sins, error: erroSins } = await supabase
        .from('insumo_sinonimos')
        .select('insumo_id, sinonimo')
        .in('insumo_id', insumos.slice(i, i + 100))
        // Os mais novos primeiro: os aprendidos com as correções entram antes do limite
        .order('created_at', { ascending: false })
      if (erroSins) throw new Error(erroSins.message)
      for (const s of sins ?? []) {
        const lista = sinonimosPorInsumo.get(s.insumo_id) ?? []
        if (lista.length < MAX_SINONIMOS && s.sinonimo.length <= 80) lista.push(s.sinonimo)
        sinonimosPorInsumo.set(s.insumo_id, lista)
      }
    }

    const lista = pedidos
      .map((p) => {
        const teor = p.teor != null && Number(p.teor) !== 100 ? ` [${Number(p.teor)}%]` : ''
        const sins = sinonimosPorInsumo.get(p.insumo_id) ?? []
        return `${p.codigo} | ${p.nome}${teor}${sins.length ? ` | também: ${sins.join('; ')}` : ''}`
      })
      .join('\n')
    const cabecalhoPagina = `ORÇAMENTO — página ${Number(pagina) || 1} de ${Number(total_paginas) || 1}`

    const partes: unknown[] = [{ text: `PRODUTOS PEDIDOS\n${lista}\n\n${cabecalhoPagina}` }]
    if (temTexto) {
      partes.push({ text: texto })
    } else {
      const img = await fetch(imagemUrl!)
      if (!img.ok) throw new Error(`Não foi possível baixar a imagem: ${img.status}`)
      const buffer = await img.arrayBuffer()
      if (buffer.byteLength > MAX_IMAGEM_BYTES) return jsonResponse({ error: 'Imagem acima de 5 MB.' }, 400)
      const tipo = ['image/jpeg', 'image/png', 'image/webp'].includes(imagem_tipo) ? imagem_tipo : 'image/jpeg'
      partes.push({ inline_data: { mime_type: tipo, data: base64(buffer) } })
    }

    const resp = await chamarGemini(apiKey, JSON.stringify({
      systemInstruction: { parts: [{ text: INSTRUCOES }] },
      contents: [{ role: 'user', parts: partes }],
      generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: SCHEMA },
    }))

    if (!resp.ok) {
      const corpo = await resp.json().catch(() => ({ error: { message: '' } }))
      const msg = corpo?.error?.message ?? ''
      if (resp.status === 429) return jsonResponse({ error: classify429(msg) }, 429, { 'Retry-After': '60' })
      if (resp.status === 503 || resp.status === 529) {
        return jsonResponse({ error: 'A IA está com alta demanda agora. Tentando de novo…' }, 503, { 'Retry-After': '20' })
      }
      throw new Error(msg || `Gemini retornou status ${resp.status}`)
    }

    const dados = await resp.json()
    const candidato = dados?.candidates?.[0]
    const usage = dados?.usageMetadata ?? {}
    console.log(`[ler-orcamento] ${cabecalhoPagina} | ${temTexto ? 'texto' : 'imagem'} | finish=${candidato?.finishReason} | in=${usage.promptTokenCount} out=${usage.candidatesTokenCount} thoughts=${usage.thoughtsTokenCount ?? 0}`)
    if (candidato?.finishReason === 'MAX_TOKENS') {
      return jsonResponse({ error: 'Página com itens demais para uma leitura. Divida o arquivo.' }, 422)
    }
    const conteudo = candidato?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('')
    if (!conteudo) throw new Error('A IA não devolveu resposta.')

    let lido: { itens?: unknown[] } & Record<string, unknown>
    try {
      lido = JSON.parse(conteudo)
    } catch {
      throw new Error('A IA devolveu uma resposta em formato inválido. Tente de novo.')
    }
    if (!Array.isArray(lido.itens)) throw new Error('Resposta da IA sem itens.')

    // Código que não está na lista da cotação vira "sem vínculo", nunca um vínculo inventado
    const codigos = new Set(pedidos.map((p) => p.codigo))
    const itens = (lido.itens as Record<string, unknown>[])
      .filter((i) => typeof i.descricao === 'string' && Number(i.valor_total) > 0 &&
        Number(i.embalagem_quantidade) > 0 && Number(i.quantidade_embalagens) > 0)
      .map((i) => ({ ...i, codigo_pedido: codigos.has(String(i.codigo_pedido)) ? String(i.codigo_pedido) : null }))

    return jsonResponse({ ...lido, itens })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro inesperado.'
    console.error(`[ler-orcamento] erro: ${msg}`)
    return jsonResponse({ error: msg }, 500)
  }
})
