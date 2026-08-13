import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getArquivosSignedUrls } from '@/lib/supabase/storage'
import { Plus } from 'lucide-react'
import { LancarPrecosModal } from '@/components/cotacoes/LancarPrecosModal'
import { CotacoesTable, type CotacaoRow } from '@/components/cotacoes/CotacoesTable'

export default async function CotacoesPage() {
  const supabase = await createClient()

  const [{ data: cotacoes }, { data: fornecedores }, { data: insumos }] = await Promise.all([
    supabase
      .from('cotacoes')
      .select('*, fornecedores(razao_social, nome_fantasia), cotacao_itens(id)')
      .order('data_cotacao', { ascending: false }),
    supabase.from('fornecedores').select('id, razao_social, nome_fantasia').eq('ativo', true).order('razao_social'),
    supabase.from('insumos').select('id, nome_padrao, unidade_padrao').order('nome_padrao'),
  ])

  const signedUrls = await getArquivosSignedUrls(
    supabase,
    (cotacoes ?? []).flatMap((c) => (c.arquivo_url ? [c.arquivo_url] : [])),
  )

  const rows: CotacaoRow[] = (cotacoes ?? []).map((c) => {
    const fornecedor = c.fornecedores as { razao_social: string; nome_fantasia: string | null } | null
    return {
      id: c.id,
      fornecedorNome: fornecedor?.nome_fantasia ?? fornecedor?.razao_social ?? '—',
      data_cotacao: c.data_cotacao,
      validade_cotacao: c.validade_cotacao,
      prazo_entrega_dias: c.prazo_entrega_dias,
      prazo_pagamento_dias: c.prazo_pagamento_dias,
      frete_fixo: c.frete_fixo,
      status: c.status,
      arquivo_nome: c.arquivo_nome,
      signedUrl: c.arquivo_url ? (signedUrls.get(c.arquivo_url) ?? null) : null,
      totalItens: (c.cotacao_itens as { id: string }[])?.length ?? 0,
    }
  })

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Cotações</h2>
          <p className="text-gray-500 mt-1">{rows.length} cotação(ões) registrada(s)</p>
        </div>
        <div className="flex items-center gap-2">
          <LancarPrecosModal
            fornecedores={fornecedores ?? []}
            insumos={insumos ?? []}
          />
          <Link
            href="/cotacoes/nova"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus size={16} />
            Nova cotação
          </Link>
        </div>
      </div>

      {!rows.length ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <p className="text-gray-500 font-medium">Nenhuma cotação registrada</p>
          <p className="text-gray-400 text-sm mt-1">Clique em "Nova cotação" para começar</p>
        </div>
      ) : (
        <CotacoesTable cotacoes={rows} />
      )}
    </div>
  )
}
