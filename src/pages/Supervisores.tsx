import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Calendar, CheckCircle, XCircle, Clock, Hash, Mail, Grid3X3,
  Loader2, Users, Search, X, ChevronDown, ChevronUp, UserPlus,
  Plus, Pencil, Trash2, Copy, AlertTriangle,
} from 'lucide-react'
import { Link } from 'react-router-dom'

import { api, ApiError } from '@/lib/api'
import { TabsPagina } from '@/components/TabsPagina'
import { useTab, type TabDef } from '@/lib/tabs'
import MatrizSupervisores from '@/pages/MatrizSupervisores'

interface Supervisor  { id: string; nombre: string; email?: string }
/** Respuesta del alta: trae el acceso a la app solo si acaba de crearlo. */
interface AltaSup { nombre: string; usuario?: string | null; password?: string | null }
interface Registro    { id: number; supervisor_id: string; otm_id: string; trab_id: string; hh: number | null }
interface Trabajador  { id: string; nombre: string; cargo: string; activo: boolean }
/** `en_otras` = en cuántas cuadrillas MÁS está esa persona. Dos supervisores
 *  que la tienen en su lista la tarean los dos el mismo día. */
interface CuaItem     { trab_id: string; nombre: string; cargo: string; orden: number; en_otras?: number }
interface Cuadrilla   {
  id: number; nombre: string; total: number; miembros: CuaItem[]
  /** Quién la armó. No es dueño: las cuadrillas las usa cualquier supervisor. */
  creada_por?: string | null; creada_por_nombre?: string | null
}
interface SinCuadrilla { id: string; nombre: string; cargo: string; tipo: string }

const hoy = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

