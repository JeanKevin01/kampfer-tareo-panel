import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Calendar, Download, Loader2, Plus, X, AlertCircle, Package, Users } from 'lucide-react'

import { api, apiBlob } from '@/lib/api'

interface OTM        { id: string; descripcion: string; estado: string }
interface Registro   { id: number; trab_id: string; otm_id: string; fecha: string; hh: number | null }
interface Trabajador { id: string; nombre: string; cargo: string }
interface Equipo     { id: number; placa: string; tipo: string; qty: number; operativo: boolean }

const TIPOS_EQUIPO = ['Camioneta', 'Excavadora', 'Cargador', 'Volquete', 'Grúa', 'Compresora', 'Generador', 'Otro']
const INDIRECTO_KW = ['ALMACENERO', 'CHOFER', 'VIGIA', 'ASISTENTE', 'ADMIN', 'GUARDIAN', 'COCIN', 'LOGISTIC', 'TOPOGRAF', 'CALIDAD']

const esIndirecto = (cargo: string) => INDIRECTO_KW.some(k => cargo.toUpperCase().includes(k))
const hoy = () => new Date().toISOString().split('T')[0]

export default function GenerarRDC() {
  const [fecha,     setFecha]     = useState(hoy())
  const [otmId,     setOtmId]     = useState('')
  const [equipos,   setEquipos]   = useState<Equipo[]>([])
  const [formPlaca, setFormPlaca] = useState('')
  const [formTipo,  setFormTipo]  = useState('Camioneta')
  const [formQty,   setFormQty]   = useState(1)
  const [generando, setGenerando] = useState(false)

  const { data: otms = [], isLoading: loadingOtms } = useQuery<OTM[]>({
    queryKey: ['otms'],
    queryFn: () => api<OTM[]>('/api/otms'),
    staleTime: 5 * 60 * 1000,
  })

  const { data: registros = [], isLoading: loadingReg } = useQuery<Registro[]>({
    queryKey: ['registros', fecha],
    queryFn: () => api<Registro[]>(`/api/registros/${fecha}`),
    enabled: !!fecha,
  })

  const { data: trabajadores = [] } = useQuery<Trabajador[]>({
    queryKey: ['trabajadores'],
    queryFn: () => api<Trabajador[]>('/admin/trabajadores'),
    staleTime: 5 * 60 * 1000,
  })

  const trabMap = useMemo(
    () => Object.fromEntries(trabajadores.map(t => [t.id, t])),
    [trabajadores]
  )

  const registrosFiltrados = useMemo(
    () => otmId ? registros.filter(r => r.otm_id === otmId) : registros,
    [registros, otmId]
  )

  const porCargo = useMemo(() => {
    const map: Record<string, { cargo: string; cantidad: number; tipo: 'Directo' | 'Indirecto' }> = {}
    registrosFiltrados.forEach(r => {
      const t = trabMap[r.trab_id]
      if (!t) return
      if (!map[t.cargo]) map[t.cargo] = { cargo: t.cargo, cantidad: 0, tipo: esIndirecto(t.cargo) ? 'Indirecto' : 'Directo' }
      map[t.cargo].cantidad++
    })
    return Object.values(map).sort((a, b) => a.tipo.localeCompare(b.tipo) || a.cargo.localeCompare(b.cargo))
  }, [registrosFiltrados, trabMap])

  const totalDirecto   = useMemo(() => porCargo.filter(c => c.tipo === 'Directo').reduce((s, c)   => s + c.cantidad, 0), [porCargo])
  const totalIndirecto = useMemo(() => porCargo.filter(c => c.tipo === 'Indirecto').reduce((s, c) => s + c.cantidad, 0), [porCargo])
  const totalHH        = useMemo(() => registrosFiltrados.reduce((s, r) => s + (r.hh ?? 0), 0).toFixed(1), [registrosFiltrados])
  const eqOperativos   = useMemo(() => equipos.filter(e => e.operativo).reduce((s, e) => s + e.qty, 0), [equipos])

  const agregarEquipo = () => {
    if (!formPlaca.trim()) return
    setEquipos(prev => [...prev, { id: Date.now(), placa: formPlaca.trim().toUpperCase(), tipo: formTipo, qty: formQty, operativo: true }])
    setFormPlaca('')
    setFormQty(1)
  }

  const toggleOperativo = (id: number) =>
    setEquipos(prev => prev.map(e => e.id === id ? { ...e, operativo: !e.operativo } : e))

  const eliminarEquipo = (id: number) =>
    setEquipos(prev => prev.filter(e => e.id !== id))

  const generarRDC = async () => {
    if (!otmId) return
    setGenerando(true)
    try {
      const blob = await apiBlob('/api/rdc/generar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otm_id: otmId, fecha, equipos }),
      })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `RDC_${otmId}_${fecha}.xlsm`
      a.click()
    } catch {
      // backend devuelve 501 — esperado por ahora
    } finally {
      setGenerando(false)
    }
  }

  const loading = loadingOtms || loadingReg

  return (
    <div className="space-y-5">

      {/* Aviso backend pendiente */}
      <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3">
        <AlertCircle size={15} className="text-k-amber mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-k-amber text-sm font-bold">Backend RDC pendiente de configurar</p>
          <p className="text-k-text3 text-xs mt-0.5">
            El endpoint <span className="font-mono">POST /api/rdc/generar</span> aún no está implementado.
            Puedes preparar y revisar el reporte, pero la descarga .xlsm no estará disponible hasta configurar el backend.
          </p>
        </div>
      </div>

      {/* Selector OTM + Fecha + Botón */}
      <div className="bg-k-surface border border-k-border rounded-xl p-4 flex flex-wrap gap-4 items-end">
        <div className="flex-1 min-w-[220px]">
          <label className="text-[11px] font-bold text-k-text3 uppercase tracking-wider block mb-1.5">OTM</label>
          <select value={otmId} onChange={e => setOtmId(e.target.value)}
            className="w-full bg-k-raised border border-k-border rounded-lg px-4 py-2.5 text-sm text-k-text outline-none focus:border-k-amber transition-colors">
            <option value="" className="bg-k-raised">— Seleccionar OTM —</option>
            {otms.filter(o => o.estado === 'EJECUCION').map(o => (
              <option key={o.id} value={o.id} className="bg-k-raised">{o.id} — {o.descripcion}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[11px] font-bold text-k-text3 uppercase tracking-wider block mb-1.5">Fecha</label>
          <div className="relative">
            <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-k-text3 pointer-events-none" />
            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
              className="bg-k-raised border border-k-border rounded-lg pl-9 pr-4 py-2.5 text-sm text-k-text outline-none focus:border-k-amber transition-colors" />
          </div>
        </div>
        <button onClick={generarRDC} disabled={!otmId || generando}
          className="flex items-center gap-2 bg-k-amber hover:bg-k-amber2 disabled:opacity-40 text-black font-bold text-sm px-5 py-2.5 rounded-lg transition-colors">
          {generando ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          Generar RDC .xlsm
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Personal directo',   value: totalDirecto,       color: 'text-k-green' },
          { label: 'Personal indirecto', value: totalIndirecto,     color: 'text-k-blue'  },
          { label: 'HH turno',           value: totalHH + ' HH',   color: 'text-k-amber' },
          { label: 'Equipos operativos', value: eqOperativos,       color: 'text-k-text'  },
        ].map(s => (
          <div key={s.label} className="bg-k-surface border border-k-border rounded-xl p-4">
            <div className={`font-mono text-2xl font-medium ${s.color} mb-1`}>{loading ? '…' : s.value}</div>
            <div className="text-[11px] text-k-text3 uppercase tracking-wide">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Personal del día */}
      <div className="bg-k-surface border border-k-border rounded-xl overflow-hidden">
        <div className="bg-k-raised border-b border-k-border px-4 py-3 flex items-center gap-2">
          <Users size={14} className="text-k-amber" />
          <span className="text-sm font-bold text-k-text">Personal del día</span>
          {otmId && <span className="ml-auto text-xs text-k-text3 font-mono">{otmId} · {fecha}</span>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-k-border">
                {['Cargo', 'Cantidad', 'Tipo'].map((h, i) => (
                  <th key={h} className={`px-4 py-3 text-[11px] font-bold text-k-text3 uppercase tracking-wider ${i > 0 ? 'text-center' : 'text-left'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={3} className="px-4 py-8 text-center text-k-text3 text-sm">
                  <Loader2 size={15} className="animate-spin inline mr-2" />Cargando registros…
                </td></tr>
              )}
              {!loading && !otmId && (
                <tr><td colSpan={3} className="px-4 py-8 text-center text-k-text3 text-sm">
                  Selecciona un proyecto para ver el personal del día
                </td></tr>
              )}
              {!loading && otmId && porCargo.length === 0 && (
                <tr><td colSpan={3} className="px-4 py-8 text-center text-k-text3 text-sm">
                  Sin registros para {otmId} el {fecha}
                </td></tr>
              )}
              {porCargo.map(c => (
                <tr key={c.cargo} className="border-b border-k-border last:border-0 hover:bg-k-raised/40 transition-colors">
                  <td className="px-4 py-3 text-sm text-k-text">{c.cargo}</td>
                  <td className="px-4 py-3 text-center font-mono text-sm font-bold text-k-text">{c.cantidad}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-[10px] font-bold uppercase tracking-wide px-2.5 py-0.5 rounded border ${
                      c.tipo === 'Directo'
                        ? 'text-k-green bg-green-500/10 border-green-500/20'
                        : 'text-k-blue  bg-blue-500/10  border-blue-500/20'
                    }`}>{c.tipo}</span>
                  </td>
                </tr>
              ))}
            </tbody>
            {!loading && porCargo.length > 0 && (
              <tfoot>
                <tr className="bg-k-raised border-t border-k-border">
                  <td className="px-4 py-3 text-[11px] font-bold text-k-text3 uppercase tracking-wider">Total</td>
                  <td className="px-4 py-3 text-center font-mono text-sm font-bold text-k-amber">{totalDirecto + totalIndirecto}</td>
                  <td className="px-4 py-3 text-center text-[11px] text-k-text3">
                    <span className="text-k-green">{totalDirecto} dir.</span>
                    {' · '}
                    <span className="text-k-blue">{totalIndirecto} ind.</span>
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Equipos / Vehículos */}
      <div className="bg-k-surface border border-k-border rounded-xl overflow-hidden">
        <div className="bg-k-raised border-b border-k-border px-4 py-3 flex items-center gap-2">
          <Package size={14} className="text-k-amber" />
          <span className="text-sm font-bold text-k-text">Equipos / Vehículos</span>
        </div>

        {/* Form */}
        <div className="p-4 border-b border-k-border flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[130px]">
            <label className="text-[11px] font-bold text-k-text3 uppercase tracking-wider block mb-1.5">Placa / ID</label>
            <input type="text" placeholder="ABC-123"
              value={formPlaca}
              onChange={e => setFormPlaca(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && agregarEquipo()}
              className="w-full bg-k-raised border border-k-border rounded-lg px-3 py-2 text-sm text-k-text placeholder:text-k-text3 font-mono outline-none focus:border-k-amber transition-colors" />
          </div>
          <div>
            <label className="text-[11px] font-bold text-k-text3 uppercase tracking-wider block mb-1.5">Tipo</label>
            <select value={formTipo} onChange={e => setFormTipo(e.target.value)}
              className="bg-k-raised border border-k-border rounded-lg px-3 py-2 text-sm text-k-text outline-none focus:border-k-amber transition-colors">
              {TIPOS_EQUIPO.map(t => <option key={t} value={t} className="bg-k-raised">{t}</option>)}
            </select>
          </div>
          <div className="w-20">
            <label className="text-[11px] font-bold text-k-text3 uppercase tracking-wider block mb-1.5">Qty</label>
            <input type="number" min={1} max={99}
              value={formQty}
              onChange={e => setFormQty(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-full bg-k-raised border border-k-border rounded-lg px-3 py-2 text-sm text-k-text outline-none focus:border-k-amber transition-colors" />
          </div>
          <button onClick={agregarEquipo} disabled={!formPlaca.trim()}
            className="flex items-center gap-2 bg-k-amber hover:bg-k-amber2 disabled:opacity-40 text-black font-bold text-sm px-4 py-2 rounded-lg transition-colors">
            <Plus size={14} /> Agregar
          </button>
        </div>

        {/* Lista */}
        {equipos.length === 0 ? (
          <p className="text-center text-k-text3 text-sm py-7">Sin equipos agregados</p>
        ) : (
          <div className="divide-y divide-k-border">
            {equipos.map(e => (
              <div key={e.id} className="flex items-center gap-3 px-4 py-3 hover:bg-k-raised/40 transition-colors">
                <span className="font-mono text-sm font-bold text-k-text flex-1">{e.placa}</span>
                <span className="text-xs text-k-text2 w-28">{e.tipo}</span>
                <span className="font-mono text-xs text-k-text3 w-8 text-center">×{e.qty}</span>
                <button onClick={() => toggleOperativo(e.id)}
                  className={`text-[10px] font-bold uppercase tracking-wide px-2.5 py-0.5 rounded border transition-colors ${
                    e.operativo
                      ? 'text-k-green bg-green-500/10 border-green-500/20 hover:bg-green-500/20'
                      : 'text-k-red   bg-red-500/10   border-red-500/20   hover:bg-red-500/20'
                  }`}>
                  {e.operativo ? 'Operativo' : 'Inoperativo'}
                </button>
                <button onClick={() => eliminarEquipo(e.id)} className="text-k-text3 hover:text-k-red transition-colors ml-1">
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
        {equipos.length > 0 && (
          <div className="px-4 py-2 border-t border-k-border bg-k-raised">
            <span className="text-[11px] text-k-text3">{equipos.length} equipos · {eqOperativos} unidades operativas</span>
          </div>
        )}
      </div>

    </div>
  )
}