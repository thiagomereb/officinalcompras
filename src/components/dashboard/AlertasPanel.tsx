import { Clock, Users, TrendingUp, Check } from 'lucide-react'

export type Alerta = {
  tipo: 'vencimento' | 'unico_fornecedor' | 'preco_alto' | 'ok'
  mensagem: string
  detalhe?: string
}

const ICONES = {
  vencimento: Clock,
  unico_fornecedor: Users,
  preco_alto: TrendingUp,
  ok: Check,
}

export function AlertasPanel({ alertas }: { alertas: Alerta[] }) {
  return (
    <section className="painel">
      <div className="painel-topo">
        <h2 className="painel-titulo">Alertas</h2>
        {alertas.length > 0 && <span className="selo selo-alerta">{alertas.length}</span>}
      </div>
      {alertas.length === 0 ? (
        <p className="flex items-center gap-2 px-5 py-6 text-[13.5px] text-salvia">
          <Check size={16} />
          Nenhuma cotação vencendo e todo insumo tem mais de um fornecedor.
        </p>
      ) : (
        <ul className="max-h-72 overflow-y-auto">
          {alertas.map((a, i) => {
            const Icone = ICONES[a.tipo]
            return (
              <li key={i} className="flex items-start gap-3 border-b border-linha-2 px-5 py-3.5 last:border-0">
                <Icone size={15} className="mt-0.5 shrink-0 text-oxido" />
                <div>
                  <p className="text-[13.5px] font-medium leading-snug">{a.mensagem}</p>
                  {a.detalhe && <p className="mt-0.5 text-[12.5px] text-ardosia">{a.detalhe}</p>}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
