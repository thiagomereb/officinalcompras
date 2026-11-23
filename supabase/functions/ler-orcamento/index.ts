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
//
// Reserva: se o Gemini estiver sobrecarregado, sem cota ou não responder, a
// mesma página vai para a OpenAI (secret OPENAI_API_KEY), com as mesmas
// instruções e o mesmo formato de resposta. Sem o secret, não há reserva.

const MODELO = 'gemini-3.5-flash'
// Uma página leva 20–60s; com a IA sobrecarregada passa de 100s. Cabe nos 150s
// do worker (a conta da vida dele abaixo corta antes, se for preciso).
const GEMINI_TIMEOUT_MS = 130_000
// Com reserva, desiste do Gemini antes, para sobrar tempo para ela
const GEMINI_TIMEOUT_COM_RESERVA_MS = 90_000
const OPENAI_MODELO = Deno.env.get('OPENAI_MODEL') || 'gpt-6.2-sol'
const OPENAI_TIMEOUT_MS = 120_000
// Com menos vida que isso no worker, a reserva fica para a próxima tentativa
const MINIMO_RESERVA_MS = 35_000
// Uma repetição rápida para um soluço da IA; alta demanda mais longa quem
// espera é o navegador (Retry-After), fora do relógio da função
const GEMINI_MAX_RETRIES = 1
// O worker da Edge Function vive 150s desde que sobe e atende várias chamadas
// em sequência; chamada que ainda está rodando quando ele chega ao limite é
// cortada (status 546). Por isso a leitura conta o tempo do worker, não só o
// da chamada.
const VIDA_WORKER_MS = 150_000
const FOLGA_WORKER_MS = 5_000
// Com menos que isso de vida, a página não começa neste worker
const MINIMO_PARA_LER_MS = 25_000
const INICIO_WORKER = Date.now()
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
  // Sem isto o navegador não enxerga o Retry-After e repete sem esperar
  'Access-Control-Expose-Headers': 'Retry-After',
}

function jsonResponse(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', ...extra },
  })
}

// Peça para o navegador tentar de novo daqui a tantos segundos. reserva: a
// próxima tentativa desta página deve ir direto para a IA reserva.
function tenteDepois(error: string, status: number, segundos: number, reserva = false) {
  // reserva vai sempre (true ou false): false faz o navegador voltar ao Gemini
  return jsonResponse({ error, retry_after: segundos, reserva }, status, {
    'Retry-After': String(segundos),
  })
}

function vidaRestante(): number {
  const idade = Date.now() - INICIO_WORKER
  // Worker que passou do limite conhecido: o limite mudou, não há o que contar
  if (idade > VIDA_WORKER_MS + 10_000) return Infinity
  return VIDA_WORKER_MS - FOLGA_WORKER_MS - idade
}

// Segundos até este worker ser trocado, mais uma folga
const esperaPeloWorker = () => Math.max(1, Math.ceil(vidaRestante() / 1000) + FOLGA_WORKER_MS / 1000 + 2)

class TempoDoWorker extends Error {}
// A IA não respondeu no tempo: é sobrecarga dela, o navegador tenta de novo
class IaDemorou extends Error {}

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

async function chamarGemini(apiKey: string, body: string, timeoutMs: number, tentativa = 1): Promise<Response> {
  const limite = Math.min(timeoutMs, vidaRestante())
  if (limite < MINIMO_PARA_LER_MS) throw new TempoDoWorker()
  const porTempoDoWorker = limite < timeoutMs
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), limite)
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
    if ((err as Error).name === 'AbortError') {
      if (porTempoDoWorker) throw new TempoDoWorker()
      throw new IaDemorou()
    }
    throw err
  }
  clearTimeout(timeout)

  if ([429, 503, 529].includes(resp.status) && tentativa <= GEMINI_MAX_RETRIES) {
    await resp.body?.cancel()
    const atraso = 2000 + Math.random() * 1000
    console.warn(`[ler-orcamento] status ${resp.status}, tentativa ${tentativa}, aguardando ${Math.round(atraso)}ms`)
    await new Promise((r) => setTimeout(r, atraso))
    return chamarGemini(apiKey, body, timeoutMs, tentativa + 1)
  }
  return resp
}

