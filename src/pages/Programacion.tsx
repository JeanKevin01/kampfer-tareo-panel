import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ChevronLeft, ChevronRight, Plus, X, Loader2, Printer, HardDrive,
  Camera, User, Trash2, Ban, CheckCircle2, CalendarDays,
} from 'lucide-react'
import { api, API_BASE } from '@/lib/api'
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
  partida_id?: number | null; titulo: string; descripcion?: string | null
  estado: 'PROGRAMADO' | 'EJECUTADO' | 'CANCELADO' | 'NO_CUMPLIDA'
  responsable?: string | null; causa_nc?: string | null
  supervisor_id?: string | null; supervisor_nombre?: string | null
  creado_por?: string; reportes: number[]
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
  const [lunes, setLunes] = useState(() => iso(lunesDe(new Date())))
  const [modalAct, setModalAct] = useState<{ modo: 'crear'; fecha: string } | { modo: 'editar'; act: Actividad } | null>(null)
  const [repVer, setRepVer] = useState<Reporte | null>(null)
  const [verAlmacen, setVerAlmacen] = useState(false)

  const sem = useQuery<Semana>({
    queryKey: ['programacion', lunes],
    queryFn: () => api(`/ev/programacion/semana?proyecto_id=${PROYECTO_ID}&lunes=${lunes}`),
  })
  const invalidar = () => qc.invalidateQueries({ queryKey: ['programacion'] })

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
        <span className="text-k-amber font-bold">PROGRAMADO</span> lo crea el planner (asignado a un supervisor) ·
        pasa a <span className="text-k-green font-bold"> EJECUTADO</span> cuando llega el reporte de campo vinculado ·
        <span className="text-k-red font-bold"> NO CUMPLIDA</span> registra la causa de no cumplimiento ·
        los reportes sin actividad aparecen como tarjetas con 📷 en su día.
      </p>

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
      </div>
      <div className="text-[12px] text-k-text leading-snug">{act.titulo}</div>
      {(act.supervisor_nombre || act.responsable) && (
        <div className="text-[10px] text-k-text3 flex items-center gap-1">
          <User size={9} /> {act.supervisor_nombre || act.responsable}
        </div>
      )}
      {act.estado === 'NO_CUMPLIDA' && act.causa_nc && (
        <div className="text-[10px] text-k-red/90 leading-snug line-clamp-2">Causa: {act.causa_nc}</div>
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
    fecha: editar ? act!.fecha : datos.fecha,
  })
  const [error, setError] = useState('')

  // OJO: /ev/otms devuelve `otm_id` (no `id`) — usar otro nombre rompe el select.
  const otms = useQuery<{ otm_id: string; descripcion: string }[]>({
    queryKey: ['otms-lista'],
    queryFn: () => api('/ev/otms'),
  })
  const sups = useQuery<{ id: string; nombre: string }[]>({
    queryKey: ['supervisores-lista'],
    queryFn: () => api('/api/supervisores'),
  })

  const guardar = useMutation({
    mutationFn: () => {
      const body = { ...form, otm_id: form.otm_id || null, supervisor_id: form.supervisor_id || null }
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

        {editar && act!.estado === 'NO_CUMPLIDA' && act!.causa_nc && (
          <div className="mt-3 rounded-lg border border-red-500/25 bg-red-500/5 px-3 py-2">
            <p className="text-[10px] uppercase font-bold text-k-red">Causa de no cumplimiento</p>
            <p className="text-xs text-k-text2">{act!.causa_nc}</p>
          </div>
        )}

        {editar && (
          <div className="flex gap-2 mt-3 flex-wrap">
            {act!.estado !== 'EJECUTADO' && (
              <button onClick={() => estado.mutate({ estado: 'EJECUTADO' })}
                className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-green-500/30 text-k-green hover:bg-green-500/10">
                <CheckCircle2 size={12} /> Marcar ejecutada
              </button>
            )}
            {act!.estado === 'PROGRAMADO' && (
              <button onClick={() => {
                const causa = prompt('Causa de no cumplimiento (ej. falta de materiales, lluvia, interferencia):')
                if (causa?.trim()) estado.mutate({ estado: 'NO_CUMPLIDA', causa_nc: causa.trim() })
              }}
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
