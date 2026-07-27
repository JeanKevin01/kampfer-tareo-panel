// Pestañas de página. El estado vive en la URL (ver lib/tabs.ts).
//
// Se creó al unificar módulos que el menú tenía sueltos (encargo de Jean
// 2026-07-26: Importar/QRs dentro de Trabajadores, Analytics dentro de
// Registros y HH).
import type { TabDef } from '@/lib/tabs'

export function TabsPagina({ tabs, activo, onCambiar }: {
  tabs: TabDef[]; activo: string; onCambiar: (id: string) => void
}) {
  return (
    <div className="flex gap-1.5 bg-k-raised border border-k-border rounded-xl p-1 w-fit flex-wrap">
      {tabs.map(t => (
        <button key={t.id} onClick={() => onCambiar(t.id)}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
            activo === t.id ? 'bg-k-amber text-black' : 'text-k-text2 hover:text-k-text'
          }`}>
          {t.icon && <t.icon size={14} />} {t.label}
        </button>
      ))}
    </div>
  )
}
