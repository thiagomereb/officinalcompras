import { Cabecalho } from '@/components/ui/Cabecalho'
import { ImportarCotacaoPropria } from '@/components/cotacoes-proprias/ImportarCotacaoPropria'
import { importarCotacaoPropria } from '../actions'

export default function NovaCotacaoPropriaPage() {
  return (
    <div className="pagina">
      <Cabecalho
        voltar={{ href: '/cotacoes-proprias', label: 'Cotações próprias' }}
        titulo="Importar cotação própria"
        descricao="Confira o que foi lido do PDF antes de importar."
      />
      <div className="max-w-4xl">
        <ImportarCotacaoPropria action={importarCotacaoPropria} />
      </div>
    </div>
  )
}
