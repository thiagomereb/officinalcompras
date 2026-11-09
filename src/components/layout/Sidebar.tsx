'use client'

import { useState } from 'react'
import Link, { useLinkStatus } from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  ClipboardList,
  GitCompare,
  History,
  Building2,
  Package,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  X,
  type LucideIcon,
} from 'lucide-react'
import { logout } from '@/app/login/actions'
import { Marca } from '@/components/ui/Marca'

type ItemNav = { href: string; label: string; icone: LucideIcon }

// Na ordem do trabalho: a cotação chega, vira mapa, o mapa aprovado vira compra
const grupos: { label: string; itens: ItemNav[] }[] = [
  {
    label: 'Compras',
    itens: [
      { href: '/dashboard', label: 'Painel', icone: LayoutDashboard },
      { href: '/cotacoes-proprias', label: 'Cotações próprias', icone: ClipboardList },
      { href: '/mapas', label: 'Mapas de cotação', icone: GitCompare },
      { href: '/compras', label: 'Histórico de compras', icone: History },
    ],
  },
  {
    label: 'Cadastros',
    itens: [
      { href: '/fornecedores', label: 'Fornecedores', icone: Building2 },
      { href: '/insumos', label: 'Insumos', icone: Package },
    ],
  },
  {
    label: 'Sistema',
    itens: [
      { href: '/relatorios', label: 'Relatórios', icone: BarChart3 },
      { href: '/configuracoes', label: 'Configurações', icone: Settings },
    ],
  },
]

type Usuario = { nome: string | null; email: string }

function iniciais({ nome, email }: Usuario) {
  const base = nome ?? email.split('@')[0] ?? ''
  const partes = base.split(/[\s._-]+/).filter(Boolean)
  const letras = partes.length > 1 ? partes[0][0] + partes[partes.length - 1][0] : base.slice(0, 2)
  return letras.toUpperCase() || '?'
}

// Feedback no próprio item clicado enquanto a próxima página carrega
function IndicadorPendente() {
  const { pending } = useLinkStatus()
  return <span className="nav-pendente ml-auto shrink-0" data-pendente={pending} aria-hidden="true" />
}

export function Sidebar({ usuario }: { usuario: Usuario }) {
  const pathname = usePathname()
  const [aberto, setAberto] = useState(false)

  function ativo(href: string) {
    return pathname === href || pathname.startsWith(`${href}/`)
  }

  return (
    <>
      {/* Barra do celular: no desktop a sidebar fica sempre visível */}
      <header className="fixed inset-x-0 top-0 z-30 flex h-14 items-center justify-between border-b border-linha bg-nevoa/95 px-4 backdrop-blur lg:hidden print:hidden">
        <Link href="/dashboard" aria-label="Ir para o painel">
          <Marca />
        </Link>
        <button
          type="button"
          onClick={() => setAberto(true)}
          className="btn btn-fantasma btn-icone"
          aria-label="Abrir menu"
          aria-expanded={aberto}
          aria-controls="menu-principal"
        >
          <Menu size={18} />
        </button>
      </header>

      {aberto && (
        <div
          className="fixed inset-0 z-40 bg-grafite/30 lg:hidden"
          onClick={() => setAberto(false)}
          aria-hidden="true"
        />
      )}

      <aside
        id="menu-principal"
        className={`fixed inset-y-0 left-0 z-50 flex w-[248px] shrink-0 flex-col border-r border-linha bg-nevoa transition-transform duration-200 lg:sticky lg:top-0 lg:h-dvh lg:translate-x-0 print:hidden ${
          aberto ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-16 items-center justify-between px-5">
          <Link href="/dashboard" aria-label="Ir para o painel" onClick={() => setAberto(false)}>
            <Marca />
          </Link>
          <button
            type="button"
            onClick={() => setAberto(false)}
            className="btn btn-fantasma btn-icone btn-sm lg:hidden"
            aria-label="Fechar menu"
          >
            <X size={16} />
          </button>
        </div>

        <nav className="flex-1 space-y-6 overflow-y-auto px-3 pb-4 pt-3" aria-label="Principal">
          {grupos.map((grupo) => (
            <div key={grupo.label}>
              <p className="rotulo mb-1.5 px-2.5">{grupo.label}</p>
              <ul className="space-y-0.5">
                {grupo.itens.map(({ href, label, icone: Icone }) => (
                  <li key={href}>
                    <Link
                      href={href}
                      onClick={() => setAberto(false)}
                      aria-current={ativo(href) ? 'page' : undefined}
                      className="item-nav"
                    >
                      <Icone size={16} strokeWidth={1.8} className="shrink-0" />
                      <span className="truncate">{label}</span>
                      <IndicadorPendente />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="flex items-center gap-2.5 border-t border-linha px-4 py-3.5">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-linha bg-papel text-[11px] font-semibold text-grafite">
            {iniciais(usuario)}
          </span>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-[13px] font-medium" title={usuario.nome ?? usuario.email}>
              {usuario.nome ?? usuario.email}
            </p>
            {usuario.nome && (
              <p className="truncate text-[11.5px] text-ardosia" title={usuario.email}>
                {usuario.email}
              </p>
            )}
          </div>
          <form action={logout}>
            <button type="submit" className="btn btn-fantasma btn-icone btn-sm" title="Sair" aria-label="Sair">
              <LogOut size={15} />
            </button>
          </form>
        </div>
      </aside>
    </>
  )
}
