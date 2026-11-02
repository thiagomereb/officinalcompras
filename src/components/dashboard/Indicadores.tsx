export type Indicador = {
  rotulo: string
  valor: string
  detalhe?: string
  // Valor em texto (nome de fornecedor) em vez de número: corpo menor e truncado
  texto?: boolean
  alerta?: boolean
}

// Divisórias da grade: 2 colunas no celular, 4 numa linha só no desktop
const BORDAS = [
  '',
  'border-l',
  'border-t lg:border-t-0 lg:border-l',
  'border-l border-t lg:border-t-0',
]

export function Indicadores({ itens }: { itens: Indicador[] }) {
  return (
    <section className="painel mb-5 grid grid-cols-2 lg:grid-cols-4" aria-label="Resumo">
      {itens.map((item, i) => (
        <div key={item.rotulo} className={`min-w-0 border-linha-2 p-4 lg:p-5 ${BORDAS[i] ?? ''}`}>
          <p className="rotulo">{item.rotulo}</p>
          <p
            className={`titulo mt-2.5 leading-none ${
              item.texto ? 'truncate text-[19px]' : 'num text-[28px]'
            } ${item.alerta ? 'text-oxido' : ''}`}
            title={item.texto ? item.valor : undefined}
          >
            {item.valor}
          </p>
          {item.detalhe && <p className="mt-2 text-[12.5px] leading-snug text-ardosia">{item.detalhe}</p>}
        </div>
      ))}
    </section>
  )
}
