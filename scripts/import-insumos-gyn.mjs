/**
 * Lê o Excel de sinônimos GYN e popula:
 *   - tabela `insumos`          (um registro por PRODUTO PRINCIPAL)
 *   - tabela `insumo_sinonimos` (um registro por SINÔNIMO vinculado ao insumo)
 *
 * Uso: node scripts/import-insumos-gyn.mjs <caminho/SinonimosGYN_tabela_completa.xlsx>
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Lê .env.local (sem dependência de dotenv). Corta só no primeiro "=", porque
// chaves JWT podem conter "=" no valor, e tira aspas opcionais.
const envPath = resolve(__dirname, '../.env.local')
const env = Object.fromEntries(
  readFileSync(envPath, 'utf-8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const idx = l.indexOf('=')
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim().replace(/^(['"])(.*)\1$/, '$2')]
    }),
)

const SUPABASE_URL = env['NEXT_PUBLIC_SUPABASE_URL']
const SERVICE_KEY  = env['SUPABASE_SERVICE_ROLE_KEY']

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌  Variáveis de ambiente não encontradas em .env.local')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

// Lê o Excel
const xlsx = await import('xlsx').then((m) => m.default ?? m)
const { readFile, utils } = xlsx

const EXCEL_PATH = process.argv[2]
if (!EXCEL_PATH) {
  console.error('❌  Informe o caminho do Excel: node scripts/import-insumos-gyn.mjs <arquivo.xlsx>')
  process.exit(1)
}
const wb    = readFile(EXCEL_PATH)
const sheet = wb.Sheets[wb.SheetNames[0]]
const rows  = utils.sheet_to_json(sheet, { header: 1 }).slice(1)

console.log(`📄  ${rows.length} linhas lidas do Excel`)

// Agrupa: Map<nome_padrao, Set<sinonimo>>
const produtos = new Map()

for (const [, produtoPrincipal, , sinonimo, ativo] of rows) {
  if (!produtoPrincipal || ativo !== 'SIM') continue

  const nome  = String(produtoPrincipal).trim()
  const syn   = sinonimo ? String(sinonimo).trim() : null

  if (!produtos.has(nome)) produtos.set(nome, new Set())
  if (syn && syn !== nome) produtos.get(nome).add(syn)
}

console.log(`🔑  ${produtos.size} produtos principais encontrados`)

// ── 1. Upsert insumos ──────────────────────────────────────────────────────
const insumosArr = [...produtos.keys()].map((nome) => ({
  nome_padrao:    nome,
  unidade_padrao: 'un',
}))

const BATCH = 200
let countInsumos = 0

for (let i = 0; i < insumosArr.length; i += BATCH) {
  const lote = insumosArr.slice(i, i + BATCH)
  const { error } = await supabase
    .from('insumos')
    .upsert(lote, { onConflict: 'nome_padrao', ignoreDuplicates: true })

  if (error) {
    console.error(`❌  Erro ao inserir insumos (lote ${i}):`, error.message)
    process.exit(1)
  }
  countInsumos += lote.length
  console.log(`  insumos: ${countInsumos}/${insumosArr.length}`)
}

console.log(`✅  ${countInsumos} insumos inseridos/ignorados`)

// ── 2. Busca IDs dos insumos recém-inseridos ───────────────────────────────
const nomes = [...produtos.keys()]
const idMap = new Map()

for (let i = 0; i < nomes.length; i += BATCH) {
  const lote = nomes.slice(i, i + BATCH)
  const { data, error } = await supabase
    .from('insumos')
    .select('id, nome_padrao')
    .in('nome_padrao', lote)

  if (error) {
    console.error('❌  Erro ao buscar IDs:', error.message)
    process.exit(1)
  }
  for (const { id, nome_padrao } of data) idMap.set(nome_padrao, id)
}

console.log(`🔍  ${idMap.size} IDs carregados`)

// ── 3. Upsert insumo_sinonimos ─────────────────────────────────────────────
const sinonimosArr = []

for (const [nome, syns] of produtos.entries()) {
  const insumo_id = idMap.get(nome)
  if (!insumo_id) continue
  for (const syn of syns) {
    sinonimosArr.push({ insumo_id, sinonimo: syn })
  }
}

console.log(`🔑  ${sinonimosArr.length} sinônimos a inserir`)

let countSyn = 0

for (let i = 0; i < sinonimosArr.length; i += BATCH) {
  const lote = sinonimosArr.slice(i, i + BATCH)
  const { error } = await supabase
    .from('insumo_sinonimos')
    .upsert(lote, { onConflict: 'insumo_id,sinonimo', ignoreDuplicates: true })

  if (error) {
    console.error(`❌  Erro ao inserir sinônimos (lote ${i}):`, error.message)
    process.exit(1)
  }
  countSyn += lote.length
  console.log(`  sinônimos: ${countSyn}/${sinonimosArr.length}`)
}

console.log(`\n🎉  Concluído: ${countInsumos} insumos + ${countSyn} sinônimos importados!`)
