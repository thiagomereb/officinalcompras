'use client'

import { createContext, useContext } from 'react'
import type { UnidadeFarmacia } from '@/lib/unidades-farmacia'

// A unidade do login para as telas do navegador (busca de insumos, por
// exemplo): null quando o login ainda não tem unidade e vê as duas
const Contexto = createContext<UnidadeFarmacia | null>(null)

export function UnidadeLoginProvider({ unidade, children }: { unidade: UnidadeFarmacia | null; children: React.ReactNode }) {
  return <Contexto.Provider value={unidade}>{children}</Contexto.Provider>
}

export const useUnidadeLogin = () => useContext(Contexto)
