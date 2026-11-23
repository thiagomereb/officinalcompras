import { createClient } from 'npm:@supabase/supabase-js@2.105.4'

// Lê as linhas do relatório "Produtos para cotação" (a cotação própria) que o
// padrão do app não reconheceu — um formato novo de linha não trava mais a
// importação. Só essas linhas vêm para cá, poucas por chamada; o resto da
// cotação é lido no navegador, sem IA.
//
// A IA só extrai os campos. Quem decide se a leitura vale é o navegador
// (conferirLeituraIa em lib/cotacao-propria.ts): código, quantidade e unidade
// precisam estar escritos na linha, e o total tem de fechar com o rodapé.
//
// Gemini primeiro; se ele falhar (sobrecarga, cota, demora), a OpenAI na mesma
// chamada, como na leitura de orçamentos.

const MODELO = 'gemini-3.5-flash'
const OPENAI_MODELO = Deno.env.get('OPENAI_MODEL') || 'gpt-6.2-sol'
// Poucas linhas por chamada: a resposta vem em segundos. Os limites deixam
// tempo para a reserva dentro dos 150s do worker.
const GEMINI_TIMEOUT_MS = 50_000
const OPENAI_TIMEOUT_MS = 60_000
const MAX_LINHAS = 60
const MAX_TAMANHO_LINHA = 400
const RATE_LIMIT_RPM = 10
const RATE_LIMIT_RPD = 100
const USAGE_CHAVE = 'ler-linhas-cotacao'
const OFFSET_BRASILIA_MS = 3 * 3600_000

const INSTRUCOES = `Você lê linhas do relatório "Produtos para cotação" do sistema de uma farmácia de manipulação. Cada linha é um produto pedido, normalmente assim:

EAN (ou "SEM GTIN")  CÓDIGO - NOME [TEOR %]  FRAÇÃO C/V  QUANTIDADE UNIDADE  OBSERVAÇÃO
exemplo: 0000001004426 1004426 - 3 INDOL CARBINOL [100.0000 %] 12,0920 g
exemplo: SEM GTIN 4000545 - CAPSULA VEGETAL 00 BRANCA 1/ 1 5.000,0000 u URGENTE

As linhas que você recebe vieram num formato que a leitura automática não reconheceu (colunas coladas ou fora de ordem, nome cortado, quantidade na linha de baixo). Para cada linha, pelo índice, devolva:
- ok: true se a linha é um produto e você conseguiu ler código, nome, quantidade e unidade com certeza; senão false
- codigo: o código do produto no sistema (só dígitos; é o número antes do " - ")
- ean: o EAN como está na linha, ou null ("SEM GTIN" ou ausente)
- nome: o nome do produto, sem o teor e sem a fração C/V
- teor: o número dentro de "[... %]" (ex.: 93.95), ou null
- quantidade: a quantidade pedida, como número. O relatório escreve com vírgula decimal e ponto de milhar: "2.992,5000" = 2992.5; "12,0920" = 12.092
- unidade: a unidade da quantidade como está na linha (g, kg, mg, ml, l, u...)
- observacao: o texto da coluna OBSERVAÇÃO (ex.: "URGENTE"), ou null

A CONTINUAÇÃO, quando vier, é a linha logo abaixo no PDF: pode ter o resto do nome ou a quantidade, ou ser texto do relatório que não tem nada a ver com o produto. Use só o que for do produto.
Copie os números exatamente como estão escritos. Não invente nem complete nada: na dúvida, ok = false.`

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    itens: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          indice: { type: 'INTEGER' },
          ok: { type: 'BOOLEAN' },
          codigo: { type: 'STRING', nullable: true },
          ean: { type: 'STRING', nullable: true },
          nome: { type: 'STRING', nullable: true },
          teor: { type: 'NUMBER', nullable: true },
          quantidade: { type: 'NUMBER', nullable: true },
          unidade: { type: 'STRING', nullable: true },
          observacao: { type: 'STRING', nullable: true },
        },
        required: ['indice', 'ok', 'codigo', 'ean', 'nome', 'teor', 'quantidade', 'unidade', 'observacao'],
      },
    },
  },
  required: ['itens'],
}

