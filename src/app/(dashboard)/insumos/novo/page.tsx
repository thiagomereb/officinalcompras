import { InsumoForm } from '@/components/insumos/InsumoForm'
import { Cabecalho } from '@/components/ui/Cabecalho'
import { criarInsumo } from '../actions'

export default function NovoInsumoPage() {
  return (
    <div className="pagina">
      <Cabecalho voltar={{ href: '/insumos', label: 'Insumos' }} titulo="Novo insumo" />
      <div className="painel max-w-3xl p-5 lg:p-7">
        <InsumoForm action={criarInsumo} />
      </div>
    </div>
  )
}
