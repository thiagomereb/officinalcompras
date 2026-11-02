'use client'

import { Printer } from 'lucide-react'

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="btn btn-primario btn-sm"
    >
      <Printer size={15} />
      Imprimir / Salvar PDF
    </button>
  )
}
