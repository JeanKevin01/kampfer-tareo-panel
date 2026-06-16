// ============================================================
// src/components/ev/AsignarHH.tsx
// Conecta las HH del tareo QR con las partidas del Valor Ganado.
// Lista días × OTM con HH sin asignar; un clic etiqueta todos los
// registros de ese día/OTM con la partida trabajada.
// ============================================================
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, Link2, CheckCircle, CalendarDays } from 'lucide-react'

const API = 'https://api.apps1.astraera.space'

interface Pendiente { otm_id: string; fecha: string; hh: number; registros: number }
interface PartidaMin { id: number; codigo: string; descripcion: string; otm_id: string | null }

const fmt = (n: number, d = 1) =>
  n.toLocaleString('es-PE', { minimumFractionDigits: d, maximumFractionDigits: d })

export default function AsignarHH({ otm }: { otm?: string } = {}) {
  const qc = useQueryClient()
  const [seleccion, setSeleccion] = useState<Record<string, string>>({}) // key otm|fecha -> partida_id
  const [hechos, setHechos] = useState<Set<string>>(new Set())

  const { data: todosPendientes = [], isLoading } = useQuery<Pendiente[]>({
    queryKey: ['ev-hh-sin-asignar'],
    queryFn: async () => (await fetch(`${API}/ev/hh-sin-asignar`)).json(),
  })
  const pendientes = otm ? todosPendientes.filter(p => p.otm_id === otm) : todosPendientes

  const { data: partidas = [] } = useQuery<PartidaMin[]>({
    queryKey: ['ev-partidas'],
    queryFn: async () => (await fetch(`${API}/ev/partidas`)).json(),
  })

  const asignar = useMutation({
    mutationFn: async (p: { otm_id: string; fecha: string; partida_id: number }) => {
      const res = await fetch(`${API}/ev/asignar-hh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(p),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j?.detail ?? `Error ${res.status}`)
      return { ...j, key: `${p.otm_id}|${p.fecha}` }
    },
    onSuccess: (data) => {
      setHechos(prev => new Set(prev).add(data.key))
      qc.invalidateQueries({ queryKey: ['ev-reporte'] })
      qc.invalidateQueries({ queryKey: ['ev-curva'] })
      qc.invalidateQueries({ queryKey: ['ev-captura'] })
      qc.invalidateQueries({ queryKey: ['ev-semanas'] })
      // refresca la lista al final para que el usuario vea el check antes
      setTimeout(() => qc.invalidateQueries({ queryKey: ['ev-hh-sin-asignar'] }), 1200)
    },
  })

  if (isLoading) {
    return <p className="text-k-text3 text-sm flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Buscando HH del tareo sin asignar…</p>
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-k-text3 max-w-2xl">
        Estas son las HH registradas por el <span className="text-k-text2 font-bold">QR del tareo</span> que
        aún no están vinculadas a una partida. Selecciona la actividad trabajada ese día y asígnala —
        las HH fluirán automáticamente al cálculo del Valor Ganado. Los días que asignes aquí ya no
        necesitan digitarse en el Registro semanal.
      </p>

      {pendientes.length === 0 && (
        <div className="bg-k-surface border border-k-border rounded-xl p-10 text-center">
          <CheckCircle size={28} className="mx-auto text-k-green mb-3" />
          <p className="text-sm text-k-text2 font-bold">Todo asignado</p>
          <p className="text-xs text-k-text3 mt-1">
            No hay HH del tareo pendientes de vincular a partidas.
          </p>
        </div>
      )}

      {pendientes.map(p => {
        const key = `${p.otm_id}|${p.fecha}`
        const opciones = partidas.filter(x => !x.otm_id || x.otm_id === p.otm_id)
        const hecho = hechos.has(key)
        return (
          <div key={key}
            className={`bg-k-surface border rounded-xl p-4 flex flex-wrap items-center gap-4 transition-colors ${
              hecho ? 'border-green-500/30' : 'border-k-border'
            }`}>
            <div className="flex items-center gap-3 min-w-[220px]">
              <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <CalendarDays size={16} className="text-k-amber" />
              </div>
              <div>
                <p className="text-sm font-bold text-k-text">{p.otm_id}</p>
                <p className="text-[11px] text-k-text3 font-mono">{p.fecha}</p>
              </div>
            </div>

            <div className="flex items-center gap-4 text-sm">
              <span className="font-mono text-k-red font-bold">{fmt(p.hh)} HH</span>
              <span className="text-[11px] text-k-text3">{p.registros} registros</span>
            </div>

            <div className="flex items-center gap-2 ml-auto">
              {hecho ? (
                <span className="text-k-green text-sm font-bold flex items-center gap-1.5">
                  <CheckCircle size={14} /> Asignado
                </span>
              ) : (
                <>
                  <select
                    value={seleccion[key] ?? ''}
                    onChange={e => setSeleccion({ ...seleccion, [key]: e.target.value })}
                    className="bg-k-raised border border-k-border rounded-lg px-3 py-2 text-sm text-k-text outline-none focus:border-k-amber transition-colors max-w-[320px]"
                  >
                    <option value="">— Actividad trabajada —</option>
                    {opciones.map(o => (
                      <option key={o.id} value={o.id}>{o.codigo} · {o.descripcion}</option>
                    ))}
                  </select>
                  <button
                    disabled={!seleccion[key] || asignar.isPending}
                    onClick={() => asignar.mutate({
                      otm_id: p.otm_id, fecha: p.fecha,
                      partida_id: Number(seleccion[key]),
                    })}
                    className="bg-k-amber hover:bg-k-amber2 disabled:opacity-40 text-black font-bold text-sm px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
                  >
                    {asignar.isPending ? <Loader2 size={13} className="animate-spin" /> : <Link2 size={13} />}
                    Asignar
                  </button>
                </>
              )}
            </div>
          </div>
        )
      })}

      {asignar.isError && (
        <p className="text-xs px-3 py-2 rounded-lg border text-k-red bg-red-500/10 border-red-500/20">
          ✗ {(asignar.error as Error).message}
        </p>
      )}
    </div>
  )
}