import { AlertTriangle, Clock, TrendingUp, CheckCircle } from 'lucide-react'

export type Alerta = {
  tipo: 'vencimento' | 'unico_fornecedor' | 'preco_alto' | 'ok'
  mensagem: string
  detalhe?: string
}

const tipoConfig = {
  vencimento: { icon: Clock, color: 'text-amber-500', bg: 'bg-amber-50 border-amber-100' },
  unico_fornecedor: { icon: AlertTriangle, color: 'text-orange-500', bg: 'bg-orange-50 border-orange-100' },
  preco_alto: { icon: TrendingUp, color: 'text-red-500', bg: 'bg-red-50 border-red-100' },
  ok: { icon: CheckCircle, color: 'text-emerald-500', bg: 'bg-emerald-50 border-emerald-100' },
}

export function AlertasPanel({ alertas }: { alertas: Alerta[] }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <h3 className="font-semibold text-slate-900 mb-0.5">Alertas Inteligentes</h3>
      <p className="text-xs text-slate-400 mb-4">{alertas.length} notificações ativas</p>
      {alertas.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-emerald-600 bg-emerald-50 rounded-lg p-3">
          <CheckCircle size={16} className="shrink-0" />
          Nenhum alerta — tudo em ordem
        </div>
      ) : (
        <div className="space-y-2 max-h-56 overflow-y-auto">
          {alertas.map((a, i) => {
            const { icon: Icon, color, bg } = tipoConfig[a.tipo]
            return (
              <div key={i} className={`flex items-start gap-3 p-2.5 rounded-lg border ${bg}`}>
                <Icon size={15} className={`${color} mt-0.5 shrink-0`} />
                <div>
                  <p className="text-sm text-slate-700 font-medium leading-snug">{a.mensagem}</p>
                  {a.detalhe && <p className="text-xs text-slate-500 mt-0.5">{a.detalhe}</p>}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