// O mesmo esquema no formato JSON Schema estrito da OpenAI
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

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Expose-Headers': 'Retry-After',
}

function jsonResponse(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', ...extra },
  })
}

function tenteDepois(error: string, status: number, segundos: number) {
  return jsonResponse({ error, retry_after: segundos }, status, { 'Retry-After': String(segundos) })
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
  if ((rpm ?? 0) >= RATE_LIMIT_RPM) return 'Limite de leituras por minuto atingido. Aguarde 1 minuto.'
  if ((rpd ?? 0) >= RATE_LIMIT_RPD) return 'Limite diário de leituras atingido. Tente novamente amanhã.'

  await supabase.from('api_usage_limits').insert({ chave: USAGE_CHAVE })
  await supabase.from('api_usage_limits').delete()
    .eq('chave', USAGE_CHAVE).lt('created_at', new Date(agora.getTime() - 48 * 3600_000).toISOString())
  return null
}

// ok: o JSON lido e o uso (para o log); senão, a mensagem de por que não leu
type Leitura = { ok: true; json: string; uso: string } | { ok: false; mensagem: string }

async function comLimite(url: string, init: RequestInit, timeoutMs: number): Promise<Response | null> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch (err) {
    if ((err as Error).name === 'AbortError') return null
    throw err
  } finally {
    clearTimeout(timeout)
  }
}

async function lerComGemini(apiKey: string, texto: string): Promise<Leitura> {
  const resp = await comLimite(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: INSTRUCOES }] },
        contents: [{ role: 'user', parts: [{ text: texto }] }],
        generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: SCHEMA },
      }),
    },
    GEMINI_TIMEOUT_MS,
  )
  if (!resp) return { ok: false, mensagem: `A IA não respondeu em ${GEMINI_TIMEOUT_MS / 1000}s.` }
  if (!resp.ok) {
    const corpo = await resp.json().catch(() => null)
    console.warn(`[ler-linhas-cotacao] gemini ${resp.status}: ${String(corpo?.error?.message ?? '').slice(0, 200)}`)
    return { ok: false, mensagem: resp.status === 429 ? 'Limite da IA atingido.' : 'A IA está com alta demanda agora.' }
  }
  const dados = await resp.json()
  const candidato = dados?.candidates?.[0]
  const u = dados?.usageMetadata ?? {}
  const json = candidato?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('')
  if (!json) return { ok: false, mensagem: 'A IA não devolveu resposta.' }
  return { ok: true, json, uso: `${MODELO} | finish=${candidato?.finishReason} | in=${u.promptTokenCount} out=${u.candidatesTokenCount}` }
}

