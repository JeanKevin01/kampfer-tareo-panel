import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ChevronLeft, ChevronRight, Plus, X, Loader2, Printer, HardDrive,
  Camera, User, Trash2, Ban, CheckCircle2, CalendarDays, ClipboardList, Copy, Check, FileText,
} from 'lucide-react'
import { api, API_BASE } from '@/lib/api'
import { CNC, TIPOS_RESTRICCION } from '@/lib/catalogos'
import { lunesDe, iso } from '@/lib/semana'
import { LookaheadGrid, EvaluacionSemanal, type ActGrid } from '@/components/LookaheadGrid'
import { ProgramarLote } from '@/components/ProgramarLote'
import { CalendarioLaboral } from '@/components/CalendarioLaboral'
import { CalendarioMes } from '@/components/CalendarioMes'
import HistogramaMO from '@/components/HistogramaMO'

const PROYECTO_ID = 1
const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
const MESES = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const inputCls = 'bg-k-raised border border-k-border rounded-lg px-2.5 py-2 text-sm text-k-text outline-none focus:border-k-amber w-full'

export interface Foto { id: number; url: string | null; url_thumb: string | null; purgada: boolean; bytes: number }
export interface Reporte {
  id: number; fecha: string; otm_id?: string; actividad_id?: number | null
  supervisor_id?: string; supervisor_nombre?: string; descripcion?: string
  creado_en?: string; fotos: Foto[]
  // Parte estructurado del supervisor (0032)
  area?: string | null; turno?: string | null
  anotaciones?: string[] | null
  restricciones?: { cat: string; detalle: string }[] | null
}
export interface Actividad {
  id: number; fecha: string; otm_id?: string | null; otm_desc?: string | null
  partida_id?: number | null; partida_codigo?: string | null; partida_desc?: string | null
  titulo: string; descripcion?: string | null
  estado: 'PROGRAMADO' | 'EJECUTADO' | 'CANCELADO' | 'NO_CUMPLIDA'
  responsable?: string | null; causa_nc?: string | null; causa_nc_cat?: string | null
  supervisor_id?: string | null; supervisor_nombre?: string | null
  rest_total?: number; rest_pend?: number
  fecha_fin?: string | null; metrado_prog?: number | null; und?: string | null
  dias_salto?: string[]; dias_medio?: string[]
  causa_nc_planner?: string | null; causa_nc_planner_cat?: string | null
  creado_por?: string; reportes: number[]
}
export interface Restriccion {
  id: number; actividad_id: number; descripcion: string; tipo: string
  responsable?: string | null; fecha_requerida?: string | null
  liberada: boolean; liberada_en?: string | null
}

export interface Semana { lunes: string; fechas: string[]; actividades: Actividad[]; reportes: Reporte[] }

const ESTADO_CLR: Record<string, string> = {
  PROGRAMADO: 'text-k-amber bg-amber-500/10 border-amber-500/30',
  EJECUTADO: 'text-k-green bg-green-500/10 border-green-500/30',
  CANCELADO: 'text-k-text3 bg-k-raised border-k-border',
  NO_CUMPLIDA: 'text-k-red bg-red-500/10 border-red-500/30',
}
const ESTADO_LBL: Record<string, string> = {
  PROGRAMADO: 'PROGRAMADO', EJECUTADO: 'EJECUTADO',
  CANCELADO: 'CANCELADO', NO_CUMPLIDA: 'NO CUMPLIDA',
}

const fmtDia = (f: string) => `${Number(f.slice(8, 10))} ${MESES[Number(f.slice(5, 7))]}`
// La fila del lookahead-grid trae los mismos campos que Actividad salvo reportes.
const desdeGrid = (a: ActGrid): Actividad =>
  ({ ...a, estado: a.estado as Actividad['estado'], reportes: [] })
const mediaUrl = (u: string | null) => (u ? `${API_BASE}${u}` : '')
const fmtMB = (b: number) => `${(b / 1024 / 1024).toFixed(1)} MB`

