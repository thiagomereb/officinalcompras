'use client'

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'

export type AbcData = { categoria: 'A' | 'B' | 'C'; count: number; pct: number }

const COLORS: Record<string, string> = { A: '#3b82f6', B: '#10b981', C: '#94a3b8' }
const DESC: Record<string, string> = {
  A: 'Alto impacto',
  B: 'Médio impacto',
  C: 'Baixo impacto',
}

export function AbcChart({ data }: { data: AbcData[] }) {
  const chartData = data.map((d) => ({ name: `Classe ${d.categoria}`, value: d.count, pct: d.pct, cat: d.categoria }))
  const total = data.reduce((s, d) => s + d.count, 0)

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <h3 className="font-semibold text-slate-900 mb-0.5">Análise ABC</h3>
      <p className="text-xs text-slate-400 mb-2">Classificação por impacto no custo</p>
      {total === 0 ? (
        <div className="h-40 flex items-center justify-center text-sm text-slate-400">
          Sem dados suficientes
        </div>
      ) : (
        <div className="flex items-center gap-4">
          <ResponsiveContainer width={140} height={140}>
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={40}
                outerRadius={65}
                paddingAngle={3}
                dataKey="value"
              >
                {data.map((entry) => (
                  <Cell key={entry.categoria} fill={COLORS[entry.categoria]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(v, _name, props) => [
                  `${Number(v ?? 0)} insumos (${((props?.payload as { pct?: number })?.pct ?? 0).toFixed(0)}%)`,
                  '',
                ]}
                contentStyle={{ fontSize: 11, borderRadius: 8 }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex flex-col gap-2.5">
            {data.map((d) => (
              <div key={d.categoria} className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: COLORS[d.categoria] }} />
                <div>
                  <p className="text-xs font-semibold text-slate-700">
                    Classe {d.categoria}
                    <span className="font-normal text-slate-400 ml-1">({d.count})</span>
                  </p>
                  <p className="text-[10px] text-slate-400">{DESC[d.categoria]}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
