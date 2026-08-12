'use client'

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'

export type PricePoint = { date: string } & Record<string, number | string>

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']

export function PriceHistoryChart({
  data,
  fornecedores,
  insumoNome,
}: {
  data: PricePoint[]
  fornecedores: string[]
  insumoNome?: string
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <h3 className="font-semibold text-slate-900 mb-0.5">Variação de Preços</h3>
      <p className="text-xs text-slate-400 mb-4">
        {insumoNome ? `Histórico: ${insumoNome}` : 'Evolução histórica por fornecedor'}
      </p>
      {data.length < 2 ? (
        <div className="h-48 flex items-center justify-center text-slate-400 text-sm">
          Dados insuficientes — adicione cotações de múltiplas datas para ver a evolução
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={data} margin={{ top: 2, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#cbd5e1" />
            <YAxis
              tick={{ fontSize: 11 }}
              stroke="#cbd5e1"
              tickFormatter={(v) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              width={68}
            />
            <Tooltip
              formatter={(v) => [Number(v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), '']}
              contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {fornecedores.map((f, i) => (
              <Line
                key={f}
                type="monotone"
                dataKey={f}
                stroke={COLORS[i % COLORS.length]}
                strokeWidth={2}
                dot={{ r: 3 }}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
