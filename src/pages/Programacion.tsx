import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ChevronLeft, ChevronRight, Plus, X, Loader2, Printer, HardDrive,
  Camera, User, Trash2, Ban, CheckCircle2, CalendarDays,
} from 'lucide-react'
import { api, API_BASE } from '@/lib/api'
import { CNC, TIPOS_RESTRICCION } from '@/lib/catalogos'
import { lunesDe, iso } from '@/lib/semana'

const PROYECTO_ID = 1
const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
const MESES = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const inputCls = 'bg-k-raised border border-k-border rounded-lg px-2.5 py-2 text-sm text-k-text outline-none focus:border-k-amber w-full'

export interface Foto { id: number; url: string | null; url_thumb: string | null; purgada: boolean; bytes: number }
export interface Reporte {
  id: number; fecha: string; otm_id?: string; actividad_id?: number | null
  supervisor_id?: string; supervisor_nombre?: string; descripcion?: string
  creado_en?: string; fotos: Foto[]
}
export interface Actividad {
  id: number; fecha: string; otm_id?: string | null; otm_desc?: string | null
  partida_id?: number | null; partida_codigo?: string | null; partida_desc?: string | null
  titulo: string; descripcion?: string | null
  estado: 'PROGRAMADO' | 'EJECUTADO' | 'CANCELADO' | 'NO_CUMPLIDA'
  responsable?: string | null; causa_nc?: string | null; causa_nc_cat?: string | null
  supervisor_id?: string | null; supervisor_nombre?: string | null
  rest_total?: number; rest_pend?: number
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
const mediaUrl = (u: string | null) => (u ? `${API_BASE}${u}` : '')
const fmtMB = (b: number) => `${(b / 1024 / 1024).toFixed(1)} MB`

export default function Programacion() {
  const qc = useQueryClient()
  const [vista, setVista] = useState<'semana' | 'lookahead' | 'ppc'>('semana')
  const [lunes, setLunes] = useState(() => iso(lunesDe(new Date())))
  const [modalAct, setModalAct] = useState<{ modo: 'crear'; fecha: string } | { modo: 'editar'; act: Actividad } | null>(null)
  const [repVer, setRepVer] = useState<Reporte | null>(null)
  const [verAlmacen, setVerAlmacen] = useState(false)

  const sem = useQuery<Semana>({
    queryKey: ['programacion', lunes],
    queryFn: () => api(`/ev/programacion/semana?proyecto_id=${PROYECTO_ID}&lunes=${lunes}`),
  })
  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ['programacion'] })
    qc.invalidateQueries({ queryKey: ['lookahead'] })
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
          <button onClick={() => setVerAlmacen(v => !v)}
            className={`flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border ${verAlmacen ? 'border-k-amber text-k-amber' : 'border-k-border bg-k-raised text-k-text2 hover:bg-k-border'}`}>
            <HardDrive size={14} /> Almacenamiento
          </button>
          <button onClick={() => window.open(`/programacion/imprimir?lunes=${lunes}`, '_blank')}
            className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border border-k-border bg-k-raised text-k-text2 hover:bg-k-border">
            <Printer size={14} /> Reporte semanal
          </button>
        </div>
      </div>

      {verAlmacen && <PanelAlmacenamiento onCambio={invalidar} />}

      {/* Vistas Last Planner: plan semanal / lookahead / aprendizaje */}
      <div className="flex gap-2">
        {([['semana', 'Plan semanal'], ['lookahead', 'Lookahead'], ['ppc', 'PPC · Causas']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setVista(k)}
            className={`text-sm px-3 py-2 rounded-lg border font-medium ${
              vista === k ? 'border-k-amber bg-amber-500/10 text-k-amber' : 'border-k-border text-k-text2 hover:bg-k-raised'}`}>
            {l}
          </button>
        ))}
      </div>

      {vista === 'lookahead' && (
        <Lookahead onEditar={a => setModalAct({ modo: 'editar', act: a })}
          onCrear={f => setModalAct({ modo: 'crear', fecha: f })} />
      )}
      {vista === 'ppc' && <PanelPPC />}

      {vista === 'semana' && <>
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
                <button title="Programar actividad" onClick={() => setModalAct({ modo: 'crear', fecha: f })}
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
  // Partidas de control de la OTM elegida (LPS: 1 actividad = 1 partida)
  const partidas = useQuery<{ id: number; codigo: string; descripcion?: string }[]>({
    queryKey: ['partidas-otm', form.otm_id],
    queryFn: () => api(`/ev/partidas?otm=${encodeURIComponent(form.otm_id!)}`),
    enabled: !!form.otm_id,
  })

  const guardar = useMutation({
    mutationFn: () => {
      const body = { ...form, otm_id: form.otm_id || null, supervisor_id: form.supervisor_id || null,
        partida_id: form.partida_id || null }
      return editar
        ? api(`/ev/programacion/actividades/${act!.id}`, { method: 'PUT', body: JSON.stringify(body) })
        : api('/ev/programacion/actividades', { method: 'POST', body: JSON.stringify({ ...body, proyecto_id: PROYECTO_ID }) })
    },
    onSuccess: onChange, onError: (e: Error) => setError(e.message),
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
          <div className="grid grid-cols-2 gap-2">
            <input type="date" value={form.fecha} onChange={e => setForm({ ...form, fecha: e.target.value })} className={inputCls} />
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
            <select value={form.partida_id || ''} onChange={e => setForm({ ...form, partida_id: Number(e.target.value) || 0 })}
              className={inputCls} title="Partida de control que se trabajará (1 actividad = 1 partida)">
              <option value="">Sin partida específica (trabajo general de la OTM)</option>
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
            onConfirmar={(cat, detalle) => { setShowNC(false); estado.mutate({ estado: 'NO_CUMPLIDA', causa_nc_cat: cat, causa_nc: detalle }) }} />
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
        </p>
        {rep.descripcion && <p className="text-sm text-k-text2 mb-3 whitespace-pre-wrap">{rep.descripcion}</p>}
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
  const pctTxt = (v: number | null) => (v == null ? '—' : `${(v * 100).toFixed(0)}%`)
  const ppcClr = (v: number | null) => (v == null ? 'text-k-text3' : v >= 0.75 ? 'text-k-green' : v >= 0.5 ? 'text-k-amber' : 'text-k-red')

  return (
    <div className="space-y-4">
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
