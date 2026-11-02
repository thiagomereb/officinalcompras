/**
 * Script de importação único — lê o Excel de sinônimos GYN e popula a tabela sinonimos_ref no Supabase.
 * Uso: node scripts/import-sinonimos.mjs <caminho/SinonimosGYN_tabela_completa.xlsx>
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
  console.error('❌  NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não encontrados em .env.local')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

// Lê o Excel usando xlsx (já instalado como dependência)
const xlsx = await import('xlsx').then((m) => m.default ?? m)
const { readFile, utils } = xlsx

const EXCEL_PATH = process.argv[2]
if (!EXCEL_PATH) {
  console.error('❌  Informe o caminho do Excel: node scripts/import-sinonimos.mjs <arquivo.xlsx>')
  process.exit(1)
}
const wb   = readFile(EXCEL_PATH)
const sheet = wb.Sheets[wb.SheetNames[0]]
const rows  = utils.sheet_to_json(sheet, { header: 1 }).slice(1) // remove header

console.log(`📄  ${rows.length} linhas lidas do Excel`)

// Constrói o conjunto de pares únicos {produto_padrao, termo}
const pares = new Map()

for (const [, produtoPrincipal, , sinonimo, ativo] of rows) {
  if (!produtoPrincipal || ativo !== 'SIM') continue

  const padrao = String(produtoPrincipal).trim().toUpperCase()
  const syn    = String(sinonimo ?? '').trim().toUpperCase()

  // O próprio nome como termo de busca
  pares.set(`${padrao}||${padrao}`, { produto_padrao: padrao, termo: padrao })

  // O sinônimo como termo alternativo
  if (syn && syn !== padrao) {
    pares.set(`${padrao}||${syn}`, { produto_padrao: padrao, termo: syn })
  }
}

const registros = [...pares.values()]
console.log(`🔑  ${registros.length} pares únicos (produto + sinônimos)`)

// Upsert em lotes de 500
const BATCH = 500
let inseridos = 0

for (let i = 0; i < registros.length; i += BATCH) {
  const lote = registros.slice(i, i + BATCH)
  const { error } = await supabase
    .from('sinonimos_ref')
    .upsert(lote, { onConflict: 'produto_padrao,termo' })

  if (error) {
    console.error(`❌  Erro no lote ${i}–${i + BATCH}:`, error.message)
    process.exit(1)
  }
  inseridos += lote.length
  console.log(`✅  ${inseridos}/${registros.length} registros inseridos`)
}

console.log('\n🎉  Importação concluída!')
