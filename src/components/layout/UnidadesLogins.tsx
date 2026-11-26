'use client'

import { useState, useTransition } from 'react'
import { UNIDADES_FARMACIA } from '@/lib/unidades-farmacia'
import type { Falha } from '@/lib/acoes'

type Login = { user_id: string; email: string | null; unidade: string | null }

interface Props {
  logins: Login[]
  definir: (userId: string, unidade: string | null) => Promise<Falha | void>
}

// A unidade de cada login: o login vê o código de produto da sua unidade
export function UnidadesLogins({ logins, definir }: Props) {
  const [salvando, setSalvando] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  function alterar(userId: string, valor: string) {
    setErro(null)
    setSalvando(userId)
    startTransition(async () => {
      const r = await definir(userId, valor || null)
      if (r?.erro) setErro(r.erro)
      setSalvando(null)
    })
  }

  return (
    <>
      <ul>
        {logins.map((l) => (
          <li key={l.user_id} className="flex flex-wrap items-center justify-between gap-3 border-b border-linha-2 px-5 py-3 last:border-0">
            <label htmlFor={`unidade-${l.user_id}`} className="min-w-0 truncate text-[13.5px]">
              {l.email ?? 'login sem e-mail'}
            </label>
            <span className="flex items-center gap-2">
              {salvando === l.user_id && <span className="girador text-ardosia" aria-label="Salvando" />}
              <select
                id={`unidade-${l.user_id}`}
                value={l.unidade ?? ''}
                onChange={(e) => alterar(l.user_id, e.target.value)}
                disabled={salvando === l.user_id}
                className="campo campo-sm w-48"
              >
                <option value="">Sem unidade (vê as duas)</option>
                {UNIDADES_FARMACIA.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nome} ({u.loja})
                  </option>
                ))}
              </select>
            </span>
          </li>
        ))}
      </ul>
      {erro && (
        <p className="aviso aviso-erro mx-5 mb-4" role="alert">
          {erro}
        </p>
      )}
    </>
  )
}
