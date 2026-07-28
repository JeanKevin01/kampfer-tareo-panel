import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Calendar, CheckCircle, XCircle, Clock, Hash, Mail, Grid3X3,
  Loader2, Users, Search, X, ChevronDown, ChevronUp, UserPlus,
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
    queryFn: () => api<CuaItem[]>(`/api/cuadrilla/${supId}`),
  })

  const { data: trabajadores = [] } = useQuery<Trabajador[]>({
    queryKey: ['trabajadores'],
    queryFn: () => api<Trabajador[]>('/admin/trabajadores'),
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
      api(`/api/cuadrilla/${supId}/${trabId}`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cuadrilla', supId] })
      setBusq('')
    },
  })

  const quitar = useMutation({
    mutationFn: (trabId: string) =>
      api(`/api/cuadrilla/${supId}/${trabId}`, { method: 'DELETE' }),
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
const TABS: TabDef[] = [
  { id: 'estado', label: 'Estado del día', icon: Calendar },
  { id: 'matriz', label: 'Reportes por semana', icon: Grid3X3 },
]

export default function Supervisores() {
  const [tab, setTab] = useTab(TABS)
  return (
    <div className="space-y-5">
      <TabsPagina tabs={TABS} activo={tab} onCambiar={setTab} />
      {tab === 'estado' && <PanelEstadoDia />}
      {tab === 'matriz' && <MatrizSupervisores />}
    </div>
  )
}

function PanelEstadoDia() {
  const [fecha, setFecha]           = useState(hoy)
  const [editando, setEditando]     = useState<string | null>(null)
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