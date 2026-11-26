import { createClient } from './client'
import type { CodigosInsumo } from '@/lib/unidades-farmacia'

export type InsumoOpcao = {
  id: string
  nome_padrao: string
  unidade_padrao: string | null
  // Código do produto no sistema da farmácia em cada unidade (o mesmo número
  // pode ser outro produto na outra unidade); null quando o insumo veio só pela
  // busca por semelhança, que não traz os códigos
  codigos: CodigosInsumo | null
  // Preenchido quando o insumo foi achado por um sinônimo, para mostrar o porquê
  via_sinonimo: string | null
}

const LIMITE = 12
const CAMPOS = 'id, nome_padrao, unidade_padrao, codigo_goiania, codigo_rio_verde'

type InsumoComCodigos = { id: string; nome_padrao: string; unidade_padrao: string | null } & CodigosInsumo
const opcao = (i: InsumoComCodigos, via_sinonimo: string | null): InsumoOpcao => ({
  id: i.id,
  nome_padrao: i.nome_padrao,
  unidade_padrao: i.unidade_padrao,
  codigos: { codigo_goiania: i.codigo_goiania, codigo_rio_verde: i.codigo_rio_verde },
  via_sinonimo,
})

// Roda no navegador, direto no Supabase (o RLS libera para usuário logado). A
// alternativa — mandar a tabela inteira de insumos junto com a página — pesava
// no carregamento de cotações e deixava um <select> com milhares de opções.
export async function buscarInsumos(termo: string): Promise<InsumoOpcao[]> {
  // % e \ são curinga e escape no ilike
  const t = termo.replace(/[,()"\\%]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!t) return []

  const supabase = createClient()
  const [porCodigo, porNome, porSinonimo, parecidos] = await Promise.all([
    // Só números: pode ser o código do sistema da farmácia (de qualquer unidade)
    /^\d+$/.test(t)
      ? supabase
          .from('insumos')
          .select(CAMPOS)
          .or(`codigo_goiania.like.${t}%,codigo_rio_verde.like.${t}%`)
          .order('nome_padrao')
          .limit(LIMITE)
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from('insumos')
      .select(CAMPOS)
      .ilike('nome_padrao', `%${t}%`)
      .order('nome_padrao')
      .limit(LIMITE),
    supabase
      .from('insumo_sinonimos')
      .select(`sinonimo, insumos(${CAMPOS})`)
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
  for (const i of [...((porCodigo.data ?? []) as InsumoComCodigos[]), ...((porNome.data ?? []) as InsumoComCodigos[])]) {
    if (!encontrados.has(i.id)) encontrados.set(i.id, opcao(i, null))
  }
  for (const s of porSinonimo.data ?? []) {
    const i = s.insumos as InsumoComCodigos | null
    if (i && !encontrados.has(i.id)) encontrados.set(i.id, opcao(i, s.sinonimo))
  }
  for (const p of parecidos.data ?? []) {
    if (!encontrados.has(p.insumo_id)) {
      encontrados.set(p.insumo_id, {
        id: p.insumo_id,
        nome_padrao: p.nome_padrao,
        unidade_padrao: null,
        codigos: null,
        via_sinonimo: null,
      })
    }
  }

  return [...encontrados.values()].slice(0, LIMITE)
}
