import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Tables } from '@/types/database'
import { InsumoForm } from '@/components/insumos/InsumoForm'
import { Cabecalho } from '@/components/ui/Cabecalho'
import { atualizarInsumo, excluirInsumo } from '../actions'
import { ExcluirInsumoButton } from './ExcluirInsumoButton'

type Insumo = Tables<'insumos'>

export default async function EditarInsumoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const [insumoRes, sinonimosRes] = await Promise.all([
    supabase.from('insumos').select('*').eq('id', id).single(),
    supabase.from('insumo_sinonimos').select('*').eq('insumo_id', id).order('sinonimo'),
  ])

  const insumo = insumoRes.data as Insumo | null
  if (!insumo) notFound()

  const action = atualizarInsumo.bind(null, id)

  return (
    <div className="pagina">
      <Cabecalho
        voltar={{ href: '/insumos', label: 'Insumos' }}
        grupo="Insumo"
        titulo={insumo.nome_padrao}
        descricao={insumo.cas_number ? <span className="leitura">CAS {insumo.cas_number}</span> : undefined}
        acoes={<ExcluirInsumoButton id={id} action={excluirInsumo} />}
      />

      <div className="painel max-w-3xl p-5 lg:p-7">
        <InsumoForm insumo={insumo} sinonimos={sinonimosRes.data ?? []} action={action} />
      </div>
    </div>
  )
}