function base64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binario = ''
  for (let i = 0; i < bytes.length; i += 8192) binario += String.fromCharCode(...bytes.subarray(i, i + 8192))
  return btoa(binario)
}

// O que vai para a IA: a lista de produtos pedidos e a página (texto ou imagem)
type PaginaParaLer = { pedidos: string; texto: string | null; imagem: { tipo: string; base64: string } | null }

// ok: o JSON lido. Senão, por que a IA não leu (quem decide o que fazer é quem chamou)
type Leitura =
  | { ok: true; json: string; uso: string }
  | { ok: false; motivo: 'sobrecarga' | 'cota' | 'demora' | 'grande'; mensagem: string }

async function lerComGemini(apiKey: string, pagina: PaginaParaLer, timeoutMs: number): Promise<Leitura> {
  const partes: unknown[] = [{ text: pagina.pedidos }]
  partes.push(pagina.texto != null ? { text: pagina.texto } : { inline_data: { mime_type: pagina.imagem!.tipo, data: pagina.imagem!.base64 } })

  let resp: Response
  try {
    resp = await chamarGemini(apiKey, JSON.stringify({
      systemInstruction: { parts: [{ text: INSTRUCOES }] },
      contents: [{ role: 'user', parts: partes }],
      generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: SCHEMA },
    }), timeoutMs)
  } catch (err) {
    if (err instanceof IaDemorou) {
      return { ok: false, motivo: 'demora', mensagem: `A IA está sobrecarregada (não respondeu em ${timeoutMs / 1000}s).` }
    }
    throw err
  }

  if (!resp.ok) {
    const corpo = await resp.json().catch(() => ({ error: { message: '' } }))
    const msg = corpo?.error?.message ?? ''
    // A mensagem do Google como veio, para o diagnóstico
    console.warn(`[ler-orcamento] gemini ${resp.status}: ${String(msg).slice(0, 200)}`)
    if (resp.status === 429) return { ok: false, motivo: 'cota', mensagem: classify429(msg) }
    if (resp.status === 503 || resp.status === 529) return { ok: false, motivo: 'sobrecarga', mensagem: 'A IA está com alta demanda agora.' }
    throw new Error(msg || `Gemini retornou status ${resp.status}`)
  }

  const dados = await resp.json()
  const candidato = dados?.candidates?.[0]
  const u = dados?.usageMetadata ?? {}
  const uso = `${MODELO} | finish=${candidato?.finishReason} | in=${u.promptTokenCount} out=${u.candidatesTokenCount} thoughts=${u.thoughtsTokenCount ?? 0}`
  if (candidato?.finishReason === 'MAX_TOKENS') return { ok: false, motivo: 'grande', mensagem: uso }
  const json = candidato?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('')
  if (!json) throw new Error('A IA não devolveu resposta.')
  return { ok: true, json, uso }
}

// O esquema do Gemini no formato JSON Schema estrito da OpenAI: todo campo
// obrigatório, nulo como tipo, nenhum campo além dos definidos
type EsquemaGemini = { type: string; nullable?: boolean; properties?: Record<string, EsquemaGemini>; items?: EsquemaGemini }
function esquemaEstrito(s: EsquemaGemini): Record<string, unknown> {
  const tipo = s.type.toLowerCase()
  if (tipo === 'object') {
    const props = Object.fromEntries(Object.entries(s.properties ?? {}).map(([k, v]) => [k, esquemaEstrito(v)]))
    return { type: 'object', properties: props, required: Object.keys(props), additionalProperties: false }
  }
  if (tipo === 'array') return { type: 'array', items: esquemaEstrito(s.items!) }
  return { type: s.nullable ? [tipo, 'null'] : tipo }
}
const SCHEMA_OPENAI = esquemaEstrito(SCHEMA as EsquemaGemini)

