// ============================================================
// AsignarHH.tsx — Distribución de HH del tareo entre partidas
// Cada bloque OTM/día permite asignar HH a múltiples partidas
// ============================================================
import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, CheckCircle, Plus, Trash2, AlertCircle } from 'lucide-react'

const API = 'https://api.apps1.astraera.space'

interface Pendiente { otm_id: string; fecha: string; hh: number; registros: number }
interface PartidaMin { id: number; codigo: string; descripcion: string; otm_id: string|null; fase: string|null; unidad: string|null }
interface Distribucion { partida_id: string; hh: string }

const fmt = (n: number) => n.toLocaleString('es-PE', { maximumFractionDigits:1 })

function BloquePendiente({ p, partidas, onDone }: {
  p: Pendiente; partidas: PartidaMin[]; onDone: () => void
}) {
  const qc = useQueryClient()
  const [filas, setFilas] = useState<Distribucion[]>([{ partida_id: '', hh: '' }])
  const [done, setDone] = useState(false)

  const distribuidos = filas.reduce((s,f) => s + (parseFloat(f.hh)||0), 0)
  const restante = Math.round((p.hh - distribuidos) * 10) / 10
  const completo = Math.abs(restante) < 0.1 && filas.every(f => f.partida_id && parseFloat(f.hh)>0)
  const opciones = partidas.filter(x => !x.otm_id || x.otm_id === p.otm_id)

  const distribuir = useMutation({
    mutationFn: () => fetch(`${API}/ev/distribuir-hh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        otm_id: p.otm_id,
        fecha:  p.fecha,
        distribuciones: filas
          .filter(f => f.partida_id && parseFloat(f.hh)>0)
          .map(f => ({ partida_id: Number(f.partida_id), hh: parseFloat(f.hh) }))
      })
    }).then(r => r.json()),
    onSuccess: () => {
      setDone(true)
      qc.invalidateQueries({ queryKey: ['ev-hh-sin-asignar'] })
      qc.invalidateQueries({ queryKey: ['ev-reporte'] })
      qc.invalidateQueries({ queryKey: ['ev-arbol'] })
      onDone()
    }
  })

  const addFila = () => setFilas(prev => [...prev, { partida_id: '', hh: '' }])
  const delFila = (i: number) => setFilas(prev => prev.filter((_,j) => j!==i))
  const setFila = (i: number, key: keyof Distribucion, val: string) =>
    setFilas(prev => prev.map((f,j) => j===i ? {...f, [key]: val} : f))

  const llenarResto = (i: number) => {
    const resto = Math.round((p.hh - filas.filter((_,j)=>j!==i).reduce((s,f)=>s+(parseFloat(f.hh)||0),0)) * 10) / 10
    setFila(i, 'hh', resto > 0 ? String(resto) : '0')
  }

  if (done) return (
    <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4 flex items-center gap-3">
      <CheckCircle size={16} className="text-k-green flex-shrink-0"/>
      <div>
        <span className="text-sm font-bold text-k-green">{p.otm_id} · {p.fecha}</span>
        <span className="text-xs text-k-text3 ml-2">{fmt(p.hh)} HH distribuidas</span>
      </div>
    </div>
  )

  return (
    <div className="bg-k-surface border border-k-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 bg-k-raised border-b border-k-border flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-sm">📋</div>
          <div>
            <div className="text-sm font-bold text-k-text">{p.otm_id}</div>
            <div className="text-[11px] text-k-text3">{p.fecha} · {p.registros} registros</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="font-mono text-base font-bold text-k-red">{fmt(p.hh)} HH</div>
            <div className="text-[10px] text-k-text3 uppercase tracking-wider">del tareo</div>
          </div>
          {distribuidos > 0 && (
            <div className="text-right">
              <div className={`font-mono text-sm font-bold ${Math.abs(restante) < 0.1 ? 'text-k-green' : 'text-k-amber'}`}>
                {restante > 0 ? `-${fmt(restante)}` : restante < -0.1 ? `+${fmt(-restante)}` : '✓ Completo'}
              </div>
              <div className="text-[10px] text-k-text3">restante</div>
            </div>
          )}
        </div>
      </div>

      {/* Distribución */}
      <div className="p-4 space-y-2">
        {/* Barra de progreso */}
        <div className="h-1.5 bg-k-border rounded-full overflow-hidden mb-3">
          <div className="h-full rounded-full transition-all duration-300"
            style={{
              width: `${Math.min(distribuidos/p.hh*100, 100)}%`,
              background: Math.abs(restante) < 0.1 ? '#10b981' : distribuidos > p.hh ? '#ef4444' : '#f59e0b'
            }}/>
        </div>

        {/* Filas de distribución */}
        {filas.map((fila, i) => {
          const part = opciones.find(x => x.id === Number(fila.partida_id))
          const hhNum = parseFloat(fila.hh) || 0
          const pctFila = p.hh > 0 ? (hhNum/p.hh*100).toFixed(0) : '0'
          return (
            <div key={i} className="flex items-center gap-2">
              {/* Número de fila */}
              <div className="w-5 h-5 rounded bg-k-raised border border-k-border flex items-center justify-center text-[10px] text-k-text3 flex-shrink-0">
                {i+1}
              </div>
              {/* Selector de partida */}
              <select
                value={fila.partida_id}
                onChange={e => setFila(i, 'partida_id', e.target.value)}
                className="flex-1 bg-k-raised border border-k-border rounded-lg px-3 py-2 text-[12px] text-k-text outline-none focus:border-k-amber transition-colors"
              >
                <option value="">— Actividad / Partida —</option>
                {opciones.map(x => (
                  <option key={x.id} value={x.id}>
                    {x.codigo} · {x.descripcion}
                  </option>
                ))}
              </select>
              {/* HH amount */}
              <div className="flex items-center gap-1">
                <input
                  type="number" step="0.5" min="0" max={p.hh}
                  value={fila.hh}
                  onChange={e => setFila(i, 'hh', e.target.value)}
                  placeholder="0.0"
                  className="w-20 bg-k-raised border border-k-border focus:border-k-amber rounded-lg px-2 py-2 text-[12px] text-k-text font-mono outline-none text-right transition-colors"
                />
                <span className="text-[10px] text-k-text3 w-6">HH</span>
              </div>
              {/* % badge */}
              <span className="text-[10px] font-bold w-9 text-right"
                style={{ color: hhNum > 0 ? '#f59e0b' : '#4e5a72' }}>
                {hhNum > 0 ? pctFila+'%' : ''}
              </span>
              {/* Llenar resto */}
              {i === filas.length - 1 && restante > 0 && (
                <button onClick={() => llenarResto(i)}
                  className="text-[11px] text-k-blue hover:text-blue-400 whitespace-nowrap transition-colors flex-shrink-0"
                  title={`Asignar los ${fmt(restante)} HH restantes`}>
                  +{fmt(restante)}
                </button>
              )}
              {/* Borrar fila */}
              {filas.length > 1 && (
                <button onClick={() => delFila(i)}
                  className="text-k-text3 hover:text-k-red transition-colors flex-shrink-0">
                  <Trash2 size={13}/>
                </button>
              )}
            </div>
          )
        })}

        {/* Acciones */}
        <div className="flex items-center justify-between pt-2 gap-3">
          <button onClick={addFila}
            className="flex items-center gap-1.5 text-[12px] text-k-text3 hover:text-k-text transition-colors">
            <Plus size={13}/> Agregar actividad
          </button>
          <div className="flex items-center gap-2">
            {distribuidos > p.hh + 0.1 && (
              <div className="flex items-center gap-1 text-[11px] text-k-red">
                <AlertCircle size={12}/> Excede en {fmt(distribuidos - p.hh)} HH
              </div>
            )}
            <button
              onClick={() => distribuir.mutate()}
              disabled={!completo || distribuir.isPending || distribuidos > p.hh + 0.1}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-[12px] font-bold transition-all ${
                completo && distribuidos <= p.hh + 0.1
                  ? 'bg-k-amber text-black hover:bg-amber-400'
                  : 'bg-k-raised text-k-text3 cursor-not-allowed'
              }`}
            >
              {distribuir.isPending ? <><Loader2 size={12} className="animate-spin"/> Guardando...</> : <>✓ Distribuir {fmt(distribuidos)} HH</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function AsignarHH({ otm }: { otm?: string } = {}) {
  const qc = useQueryClient()
  const [done, setDone] = useState<Set<string>>(new Set())

  const { data: todosPendientes = [], isLoading } = useQuery<Pendiente[]>({
    queryKey: ['ev-hh-sin-asignar'],
    queryFn: async () => (await fetch(`${API}/ev/hh-sin-asignar`)).json(),
  })
  const pendientes = otm
    ? todosPendientes.filter(p => p.otm_id === otm)
    : todosPendientes

  const { data: partidas = [] } = useQuery<PartidaMin[]>({
    queryKey: ['ev-partidas-min'],
    queryFn: async () => (await fetch(`${API}/ev/partidas`)).json(),
    staleTime: 5 * 60_000,
  })

  const pendientesFiltrados = useMemo(() =>
    pendientes.filter(p => !done.has(`${p.otm_id}|${p.fecha}`)),
  [pendientes, done])

  const totalHH  = pendientesFiltrados.reduce((s,p) => s + p.hh, 0)
  const totalOTMs = new Set(pendientesFiltrados.map(p => p.otm_id)).size

  if (isLoading) return (
    <div className="flex items-center gap-2 py-10 text-k-text3 text-sm">
      <Loader2 size={16} className="animate-spin"/> Cargando HH pendientes...
    </div>
  )

  return (
    <div className="space-y-4">
      {/* Descripción */}
      <div className="bg-k-raised border border-k-border rounded-xl p-4">
        <p className="text-sm text-k-text2 mb-1">
          <strong className="text-k-text">Distribución de HH del tareo entre actividades</strong>
        </p>
        <p className="text-[12px] text-k-text3">
          Para cada día × OTM del tareo, distribuye las HH totales entre las actividades específicas que se ejecutaron.
          Cada fila puede tener múltiples actividades. Al guardar, las HH se registran en el cálculo de Valor Ganado.
        </p>
        {pendientesFiltrados.length > 0 && (
          <div className="flex gap-6 mt-3">
            <div><div className="font-mono text-sm font-bold text-k-red">{fmt(totalHH)} HH</div><div className="text-[10px] text-k-text3 uppercase">por distribuir</div></div>
            <div><div className="font-mono text-sm font-bold text-k-text">{pendientesFiltrados.length}</div><div className="text-[10px] text-k-text3 uppercase">bloques</div></div>
            <div><div className="font-mono text-sm font-bold text-k-amber">{totalOTMs}</div><div className="text-[10px] text-k-text3 uppercase">OTMs</div></div>
          </div>
        )}
      </div>

      {pendientesFiltrados.length === 0 ? (
        <div className="text-center py-12 bg-k-surface border border-k-border rounded-xl">
          <div className="text-4xl mb-3 opacity-30">✓</div>
          <p className="text-sm font-bold text-k-green mb-1">Todo distribuido</p>
          <p className="text-[12px] text-k-text3">No hay HH del tareo pendientes de distribución.</p>
        </div>
      ) : (
        pendientesFiltrados.map(p => (
          <BloquePendiente
            key={`${p.otm_id}|${p.fecha}`}
            p={p}
            partidas={partidas}
            onDone={() => setDone(prev => new Set([...prev, `${p.otm_id}|${p.fecha}`]))}
          />
        ))
      )}
    </div>
  )
}