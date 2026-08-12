import { Settings, Bell, Shield, Database, Sliders } from 'lucide-react'

const items = [
  { icon: Sliders, title: 'Pesos padrão do algoritmo', desc: 'Ajuste os pesos usados ao criar novos mapas de cotação.' },
  { icon: Bell, title: 'Notificações', desc: 'Alertas de vencimento de cotações e insumos críticos.' },
  { icon: Shield, title: 'Usuários e permissões', desc: 'Gerencie acessos e funções dos colaboradores.' },
  { icon: Database, title: 'Exportação de dados', desc: 'Backup e exportação em CSV/Excel.' },
]

export default function ConfiguracoesPage() {
  return (
    <div className="p-8 space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Configurações</h2>
        <p className="text-gray-500 mt-1">Preferências e ajustes do sistema</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl">
        {items.map(({ icon: Icon, title, desc }) => (
          <div key={title} className="bg-white rounded-xl border border-gray-200 p-5 flex items-start gap-4 opacity-60">
            <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
              <Icon size={17} className="text-slate-500" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <p className="font-medium text-gray-900 text-sm">{title}</p>
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">Em breve</span>
              </div>
              <p className="text-xs text-gray-500">{desc}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-xl p-5 max-w-3xl">
        <div className="flex items-start gap-3">
          <Settings size={18} className="text-blue-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-blue-800">Módulo em desenvolvimento</p>
            <p className="text-xs text-blue-600 mt-0.5">
              As configurações avançadas estarão disponíveis em breve. Os pesos do algoritmo podem ser
              ajustados individualmente em cada Mapa de Cotação.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