export default function Programacion() {
  const qc = useQueryClient()
  const [vista, setVista] = useState<'semana' | 'lookahead' | 'histograma' | 'ppc'>('semana')
  const [laModo, setLaModo] = useState<'tabla' | 'tarjetas'>('tabla')
  const [planModo, setPlanModo] = useState<'semana' | 'mes'>('semana')
  const [lunes, setLunes] = useState(() => iso(lunesDe(new Date())))
  const [modalAct, setModalAct] = useState<{ modo: 'crear'; fecha: string } | { modo: 'editar'; act: Actividad } | null>(null)
  const [modalLote, setModalLote] = useState<string | null>(null)   // fecha base del wizard por partidas
  const [repVer, setRepVer] = useState<Reporte | null>(null)
  const [verAlmacen, setVerAlmacen] = useState(false)
  const [verParte, setVerParte] = useState(false)
  const [verSustento, setVerSustento] = useState(false)
  const [verCalendario, setVerCalendario] = useState(false)

  const sem = useQuery<Semana>({
    queryKey: ['programacion', lunes],
    queryFn: () => api(`/ev/programacion/semana?proyecto_id=${PROYECTO_ID}&lunes=${lunes}`),
  })
  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ['programacion'] })
    qc.invalidateQueries({ queryKey: ['lookahead'] })
    qc.invalidateQueries({ queryKey: ['lookahead-grid'] })   // la tabla Excel también, al instante
    qc.invalidateQueries({ queryKey: ['ppc'] })
  }

  const mover = (dias: number) => {
    const d = new Date(lunes + 'T12:00:00')
    d.setDate(d.getDate() + dias)
    setLunes(iso(lunesDe(d)))
  }

  const repsPorId = new Map((sem.data?.reportes ?? []).map(r => [r.id, r]))
  const hoy = iso(new Date())

  return (
    <div className="space-y-4">
      {/* Cabecera */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold text-k-text">Programación de actividades</h1>
          <p className="text-k-text2 text-sm">Plan del planner + reportes con fotos desde campo, en el mismo calendario.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setModalLote(lunes)}
            className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg bg-k-amber text-black font-bold">
            <Plus size={14} /> Programar por partidas
          </button>
          <button onClick={() => setVerCalendario(v => !v)}
            className={`flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border ${verCalendario ? 'border-k-amber text-k-amber' : 'border-k-border bg-k-raised text-k-text2 hover:bg-k-border'}`}>
            <CalendarDays size={14} /> Calendario laboral
          </button>
          <button onClick={() => setVerAlmacen(v => !v)}
            className={`flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border ${verAlmacen ? 'border-k-amber text-k-amber' : 'border-k-border bg-k-raised text-k-text2 hover:bg-k-border'}`}>
            <HardDrive size={14} /> Almacenamiento
          </button>
          <button onClick={() => setVerSustento(true)}
            title="Sustento de valorización: partes y fotos por partida"
            className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border border-k-border bg-k-raised text-k-text2 hover:bg-k-border">
            <FileText size={14} /> Reporte por partida
          </button>
          <button onClick={() => setVerParte(true)}
            title="El parte diario tal como lo ve el supervisor (listo para copiar)"
            className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border border-k-border bg-k-raised text-k-text2 hover:bg-k-border">
            <ClipboardList size={14} /> Parte del día
          </button>
          <button onClick={() => window.open(`/programacion/imprimir?lunes=${lunes}`, '_blank')}
            className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border border-k-border bg-k-raised text-k-text2 hover:bg-k-border">
            <Printer size={14} /> Reporte semanal
          </button>
        </div>
      </div>

      {verCalendario && <CalendarioLaboral />}
      {verAlmacen && <PanelAlmacenamiento onCambio={invalidar} />}
      {verParte && <ModalParteDia onClose={() => setVerParte(false)} />}
      {verSustento && <ModalReportePartida onClose={() => setVerSustento(false)} />}

      {/* Vistas Last Planner: plan semanal / lookahead / aprendizaje */}
      <div className="flex gap-2">
        {([['semana', 'Plan semanal'], ['lookahead', 'Lookahead'], ['histograma', 'Histograma · Ratios'], ['ppc', 'PPC · Causas']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setVista(k)}
            className={`text-sm px-3 py-2 rounded-lg border font-medium ${
              vista === k ? 'border-k-amber bg-amber-500/10 text-k-amber' : 'border-k-border text-k-text2 hover:bg-k-raised'}`}>
            {l}
          </button>
        ))}
      </div>

      {vista === 'lookahead' && (
        <div className="space-y-3">
          <div className="flex gap-1.5">
            {([['tabla', 'Tabla (Excel)'], ['tarjetas', 'Tarjetas']] as const).map(([k, l]) => (
              <button key={k} onClick={() => setLaModo(k)}
                className={`text-[11px] px-2.5 py-1.5 rounded-lg border ${
                  laModo === k ? 'border-k-amber text-k-amber bg-amber-500/10' : 'border-k-border text-k-text3 hover:bg-k-raised'}`}>
                {l}
              </button>
            ))}
          </div>
          {laModo === 'tabla'
            ? <LookaheadGrid onEditar={a => setModalAct({ modo: 'editar', act: desdeGrid(a) })} />
            : <Lookahead onEditar={a => setModalAct({ modo: 'editar', act: a })}
                onCrear={f => setModalLote(f)} />}
        </div>
      )}
      {vista === 'histograma' && <HistogramaMO />}

      {vista === 'ppc' && <PanelPPC />}

      {vista === 'semana' && (
        <div className="flex gap-1.5">
          {([['semana', 'Semana'], ['mes', 'Mes (calendario)']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setPlanModo(k)}
              className={`text-[11px] px-2.5 py-1.5 rounded-lg border ${
                planModo === k ? 'border-k-amber text-k-amber bg-amber-500/10' : 'border-k-border text-k-text3 hover:bg-k-raised'}`}>
              {l}
            </button>
          ))}
        </div>
      )}
      {vista === 'semana' && planModo === 'mes' && (
        <CalendarioMes onEditar={a => setModalAct({ modo: 'editar', act: desdeGrid(a) })}
          onCrearDia={f => setModalLote(f)} />
      )}

      {vista === 'semana' && planModo === 'semana' && <>
      {/* Navegación de semana */}
      <div className="flex items-center gap-2">
        <button onClick={() => mover(-7)} className="p-1.5 rounded-lg border border-k-border text-k-text2 hover:bg-k-raised"><ChevronLeft size={15} /></button>
        <div className="flex items-center gap-1.5 text-sm font-bold text-k-text px-2">
          <CalendarDays size={14} className="text-k-amber" />
          {sem.data ? `${fmtDia(sem.data.fechas[0])} — ${fmtDia(sem.data.fechas[6])} ${sem.data.fechas[6].slice(0, 4)}` : '…'}
        </div>
        <button onClick={() => mover(7)} className="p-1.5 rounded-lg border border-k-border text-k-text2 hover:bg-k-raised"><ChevronRight size={15} /></button>
        <button onClick={() => setLunes(iso(lunesDe(new Date())))}
          className="text-xs px-2.5 py-1.5 rounded-lg border border-k-border text-k-text3 hover:bg-k-raised">Hoy</button>
        {sem.isFetching && <Loader2 size={14} className="animate-spin text-k-text3" />}
      </div>

      {/* Tablero Lun-Dom */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-2">
        {(sem.data?.fechas ?? []).map((f, i) => {
          const acts = (sem.data?.actividades ?? []).filter(a => a.fecha === f)
          const libres = (sem.data?.reportes ?? []).filter(r => r.fecha === f && !r.actividad_id)
          const esHoy = f === hoy
          return (
            <div key={f} className={`rounded-xl border flex flex-col min-h-[220px] ${esHoy ? 'border-k-green bg-green-500/5' : 'border-k-border bg-k-surface'}`}>
              <div className={`flex items-center justify-between px-2.5 py-2 border-b ${esHoy ? 'border-k-green/40' : 'border-k-border'}`}>
                <div>
                  <div className={`text-[10px] uppercase font-bold ${esHoy ? 'text-k-green' : 'text-k-text3'}`}>{DIAS[i]}{esHoy ? ' · HOY' : ''}</div>
                  <div className="text-sm font-bold text-k-text">{fmtDia(f)}</div>
                </div>
                <button title="Programar en este día (por partidas)" onClick={() => setModalLote(f)}
                  className="p-1 rounded-lg text-k-text3 hover:text-k-amber hover:bg-k-raised"><Plus size={15} /></button>
              </div>
              <div className="p-1.5 space-y-1.5 flex-1">
                {acts.map(a => (
                  <TarjetaActividad key={a.id} act={a} reps={a.reportes.map(id => repsPorId.get(id)!).filter(Boolean)}
                    onClick={() => setModalAct({ modo: 'editar', act: a })} />
                ))}
                {libres.map(r => (
                  <TarjetaReporte key={r.id} rep={r} onClick={() => setRepVer(r)} />
                ))}
                {acts.length === 0 && libres.length === 0 && (
                  <p className="text-[10px] text-k-text3 text-center pt-6">—</p>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {sem.isError && (
        <p className="text-k-red text-sm">No se pudo cargar la semana: {(sem.error as Error).message}</p>
      )}
      <p className="text-[11px] text-k-text3">
        <span className="text-k-amber font-bold">PROGRAMADO</span> lo crea el planner (asignado a un supervisor y una partida) ·
        pasa a <span className="text-k-green font-bold"> EJECUTADO</span> cuando llega el reporte de campo vinculado ·
        <span className="text-k-red font-bold"> NO CUMPLIDA</span> registra la causa (catálogo CNC) ·
        ⛔ = restricciones pendientes de liberar.
      </p>
      </>}

      {modalLote && (
        <ProgramarLote fechaBase={modalLote}
          onClose={() => setModalLote(null)}
          onCreado={() => { invalidar(); setModalLote(null) }}
          onLibre={() => { const f = modalLote; setModalLote(null); setModalAct({ modo: 'crear', fecha: f }) }} />
      )}
      {modalAct && (
        <ModalActividad datos={modalAct} repsPorId={repsPorId}
          onClose={() => setModalAct(null)}
          onChange={() => { invalidar(); setModalAct(null) }}
          onVerReporte={r => setRepVer(r)} />
      )}
      {repVer && <ModalReporte rep={repVer} onClose={() => setRepVer(null)} />}
    </div>
  )
}

function TarjetaActividad({ act, reps, onClick }: { act: Actividad; reps: Reporte[]; onClick: () => void }) {
  const thumbs = reps.flatMap(r => r.fotos).filter(f => f.url_thumb).slice(0, 3)
  return (
    <div onClick={onClick}
      className="rounded-lg border border-k-border bg-k-raised/60 hover:bg-k-raised cursor-pointer p-2 space-y-1">
      <div className="flex items-center gap-1 flex-wrap">
        {act.otm_id && <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-blue-500/15 text-k-blue border border-blue-500/20">{act.otm_id}</span>}
        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${ESTADO_CLR[act.estado]}`}>{ESTADO_LBL[act.estado]}</span>
        {(act.rest_pend ?? 0) > 0 && (
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border text-k-red bg-red-500/10 border-red-500/30"
            title={`${act.rest_pend} restricción(es) pendiente(s) de liberar`}>⛔ {act.rest_pend}</span>
        )}
      </div>
      <div className="text-[12px] text-k-text leading-snug">{act.titulo}</div>
      {act.partida_codigo && (
        <div className="text-[10px] text-k-text3 font-mono truncate" title={`${act.partida_codigo} — ${act.partida_desc ?? ''}`}>
          {act.partida_codigo} {act.partida_desc ? `· ${act.partida_desc.slice(0, 30)}` : ''}
        </div>
      )}
      {(act.supervisor_nombre || act.responsable) && (
        <div className="text-[10px] text-k-text3 flex items-center gap-1">
          <User size={9} /> {act.supervisor_nombre || act.responsable}
        </div>
      )}
      {act.estado === 'NO_CUMPLIDA' && (act.causa_nc_cat || act.causa_nc) && (
        <div className="text-[10px] text-k-red/90 leading-snug line-clamp-2">
          Causa: {act.causa_nc_cat ? CNC[act.causa_nc_cat] ?? act.causa_nc_cat : ''}{act.causa_nc ? ` — ${act.causa_nc}` : ''}
        </div>
      )}
      {thumbs.length > 0 && (
        <div className="flex gap-1 pt-0.5">
          {thumbs.map(f => (
            <img key={f.id} src={mediaUrl(f.url_thumb)} alt="" className="w-12 h-12 object-cover rounded border border-k-border" loading="lazy" />
          ))}
          {reps.flatMap(r => r.fotos).length > 3 && <span className="text-[10px] text-k-text3 self-end">+{reps.flatMap(r => r.fotos).length - 3}</span>}
        </div>
      )}
    </div>
  )
}

function TarjetaReporte({ rep, onClick }: { rep: Reporte; onClick: () => void }) {
  const thumbs = rep.fotos.filter(f => f.url_thumb).slice(0, 3)
  return (
    <div onClick={onClick}
      className="rounded-lg border border-green-500/25 bg-green-500/5 hover:bg-green-500/10 cursor-pointer p-2 space-y-1">
      <div className="flex items-center gap-1 flex-wrap">
        {rep.otm_id && <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-blue-500/15 text-k-blue border border-blue-500/20">{rep.otm_id}</span>}
        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border text-k-green bg-green-500/10 border-green-500/30 flex items-center gap-0.5">
          <Camera size={8} /> CAMPO
        </span>
      </div>
      {rep.descripcion && <div className="text-[12px] text-k-text leading-snug line-clamp-2">{rep.descripcion}</div>}
      {rep.supervisor_nombre && <div className="text-[10px] text-k-text3 flex items-center gap-1"><User size={9} /> {rep.supervisor_nombre}</div>}
      {thumbs.length > 0 && (
        <div className="flex gap-1 pt-0.5">
          {thumbs.map(f => (
            <img key={f.id} src={mediaUrl(f.url_thumb)} alt="" className="w-12 h-12 object-cover rounded border border-k-border" loading="lazy" />
          ))}
        </div>
      )}
      {rep.fotos.length > 0 && rep.fotos.every(f => f.purgada) && (
        <div className="text-[10px] text-k-text3 italic">fotos purgadas (queda el texto)</div>
      )}
    </div>
  )
}

function ModalActividad({ datos, repsPorId, onClose, onChange, onVerReporte }: {
  datos: { modo: 'crear'; fecha: string } | { modo: 'editar'; act: Actividad }
  repsPorId: Map<number, Reporte>
  onClose: () => void
  onChange: () => void
  onVerReporte: (r: Reporte) => void
}) {
  const editar = datos.modo === 'editar'
  const act = editar ? datos.act : null
  const [form, setForm] = useState({
    titulo: act?.titulo ?? '', otm_id: act?.otm_id ?? '', descripcion: act?.descripcion ?? '',
    responsable: act?.responsable ?? '', supervisor_id: act?.supervisor_id ?? '',
    partida_id: act?.partida_id ?? 0,
    fecha: editar ? act!.fecha : datos.fecha,
    fecha_fin: act?.fecha_fin ?? '',
    metrado_prog: act?.metrado_prog != null ? String(act.metrado_prog) : '',
    und: act?.und ?? '',
    dias_salto: act?.dias_salto ?? [],
    dias_medio: act?.dias_medio ?? [],
  })
  const [error, setError] = useState('')
  const [showNC, setShowNC] = useState(false)

  // OJO: /ev/otms devuelve `otm_id` (no `id`) — usar otro nombre rompe el select.
  const otms = useQuery<{ otm_id: string; descripcion: string }[]>({
    queryKey: ['otms-lista'],
    queryFn: () => api('/ev/otms'),
  })
  const sups = useQuery<{ id: string; nombre: string }[]>({
    queryKey: ['supervisores-lista'],
    queryFn: () => api('/api/supervisores'),
  })
  // Partidas de control de el proyecto elegida (LPS: 1 actividad = 1 partida)
  const partidas = useQuery<{ id: number; codigo: string; descripcion?: string; unidad?: string | null; metrado_presup?: number | string | null }[]>({
    queryKey: ['partidas-otm', form.otm_id],
    queryFn: () => api(`/ev/partidas?otm=${encodeURIComponent(form.otm_id!)}`),
    enabled: !!form.otm_id,
  })
  // Al elegir partida, el metrado meta se prellena con el del presupuesto
  // (editable: es la "opción de trabajar con el metrado meta" de Jean).
  const elegirPartida = (pid: number) => {
    const p = (partidas.data ?? []).find(x => x.id === pid)
    const base = Number(p?.metrado_presup)
    setForm(f => ({
      ...f, partida_id: pid,
      metrado_prog: f.metrado_prog.trim() === '' && Number.isFinite(base) && base > 0 ? String(base) : f.metrado_prog,
      und: !f.und && p?.unidad ? p.unidad : f.und,
    }))
  }

  const guardar = useMutation({
    mutationFn: () => {
      const base = {
        titulo: form.titulo, descripcion: form.descripcion, responsable: form.responsable,
        otm_id: form.otm_id || null, supervisor_id: form.supervisor_id || null,
        partida_id: form.partida_id || null, und: form.und.trim() || null,
      }
      const metrado = form.metrado_prog.trim() === '' ? null : Number(form.metrado_prog)
      if (!editar) {
        return api('/ev/programacion/actividades', {
          method: 'POST',
          body: JSON.stringify({ ...base, proyecto_id: PROYECTO_ID, fecha: form.fecha,
            fecha_fin: form.fecha_fin || null, metrado_prog: metrado,
            dias_salto: form.dias_salto, dias_medio: form.dias_medio }),
        })
      }
      // Al editar, fecha/fecha_fin/metrado solo viajan si CAMBIARON: el API
      // redistribuye las celdas diarias al recibirlos y no queremos pisar las
      // ediciones celda a celda por guardar un cambio de título.
      const body: Record<string, unknown> = { ...base }
      if (form.fecha !== act!.fecha) body.fecha = form.fecha
      if ((form.fecha_fin || null) !== (act!.fecha_fin ?? null)) body.fecha_fin = form.fecha_fin || null
      if ((metrado ?? null) !== (act!.metrado_prog ?? null)) body.metrado_prog = metrado
      if (form.dias_salto.join(',') !== (act!.dias_salto ?? []).join(',')) body.dias_salto = form.dias_salto
      if (form.dias_medio.join(',') !== (act!.dias_medio ?? []).join(',')) body.dias_medio = form.dias_medio
      return api(`/ev/programacion/actividades/${act!.id}`, { method: 'PUT', body: JSON.stringify(body) })
    },
    onSuccess: (j: unknown) => {
      const m = (j as { movidas?: number[] })?.movidas
      if (m?.length) alert(`Cascada: se recorrieron ${m.length} actividad(es) vinculada(s) hacia adelante.`)
      onChange()
    },
    onError: (e: Error) => setError(e.message),
  })
  const estado = useMutation({
    mutationFn: (cambio: { estado: string; causa_nc?: string }) =>
      api(`/ev/programacion/actividades/${act!.id}`, { method: 'PUT', body: JSON.stringify(cambio) }),
    onSuccess: onChange, onError: (e: Error) => setError(e.message),
  })
  const borrar = useMutation({
    mutationFn: () => api(`/ev/programacion/actividades/${act!.id}`, { method: 'DELETE' }),
    onSuccess: onChange, onError: (e: Error) => setError(e.message),
  })

  const reps = (act?.reportes ?? []).map(id => repsPorId.get(id)!).filter(Boolean)

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-k-surface border border-k-border rounded-xl p-5 w-[520px] max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-k-text">{editar ? 'Actividad' : 'Programar actividad'}</h2>
          <div className="flex items-center gap-2">
            {act && <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${ESTADO_CLR[act.estado]}`}>{ESTADO_LBL[act.estado]}</span>}
            <button onClick={onClose} className="text-k-text3 hover:text-k-text"><X size={18} /></button>
          </div>
        </div>

        <div className="space-y-2">
          <input placeholder="Título (ej. Hormigonado fundación chancador — etapa 1)" value={form.titulo}
            onChange={e => setForm({ ...form, titulo: e.target.value })} className={inputCls} autoFocus={!editar} />
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[9px] uppercase font-bold text-k-text3">F. Inicio</label>
              <input type="date" value={form.fecha} onChange={e => setForm({ ...form, fecha: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className="text-[9px] uppercase font-bold text-k-text3">F. Fin (opcional)</label>
              <input type="date" value={form.fecha_fin ?? ''} min={form.fecha}
                onChange={e => setForm({ ...form, fecha_fin: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className="text-[9px] uppercase font-bold text-k-text3" title="Se distribuye por día entre F.Inicio y F.Fin (LookAhead)">Metrado + und</label>
              <div className="flex gap-1">
                <input placeholder="90" inputMode="decimal" value={form.metrado_prog}
                  onChange={e => setForm({ ...form, metrado_prog: e.target.value })} className={inputCls} />
                <input placeholder="m3" value={form.und ?? ''} maxLength={10}
                  onChange={e => setForm({ ...form, und: e.target.value })} className={`${inputCls} w-16`} style={{ width: 64 }} />
              </div>
            </div>
          </div>
          {/* Días del rango: clic cicla normal → salto ∅ (peso 0) → medio ◐ (peso 0.5) */}
          {form.fecha && form.fecha_fin && form.fecha_fin > form.fecha && (() => {
            const dias: string[] = []
            const d = new Date(form.fecha + 'T12:00:00')
            const fin = new Date(form.fecha_fin + 'T12:00:00')
            while (d <= fin && dias.length < 42) { dias.push(d.toISOString().slice(0, 10)); d.setDate(d.getDate() + 1) }
            const DIA_L = ['D', 'L', 'M', 'M', 'J', 'V', 'S']
            const ciclar = (f: string) => {
              const esSalto = form.dias_salto.includes(f)
              const esMedio = form.dias_medio.includes(f)
              if (!esSalto && !esMedio) {          // normal → salto
                setForm({ ...form, dias_salto: [...form.dias_salto, f].sort() })
              } else if (esSalto) {                 // salto → medio
                setForm({ ...form, dias_salto: form.dias_salto.filter(x => x !== f), dias_medio: [...form.dias_medio, f].sort() })
              } else {                              // medio → normal
                setForm({ ...form, dias_medio: form.dias_medio.filter(x => x !== f) })
              }
            }
            return (
              <div>
                <label className="text-[9px] uppercase font-bold text-k-text3">
                  Días del rango <span className="normal-case font-normal">(clic: se trabaja → ∅ salto → ◐ medio día; el metrado se re-prorratea)</span>
                </label>
                <div className="flex gap-1 flex-wrap mt-1">
                  {dias.map(f => {
                    const salto = form.dias_salto.includes(f)
                    const medio = form.dias_medio.includes(f)
                    return (
                      <button key={f} type="button" onClick={() => ciclar(f)}
                        className={`text-[10px] px-1.5 py-1 rounded border font-mono ${
                          salto ? 'border-red-500/40 bg-red-500/15 text-k-red line-through'
                          : medio ? 'border-sky-500/40 bg-sky-500/15 text-sky-300'
                          : 'border-k-border bg-k-raised text-k-text2'}`}
                        title={salto ? 'Salto ∅: no se trabaja (clic → medio día)'
                          : medio ? 'Medio día ◐: pesa 0.5 (clic → normal)'
                          : 'Se trabaja completo (clic → salto)'}>
                        {medio ? '◐ ' : ''}{DIA_L[new Date(f + 'T12:00:00').getDay()]} {f.slice(8, 10)}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })()}
          <div className="grid grid-cols-2 gap-2">
            <select value={form.otm_id ?? ''} onChange={e => setForm({ ...form, otm_id: e.target.value })}
              className={inputCls} title={(otms.data ?? []).find(o => o.otm_id === form.otm_id)?.descripcion || 'OTM'}>
              <option value="">Sin OTM</option>
              {(otms.data ?? []).map(o => (
                <option key={o.otm_id} value={o.otm_id} title={o.descripcion}>
                  {o.otm_id}{o.descripcion ? ` — ${o.descripcion.slice(0, 42)}${o.descripcion.length > 42 ? '…' : ''}` : ''}
                </option>
              ))}
            </select>
          </div>
          {form.otm_id && (
            <select value={form.partida_id || ''} onChange={e => elegirPartida(Number(e.target.value) || 0)}
              className={inputCls} title="Partida de control que se trabajará (1 actividad = 1 partida)">
              <option value="">Sin partida específica (trabajo general de el proyecto)</option>
              {(partidas.data ?? []).map(p => (
                <option key={p.id} value={p.id}>{p.codigo} — {(p.descripcion ?? '').slice(0, 48)}</option>
              ))}
            </select>
          )}
          <div className="grid grid-cols-2 gap-2">
            <select value={form.supervisor_id ?? ''} onChange={e => setForm({ ...form, supervisor_id: e.target.value })}
              className={inputCls} title="Supervisor asignado: la actividad le aparecerá en su app de campo">
              <option value="">Sin supervisor asignado</option>
              {(sups.data ?? []).map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
            <input placeholder="Responsable / cuadrilla" value={form.responsable ?? ''}
              onChange={e => setForm({ ...form, responsable: e.target.value })} className={inputCls} />
          </div>
          <textarea placeholder="Descripción (alcance del día, metrados previstos…)" value={form.descripcion ?? ''}
            onChange={e => setForm({ ...form, descripcion: e.target.value })} rows={3} className={inputCls} />
          {error && <p className="text-k-red text-xs">{error}</p>}
          <button onClick={() => guardar.mutate()} disabled={guardar.isPending || !form.titulo.trim()}
            className="w-full bg-k-amber text-black font-bold text-sm py-2.5 rounded-lg disabled:opacity-40">
            {guardar.isPending ? 'Guardando…' : editar ? 'Guardar cambios' : 'Programar'}
          </button>
        </div>

        {editar && act!.estado === 'NO_CUMPLIDA' && (act!.causa_nc_cat || act!.causa_nc) && (
          <div className="mt-3 rounded-lg border border-red-500/25 bg-red-500/5 px-3 py-2">
            <p className="text-[10px] uppercase font-bold text-k-red">Causa de no cumplimiento</p>
            <p className="text-xs text-k-text2">
              {act!.causa_nc_cat ? <b>{CNC[act!.causa_nc_cat] ?? act!.causa_nc_cat}</b> : null}
              {act!.causa_nc ? ` — ${act!.causa_nc}` : ''}
            </p>
          </div>
        )}

        {editar && act!.partida_id && <HitosPartida partidaId={act!.partida_id} onCambio={onChange} />}

        {/* Actividad LIBRE (sin partida de control): hitos solo visuales — el
            avance por etapas del % EV vive en la partida (decisión Jean 2026-07-18) */}
        {editar && !act!.partida_id && (
          <div className="mt-4 border-t border-k-border pt-3">
            <p className="text-[10px] uppercase font-bold text-k-text3 mb-2">Hitos de la actividad</p>
            <div className="flex items-center gap-2 rounded-lg border border-k-border bg-k-raised/40 px-2.5 py-1.5">
              <span className={`text-[11px] ${act!.estado === 'EJECUTADO' ? 'text-k-green' : 'text-k-text3'}`}>
                {act!.estado === 'EJECUTADO' ? '✓' : '○'}
              </span>
              <span className="text-[11px] text-k-text2 flex-1">Ejecución <span className="text-k-text3">· 100% ★</span></span>
              <span className="text-[10px] font-mono font-bold text-k-text3">
                {act!.estado === 'EJECUTADO' ? '100%' : '—'}
              </span>
            </div>
            <p className="text-[10px] text-k-text3 mt-1.5">
              Sin partida de control los hitos son referenciales (se completa con «Marcar ejecutada»).
              Vincula una partida del presupuesto para que el avance alimente el % EV por etapas.
            </p>
          </div>
        )}

        {editar && <Antecesoras act={act!} onCambio={onChange} />}

        {editar && <Restricciones actId={act!.id} onCambio={onChange} />}

        {editar && (
          <div className="flex gap-2 mt-3 flex-wrap">
            {act!.estado !== 'EJECUTADO' && (
              <button onClick={() => estado.mutate({ estado: 'EJECUTADO' })}
                className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-green-500/30 text-k-green hover:bg-green-500/10">
                <CheckCircle2 size={12} /> Marcar ejecutada
              </button>
            )}
            {act!.estado === 'PROGRAMADO' && (
              <button onClick={() => setShowNC(true)}
                className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-red-500/30 text-k-red hover:bg-red-500/10">
                <Ban size={12} /> No cumplida…
              </button>
            )}
            {act!.estado !== 'CANCELADO' && (
              <button onClick={() => estado.mutate({ estado: 'CANCELADO' })}
                className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-k-border text-k-text3 hover:bg-k-raised">
                <Ban size={12} /> Cancelar
              </button>
            )}
            <button onClick={() => { if (confirm('¿Eliminar la actividad? (si tiene reportes, el sistema lo impedirá)')) borrar.mutate() }}
              className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-red-500/30 text-k-red hover:bg-red-500/10 ml-auto">
              <Trash2 size={12} /> Eliminar
            </button>
          </div>
        )}

        {reps.length > 0 && (
          <div className="mt-4 border-t border-k-border pt-3 space-y-2">
            <p className="text-[10px] uppercase font-bold text-k-text3">Reportes de campo ({reps.length})</p>
            {reps.map(r => (
              <div key={r.id} onClick={() => onVerReporte(r)}
                className="rounded-lg border border-k-border bg-k-raised/50 p-2 cursor-pointer hover:bg-k-raised">
                <div className="text-[11px] text-k-text2">{r.descripcion || '(sin descripción)'}</div>
                <div className="text-[10px] text-k-text3 mt-0.5">{r.supervisor_nombre} · {r.fotos.length} foto{r.fotos.length !== 1 ? 's' : ''}</div>
              </div>
            ))}
          </div>
        )}

        {showNC && (
          <ModalNC onClose={() => setShowNC(false)}
            onConfirmar={(cat, detalle) => { setShowNC(false); estado.mutate({ estado: 'NO_CUMPLIDA', causa_nc_cat: cat, causa_nc: detalle } as { estado: string; causa_nc?: string }) }} />
        )}
      </div>
    </div>
  )
}

function ModalNC({ onClose, onConfirmar }: { onClose: () => void; onConfirmar: (cat: string, detalle: string) => void }) {
  const [cat, setCat] = useState('MATERIALES')
  const [detalle, setDetalle] = useState('')
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60]" onClick={onClose}>
      <div className="bg-k-surface border border-k-border rounded-xl p-5 w-[400px]" onClick={e => e.stopPropagation()}>
        <h3 className="font-bold text-k-text mb-1">Causa de no cumplimiento</h3>
        <p className="text-[11px] text-k-text3 mb-3">La categoría alimenta el Pareto de causas (PPC · Causas).</p>
        <select value={cat} onChange={e => setCat(e.target.value)} className={`${inputCls} mb-2`}>
          {Object.entries(CNC).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <textarea placeholder="Detalle (opcional)" value={detalle} onChange={e => setDetalle(e.target.value)}
          rows={2} className={`${inputCls} mb-3`} />
        <button onClick={() => onConfirmar(cat, detalle.trim())}
          className="w-full bg-k-red/90 hover:bg-k-red text-white font-bold text-sm py-2.5 rounded-lg">
          Registrar no cumplimiento
        </button>
      </div>
    </div>
  )
}

// Antecesoras FS (F5 v2): esta actividad solo puede empezar cuando terminen.
// Al mover una antecesora, el API recorre a las sucesoras (auto-cascada).
// Hitos (rules of credit) de la partida de control, vistos desde el modal:
// el hito principal se alimenta SOLO de las celdas diarias (rollup); los
// secundarios sin registro diario se marcan aquí con un checkpoint (✓ o %).
function HitosPartida({ partidaId, onCambio }: { partidaId: number; onCambio: () => void }) {
  const qc = useQueryClient()
  interface Hito {
    id: number | null; numero: number; descripcion: string; peso: number
    es_principal: boolean; pct: number | null; auto: boolean
    con_actividad: boolean; virtual?: boolean
  }
  const hitos = useQuery<{ metrado: number; unidad?: string | null; hitos: Hito[] }>({
    queryKey: ['hitos-partida', partidaId],
    queryFn: () => api(`/ev/programacion/partidas/${partidaId}/hitos`),
  })
  const checkpoint = useMutation({
    mutationFn: ({ id, pct }: { id: number; pct: number }) =>
      api(`/ev/programacion/hitos/${id}/checkpoint`, {
        method: 'POST', body: JSON.stringify({ pct }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hitos-partida', partidaId] })
      for (const k of ['ev-captura', 'ev-reporte', 'ev-curva', 'ev-performance'])
        qc.invalidateQueries({ queryKey: [k] })
      onCambio()
    },
    onError: (e: Error) => alert(e.message),
  })
  const lista = hitos.data?.hitos ?? []
  if (!lista.length) return null
  return (
    <div className="mt-4 border-t border-k-border pt-3">
      <p className="text-[10px] uppercase font-bold text-k-text3 mb-2">
        Hitos de la partida (% EV = Σ peso × avance de cada etapa)
      </p>
      <div className="space-y-1.5">
        {lista.map(h => {
          const pct = h.pct ?? 0
          const done = pct >= 0.9995
          return (
            <div key={h.id ?? 'v'} className="flex items-center gap-2 rounded-lg border border-k-border bg-k-raised/40 px-2.5 py-1.5">
              <span className={`text-[11px] ${done ? 'text-k-green' : pct > 0 ? 'text-k-blue' : 'text-k-text3'}`}>
                {done ? '✓' : pct > 0 ? '●' : '○'}
              </span>
              <span className="text-[11px] text-k-text2 flex-1 truncate">
                {h.descripcion || `Hito ${h.numero}`}
                <span className="text-k-text3"> · {Math.round(h.peso * 100)}%{h.es_principal ? ' ★' : ''}</span>
              </span>
              <span className={`text-[10px] font-mono font-bold ${done ? 'text-k-green' : pct > 0 ? 'text-k-blue' : 'text-k-text3'}`}>
                {h.pct != null ? `${(pct * 100).toFixed(0)}%` : '—'}
              </span>
              {h.auto ? (
                <span className="text-[9px] font-bold text-sky-300 bg-sky-500/10 border border-sky-500/30 rounded px-1.5 py-0.5"
                  title="Se alimenta del registro diario (celdas del LookAhead / Avance diario)">AUTO</span>
              ) : h.id != null && (
                <>
                  {!done && (
                    <button onClick={() => checkpoint.mutate({ id: h.id!, pct: 1 })}
                      disabled={checkpoint.isPending}
                      title="Marcar la etapa como completada hoy"
                      className="text-[10px] px-2 py-0.5 rounded border border-green-500/30 text-k-green hover:bg-green-500/10">✓ Completar</button>
                  )}
                  <input placeholder="%" inputMode="numeric" title="O registra un % parcial de la etapa (Enter)"
                    onKeyDown={e => {
                      if (e.key !== 'Enter') return
                      const v = Number((e.target as HTMLInputElement).value)
                      if (Number.isFinite(v) && v >= 0 && v <= 100) checkpoint.mutate({ id: h.id!, pct: v / 100 })
                    }}
                    className="w-10 bg-k-void border border-k-border rounded px-1 py-0.5 text-[10px] text-k-text text-center outline-none focus:border-k-amber" />
                </>
              )}
            </div>
          )
        })}
      </div>
      {lista.some(h => h.virtual) && (
        <p className="text-[10px] text-k-text3 mt-1.5">
          Sin hitos definidos: al primer registro diario se crea «Ejecución 100%» solo.
          Puedes definir hitos en VG → Configuración para desagregar el % por etapas.
        </p>
      )}
    </div>
  )
}

function Antecesoras({ act, onCambio }: { act: Actividad; onCambio: () => void }) {
  const qc = useQueryClient()
  // Selección en 2 pasos (pedido Jean 2026-07-18): primero el proyecto (arranca en
  // la de la actividad), luego una actividad de ESA OTM — se acabó la lista plana.
  const [otmSel, setOtmSel] = useState(act.otm_id ?? '')
  const [predId, setPredId] = useState(0)
  const [lag, setLag] = useState('0')
  interface Dep { id: number; predecesora_id: number; lag_dias: number; pred_titulo: string; pred_fecha_fin: string; pred_estado: string }
  const deps = useQuery<Dep[]>({
    queryKey: ['dependencias', act.id],
    queryFn: () => api(`/ev/programacion/actividades/${act.id}/dependencias`),
  })
  const otms = useQuery<{ otm_id: string; descripcion: string }[]>({
    queryKey: ['otms-lista'],
    queryFn: () => api('/ev/otms'),
  })
  const candidatas = useQuery<{ id: number; titulo: string; otm_id?: string | null; fecha: string; fecha_fin: string }[]>({
    queryKey: ['actividades-lista', otmSel],
    queryFn: () => api(`/ev/programacion/actividades?proyecto_id=${PROYECTO_ID}${otmSel ? `&otm=${encodeURIComponent(otmSel)}` : ''}`),
  })
  const invalidar = () => { qc.invalidateQueries({ queryKey: ['dependencias', act.id] }); onCambio() }
  const crear = useMutation({
    mutationFn: () => api(`/ev/programacion/actividades/${act.id}/dependencias`, {
      method: 'POST', body: JSON.stringify({ predecesora_id: predId, lag_dias: Number(lag) || 0 }),
    }),
    onSuccess: (j: unknown) => {
      const m = (j as { movidas?: number[] })?.movidas
      if (m?.length) alert(`Cascada: se recorrieron ${m.length} actividad(es) hacia adelante.`)
      setPredId(0); setLag('0'); invalidar()
    },
    onError: (e: Error) => alert(e.message),
  })
  const borrar = useMutation({
    mutationFn: (id: number) => api(`/ev/programacion/dependencias/${id}`, { method: 'DELETE' }),
    onSuccess: invalidar, onError: (e: Error) => alert(e.message),
  })

  return (
    <div className="mt-4 border-t border-k-border pt-3">
      <p className="text-[10px] uppercase font-bold text-k-text3 mb-2">
        Antecesoras (Fin→Inicio) {(deps.data ?? []).length > 0 && <span className="text-k-blue">· 🔗 {(deps.data ?? []).length}</span>}
      </p>
      <div className="space-y-1.5 mb-2">
        {(deps.data ?? []).map(dp => {
          const sinTerminar = dp.pred_estado !== 'EJECUTADO' && dp.pred_fecha_fin >= act.fecha
          return (
            <div key={dp.id} className="flex items-center gap-2 rounded-lg border border-k-border bg-k-raised/40 px-2.5 py-1.5">
              <span className="text-[10px] font-mono text-k-text3">#{dp.predecesora_id}FS{dp.lag_dias ? `+${dp.lag_dias}d` : ''}</span>
              <span className="text-[11px] text-k-text2 flex-1 truncate">{dp.pred_titulo}
                <span className="text-k-text3"> · termina {dp.pred_fecha_fin}</span>
              </span>
              {sinTerminar && (
                <span className="text-[9px] font-bold text-k-amber bg-amber-500/10 border border-amber-500/30 rounded px-1.5 py-0.5"
                  title="La antecesora termina en o después del inicio de esta actividad">⚠ sin terminar</span>
              )}
              <button onClick={() => borrar.mutate(dp.id)} className="text-k-text3 hover:text-k-red"><Trash2 size={11} /></button>
            </div>
          )
        })}
        {(deps.data ?? []).length === 0 && !deps.isLoading && (
          <p className="text-[11px] text-k-text3">Sin antecesoras: puede arrancar cuando se quiera.</p>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        <select value={otmSel} onChange={e => { setOtmSel(e.target.value); setPredId(0) }}
          title="Paso 1: elige el proyecto de la antecesora"
          className={inputCls} style={{ width: 150 }}>
          <option value="">Todos los proyectos</option>
          {(otms.data ?? []).map(o => (
            <option key={o.otm_id} value={o.otm_id}>{o.otm_id}</option>
          ))}
        </select>
        <select value={predId || ''} onChange={e => setPredId(Number(e.target.value) || 0)}
          title="Paso 2: elige la actividad de ese proyecto"
          className={`${inputCls} flex-1 min-w-[180px]`} style={{ width: 'auto' }}>
          <option value="">Elegir antecesora…</option>
          {(candidatas.data ?? []).filter(c => c.id !== act.id).map(c => (
            <option key={c.id} value={c.id}>#{c.id} {c.titulo.slice(0, 44)} ({c.fecha}→{c.fecha_fin})</option>
          ))}
        </select>
        <input value={lag} onChange={e => setLag(e.target.value)} inputMode="numeric"
          title="Lag: días de espera tras el fin de la antecesora" className={inputCls} style={{ width: 52 }} />
        <button onClick={() => crear.mutate()} disabled={crear.isPending || !predId}
          className="text-xs px-3 py-2 rounded-lg bg-k-amber text-black font-bold disabled:opacity-40">+ Vincular</button>
      </div>
    </div>
  )
}

function Restricciones({ actId, onCambio }: { actId: number; onCambio: () => void }) {
  const qc = useQueryClient()
  const [nueva, setNueva] = useState({ descripcion: '', tipo: 'MATERIALES', responsable: '', fecha_requerida: '' })
  const rests = useQuery<Restriccion[]>({
    queryKey: ['restricciones', actId],
    queryFn: () => api(`/ev/programacion/actividades/${actId}/restricciones`),
  })
  const invalidar = () => { qc.invalidateQueries({ queryKey: ['restricciones', actId] }); onCambio() }
  const crear = useMutation({
    mutationFn: () => api(`/ev/programacion/actividades/${actId}/restricciones`, {
      method: 'POST', body: JSON.stringify({ ...nueva, fecha_requerida: nueva.fecha_requerida || null }),
    }),
    onSuccess: () => { setNueva({ descripcion: '', tipo: 'MATERIALES', responsable: '', fecha_requerida: '' }); invalidar() },
    onError: (e: Error) => alert(e.message),
  })
  const toggle = useMutation({
    mutationFn: (r: Restriccion) => api(`/ev/programacion/restricciones/${r.id}`, {
      method: 'PUT', body: JSON.stringify({ liberada: !r.liberada }),
    }),
    onSuccess: invalidar, onError: (e: Error) => alert(e.message),
  })
  const borrar = useMutation({
    mutationFn: (id: number) => api(`/ev/programacion/restricciones/${id}`, { method: 'DELETE' }),
    onSuccess: invalidar, onError: (e: Error) => alert(e.message),
  })
  const pend = (rests.data ?? []).filter(r => !r.liberada).length

  return (
    <div className="mt-4 border-t border-k-border pt-3">
      <p className="text-[10px] uppercase font-bold text-k-text3 mb-2">
        Restricciones (lookahead) {pend > 0 && <span className="text-k-red">· {pend} pendiente{pend !== 1 ? 's' : ''}</span>}
      </p>
      <div className="space-y-1.5 mb-2">
        {(rests.data ?? []).map(r => (
          <div key={r.id} className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 ${
            r.liberada ? 'border-k-border bg-k-raised/40 opacity-60' : 'border-red-500/25 bg-red-500/5'}`}>
            <input type="checkbox" checked={r.liberada} onChange={() => toggle.mutate(r)}
              title={r.liberada ? 'Liberada — desmarcar la reabre' : 'Marcar como LIBERADA'}
              className="accent-green-500 cursor-pointer" />
            <div className="flex-1 min-w-0">
              <span className={`text-[11px] ${r.liberada ? 'line-through text-k-text3' : 'text-k-text2'}`}>{r.descripcion}</span>
              <span className="text-[10px] text-k-text3 ml-1.5">
                {TIPOS_RESTRICCION[r.tipo] ?? r.tipo}{r.responsable ? ` · ${r.responsable}` : ''}{r.fecha_requerida ? ` · para ${r.fecha_requerida}` : ''}
              </span>
            </div>
            <button onClick={() => borrar.mutate(r.id)} className="text-k-text3 hover:text-k-red"><Trash2 size={11} /></button>
          </div>
        ))}
        {(rests.data ?? []).length === 0 && !rests.isLoading && (
          <p className="text-[11px] text-k-text3">Sin restricciones: la actividad está lista para comprometerse.</p>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        <input placeholder="Nueva restricción (ej. llega el acero)" value={nueva.descripcion}
          onChange={e => setNueva({ ...nueva, descripcion: e.target.value })} className={`${inputCls} flex-1 min-w-[160px]`} style={{ width: 'auto' }} />
        <select value={nueva.tipo} onChange={e => setNueva({ ...nueva, tipo: e.target.value })} className={inputCls} style={{ width: 'auto' }}>
          {Object.entries(TIPOS_RESTRICCION).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input placeholder="Responsable" value={nueva.responsable}
          onChange={e => setNueva({ ...nueva, responsable: e.target.value })} className={inputCls} style={{ width: 110 }} />
        <input type="date" value={nueva.fecha_requerida}
          onChange={e => setNueva({ ...nueva, fecha_requerida: e.target.value })} className={inputCls} style={{ width: 'auto' }} />
        <button onClick={() => crear.mutate()} disabled={crear.isPending || !nueva.descripcion.trim()}
          className="text-xs px-3 py-2 rounded-lg bg-k-amber text-black font-bold disabled:opacity-40">+ Agregar</button>
      </div>
    </div>
  )
}

// ── Sustento por partida: elige proyecto → partidas → rango y abre el PDF ──
function ModalReportePartida({ onClose }: { onClose: () => void }) {
  const [otm, setOtm] = useState('')
  const [sel, setSel] = useState<Set<number>>(new Set())
  const [filtro, setFiltro] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')

  const otms = useQuery<{ otm_id: string; descripcion: string }[]>({
    queryKey: ['otms-ev'],
    queryFn: () => api('/ev/otms'),
  })
  const partidas = useQuery<{ id: number; codigo: string; descripcion: string; es_hoja?: boolean }[]>({
    queryKey: ['partidas-otm', otm],
    queryFn: () => api(`/ev/partidas?otm=${encodeURIComponent(otm)}`),
    enabled: !!otm,
  })

  const lista = useMemo(() => {
    const q = filtro.trim().toLowerCase()
    return (partidas.data ?? []).filter(p =>
      !q || p.codigo.toLowerCase().includes(q) || p.descripcion.toLowerCase().includes(q))
  }, [partidas.data, filtro])

  const toggle = (id: number) => setSel(s => {
    const n = new Set(s)
    if (n.has(id)) n.delete(id); else n.add(id)
    return n
  })

  const abrir = () => {
    const ids = [...sel].join(',')
    window.open(`/programacion/reporte-partida?partidas=${ids}`
      + `${desde ? `&desde=${desde}` : ''}${hasta ? `&hasta=${hasta}` : ''}`, '_blank')
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-k-surface border border-k-border rounded-xl p-5 w-[620px] max-h-[88vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-bold text-k-text flex items-center gap-2">
            <FileText size={16} className="text-k-amber" /> Reporte por partida
          </h2>
          <button onClick={onClose} className="text-k-text3 hover:text-k-text"><X size={18} /></button>
        </div>
        <p className="text-xs text-k-text3 mb-4">
          Sustento de valorización: cifras de la partida + los partes de campo con sus fotos,
          del más antiguo al más nuevo.
        </p>

        <label className="block text-[10px] uppercase tracking-wider text-k-text3 mb-1">Proyecto</label>
        <select value={otm} onChange={e => { setOtm(e.target.value); setSel(new Set()) }}
          className="w-full bg-k-void border border-k-border rounded-lg px-3 py-2.5 text-sm text-k-text mb-3">
          <option value="">— Elegir proyecto —</option>
          {(otms.data ?? []).map(o => (
            <option key={o.otm_id} value={o.otm_id}>{o.otm_id} · {o.descripcion}</option>
          ))}
        </select>

        {otm && (
          <>
            <input value={filtro} onChange={e => setFiltro(e.target.value)}
              placeholder="Buscar partida por código o descripción…"
              className="w-full bg-k-void border border-k-border rounded-lg px-3 py-2 text-sm text-k-text mb-2" />
            <div className="border border-k-border rounded-lg max-h-64 overflow-y-auto divide-y divide-k-border mb-3">
              {partidas.isLoading ? (
                <div className="flex items-center gap-2 justify-center py-6 text-k-text3 text-xs">
                  <Loader2 size={14} className="animate-spin" /> Cargando partidas…
                </div>
              ) : lista.length === 0 ? (
                <p className="text-center py-6 text-k-text3 text-xs">Sin partidas.</p>
              ) : lista.map(p => (
                <button key={p.id} type="button" onClick={() => toggle(p.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-k-raised ${sel.has(p.id) ? 'bg-amber-500/10' : ''}`}>
                  <span className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] flex-shrink-0 ${
                    sel.has(p.id) ? 'bg-k-amber border-k-amber text-black' : 'border-k-border'}`}>
                    {sel.has(p.id) ? '✓' : ''}
                  </span>
                  <span className="font-mono text-[11px] text-k-amber flex-shrink-0">{p.codigo}</span>
                  <span className="text-xs text-k-text2 truncate">{p.descripcion}</span>
                </button>
              ))}
            </div>

            <div className="flex gap-3 mb-4">
              <div className="flex-1">
                <label className="block text-[10px] uppercase tracking-wider text-k-text3 mb-1">Desde (opcional)</label>
                <input type="date" value={desde} onChange={e => setDesde(e.target.value)}
                  className="w-full bg-k-void border border-k-border rounded-lg px-3 py-2 text-sm text-k-text" />
              </div>
              <div className="flex-1">
                <label className="block text-[10px] uppercase tracking-wider text-k-text3 mb-1">Hasta (opcional)</label>
                <input type="date" value={hasta} onChange={e => setHasta(e.target.value)}
                  className="w-full bg-k-void border border-k-border rounded-lg px-3 py-2 text-sm text-k-text" />
              </div>
            </div>
            <p className="text-[10px] text-k-text3 mb-3">Sin fechas trae todo el historial de la partida.</p>
          </>
        )}

        <button onClick={abrir} disabled={sel.size === 0}
          className="w-full flex items-center justify-center gap-2 bg-k-amber text-k-void font-bold rounded-lg py-2.5 text-sm disabled:opacity-40">
          <Printer size={15} /> Generar sustento ({sel.size} partida{sel.size !== 1 ? 's' : ''})
        </button>
      </div>
    </div>
  )
}

// ── Parte diario: el mismo texto que el supervisor manda al grupo ──
// Sirve para reenviarlo desde oficina o pegarlo en el informe del cliente.
function ModalParteDia({ onClose }: { onClose: () => void }) {
  const [fecha, setFecha] = useState(iso(new Date()))
  const [copiado, setCopiado] = useState('')

  const { data, isLoading } = useQuery<{ fecha: string; partes: { supervisor_id: string; supervisor: string; texto: string }[] }>({
    queryKey: ['reporte-dia', fecha],
    queryFn: () => api(`/ev/programacion/reporte-dia?fecha=${fecha}`),
  })

  const copiar = (id: string, texto: string) => {
    navigator.clipboard?.writeText(texto).then(() => {
      setCopiado(id); setTimeout(() => setCopiado(''), 2000)
    }).catch(() => {})
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-k-surface border border-k-border rounded-xl p-5 w-[680px] max-h-[88vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-k-text flex items-center gap-2">
            <ClipboardList size={16} className="text-k-amber" /> Parte diario por supervisor
          </h2>
          <button onClick={onClose} className="text-k-text3 hover:text-k-text"><X size={18} /></button>
        </div>
        <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
          className="bg-k-void border border-k-border rounded-lg px-3 py-2 text-sm text-k-text mb-4" />
        {isLoading ? (
          <div className="flex items-center gap-2 text-k-text3 text-sm py-8 justify-center">
            <Loader2 size={15} className="animate-spin" /> Cargando…
          </div>
        ) : !data?.partes.length ? (
          <p className="text-k-text3 text-sm py-6 text-center">Nadie reportó ese día.</p>
        ) : data.partes.map(p => (
          <div key={p.supervisor_id} className="mb-4">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-sm font-bold text-k-text">{p.supervisor}</span>
              <button onClick={() => copiar(p.supervisor_id, p.texto)}
                className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-k-border text-k-text2 hover:border-k-amber">
                {copiado === p.supervisor_id ? <Check size={12} className="text-k-green" /> : <Copy size={12} />}
                {copiado === p.supervisor_id ? 'Copiado' : 'Copiar'}
              </button>
            </div>
            <pre className="bg-k-void border border-k-border rounded-lg p-3 text-[11px] font-mono text-k-text2 whitespace-pre-wrap leading-relaxed">
              {p.texto}
            </pre>
          </div>
        ))}
      </div>
    </div>
  )
}

function ModalReporte({ rep, onClose }: { rep: Reporte; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-k-surface border border-k-border rounded-xl p-5 w-[640px] max-h-[88vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-bold text-k-text flex items-center gap-2"><Camera size={16} className="text-k-green" /> Reporte de campo</h2>
          <button onClick={onClose} className="text-k-text3 hover:text-k-text"><X size={18} /></button>
        </div>
        <p className="text-xs text-k-text3 mb-3">
          {rep.fecha} · {rep.otm_id} · {rep.supervisor_nombre || rep.supervisor_id}
          {rep.turno ? ` · turno ${rep.turno.toLowerCase()}` : ''}
          {rep.area ? ` · ${rep.area}` : ''}
        </p>
        {/* Parte estructurado: viñetas de lo ejecutado + lo que frenó el avance */}
        {rep.anotaciones && rep.anotaciones.length > 0 ? (
          <ul className="mb-3 space-y-1">
            {rep.anotaciones.map((n, i) => (
              <li key={i} className="text-sm text-k-text2 flex gap-2">
                <span className="text-k-amber font-bold">•</span><span>{n}</span>
              </li>
            ))}
          </ul>
        ) : rep.descripcion && (
          <p className="text-sm text-k-text2 mb-3 whitespace-pre-wrap">{rep.descripcion}</p>
        )}
        {rep.restricciones && rep.restricciones.length > 0 && (
          <div className="mb-3 border border-red-500/20 bg-red-500/5 rounded-lg p-3">
            <div className="text-[10px] font-bold text-k-red uppercase tracking-wider mb-1.5">
              Restricciones que bajaron el rendimiento
            </div>
            <ul className="space-y-1">
              {rep.restricciones.map((r, i) => (
                <li key={i} className="text-xs text-k-text2">
                  <span className="text-k-red font-bold">• </span>
                  {r.detalle || CNC[r.cat] || r.cat}
                  {r.detalle && <span className="text-k-text3"> ({CNC[r.cat] || r.cat})</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          {rep.fotos.map(f => f.url
            ? <img key={f.id} src={mediaUrl(f.url)} alt="" className="w-full rounded-lg border border-k-border" loading="lazy" />
            : <div key={f.id} className="rounded-lg border border-k-border bg-k-raised h-32 flex items-center justify-center text-[11px] text-k-text3 italic">foto purgada</div>)}
        </div>
        {rep.fotos.length === 0 && <p className="text-k-text3 text-sm">Reporte sin fotos.</p>}
      </div>
    </div>
  )
}

// ── Lookahead: ¿qué se PUEDE hacer en las próximas semanas? ──
function Lookahead({ onEditar, onCrear }: { onEditar: (a: Actividad) => void; onCrear: (fecha: string) => void }) {
  const [nSemanas, setNSemanas] = useState(4)
  const [desde, setDesde] = useState(() => iso(lunesDe(new Date())))

  interface Resp { desde: string; semanas: { lunes: string; domingo: string; actividades: Actividad[] }[] }
  const la = useQuery<Resp>({
    queryKey: ['lookahead', desde, nSemanas],
    queryFn: () => api(`/ev/programacion/lookahead?proyecto_id=${PROYECTO_ID}&desde=${desde}&semanas=${nSemanas}`),
  })
  const mover = (dias: number) => {
    const d = new Date(desde + 'T12:00:00'); d.setDate(d.getDate() + dias); setDesde(iso(lunesDe(d)))
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => mover(-7)} className="p-1.5 rounded-lg border border-k-border text-k-text2 hover:bg-k-raised"><ChevronLeft size={15} /></button>
        <span className="text-sm font-bold text-k-text">Lookahead desde {fmtDia(desde)}</span>
        <button onClick={() => mover(7)} className="p-1.5 rounded-lg border border-k-border text-k-text2 hover:bg-k-raised"><ChevronRight size={15} /></button>
        <button onClick={() => setDesde(iso(lunesDe(new Date())))} className="text-xs px-2.5 py-1.5 rounded-lg border border-k-border text-k-text3 hover:bg-k-raised">Hoy</button>
        <select value={nSemanas} onChange={e => setNSemanas(Number(e.target.value))} className={inputCls}>
          {[3, 4, 5, 6].map(n => <option key={n} value={n}>{n} semanas</option>)}
        </select>
        {la.isFetching && <Loader2 size={14} className="animate-spin text-k-text3" />}
      </div>

      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${nSemanas}, minmax(0, 1fr))` }}>
        {(la.data?.semanas ?? []).map((s, i) => {
          const pend = s.actividades.reduce((n, a) => n + (a.rest_pend ?? 0), 0)
          return (
            <div key={s.lunes} className="rounded-xl border border-k-border bg-k-surface flex flex-col min-h-[260px]">
              <div className="px-2.5 py-2 border-b border-k-border flex items-center justify-between">
                <div>
                  <div className="text-[10px] uppercase font-bold text-k-text3">{i === 0 ? 'Esta semana' : `Semana +${i}`}</div>
                  <div className="text-xs font-bold text-k-text">{fmtDia(s.lunes)} — {fmtDia(s.domingo)}</div>
                  <div className="text-[10px] text-k-text3">
                    {s.actividades.length} activ.{pend > 0 && <span className="text-k-red font-bold"> · ⛔ {pend} restric.</span>}
                  </div>
                </div>
                <button title="Programar en esta semana" onClick={() => onCrear(s.lunes)}
                  className="p-1 rounded-lg text-k-text3 hover:text-k-amber hover:bg-k-raised"><Plus size={15} /></button>
              </div>
              <div className="p-1.5 space-y-1.5 flex-1">
                {s.actividades.map(a => (
                  <div key={a.id} onClick={() => onEditar(a)}
                    className="rounded-lg border border-k-border bg-k-raised/60 hover:bg-k-raised cursor-pointer p-2 space-y-0.5">
                    <div className="flex items-center gap-1 flex-wrap">
                      {a.otm_id && <span className="font-mono text-[9px] px-1 py-0.5 rounded bg-blue-500/15 text-k-blue">{a.otm_id}</span>}
                      <span className={`text-[9px] font-bold px-1 py-0.5 rounded border ${ESTADO_CLR[a.estado]}`}>{ESTADO_LBL[a.estado]}</span>
                      {(a.rest_pend ?? 0) > 0
                        ? <span className="text-[9px] font-bold text-k-red" title="Restricciones pendientes">⛔ {a.rest_pend}</span>
                        : a.estado === 'PROGRAMADO' && <span className="text-[9px] text-k-green" title="Sin restricciones: lista para comprometer">✓ libre</span>}
                    </div>
                    <div className="text-[11px] text-k-text leading-snug">{a.titulo}</div>
                    <div className="text-[9px] text-k-text3">
                      {fmtDia(a.fecha)}{a.partida_codigo ? ` · ${a.partida_codigo}` : ''}{a.supervisor_nombre ? ` · ${a.supervisor_nombre}` : ''}
                    </div>
                  </div>
                ))}
                {s.actividades.length === 0 && <p className="text-[10px] text-k-text3 text-center pt-8">—</p>}
              </div>
            </div>
          )
        })}
      </div>
      <p className="text-[11px] text-k-text3">
        Regla Last Planner: una actividad solo debería comprometerse en el plan semanal cuando está
        <span className="text-k-green font-bold"> ✓ libre</span> (todas sus restricciones liberadas).
        Abre la actividad para gestionar sus restricciones.
      </p>
    </div>
  )
}

// ── PPC + Pareto de causas: el aprendizaje del Last Planner ──
function PanelPPC() {
  interface Resp {
    semanal: { lunes: string; comprometidas: number; cumplidas: number; no_cumplidas: number; ppc: number | null }[]
    cnc: { causa: string; etiqueta: string; n: number }[]
    pareto_restricciones?: { causa: string; etiqueta: string; n: number }[]
    por_supervisor: { supervisor_id: string; nombre?: string; comprometidas: number; cumplidas: number; ppc: number | null }[]
  }
  const [nSem, setNSem] = useState(8)
  const ppc = useQuery<Resp>({
    queryKey: ['ppc', nSem],
    queryFn: () => api(`/ev/programacion/ppc?proyecto_id=${PROYECTO_ID}&semanas=${nSem}`),
  })
  const d = ppc.data
  const totC = (d?.semanal ?? []).reduce((s, w) => s + w.comprometidas, 0)
  const totE = (d?.semanal ?? []).reduce((s, w) => s + w.cumplidas, 0)
  const totNC = (d?.semanal ?? []).reduce((s, w) => s + w.no_cumplidas, 0)
  const ppcGlobal = totC ? totE / totC : null
  const maxCnc = Math.max(1, ...(d?.cnc ?? []).map(c => c.n))
  const rest = d?.pareto_restricciones ?? []
  const maxRest = Math.max(1, ...rest.map(c => c.n))
  const pctTxt = (v: number | null) => (v == null ? '—' : `${(v * 100).toFixed(0)}%`)
  const ppcClr = (v: number | null) => (v == null ? 'text-k-text3' : v >= 0.75 ? 'text-k-green' : v >= 0.5 ? 'text-k-amber' : 'text-k-red')

  return (
    <div className="space-y-4">
      {/* F030b: la evaluación semanal comprometido vs alcanzado */}
      <EvaluacionSemanal />

      <div className="flex items-center gap-2">
        <select value={nSem} onChange={e => setNSem(Number(e.target.value))} className={inputCls}>
          {[4, 8, 12, 26].map(n => <option key={n} value={n}>Últimas {n} semanas</option>)}
        </select>
        {ppc.isFetching && <Loader2 size={14} className="animate-spin text-k-text3" />}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {[['PPC del periodo', pctTxt(ppcGlobal), ppcClr(ppcGlobal)],
          ['Comprometidas', String(totC), 'text-k-text'],
          ['Cumplidas', String(totE), 'text-k-green'],
          ['No cumplidas', String(totNC), 'text-k-red']].map(([l, v, c]) => (
          <div key={l} className="bg-k-surface border border-k-border rounded-xl px-4 py-3">
            <div className={`font-mono text-2xl font-medium ${c}`}>{v}</div>
            <div className="text-[10px] uppercase text-k-text3 tracking-wide">{l}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* PPC semanal (meta lean: ≥75%) */}
        <div className="bg-k-surface border border-k-border rounded-xl p-4">
          <p className="text-xs font-bold text-k-text mb-3">PPC semanal <span className="text-k-text3 font-normal">(sano: ≥75%)</span></p>
          <div className="space-y-2">
            {(d?.semanal ?? []).map(w => (
              <div key={w.lunes} className="flex items-center gap-2">
                <span className="text-[10px] text-k-text3 font-mono w-20 flex-shrink-0">{fmtDia(w.lunes)}</span>
                <div className="flex-1 h-4 bg-k-raised rounded overflow-hidden">
                  <div className={`h-full rounded ${w.ppc == null ? '' : w.ppc >= 0.75 ? 'bg-green-500/70' : w.ppc >= 0.5 ? 'bg-amber-500/70' : 'bg-red-500/70'}`}
                    style={{ width: `${Math.round((w.ppc ?? 0) * 100)}%` }} />
                </div>
                <span className={`text-[11px] font-bold w-12 text-right ${ppcClr(w.ppc)}`}>{pctTxt(w.ppc)}</span>
                <span className="text-[10px] text-k-text3 w-14 text-right">{w.cumplidas}/{w.comprometidas}</span>
              </div>
            ))}
            {(d?.semanal ?? []).length === 0 && <p className="text-k-text3 text-xs">Aún no hay actividades programadas en el periodo.</p>}
          </div>
        </div>

        {/* Pareto de causas de no cumplimiento */}
        <div className="bg-k-surface border border-k-border rounded-xl p-4">
          <p className="text-xs font-bold text-k-text mb-3">Causas de no cumplimiento <span className="text-k-text3 font-normal">(Pareto)</span></p>
          <div className="space-y-2">
            {(d?.cnc ?? []).map(c => (
              <div key={c.causa} className="flex items-center gap-2">
                <span className="text-[10px] text-k-text2 w-44 flex-shrink-0 truncate" title={c.etiqueta}>{c.etiqueta}</span>
                <div className="flex-1 h-4 bg-k-raised rounded overflow-hidden">
                  <div className="h-full bg-red-500/60 rounded" style={{ width: `${Math.round((c.n / maxCnc) * 100)}%` }} />
                </div>
                <span className="text-[11px] font-bold text-k-text w-6 text-right">{c.n}</span>
              </div>
            ))}
            {(d?.cnc ?? []).length === 0 && <p className="text-k-text3 text-xs">Sin no-cumplimientos registrados 🎉</p>}
          </div>
        </div>
      </div>

      {/* Restricciones reportadas desde campo: el trabajo SÍ se hizo, pero algo
          lo frenó. Van aparte del PPC — mezclarlas falsearía el indicador. */}
      <div className="bg-k-surface border border-k-border rounded-xl p-4">
        <p className="text-xs font-bold text-k-text mb-1">
          Restricciones que bajaron el rendimiento{' '}
          <span className="text-k-text3 font-normal">(Pareto — reportadas por los supervisores)</span>
        </p>
        <p className="text-[10px] text-k-text3 mb-3">
          La actividad se ejecutó, pero el supervisor reportó que algo le restó productividad.
          No afectan el PPC; sirven para atacar lo que se repite.
        </p>
        <div className="space-y-2">
          {rest.map(c => (
            <div key={c.causa} className="flex items-center gap-2">
              <span className="text-[10px] text-k-text2 w-44 flex-shrink-0 truncate" title={c.etiqueta}>{c.etiqueta}</span>
              <div className="flex-1 h-4 bg-k-raised rounded overflow-hidden">
                <div className="h-full bg-amber-500/60 rounded" style={{ width: `${Math.round((c.n / maxRest) * 100)}%` }} />
              </div>
              <span className="text-[11px] font-bold text-k-text w-6 text-right">{c.n}</span>
            </div>
          ))}
          {rest.length === 0 && <p className="text-k-text3 text-xs">Ningún supervisor reportó restricciones en el periodo.</p>}
        </div>
      </div>

      {/* Por supervisor */}
      <div className="bg-k-surface border border-k-border rounded-xl overflow-hidden">
        <p className="text-xs font-bold text-k-text px-4 py-2.5 border-b border-k-border">PPC por supervisor</p>
        <table className="w-full text-xs">
          <thead><tr className="text-[10px] uppercase text-k-text3 border-b border-k-border">
            <th className="text-left px-4 py-2">Supervisor</th><th className="text-right px-3 py-2">Comprometidas</th>
            <th className="text-right px-3 py-2">Cumplidas</th><th className="text-right px-3 py-2">PPC</th>
          </tr></thead>
          <tbody>
            {(d?.por_supervisor ?? []).map(s => (
              <tr key={s.supervisor_id} className="border-b border-k-border/40">
                <td className="px-4 py-1.5 text-k-text2">{s.nombre ?? s.supervisor_id}</td>
                <td className="px-3 py-1.5 text-right text-k-text2">{s.comprometidas}</td>
                <td className="px-3 py-1.5 text-right text-k-text2">{s.cumplidas}</td>
                <td className={`px-3 py-1.5 text-right font-bold ${ppcClr(s.ppc)}`}>{pctTxt(s.ppc)}</td>
              </tr>
            ))}
            {(d?.por_supervisor ?? []).length === 0 && (
              <tr><td colSpan={4} className="px-4 py-4 text-center text-k-text3">Sin actividades asignadas a supervisores en el periodo.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function PanelAlmacenamiento({ onCambio }: { onCambio: () => void }) {
  const qc = useQueryClient()
  const uso = useQuery<{ semana_iso: string; n_fotos: number; n_purgadas: number; bytes_en_disco: number }[]>({
    queryKey: ['media-uso'],
    queryFn: () => api(`/ev/programacion/media-uso?proyecto_id=${PROYECTO_ID}`),
  })
  const purgar = useMutation({
    mutationFn: (semana_iso: string) => api('/ev/programacion/purgar', {
      method: 'POST', body: JSON.stringify({ proyecto_id: PROYECTO_ID, semana_iso }),
    }),
    onSuccess: (j: unknown) => {
      const r = j as { fotos_purgadas: number; bytes_liberados: number }
      alert(`Purga completada: ${r.fotos_purgadas} fotos, ${fmtMB(r.bytes_liberados)} liberados. Los textos de los reportes se conservan.`)
      qc.invalidateQueries({ queryKey: ['media-uso'] }); onCambio()
    },
    onError: (e: Error) => alert(e.message),
  })
  const total = (uso.data ?? []).reduce((s, u) => s + Number(u.bytes_en_disco), 0)

  return (
    <div className="bg-k-surface border border-k-border rounded-xl overflow-hidden">
      <div className="px-4 py-2.5 border-b border-k-border flex items-center justify-between">
        <span className="text-sm font-bold text-k-text flex items-center gap-2"><HardDrive size={14} className="text-k-amber" /> Almacenamiento de fotos (disco del VPS)</span>
        <span className="text-sm text-k-text2">Total en disco: <b className="text-k-amber">{fmtMB(total)}</b></span>
      </div>
      <table className="w-full text-xs">
        <thead><tr className="text-[10px] uppercase text-k-text3 border-b border-k-border">
          <th className="text-left px-4 py-2">Semana</th><th className="text-right px-3 py-2">Fotos</th>
          <th className="text-right px-3 py-2">Purgadas</th><th className="text-right px-3 py-2">En disco</th><th className="px-3 py-2"></th>
        </tr></thead>
        <tbody>
          {(uso.data ?? []).map(u => (
            <tr key={u.semana_iso} className="border-b border-k-border/40">
              <td className="px-4 py-1.5 font-mono text-k-text2">{u.semana_iso}</td>
              <td className="px-3 py-1.5 text-right text-k-text2">{u.n_fotos}</td>
              <td className="px-3 py-1.5 text-right text-k-text3">{u.n_purgadas}</td>
              <td className="px-3 py-1.5 text-right text-k-text">{fmtMB(Number(u.bytes_en_disco))}</td>
              <td className="px-3 py-1.5 text-right">
                {Number(u.bytes_en_disco) > 0 && (
                  <button onClick={() => {
                    if (confirm(`¿Ya exportaste el reporte semanal de ${u.semana_iso}? La purga borra las fotos del disco DEFINITIVAMENTE (los textos se conservan).`)
                      && confirm(`Confirma la purga de ${u.semana_iso}.`)) purgar.mutate(u.semana_iso)
                  }}
                    className="text-[11px] px-2 py-1 rounded border border-red-500/30 text-k-red hover:bg-red-500/10">
                    Purgar
                  </button>
                )}
              </td>
            </tr>
          ))}
          {(uso.data ?? []).length === 0 && (
            <tr><td colSpan={5} className="px-4 py-4 text-center text-k-text3">Aún no hay fotos almacenadas.</td></tr>
          )}
        </tbody>
      </table>
      <p className="px-4 py-2 text-[10px] text-k-text3 border-t border-k-border">
        La purga es <b>automática</b>: cada día el sistema borra las fotos con más de ~2 meses
        (9 semanas; configurable con MEDIA_RETENCION_SEMANAS). Los textos de los reportes se
        conservan siempre. El botón Purgar es solo para liberar disco antes de tiempo — imprime
        el <b>Reporte semanal</b> (PDF con fotos) antes: es tu archivo permanente.
      </p>
    </div>
  )
}
