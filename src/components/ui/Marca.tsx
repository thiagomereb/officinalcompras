// O frasco âmbar com rótulo: é onde o insumo comprado vai parar, e é de onde
// vem o único acento de cor do sistema.
export function Frasco({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 24" aria-hidden="true" className={className}>
      <rect x="6.5" y="1" width="7" height="3.5" rx="1" fill="#1c2226" />
      <rect x="7.5" y="4.5" width="5" height="2.5" fill="#8a5409" />
      <path
        d="M4 10.5A3.5 3.5 0 0 1 7.5 7h5a3.5 3.5 0 0 1 3.5 3.5V20a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3z"
        fill="#b26b12"
      />
      <rect x="4" y="12.5" width="12" height="5.5" fill="#fff" fillOpacity="0.9" />
      <rect x="6" y="14.5" width="5.5" height="1.4" rx="0.7" fill="#1c2226" fillOpacity="0.5" />
    </svg>
  )
}

export function Marca({ grande = false }: { grande?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <Frasco className={grande ? 'h-11 w-9' : 'h-6 w-5'} />
      <span className="leading-none">
        <span className={`titulo block ${grande ? 'text-[34px]' : 'text-[16px]'}`}>Officinal</span>
        <span className={`rotulo block text-ambar-tinta ${grande ? 'mt-2 text-[11px]' : 'mt-1 text-[9.5px]'}`}>
          Compras
        </span>
      </span>
    </span>
  )
}
