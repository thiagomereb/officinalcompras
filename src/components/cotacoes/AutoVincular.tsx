'use client'

import { useEffect } from 'react'

interface Props {
  cotacaoId: string
  semVinculo: number
  action: (cotacaoId: string) => Promise<{ vinculados: number }>
}

export function AutoVincular({ cotacaoId, semVinculo, action }: Props) {
  useEffect(() => {
    if (semVinculo > 0) {
      action(cotacaoId)
    }
  }, [])

  return null
}
