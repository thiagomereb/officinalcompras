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

// Sem âmbar: no sistema ele marca "o escolhido", e aqui nenhuma linha é
const CORES = ['#1c2226', '#2f6b52', '#4a6a86', '#a63a2b', '#8a9397', '#6e5a8a']

// Preço por grama costuma ficar abaixo de R$1, onde 2 casas apagam a diferença
function moeda(v: unknown) {
  const n = Number(v ?? 0)
  const casas = Math.abs(n) < 1 ? 4 : 2
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: casas, maximumFractionDigits: casas })
}

function diaMes(v: unknown) {
  const [, mes, dia] = String(v).split('-')
  return dia && mes ? `${dia}/${mes}` : String(v)
}

const EIXO = { fontSize: 11, fill: '#5c656a' }

export function PriceHistoryChart({
  data,
  fornecedores,
  insumoNome,
  unidade,
}: {
  data: PricePoint[]
  fornecedores: string[]
  insumoNome?: string
  unidade?: string | null
}) {
  return (
    <section className="painel">
      <div className="painel-topo">
        <div className="min-w-0">
          <h2 className="painel-titulo">Histórico de preço</h2>
          <p className="truncate text-[12.5px] text-ardosia">
            {insumoNome ?? 'Insumo com mais fornecedores'}
            {unidade && ` · R$/${unidade}`}
          </p>
        </div>
      </div>
      {data.length < 2 ? (
        <p className="flex h-52 items-center justify-center px-6 text-center text-[13.5px] text-ardosia">
          O histórico aparece quando o mesmo insumo tiver cotações em pelo menos duas datas.
        </p>
      ) : (
        <div className="px-3 pb-3 pt-4">
          <ResponsiveContainer width="100%" height={210}>
            <LineChart data={data} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#e9ece9" vertical={false} />
              <XAxis dataKey="date" tick={EIXO} tickFormatter={diaMes} stroke="#dae0dc" tickLine={false} />
              <YAxis tick={EIXO} tickFormatter={moeda} width={76} stroke="#dae0dc" tickLine={false} axisLine={false} />
              <Tooltip
                formatter={(v) => [moeda(v), '']}
                labelFormatter={diaMes}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #dae0dc', boxShadow: 'none' }}
              />
              <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} iconType="plainline" />
              {fornecedores.map((f, i) => (
                <Line
                  key={f}
                  type="monotone"
                  dataKey={f}
                  stroke={CORES[i % CORES.length]}
                  strokeWidth={1.75}
                  dot={{ r: 2.5 }}
                  activeDot={{ r: 4 }}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  )
}