// ── Una cuadrilla: renombrar, duplicar, borrar y editar su gente ────
// No hay «asignar»: la cuadrilla es una lista que usa cualquier supervisor.
// Duplicar sirve para las variantes («Encofrado» y «Encofrado sin los dos que
// están de descanso») sin volver a armarla.
function TarjetaCuadrilla({ cua, abierta, onAlternar, onCambio }: {
  cua: Cuadrilla; abierta: boolean
  onAlternar: () => void; onCambio: () => void
}) {
  const [busq, setBusq] = useState('')
  const [renombrando, setRenombrando] = useState(false)
  const [nombre, setNombre] = useState(cua.nombre)
  const [confirmaBorrar, setConfirmaBorrar] = useState(false)
  const [duplicando, setDuplicando] = useState(false)
  const [nombreCopia, setNombreCopia] = useState('')

  const { data: trabajadores = [] } = useQuery<Trabajador[]>({
    queryKey: ['trabajadores'],
    queryFn: () => api<Trabajador[]>('/admin/trabajadores'),
    staleTime: 5 * 60 * 1000,
  })
  const miembrosSet = useMemo(() => new Set(cua.miembros.map(m => m.trab_id)), [cua.miembros])

  const resultados = useMemo(() => {
    const q = busq.trim().toLowerCase()
    if (!q) return []
    return trabajadores
      .filter(t => t.activo && !miembrosSet.has(t.id) && (
        t.nombre.toLowerCase().includes(q) ||
        t.cargo.toLowerCase().includes(q) ||
        t.id.toLowerCase() === q
      ))
      .slice(0, 6)
  }, [busq, trabajadores, miembrosSet])

  const agregar = useMutation({
    mutationFn: (trabId: string) =>
      api(`/api/cuadrilla-grupo/${cua.id}/miembro/${trabId}`, { method: 'POST' }),
    onSuccess: () => { onCambio(); setBusq('') },
  })
  const quitar = useMutation({
    mutationFn: (trabId: string) =>
      api(`/api/cuadrilla-grupo/${cua.id}/miembro/${trabId}`, { method: 'DELETE' }),
    onSuccess: onCambio,
  })
  const renombrar = useMutation({
    mutationFn: (n: string) =>
      api(`/api/cuadrilla-grupo/${cua.id}`, { method: 'PATCH', body: JSON.stringify({ nombre: n }) }),
    onSuccess: () => { onCambio(); setRenombrando(false) },
  })
  const borrar = useMutation({
    mutationFn: () => api(`/api/cuadrilla-grupo/${cua.id}`, { method: 'DELETE' }),
    onSuccess: onCambio,
  })
  const duplicar = useMutation({
    mutationFn: () => api(`/api/cuadrilla-grupo/${cua.id}/duplicar`, {
      method: 'POST',
      body: JSON.stringify({ nombre: nombreCopia.trim() }),
    }),
    onSuccess: () => { onCambio(); setDuplicando(false) },
  })
  const abrirDuplicar = () => {
    setNombreCopia(`${cua.nombre} (copia)`)
    setDuplicando(true)
    duplicar.reset()
  }

  return (
    <div className={`bg-k-raised border rounded-lg overflow-hidden transition-colors ${
      abierta ? 'border-amber-500/30' : 'border-k-border'}`}>

      <div className="flex items-center gap-3 px-3 py-2.5">
        <div className="w-7 h-7 rounded-md bg-amber-500/10 border border-amber-500/20
                        flex items-center justify-center flex-shrink-0">
          <Users size={13} className="text-k-amber" />
        </div>

        {renombrando ? (
          <div className="flex-1 flex items-center gap-2">
            <input
              value={nombre} onChange={e => setNombre(e.target.value)} autoFocus
              onKeyDown={e => {
                if (e.key === 'Enter' && nombre.trim()) renombrar.mutate(nombre.trim())
                if (e.key === 'Escape') { setNombre(cua.nombre); setRenombrando(false); renombrar.reset() }
              }}
              className="flex-1 bg-k-void border border-k-border rounded px-2 py-1 text-sm
                         text-k-text outline-none focus:border-k-amber" />
            <button onClick={() => renombrar.mutate(nombre.trim())}
              disabled={!nombre.trim() || renombrar.isPending}
              className="text-k-green hover:opacity-70 disabled:opacity-40"><CheckCircle size={15} /></button>
            <button onClick={() => { setNombre(cua.nombre); setRenombrando(false); renombrar.reset() }}
              className="text-k-text3 hover:text-k-text"><X size={15} /></button>
          </div>
        ) : (
          <button onClick={onAlternar} className="flex-1 min-w-0 text-left">
            <span className="text-sm font-bold text-k-text">{cua.nombre}</span>
            <span className="text-[11px] text-k-text3 ml-2">
              {cua.total} {cua.total === 1 ? 'persona' : 'personas'}
            </span>
          </button>
        )}

        {!renombrando && (
          <div className="flex items-center gap-1">
            <button onClick={abrirDuplicar} title="Duplicar esta cuadrilla"
              className="text-k-text3 hover:text-k-blue p-1"><Copy size={12} /></button>
            <button onClick={() => { setNombre(cua.nombre); setRenombrando(true) }}
              title="Renombrar"
              className="text-k-text3 hover:text-k-amber p-1"><Pencil size={12} /></button>
            <button onClick={() => setConfirmaBorrar(true)} title="Eliminar cuadrilla"
              className="text-k-text3 hover:text-k-red p-1"><Trash2 size={12} /></button>
            <button onClick={onAlternar} className="text-k-text3 hover:text-k-text p-1">
              {abierta ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          </div>
        )}
      </div>

      {renombrar.isError && (
        <p className="text-xs text-k-red px-3 pb-2">
          {(renombrar.error as ApiError).message}
        </p>
      )}

      {duplicando && (
        <div className="mx-3 mb-2.5 bg-blue-500/5 border border-blue-500/20 rounded-lg
                        px-3 py-2.5 space-y-2">
          <p className="text-[11px] text-k-text3">
            Copia las <b className="text-k-text2">{cua.total}</b> personas de «{cua.nombre}»
            a una lista nueva. Desde ahí las dos van por su cuenta.
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <input value={nombreCopia} onChange={e => setNombreCopia(e.target.value)} autoFocus
              placeholder="Nombre de la copia"
              className="flex-1 min-w-[160px] bg-k-void border border-k-border rounded-lg
                         px-3 py-1.5 text-sm text-k-text outline-none focus:border-k-amber" />
            <button onClick={() => duplicar.mutate()}
              disabled={!nombreCopia.trim() || duplicar.isPending}
              className="btn btn-secundario btn-sm">
              {duplicar.isPending ? <Loader2 size={12} className="animate-spin" /> : <Copy size={12} />}
              Duplicar
            </button>
            <button onClick={() => setDuplicando(false)} className="text-k-text3 hover:text-k-text">
              <X size={15} />
            </button>
          </div>
          {duplicar.isError && (
            <p className="text-xs text-k-red">{(duplicar.error as ApiError).message}</p>
          )}
        </div>
      )}

      {confirmaBorrar && (
        <div className="mx-3 mb-2.5 bg-red-500/5 border border-red-500/20 rounded-lg px-3 py-2.5
                        flex items-center gap-3 flex-wrap">
          <p className="text-xs text-k-text2 flex-1">
            ¿Eliminar «{cua.nombre}»? Deja de aparecer en el teléfono del supervisor.
            Los partes ya enviados no se tocan.
          </p>
          <button onClick={() => borrar.mutate()} disabled={borrar.isPending}
            className="btn btn-peligro btn-sm">
            {borrar.isPending ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
            Eliminar
          </button>
          <button onClick={() => setConfirmaBorrar(false)} className="btn btn-terciario btn-sm">
            Cancelar
          </button>
        </div>
      )}

      {abierta && (
        <div className="px-3 pb-3 space-y-2 border-t border-k-border pt-3">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-k-text3 pointer-events-none" />
            <input
              type="text" value={busq} onChange={e => setBusq(e.target.value)}
              placeholder="Buscar trabajador para agregar…"
              className="w-full bg-k-void border border-k-border2 rounded-lg pl-9 pr-4 py-2
                         text-sm text-k-text placeholder:text-k-text3 outline-none
                         focus:border-k-amber transition-colors" />
          </div>

          {resultados.length > 0 && (
            <div className="bg-k-surface border border-k-border rounded-lg overflow-hidden">
              {resultados.map(t => (
                <div key={t.id}
                  className="flex items-center gap-3 px-3 py-2.5 border-b border-k-border
                             last:border-0 hover:bg-k-border/30 transition-colors">
                  <div className="flex-1 min-w-0">
                    <span className="font-mono text-[10px] text-k-amber mr-2">{t.id}</span>
                    <span className="text-sm font-medium text-k-text">{t.nombre}</span>
                    <span className="text-[10px] text-k-text3 ml-2">{t.cargo}</span>
                  </div>
                  <button onClick={() => agregar.mutate(t.id)} disabled={agregar.isPending}
                    className="flex items-center gap-1 text-[11px] font-bold text-k-green
                               bg-green-500/10 border border-green-500/20 hover:bg-green-500/20
                               disabled:opacity-40 px-2.5 py-1 rounded-lg transition-colors">
                    + Agregar
                  </button>
                </div>
              ))}
            </div>
          )}

          {cua.miembros.length === 0 ? (
            <div className="text-center py-4 bg-k-surface border border-dashed border-k-border
                            rounded-lg text-k-text3 text-sm">
              Cuadrilla vacía — búscalos arriba y agrégalos
            </div>
          ) : (
            <div className="space-y-1.5">
              {cua.miembros.map(m => (
                <div key={m.trab_id}
                  className="flex items-center gap-3 bg-k-surface border border-k-border
                             rounded-lg px-3 py-2 group">
                  <div className="w-6 h-6 rounded bg-green-500/10 border border-green-500/20
                                  flex items-center justify-center text-[10px] flex-shrink-0">
                    👷
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="font-mono text-[10px] text-k-amber mr-2">{m.trab_id}</span>
                    <span className="text-sm font-medium text-k-text">{m.nombre}</span>
                    <span className="text-[10px] text-k-text3 ml-2">{m.cargo}</span>
                    {(m.en_otras ?? 0) > 0 && (
                      <span title="Está en más cuadrillas: si dos supervisores la tarean el mismo día, sus horas se duplican"
                        className="inline-flex items-center gap-1 text-[10px] font-bold text-k-alerta
                                   bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5
                                   rounded ml-2 align-middle">
                        <AlertTriangle size={9} /> en {m.en_otras! + 1} cuadrillas
                      </span>
                    )}
                  </div>
                  <button onClick={() => quitar.mutate(m.trab_id)} disabled={quitar.isPending}
                    className="opacity-0 group-hover:opacity-100 flex items-center gap-1
                               text-[11px] font-bold text-k-red bg-red-500/10
                               border border-red-500/20 hover:bg-red-500/20 disabled:opacity-40
                               px-2 py-1 rounded transition-all duration-150">
                    <X size={10} /> Quitar
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Catálogo: todas las cuadrillas de la empresa ──────────────
// La cuadrilla existe por sí misma y el supervisor es una asignación que
// cambia (0047): lo que rota en obra es el mando, no la gente. Aquí se ve el
// conjunto, se reparte y se duplica, en vez de teclear la lista otra vez con
// cada supervisor nuevo.
function CatalogoCuadrillas() {
  const qc = useQueryClient()
  const [abierta, setAbierta] = useState<number | null>(null)
  const [creando, setCreando] = useState(false)
  const [nombreNuevo, setNombreNuevo] = useState('')

  const { data: cuadrillas = [], isLoading } = useQuery<Cuadrilla[]>({
    queryKey: ['cuadrillas-catalogo'],
    queryFn: () => api<Cuadrilla[]>('/api/cuadrillas'),
  })

  // Toda vista de cuadrillas se invalida a la vez: la misma cuadrilla sale en
  // el catálogo y en la ficha de su supervisor.
  const refrescar = () => {
    qc.invalidateQueries({ queryKey: ['cuadrillas-catalogo'] })
    qc.invalidateQueries({ queryKey: ['cuadrillas'] })
  }

  const crear = useMutation({
    mutationFn: (nombre: string) =>
      api('/api/cuadrillas', { method: 'POST', body: JSON.stringify({ nombre, trab_ids: [] }) }),
    onSuccess: (r) => {
      refrescar(); setNombreNuevo(''); setCreando(false)
      const id = (r as { id?: number })?.id
      if (id) setAbierta(id)
    },
  })

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-k-text2 text-sm">
          Listas de gente que cualquier supervisor puede usar al reportar ·{' '}
          <b className="text-k-text">{cuadrillas.length}</b>
        </p>
        {!creando && (
          <button onClick={() => setCreando(true)} className="btn btn-primario btn-sm">
            <Plus size={13} /> Nueva cuadrilla
          </button>
        )}
      </div>

      {creando && (
        <div className="bg-k-surface border border-amber-500/20 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2">
            <input value={nombreNuevo} onChange={e => setNombreNuevo(e.target.value)} autoFocus
              onKeyDown={e => { if (e.key === 'Enter' && nombreNuevo.trim()) crear.mutate(nombreNuevo.trim()) }}
              placeholder="Nombre: Excavación, Encofrado, Cuadrilla A…"
              className="flex-1 bg-k-raised border border-k-border rounded-lg px-3 py-2 text-sm
                         text-k-text placeholder:text-k-text3 outline-none focus:border-k-amber" />
            <button onClick={() => crear.mutate(nombreNuevo.trim())}
              disabled={!nombreNuevo.trim() || crear.isPending}
              className="btn btn-primario btn-sm">
              {crear.isPending ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle size={13} />}
              Crear
            </button>
            <button onClick={() => { setCreando(false); setNombreNuevo(''); crear.reset() }}
              className="text-k-text3 hover:text-k-text"><X size={15} /></button>
          </div>
          {crear.isError && <p className="text-xs text-k-red">{(crear.error as ApiError).message}</p>}
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-k-text3">
          <Loader2 size={18} className="animate-spin mr-2" /> Cargando cuadrillas…
        </div>
      ) : cuadrillas.length === 0 ? (
        <div className="text-center py-12 bg-k-surface border border-dashed border-k-border
                        rounded-xl text-k-text3 text-sm">
          Todavía no hay cuadrillas. Crea la primera: es la lista que el supervisor
          elige de un toque en vez de buscar quince nombres.
        </div>
      ) : (
        <div className="space-y-2">
          {cuadrillas.map(c => (
            <TarjetaCuadrilla
              key={c.id} cua={c}
              abierta={abierta === c.id}
              onAlternar={() => setAbierta(abierta === c.id ? null : c.id)}
              onCambio={refrescar} />
          ))}
        </div>
      )}

      <SinCuadrillaAviso />

      <div className="bg-k-raised border border-k-border rounded-xl p-4">
        <p className="text-[11px] text-k-text3 leading-relaxed">
          <span className="text-k-blue font-bold">ℹ️ Las cuadrillas no son de nadie. </span>
          Son listas preestablecidas para que el registro diario sea de un toque:
          todos los supervisores las ven todas, y cada uno encuentra arriba las que
          armó él. Quién reportó qué lo guarda el parte, no la lista.
        </p>
      </div>
    </div>
  )
}

// ── Quién no está en ninguna lista ────────────────────────────
// El reverso del aviso de solapamiento: a estos no los encuentra nadie en una
// cuadrilla guardada, así que o se tarean a mano cada día o —lo que pasa de
// verdad— se quedan sin tarear.
function SinCuadrillaAviso() {
  const [abierto, setAbierto] = useState(false)
  const { data: sueltos = [] } = useQuery<SinCuadrilla[]>({
    queryKey: ['sin-cuadrilla'],
    queryFn: () => api<SinCuadrilla[]>('/api/trabajadores-sin-cuadrilla'),
  })

  if (!sueltos.length) return (
    <div className="flex items-center gap-2 text-[11px] text-k-text3 px-1">
      <CheckCircle size={12} className="text-k-green" />
      Todo el personal activo está en alguna cuadrilla.
    </div>
  )

  return (
    <div className="bg-k-surface border border-amber-500/20 rounded-xl overflow-hidden">
      <button onClick={() => setAbierto(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-k-raised/50
                   transition-colors">
        <AlertTriangle size={15} className="text-k-alerta flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-k-text">
            {sueltos.length} {sueltos.length === 1 ? 'persona' : 'personas'} sin cuadrilla
          </p>
          <p className="text-[11px] text-k-text3">
            Nadie las encuentra en una lista guardada: hay que agregarlas a mano cada día.
          </p>
        </div>
        {abierto ? <ChevronUp size={15} className="text-k-text3" />
                 : <ChevronDown size={15} className="text-k-text3" />}
      </button>
      {abierto && (
        <div className="px-4 pb-4 space-y-1.5">
          {sueltos.map(t => (
            <div key={t.id}
              className="flex items-center gap-3 bg-k-raised border border-k-border
                         rounded-lg px-3 py-2">
              <span className="font-mono text-[10px] text-k-amber">{t.id}</span>
              <span className="text-sm font-medium text-k-text flex-1 min-w-0">{t.nombre}</span>
              <span className="text-[10px] text-k-text3">{t.cargo}</span>
              <span className="text-[9px] text-k-text3 uppercase tracking-wide
                               border border-k-border rounded px-1.5 py-0.5">{t.tipo}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────
const TABS: TabDef[] = [
  { id: 'estado', label: 'Estado del día', icon: Calendar },
  { id: 'cuadrillas', label: 'Cuadrillas', icon: Users },
  { id: 'matriz', label: 'Reportes por semana', icon: Grid3X3 },
]

export default function Supervisores() {
  const [tab, setTab] = useTab(TABS)
  return (
    <div className="space-y-5">
      <TabsPagina tabs={TABS} activo={tab} onCambiar={setTab} />
      {tab === 'estado' && <PanelEstadoDia />}
      {tab === 'cuadrillas' && <CatalogoCuadrillas />}
      {tab === 'matriz' && <MatrizSupervisores />}
    </div>
  )
}

function PanelEstadoDia() {
  const [fecha, setFecha]           = useState(hoy)
  const [showNuevo, setShowNuevo]   = useState(false)

  const { data: supervisores = [], isLoading: loadSup } = useQuery<Supervisor[]>({
    queryKey: ['supervisores'],
    queryFn: () => api<Supervisor[]>('/api/supervisores'),
    staleTime: 5 * 60 * 1000,
  })

  const { data: registros = [], isLoading: loadReg } = useQuery<Registro[]>({
    queryKey: ['registros', fecha],
    queryFn: () => api<Registro[]>(`/api/registros/${fecha}`),
  })

  const isLoading = loadSup || loadReg

  const statsPorSup = supervisores.map(s => {
    const regs      = registros.filter(r => r.supervisor_id === s.id)
    const trabUnicos = new Set(regs.map(r => r.trab_id)).size
    const otmsUnicos = new Set(regs.map(r => r.otm_id)).size
    const hhTotal    = regs.reduce((sum, r) => sum + (r.hh ?? 0), 0)
    return { ...s, regs: regs.length, trabUnicos, otmsUnicos, hhTotal, reporto: regs.length > 0 }
  })

  const reportaron = statsPorSup.filter(s => s.reporto).length
  const pendientes = statsPorSup.filter(s => !s.reporto).length
  const totalRegs  = registros.length
  const totalHH    = registros.reduce((s, r) => s + (r.hh ?? 0), 0).toFixed(1)

  return (
    <div className="space-y-5">

      {/* Header con selector de fecha */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-k-text2 text-sm">Estado de reporte por supervisor</p>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowNuevo(v => !v)}
            className="flex items-center gap-1.5 text-xs font-bold text-k-amber bg-amber-500/10 border border-amber-500/20 px-3 py-2.5 rounded-lg hover:bg-amber-500/20 transition-colors">
            <UserPlus size={13} /> Agregar supervisor
          </button>
          <div className="relative">
            <Calendar size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-k-text3 pointer-events-none" />
            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
              className="bg-k-raised border border-k-border rounded-lg pl-9 pr-4 py-2.5
                         text-sm text-k-text outline-none focus:border-k-amber transition-colors" />
          </div>
        </div>
      </div>

      {showNuevo && <NombrarSupervisor onCerrar={() => setShowNuevo(false)} />}

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Reportaron',      value: reportaron,       color: 'text-k-green' },
          { label: 'Pendientes',      value: pendientes,       color: pendientes > 0 ? 'text-k-red' : 'text-k-text3' },
          { label: 'Registros total', value: totalRegs,        color: 'text-k-blue'  },
          { label: 'HH del día',      value: totalHH + ' HH', color: 'text-k-amber' },
        ].map(s => (
          <div key={s.label} className="bg-k-surface border border-k-border rounded-xl p-4">
            <div className={`font-mono text-2xl font-medium ${s.color} mb-1`}>
              {isLoading ? '…' : s.value}
            </div>
            <div className="text-[10px] text-k-text3 uppercase tracking-wide">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Lista de supervisores */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-k-text3">
          <Loader2 size={18} className="animate-spin mr-2" /> Cargando…
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {statsPorSup.map(s => {
            return (
              <div key={s.id}
                className={`bg-k-surface rounded-xl border transition-colors ${
                  s.reporto ? 'border-green-500/20' : 'border-k-border'
                }`}>

                {/* Fila principal */}
                <div className="p-5 flex items-center gap-5 flex-wrap">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    s.reporto ? 'bg-green-500/10' : 'bg-k-raised'}`}>
                    {s.reporto
                      ? <CheckCircle size={22} className="text-k-green" />
                      : <XCircle    size={22} className="text-k-text3" />}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap mb-1">
                      <span className="font-bold text-base text-k-text">{s.nombre}</span>
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border ${
                        s.reporto
                          ? 'text-k-green bg-green-500/10 border-green-500/20'
                          : 'text-k-text3 bg-k-raised border-k-border'
                      }`}>
                        {s.reporto ? '✓ Reportó' : '✗ Sin reporte'}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 flex-wrap">
                      <span className="flex items-center gap-1.5 text-[11px] text-k-text3">
                        <Hash size={11} /> {s.id}
                      </span>
                      {s.email && (
                        <span className="flex items-center gap-1.5 text-[11px] text-k-text3">
                          <Mail size={11} /> {s.email}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Stats del día */}
                  {s.reporto ? (
                    <div className="flex gap-6">
                      {[
                        { label: 'Registros',    value: s.regs,       color: 'text-k-blue'  },
                        { label: 'Trabajadores', value: s.trabUnicos, color: 'text-k-text'  },
                        { label: 'Proyectos',         value: s.otmsUnicos, color: 'text-k-amber' },
                        { label: 'HH', value: s.hhTotal > 0 ? s.hhTotal.toFixed(1) : '—', color: 'text-k-green' },
                      ].map(m => (
                        <div key={m.label} className="text-center">
                          <div className={`font-mono text-xl font-medium ${m.color}`}>{m.value}</div>
                          <div className="text-[9px] text-k-text3 uppercase tracking-wide">{m.label}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-k-text3">
                      <Clock size={14} />
                      <span className="text-xs">Sin actividad el {fecha}</span>
                    </div>
                  )}

                </div>

              </div>
            )
          })}
        </div>
      )}

      <div className="bg-k-raised border border-k-border rounded-xl p-4">
        <p className="text-[11px] text-k-text3 leading-relaxed">
          <span className="text-k-amber font-bold">ℹ️ Supervisor = un rol, no otra persona. </span>
          Todo el que reporta está antes en el padrón de <b className="text-k-text2">Trabajadores</b>;
          nombrarlo aquí le agrega el rol y su acceso a la app. Escribir el nombre a mano crea una
          segunda ficha de la misma persona, y a partir de ahí sus HH viven en dos sitios.
        </p>
      </div>
    </div>
  )
}

// ── Nombrar supervisor: se elige del padrón ──────────────────
// Antes se escribía el nombre a mano y eso creaba una ficha nueva. El camino
// natural es al revés: el supervisor ya es personal del proyecto, así que se
// busca y se le da el rol. El alta libre sigue existiendo —hace falta para un
// externo— pero deja de ser lo primero que se puede hacer.
function NombrarSupervisor({ onCerrar }: { onCerrar: () => void }) {
  const qc = useQueryClient()
  const [busq, setBusq] = useState('')
  const [email, setEmail] = useState('')
  const [libre, setLibre] = useState(false)
  const [acceso, setAcceso] = useState<AltaSup | null>(null)

  const { data: trabajadores = [] } = useQuery<Trabajador[]>({
    queryKey: ['trabajadores'],
    queryFn: () => api<Trabajador[]>('/admin/trabajadores'),
  })
  const { data: fichas = [] } = useQuery<{ trabajador_id?: string | null }[]>({
    queryKey: ['supervisores-all'],
    queryFn: () => api<{ trabajador_id?: string | null }[]>('/admin/supervisores'),
  })
  const yaSup = useMemo(
    () => new Set(fichas.map(f => f.trabajador_id).filter(Boolean) as string[]), [fichas])

  const q = busq.trim().toUpperCase()
  const resultados = useMemo(() => {
    if (q.length < 2) return []
    return trabajadores
      .filter(t => t.activo && !yaSup.has(t.id) &&
        (t.nombre.toUpperCase().includes(q) || t.cargo.toUpperCase().includes(q) || t.id === q))
      .slice(0, 8)
  }, [q, trabajadores, yaSup])

  const guardar = (body: object) => api<AltaSup>('/admin/supervisor' + (libre ? '' : '/desde-trabajador'),
    { method: 'POST', body: JSON.stringify(body) })
  const nombrar = useMutation({
    mutationFn: guardar,
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['supervisores'] })
      qc.invalidateQueries({ queryKey: ['supervisores-all'] })
      qc.invalidateQueries({ queryKey: ['trabajadores'] })
      setAcceso(r); setBusq(''); setEmail(''); setLibre(false)
    },
  })

  if (acceso) return (
    <div className="bg-k-surface border border-green-500/30 rounded-xl p-4 flex items-start gap-3">
      <CheckCircle size={16} className="text-k-green mt-0.5 flex-shrink-0" />
      <div className="flex-1 text-sm text-k-text2">
        <b className="text-k-text">{acceso.nombre}</b> ya es supervisor.
        {acceso.usuario ? <> Su acceso a la app: usuario{' '}
          <b className="font-mono text-k-amber">{acceso.usuario}</b> · clave{' '}
          <b className="font-mono text-k-amber">{acceso.password}</b>.
          <span className="block text-[11px] text-k-text3 mt-0.5">
            Anótalo ahora: la clave no se puede volver a consultar.
          </span></> : <> Ya tenía acceso a la app; conserva su usuario y su clave.</>}
      </div>
      <button onClick={() => { setAcceso(null); onCerrar() }}
        className="text-k-text3 hover:text-k-text"><X size={16} /></button>
    </div>
  )

  return (
    <div className="bg-k-surface border border-amber-500/20 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <p className="text-[11px] font-bold text-k-text3 uppercase tracking-widest flex-1">
          Elige a quién nombrar supervisor
        </p>
        <button onClick={onCerrar} className="text-k-text3 hover:text-k-text"><X size={15} /></button>
      </div>

      <div className="relative">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-k-text3 pointer-events-none" />
        <input value={busq} onChange={e => { setBusq(e.target.value); setLibre(false) }} autoFocus
          placeholder="Buscar en el padrón por nombre, cargo o ID…"
          className="w-full bg-k-raised border border-k-border rounded-lg pl-9 pr-4 py-2.5 text-sm text-k-text placeholder:text-k-text3 outline-none focus:border-k-amber transition-colors" />
      </div>

      {resultados.length > 0 && (
        <div className="bg-k-raised border border-k-border rounded-lg overflow-hidden">
          {resultados.map(t => (
            <div key={t.id} className="flex items-center gap-3 px-3 py-2.5 border-b border-k-border last:border-0 hover:bg-k-border/30 transition-colors">
              <div className="flex-1 min-w-0">
                <span className="font-mono text-[10px] text-k-amber mr-2">{t.id}</span>
                <span className="text-sm font-medium text-k-text">{t.nombre}</span>
                <span className="text-[10px] text-k-text3 ml-2">{t.cargo}</span>
              </div>
              <button onClick={() => nombrar.mutate({ trabajador_id: t.id })}
                disabled={nombrar.isPending}
                className="flex items-center gap-1 text-[11px] font-bold text-k-green bg-green-500/10 border border-green-500/20 hover:bg-green-500/20 disabled:opacity-40 px-2.5 py-1 rounded-lg transition-colors">
                <UserPlus size={12} /> Nombrar supervisor
              </button>
            </div>
          ))}
        </div>
      )}

      {/* No está en el padrón: el camino correcto es registrarlo como
          trabajador. El alta libre queda como salida para un externo. */}
      {q.length >= 2 && resultados.length === 0 && (
        <div className="bg-k-raised border border-dashed border-k-border rounded-lg px-4 py-3 space-y-2">
          <p className="text-sm text-k-text2">
            <b className="text-k-text">«{busq.trim()}»</b> no está en el padrón de trabajadores.
          </p>
          <p className="text-[11px] text-k-text3">
            Regístralo primero en <b className="text-k-text2">Trabajadores</b> (ahí eliges si es
            directo o indirecto y puedes marcarlo como supervisor de una vez). Si ya está y no
            aparece, puede que sea supervisor o esté dado de baja.
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Link to="/trabajadores" className="btn btn-secundario btn-sm">
              <Users size={13} /> Ir a Trabajadores
            </Link>
            {!libre ? (
              <button onClick={() => setLibre(true)} className="text-[11px] text-k-text3 hover:text-k-amber underline">
                Es alguien externo: registrarlo solo como supervisor
              </button>
            ) : (
              <>
                <input value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="correo@kampfer.pe (opcional)"
                  className="bg-k-void border border-k-border rounded-lg px-3 py-2 text-sm text-k-text outline-none focus:border-k-amber" />
                <button onClick={() => nombrar.mutate({ nombre: busq.trim().toUpperCase(), email })}
                  disabled={nombrar.isPending}
                  className="btn btn-primario btn-sm">
                  {nombrar.isPending ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle size={13} />}
                  Registrar «{busq.trim().toUpperCase()}»
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {q.length > 0 && q.length < 2 && (
        <p className="text-[11px] text-k-text3">Escribe al menos dos letras.</p>
      )}
      {nombrar.isError && (
        <p className="text-xs text-k-red">{(nombrar.error as ApiError).message}</p>
      )}
    </div>
  )
}