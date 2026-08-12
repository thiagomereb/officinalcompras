import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { createServiceClient } from '@/lib/supabase/server'
import type { Tables } from '@/types/database'
import { InsumoForm } from '@/components/insumos/InsumoForm'
import { atualizarInsumo, excluirInsumo } from '../actions'
import { ExcluirInsumoButton } from './ExcluirInsumoButton'

type Insumo = Tables<'insumos'>

export default async function EditarInsumoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createServiceClient()

  const [insumoRes, sinonimosRes] = await Promise.all([
    supabase.from('insumos').select('*').eq('id', id).single(),
    supabase.from('insumo_sinonimos').select('*').eq('insumo_id', id).order('sinonimo'),
  ])

  const insumo = insumoRes.data as Insumo | null
  if (!insumo) notFound()

  const action = atualizarInsumo.bind(null, id)

  return (
    <div className="p-8">
      <div className="mb-8">
        <Link
          href="/insumos"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4"
        >
          <ChevronLeft size={16} />
          Voltar para insumos
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{insumo.nome_padrao}</h2>
            {insumo.cas_number && (
              <p className="text-gray-400 text-sm font-mono mt-0.5">CAS {insumo.cas_number}</p>
            )}
          </div>
          <ExcluirInsumoButton id={id} action={excluirInsumo} />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <InsumoForm insumo={insumo} sinonimos={sinonimosRes.data ?? []} action={action} />
      </div>
    </div>
  )
}
