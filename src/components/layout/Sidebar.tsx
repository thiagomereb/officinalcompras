'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Building2,
  Package,
  FileText,
  BarChart3,
  GitCompare,
  Settings,
  FlaskConical,
  ChevronDown,
} from 'lucide-react'

type NavItem = { href: string; label: string; icon: React.ElementType }

const groups: { label: string; items: NavItem[] }[] = [
  {
    label: 'Principal',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/mapas', label: 'Comparações', icon: GitCompare },
      { href: '/cotacoes', label: 'Cotações', icon: FileText },
    ],
  },
  {
    label: 'Cadastros',
    items: [
      { href: '/fornecedores', label: 'Fornecedores', icon: Building2 },
      { href: '/insumos', label: 'Insumos', icon: Package },
    ],
  },
  {
    label: 'Sistema',
    items: [
      { href: '/relatorios', label: 'Relatórios', icon: BarChart3 },
      { href: '/configuracoes', label: 'Configurações', icon: Settings },
    ],
  },
]

export function Sidebar() {
  const pathname = usePathname()

  function isActive(href: string) {
    if (href === '/dashboard') return pathname === '/dashboard'
    return pathname.startsWith(href)
  }

  return (
    <aside className="w-[220px] shrink-0 bg-[#0d1b2e] flex flex-col h-screen print:hidden">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-white/8">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center shrink-0">
            <FlaskConical size={15} className="text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-white font-bold text-sm leading-tight">Officinal</p>
            <p className="text-blue-300/80 text-[10px] leading-tight">Inteligência de Compras</p>
          </div>
        </div>
      </div>

      {/* Nav groups */}
      <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto">
        {groups.map((group) => (
          <div key={group.label}>
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-2 mb-1.5">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map(({ href, label, icon: Icon }) => {
                const active = isActive(href)
                return (
                  <Link
                    key={href}
                    href={href}
                    className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] transition-all ${
                      active
                        ? 'bg-blue-600 text-white font-medium shadow-sm'
                        : 'text-slate-400 hover:text-white hover:bg-white/6'
                    }`}
                  >
                    <Icon size={16} className="shrink-0" />
                    {label}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Plan badge */}
      <div className="px-3 pb-2">
        <div className="bg-blue-900/40 rounded-lg px-3 py-2.5 border border-blue-700/30">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold text-blue-300">Plano Pro</p>
              <p className="text-[10px] text-slate-500 mt-0.5">officinal.compras</p>
            </div>
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          </div>
        </div>
      </div>

      {/* User profile */}
      <div className="px-3 pb-4 pt-2 border-t border-white/8">
        <button className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-white/6 transition-colors text-left">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
            OC
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-xs font-medium truncate">Officinal Compras</p>
            <p className="text-slate-500 text-[10px]">Administrador</p>
          </div>
          <ChevronDown size={12} className="text-slate-500 shrink-0" />
        </button>
      </div>
    </aside>
  )
}