async function lerComOpenAI(apiKey: string, texto: string): Promise<Leitura> {
  const resp = await comLimite(
    'https://api.openai.com/v1/responses',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: OPENAI_MODELO,
        reasoning: { effort: 'low' },
        input: [
          { role: 'system', content: INSTRUCOES },
          { role: 'user', content: [{ type: 'input_text', text: texto }] },
        ],
        text: { format: { type: 'json_schema', name: 'linhas', schema: SCHEMA_OPENAI, strict: true } },
        max_output_tokens: 16_000,
      }),
    },
    OPENAI_TIMEOUT_MS,
  )
  if (!resp) return { ok: false, mensagem: `A IA reserva não respondeu em ${OPENAI_TIMEOUT_MS / 1000}s.` }
  if (!resp.ok) {
    const erro = (await resp.json().catch(() => null))?.error ?? {}
    console.warn(`[ler-linhas-cotacao] openai ${resp.status}: ${erro.code ?? erro.type ?? '-'}: ${String(erro.message ?? '').slice(0, 200)}`)
    const semCredito = erro.code === 'credit_balance_exhausted' || erro.type === 'insufficient_quota'
    return { ok: false, mensagem: semCredito ? 'A IA reserva (OpenAI) está sem créditos.' : 'A IA reserva também falhou.' }
  }
  const dados = await resp.json()
  let json = ''
  for (const item of dados?.output ?? []) {
    if (item?.type !== 'message') continue
    for (const parte of item.content ?? []) if (parte?.type === 'output_text') json += parte.text ?? ''
  }
  if (!json) return { ok: false, mensagem: 'A IA reserva não devolveu resposta.' }
  const u = dados?.usage ?? {}
  return { ok: true, json, uso: `${OPENAI_MODELO} | status=${dados?.status} | in=${u.input_tokens} out=${u.output_tokens}` }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS })

  const inicio = Date.now()
  try {
    const apiKey = Deno.env.get('GEMINI_API_KEY')
    if (!apiKey) return jsonResponse({ error: 'Secret GEMINI_API_KEY não configurado.' }, 500)

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    // A anon key é pública: só usuário logado gasta a cota da IA
    const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? ''
    const { data: auth } = token ? await supabase.auth.getUser(token) : { data: { user: null } }
    if (!auth.user) return jsonResponse({ error: 'Sessão expirada. Entre novamente no sistema.' }, 401)

    const { linhas } = await req.json()
    const validas =
      Array.isArray(linhas) &&
      linhas.length > 0 &&
      linhas.length <= MAX_LINHAS &&
      linhas.every(
        (l) =>
          typeof l?.texto === 'string' &&
          l.texto.length <= MAX_TAMANHO_LINHA &&
          (l.continuacao == null || (typeof l.continuacao === 'string' && l.continuacao.length <= MAX_TAMANHO_LINHA)),
      )
    if (!validas) return jsonResponse({ error: `Envie de 1 a ${MAX_LINHAS} linhas.` }, 400)

    const bloqueio = await verificarRateLimit(supabase)
    if (bloqueio) return tenteDepois(bloqueio, 429, 60)

    const texto = `LINHAS\n${(linhas as { texto: string; continuacao: string | null }[])
      .map((l, i) => `[${i}] ${l.texto}${l.continuacao ? `\n    CONTINUAÇÃO: ${l.continuacao}` : ''}`)
      .join('\n')}`

    let ia = MODELO
    let leitura = await lerComGemini(apiKey, texto)
    const openaiKey = Deno.env.get('OPENAI_API_KEY')
    if (!leitura.ok && openaiKey) {
      console.warn(`[ler-linhas-cotacao] gemini: ${leitura.mensagem} Lendo pela reserva (${OPENAI_MODELO})`)
      ia = OPENAI_MODELO
      leitura = await lerComOpenAI(openaiKey, texto)
    }
    const segundos = ((Date.now() - inicio) / 1000).toFixed(1)
    if (!leitura.ok) {
      console.warn(`[ler-linhas-cotacao] ${linhas.length} linha(s) | ${segundos}s | não leu: ${leitura.mensagem}`)
      return tenteDepois(leitura.mensagem, 503, 20)
    }
    console.log(`[ler-linhas-cotacao] ${linhas.length} linha(s) | ${segundos}s | ${leitura.uso}`)

    let lido: { itens?: unknown }
    try {
      lido = JSON.parse(leitura.json)
    } catch {
      return tenteDepois('A IA devolveu uma resposta em formato inválido.', 503, 5)
    }
    if (!Array.isArray(lido.itens)) return tenteDepois('Resposta da IA sem itens.', 503, 5)
    return jsonResponse({ itens: lido.itens, ia })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro inesperado.'
    console.error(`[ler-linhas-cotacao] erro: ${msg}`)
    return jsonResponse({ error: msg }, 500)
  }
})
