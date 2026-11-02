import { createClient } from './client'

export type InsumoOpcao = {
  id: string
  nome_padrao: string
  unidade_padrao: string | null
  cas_number: string | null
  // Preenchido quando o insumo foi achado por um sinônimo, para mostrar o porquê
  via_sinonimo: string | null
}

const LIMITE = 12

// Roda no navegador, direto no Supabase (o RLS libera para usuário logado). A
// alternativa — mandar a tabela inteira de insumos junto com a página — pesava
// no carregamento de cotações e deixava um <select> com milhares de opções.
export async function buscarInsumos(termo: string): Promise<InsumoOpcao[]> {
  // Vírgula, parênteses e aspas têm significado na sintaxe do .or() do PostgREST
  const t = termo.replace(/[,()"\\%]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!t) return []

  const supabase = createClient()
  const [porNome, porSinonimo, parecidos] = await Promise.all([
    supabase
      .from('insumos')
      .select('id, nome_padrao, unidade_padrao, cas_number')
      .or(`nome_padrao.ilike.%${t}%,cas_number.ilike.%${t}%`)
      .order('nome_padrao')
      .limit(LIMITE),
    supabase
      .from('insumo_sinonimos')
      .select('sinonimo, insumos(id, nome_padrao, unidade_padrao, cas_number)')
      .ilike('sinonimo', `%${t}%`)
      .limit(LIMITE),
    // Similaridade (pg_trgm) cobre acento e grafia: "acido ascorbico" acha
    // "Ácido Ascórbico", o que o ilike sozinho não faz
    t.length >= 3
      ? supabase.rpc('buscar_insumo_por_descricao', { p_descricao: t, p_limite: 6 })
      : Promise.resolve({ data: null, error: null }),
  ])

  if (porNome.error) throw new Error(porNome.error.message)

  const encontrados = new Map<string, InsumoOpcao>()
  for (const i of porNome.data ?? []) encontrados.set(i.id, { ...i, via_sinonimo: null })
  for (const s of porSinonimo.data ?? []) {
    const i = s.insumos
    if (i && !encontrados.has(i.id)) encontrados.set(i.id, { ...i, via_sinonimo: s.sinonimo })
  }
  for (const p of parecidos.data ?? []) {
    if (!encontrados.has(p.insumo_id)) {
      encontrados.set(p.insumo_id, {
        id: p.insumo_id,
        nome_padrao: p.nome_padrao,
        unidade_padrao: null,
        cas_number: null,
        via_sinonimo: null,
      })
    }
  }

  return [...encontrados.values()].slice(0, LIMITE)
}
