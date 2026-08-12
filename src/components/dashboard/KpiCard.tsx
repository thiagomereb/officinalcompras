'use client'

import { LineChart, Line, ResponsiveContainer } from 'recharts'

interface KpiCardProps {
  title: string
  value: string
  subtitle?: string
  trendLabel?: string
  sparkData?: number[]
  color?: 'blue' | 'green' | 'amber' | 'red'
  icon: React.ReactNode
}

const colorMap = {
  blue: { bg: 'bg-blue-50', text: 'text-blue-600', line: '#3b82f6', badge: 'bg-blue-100 text-blue-700' },
  green: { bg: 'bg-emerald-50', text: 'text-emerald-600', line: '#10b981', badge: 'bg-emerald-100 text-emerald-700' },
  amber: { bg: 'bg-amber-50', text: 'text-amber-600', line: '#f59e0b', badge: 'bg-amber-100 text-amber-700' },
  red: { bg: 'bg-red-50', text: 'text-red-600', line: '#ef4444', badge: 'bg-red-100 text-red-700' },
}

export function KpiCard({ title, value, subtitle, trendLabel, sparkData, color = 'blue', icon }: KpiCardProps) {
  const c = colorMap[color]
  const data = (sparkData ?? []).map((v, i) => ({ i, v }))

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col gap-3 shadow-sm">
      <div className="flex items-start justify-between">
        <div className={`w-9 h-9 rounded-lg ${c.bg} ${c.text} flex items-center justify-center`}>
          {icon}
        </div>
        {trendLabel && (
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${c.badge}`}>
            {trendLabel}
          </span>
        )}
      </div>
      <div>
        <p className="text-2xl font-bold text-slate-900 leading-tight">{value}</p>
        <p className="text-sm text-slate-500 mt-0.5">{title}</p>
        {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
      </div>
      {data.length > 1 && (
        <div className="h-10 -mx-1">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <Line type="monotone" dataKey="v" stroke={c.line} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
