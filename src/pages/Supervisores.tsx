import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Calendar, CheckCircle, XCircle, Clock, Hash, Mail,
  Loader2, Users, Search, X, ChevronDown, ChevronUp, UserPlus,
} from 'lucide-react'

import { API_BASE } from '@/lib/api'
const API = API_BASE

interface Supervisor  { id: string; nombre: string; email?: string }
interface Registro    { id: number; supervisor_id: string; otm_id: string; trab_id: string; hh: number | null }
interface Trabajador  { id: string; nombre: string; cargo: string; activo: boolean }
interface CuaItem     { trab_id: string; nombre: string; cargo: string }

const hoy = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

// ── Sub-componente: gestión de cuadrilla de un supervisor ──
function CuadrillaPanel({ supId, supNombre }: { supId: string; supNombre: string }) {
  const qc = useQueryClient()
  const [busq, setBusq] = useState('')

  const { data: miembros = [], isLoading: loadCua } = useQuery<CuaItem[]>({
    queryKey: ['cuadrilla', supId],
    queryFn: () => fetch(`${API}/api/cuadrilla/${supId}`).then(r => r.json()),
  })

  const { data: trabajadores = [] } = useQuery<Trabajador[]>({
    queryKey: ['trabajadores'],
    queryFn: () => fetch(`${API}/admin/trabajadores`).then(r => r.json()),
    staleTime: 5 * 60 * 1000,
  })

  const miembrosSet = useMemo(() => new Set(miembros.map(m => m.trab_id)), [miembros])

  const resultados = useMemo(() => {
    if (busq.length < 1) return []
    const q = busq.toLowerCase()
    return trabajadores
      .filter(t => t.activo && !miembrosSet.has(t.id) && (
        t.nombre.toLowerCase().includes(q) ||
        t.cargo.toLowerCase().includes(q) ||
        t.id === busq.padStart(3, '0')
      ))
      .slice(0, 6)
  }, [busq, trabajadores, miembrosSet])

  const agregar = useMutation({
    mutationFn: (trabId: string) =>
      fetch(`${API}/api/cuadrilla/${supId}/${trabId}`, { method: 'POST' }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cuadrilla', supId] })
      setBusq('')
    },
  })

  const quitar = useMutation({
    mutationFn: (trabId: string) =>
      fetch(`${API}/api/cuadrilla/${supId}/${trabId}`, { method: 'DELETE' }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cuadrilla', supId] }),
  })

  return (
    <div className="border-t border-k-border mt-3 pt-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-bold text-k-text3 uppercase tracking-widest">
          Cuadrilla habitual de {supNombre.split(' ')[0]}
        </p>
        <span className="font-mono text-[11px] font-bold text-k-amber bg-amber-500/10
                         border border-amber-500/20 px-2 py-0.5 rounded">
          {miembros.length} miembro{miembros.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Buscador para agregar */}
      <div className="relative">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-k-text3 pointer-events-none" />
        <input
          type="text" value={busq} onChange={e => setBusq(e.target.value)}
          placeholder="Buscar trabajador para agregar..."
          className="w-full bg-k-raised border border-k-border2 rounded-lg pl-9 pr-4 py-2
                     text-sm text-k-text placeholder:text-k-text3 outline-none focus:border-k-amber
                     transition-colors"
        />
      </div>

      {/* Resultados de búsqueda */}
      {resultados.length > 0 && (
        <div className="bg-k-raised border border-k-border rounded-lg overflow-hidden">
          {resultados.map(t => (
            <div key={t.id}
              className="flex items-center gap-3 px-3 py-2.5 border-b border-k-border last:border-0
                         hover:bg-k-border/30 transition-colors">
              <div className="flex-1 min-w-0">
                <span className="font-mono text-[10px] text-k-amber mr-2">{t.id}</span>
                <span className="text-sm font-medium text-k-text">{t.nombre}</span>
                <span className="text-[10px] text-k-text3 ml-2">{t.cargo}</span>
              </div>
              <button
                onClick={() => agregar.mutate(t.id)}
                disabled={agregar.isPending}
                className="flex items-center gap-1 text-[11px] font-bold text-k-green
                           bg-green-500/10 border border-green-500/20 hover:bg-green-500/20
                           disabled:opacity-40 px-2.5 py-1 rounded-lg transition-colors">
                + Agregar
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Lista de miembros actuales */}
      {loadCua ? (
        <div className="flex items-center gap-2 py-3 text-k-text3 text-sm">
          <Loader2 size={13} className="animate-spin" /> Cargando cuadrilla...
        </div>
      ) : miembros.length === 0 ? (
        <div className="text-center py-5 bg-k-raised border border-dashed border-k-border
                        rounded-lg text-k-text3 text-sm">
          Sin miembros — usa el buscador para agregar trabajadores a la cuadrilla
        </div>
      ) : (
        <div className="space-y-1.5">
          {miembros.map(m => (
            <div key={m.trab_id}
              className="flex items-center gap-3 bg-k-raised border border-k-border
                         rounded-lg px-3 py-2.5 group">
              <div className="w-7 h-7 rounded-md bg-green-500/10 border border-green-500/20
                              flex items-center justify-center text-xs flex-shrink-0">
                👷
              </div>
              <div className="flex-1 min-w-0">
                <span className="font-mono text-[10px] text-k-amber mr-2">{m.trab_id}</span>
                <span className="text-sm font-medium text-k-text">{m.nombre}</span>
                <span className="text-[10px] text-k-text3 ml-2">{m.cargo}</span>
              </div>
              <button
                onClick={() => quitar.mutate(m.trab_id)}
                disabled={quitar.isPending}
                className="opacity-0 group-hover:opacity-100 flex items-center gap-1 text-[11px]
                           font-bold text-k-red bg-red-500/10 border border-red-500/20
                           hover:bg-red-500/20 disabled:opacity-40 px-2 py-1 rounded
                           transition-all duration-150">
                <X size={10} /> Quitar
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────
export default function Supervisores() {
  const qc = useQueryClient()
  const [fecha, setFecha]           = useState(hoy)
  const [editando, setEditando]     = useState<string | null>(null)
  const [showNuevo, setShowNuevo]   = useState(false)
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [nuevoEmail, setNuevoEmail]   = useState('')

  const { data: supervisores = [], isLoading: loadSup } = useQuery<Supervisor[]>({
    queryKey: ['supervisores'],
    queryFn: () => fetch(API + '/api/supervisores').then(r => r.json()),
    staleTime: 5 * 60 * 1000,
  })

  const crearSupervisor = useMutation({
    mutationFn: async () => {
      const r = await fetch(API + '/admin/supervisor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: nuevoNombre, email: nuevoEmail }),
      })
      if (!r.ok) throw new Error((await r.json()).detail || 'Error al crear')
      return r.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['supervisores'] })
      setNuevoNombre(''); setNuevoEmail(''); setShowNuevo(false)
    },
  })

  const { data: registros = [], isLoading: loadReg } = useQuery<Registro[]>({
    queryKey: ['registros', fecha],
    queryFn: () => fetch(`${API}/api/registros/${fecha}`).then(r => r.json()),
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

      {/* Formulario nuevo supervisor */}
      {showNuevo && (
        <div className="bg-k-surface border border-amber-500/20 rounded-xl p-4 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-[10px] font-bold text-k-text3 uppercase tracking-wide mb-1.5">Nombre completo</label>
            <input value={nuevoNombre} onChange={e => setNuevoNombre(e.target.value)}
              placeholder="Ej: MAMANI CCOPA DAVID"
              className="w-full bg-k-raised border border-k-border rounded-lg px-3 py-2.5 text-sm text-k-text outline-none focus:border-k-amber transition-colors" />
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-[10px] font-bold text-k-text3 uppercase tracking-wide mb-1.5">Email (opcional)</label>
            <input value={nuevoEmail} onChange={e => setNuevoEmail(e.target.value)}
              placeholder="correo@kampfer.pe"
              className="w-full bg-k-raised border border-k-border rounded-lg px-3 py-2.5 text-sm text-k-text outline-none focus:border-k-amber transition-colors" />
          </div>
          <button onClick={() => crearSupervisor.mutate()}
            disabled={!nuevoNombre.trim() || crearSupervisor.isPending}
            className="flex items-center gap-2 bg-k-amber hover:bg-k-amber2 disabled:opacity-40 text-black font-bold text-sm px-4 py-2.5 rounded-lg transition-colors">
            {crearSupervisor.isPending ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
            Guardar
          </button>
          <button onClick={() => setShowNuevo(false)}
            className="flex items-center gap-2 bg-k-raised border border-k-border text-k-text2 font-bold text-sm px-4 py-2.5 rounded-lg hover:bg-k-border transition-colors">
            <X size={14} />
          </button>
          {crearSupervisor.isError && (
            <p className="text-xs text-k-red w-full">{(crearSupervisor.error as Error).message}</p>
          )}
        </div>
      )}

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
            const abierto = editando === s.id
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

                  {/* Botón cuadrilla */}
                  <button
                    onClick={() => setEditando(abierto ? null : s.id)}
                    className={`flex items-center gap-2 text-[11px] font-bold px-3 py-2 rounded-lg
                               border transition-all ${
                      abierto
                        ? 'bg-amber-500/15 border-amber-500/30 text-k-amber'
                        : 'bg-k-raised border-k-border text-k-text2 hover:border-k-border2 hover:text-k-text'
                    }`}>
                    <Users size={13} />
                    Cuadrilla
                    {abierto
                      ? <ChevronUp size={12} />
                      : <ChevronDown size={12} />}
                  </button>
                </div>

                {/* Panel de cuadrilla (expandible) */}
                {abierto && (
                  <div className="px-5 pb-5">
                    <CuadrillaPanel supId={s.id} supNombre={s.nombre} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <div className="bg-k-raised border border-k-border rounded-xl p-4">
        <p className="text-[11px] text-k-text3 leading-relaxed">
          <span className="text-k-amber font-bold">ℹ️ Para agregar nuevos supervisores: </span>
          usa el botón <span className="font-mono text-k-text">+ Nuevo supervisor</span> de esta
          página (formato ID <span className="font-mono text-k-text">SUP-006</span>). La
          administración directa de la base de datos debe hacerse solo desde la red interna.
        </p>
      </div>
    </div>
  )
}