async function lerComOpenAI(apiKey: string, pagina: PaginaParaLer): Promise<Leitura> {
  const limite = Math.min(OPENAI_TIMEOUT_MS, vidaRestante())
  if (limite < MINIMO_PARA_LER_MS) throw new TempoDoWorker()
  const porTempoDoWorker = limite < OPENAI_TIMEOUT_MS
  const conteudo: unknown[] = [{ type: 'input_text', text: pagina.pedidos }]
  conteudo.push(
    pagina.texto != null
      ? { type: 'input_text', text: pagina.texto }
      : { type: 'input_image', image_url: `data:${pagina.imagem!.tipo};base64,${pagina.imagem!.base64}`, detail: 'high' },
  )

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), limite)
  let resp: Response
  try {
    resp = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: OPENAI_MODELO,
        reasoning: { effort: 'low' },
        input: [
          { role: 'system', content: INSTRUCOES },
          { role: 'user', content: conteudo },
        ],
        text: { format: { type: 'json_schema', name: 'orcamento', schema: SCHEMA_OPENAI, strict: true } },
        max_output_tokens: 32_000,
      }),
      signal: controller.signal,
    })
  } catch (err) {
    clearTimeout(timeout)
    if ((err as Error).name === 'AbortError') {
      if (porTempoDoWorker) throw new TempoDoWorker()
      return { ok: false, motivo: 'demora', mensagem: `A IA reserva não respondeu em ${OPENAI_TIMEOUT_MS / 1000}s.` }
    }
    throw err
  }
  clearTimeout(timeout)

  if (!resp.ok) {
    const corpo = await resp.json().catch(() => null)
    const erro = corpo?.error ?? {}
    // O erro da OpenAI como veio (código e mensagem), para o diagnóstico
    console.warn(`[ler-orcamento] openai ${resp.status}: ${erro.code ?? erro.type ?? '-'}: ${String(erro.message ?? '').slice(0, 200)}`)
    if (resp.status === 401) throw new Error('Chave da OpenAI inválida (secret OPENAI_API_KEY).')
    if (resp.status === 429) {
      const semCredito = erro.code === 'credit_balance_exhausted' || erro.type === 'insufficient_quota'
      return {
        ok: false,
        motivo: 'cota',
        mensagem: semCredito ? 'A IA reserva (OpenAI) está sem créditos.' : 'Limite da IA reserva atingido.',
      }
    }
    if (resp.status >= 500) return { ok: false, motivo: 'sobrecarga', mensagem: 'A IA reserva também está com alta demanda.' }
    throw new Error(erro.message || `OpenAI retornou status ${resp.status}`)
  }

  const dados = await resp.json()
  const u = dados?.usage ?? {}
  const uso = `${OPENAI_MODELO} | status=${dados?.status} | in=${u.input_tokens} out=${u.output_tokens} reasoning=${u.output_tokens_details?.reasoning_tokens ?? 0}`
  if (dados?.status === 'incomplete' && dados?.incomplete_details?.reason === 'max_output_tokens') {
    return { ok: false, motivo: 'grande', mensagem: uso }
  }
  let json = ''
  for (const item of dados?.output ?? []) {
    if (item?.type !== 'message') continue
    for (const parte of item.content ?? []) {
      if (parte?.type === 'refusal') throw new Error('A IA reserva recusou ler esta página.')
      if (parte?.type === 'output_text') json += parte.text ?? ''
    }
  }
  if (!json) throw new Error('A IA reserva não devolveu resposta.')
  return { ok: true, json, uso }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS })

  const inicio = Date.now()
  // A página está sendo lida pela reserva: se for adiada, continua nela
  let usandoReserva = false
  try {
    const apiKey = Deno.env.get('GEMINI_API_KEY')
    if (!apiKey) return jsonResponse({ error: 'Secret GEMINI_API_KEY não configurado.' }, 500)

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
    const supabase = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    // A anon key é pública: só usuário logado gasta a cota do Gemini
    const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? ''
    const { data: auth } = token ? await supabase.auth.getUser(token) : { data: { user: null } }
    if (!auth.user) return jsonResponse({ error: 'Sessão expirada. Entre novamente no sistema.' }, 401)

    const { cotacao_propria_id, pagina: numeroPagina, total_paginas, texto, imagem_url, imagem_tipo, reserva } = await req.json()
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

    // Worker perto do fim: a página espera ele ser trocado em vez de ser cortada no meio
    if (vidaRestante() < MINIMO_PARA_LER_MS) {
      return tenteDepois('Reiniciando a leitura…', 503, esperaPeloWorker())
    }

    const bloqueio = await verificarRateLimit(supabase)
    if (bloqueio) return tenteDepois(bloqueio, 429, 60)

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
    const cabecalhoPagina = `ORÇAMENTO — página ${Number(numeroPagina) || 1} de ${Number(total_paginas) || 1}`

    const pagina: PaginaParaLer = {
      pedidos: `PRODUTOS PEDIDOS\n${lista}\n\n${cabecalhoPagina}`,
      texto: temTexto ? texto : null,
      imagem: null,
    }
    if (!temTexto) {
      const img = await fetch(imagemUrl!)
      if (!img.ok) throw new Error(`Não foi possível baixar a imagem: ${img.status}`)
      const buffer = await img.arrayBuffer()
      if (buffer.byteLength > MAX_IMAGEM_BYTES) return jsonResponse({ error: 'Imagem acima de 5 MB.' }, 400)
      const tipo = ['image/jpeg', 'image/png', 'image/webp'].includes(imagem_tipo) ? imagem_tipo : 'image/jpeg'
      pagina.imagem = { tipo, base64: base64(buffer) }
    }

    // Gemini primeiro; se ele falhar, a reserva (OpenAI). Página que já caiu
    // na reserva numa tentativa anterior vai direto para ela.
    const openaiKey = Deno.env.get('OPENAI_API_KEY') || null
    let leitura: Leitura
    if (reserva === true && openaiKey) {
      usandoReserva = true
      leitura = await lerComOpenAI(openaiKey, pagina)
    } else {
      leitura = await lerComGemini(apiKey, pagina, openaiKey ? GEMINI_TIMEOUT_COM_RESERVA_MS : GEMINI_TIMEOUT_MS)
      if (!leitura.ok && leitura.motivo !== 'grande' && openaiKey) {
        if (vidaRestante() < MINIMO_RESERVA_MS) {
          console.warn(`[ler-orcamento] gemini: ${leitura.motivo}; reserva na próxima tentativa (worker ${Math.round((Date.now() - INICIO_WORKER) / 1000)}s)`)
          return tenteDepois(`${leitura.mensagem} Lendo pela IA reserva…`, 503, esperaPeloWorker(), true)
        }
        console.warn(`[ler-orcamento] gemini: ${leitura.motivo}; lendo pela reserva (${OPENAI_MODELO})`)
        usandoReserva = true
        leitura = await lerComOpenAI(openaiKey, pagina)
      }
    }

    const segundos = ((Date.now() - inicio) / 1000).toFixed(1)
    if (!leitura.ok) {
      console.warn(`[ler-orcamento] ${cabecalhoPagina} | ${segundos}s | ${usandoReserva ? 'reserva' : 'gemini'} não leu: ${leitura.motivo}`)
      if (leitura.motivo === 'grande') {
        return jsonResponse({ error: 'Página com itens demais para uma leitura. Divida o arquivo.' }, 422)
      }
      // Se foi a reserva que falhou (sem crédito, sobrecarga, demora), a próxima
      // tentativa volta para o Gemini, que pode já ter se recuperado
      const mensagem = usandoReserva ? `${leitura.mensagem} Tentando de novo pela IA principal.` : leitura.mensagem
      if (leitura.motivo === 'cota') return tenteDepois(mensagem, 429, usandoReserva ? 20 : 60)
      return tenteDepois(mensagem, 503, leitura.motivo === 'demora' ? 15 : 20)
    }
    console.log(`[ler-orcamento] ${cabecalhoPagina} | ${temTexto ? 'texto' : 'imagem'} | ${segundos}s | worker ${Math.round((Date.now() - INICIO_WORKER) / 1000)}s | ${leitura.uso}`)

    let lido: { itens?: unknown[] } & Record<string, unknown>
    try {
      lido = JSON.parse(leitura.json)
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

    // ia: quem leu a página (o navegador pode avisar quando foi a reserva)
    return jsonResponse({ ...lido, itens, ia: usandoReserva ? OPENAI_MODELO : MODELO })
  } catch (err) {
    if (err instanceof TempoDoWorker) {
      console.warn(`[ler-orcamento] worker no fim da vida (${Math.round((Date.now() - INICIO_WORKER) / 1000)}s), página adiada`)
      return tenteDepois('Reiniciando a leitura…', 503, esperaPeloWorker(), usandoReserva)
    }
    const msg = err instanceof Error ? err.message : 'Erro inesperado.'
    console.error(`[ler-orcamento] erro: ${msg}`)
    return jsonResponse({ error: msg }, 500)
  }
})
