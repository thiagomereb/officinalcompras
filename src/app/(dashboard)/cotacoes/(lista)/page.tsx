import Link from 'next/link'
import { Plus, FileText } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getArquivosSignedUrls } from '@/lib/supabase/storage'
import { LancarPrecosModal } from '@/components/cotacoes/LancarPrecosModal'
import { CotacoesTable, type CotacaoRow } from '@/components/cotacoes/CotacoesTable'
import { Cabecalho } from '@/components/ui/Cabecalho'
import { Vazio } from '@/components/ui/Vazio'

export default async function CotacoesPage() {
  const supabase = await createClient()

  const [{ data: cotacoes }, { data: fornecedores }] = await Promise.all([
    supabase
      .from('cotacoes')
      .select('*, fornecedores(razao_social, nome_fantasia), cotacao_itens(id)')
      .order('data_cotacao', { ascending: false }),
    supabase.from('fornecedores').select('id, razao_social, nome_fantasia').eq('ativo', true).order('razao_social'),
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
    <div className="pagina">
      <Cabecalho
        grupo="Compras"
        titulo="Cotações"
        descricao={`${rows.length.toLocaleString('pt-BR')} cotação(ões) registrada(s)`}
        acoes={
          <>
            <LancarPrecosModal fornecedores={fornecedores ?? []} />
            <Link href="/cotacoes/nova" className="btn btn-primario">
              <Plus size={16} />
              Nova cotação
            </Link>
          </>
        }
      />

      {!rows.length ? (
        <Vazio
          icone={FileText}
          titulo="Nenhuma cotação registrada"
          texto="Registre a tabela de preços de um fornecedor para começar a comparar."
          acao={
            <Link href="/cotacoes/nova" className="btn btn-primario btn-sm">
              Nova cotação
            </Link>
          }
        />
      ) : (
        <CotacoesTable cotacoes={rows} />
      )}
    </div>
  )
}
