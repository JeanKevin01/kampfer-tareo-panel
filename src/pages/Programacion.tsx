import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ChevronLeft, ChevronRight, Plus, X, Loader2, Printer, HardDrive,
  Camera, User, Trash2, Ban, CheckCircle2, CalendarDays, ClipboardList, Copy, Check, FileText,
  FolderArchive,
} from 'lucide-react'
import { api, apiBlob, descargarBlob, API_BASE } from '@/lib/api'
import { CNC, TIPOS_RESTRICCION } from '@/lib/catalogos'
import { lunesDe, iso } from '@/lib/semana'
import { LookaheadGrid, EvaluacionSemanal, type ActGrid } from '@/components/LookaheadGrid'
import AltaPartidasLote from '@/components/maestros/AltaPartidasLote'
import CierreSemana from '@/components/CierreSemana'
import NoPlanificadas from '@/components/NoPlanificadas'
import { ProgramarLote } from '@/components/ProgramarLote'
import { CalendarioLaboral } from '@/components/CalendarioLaboral'
import HistogramaMO from '@/components/HistogramaMO'
import MenuMas from '@/components/MenuMas'
import { useTab } from '@/lib/tabs'
import type { TabDef } from '@/lib/tabs'

const PROYECTO_ID = 1
const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
// La pestaña viaja en ?tab= (misma convención que el resto del panel), para que
// un enlace al LookAhead abra el LookAhead y no el plan semanal.
const TABS_PROG: TabDef[] = [
  { id: 'semana', label: 'Plan semanal' },
  { id: 'lookahead', label: 'Lookahead' },
  { id: 'histograma', label: 'Histograma · Ratios' },
  { id: 'ppc', label: 'PPC · Causas' },
]
const MESES = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const inputCls = 'bg-k-raised border border-k-border rounded-lg px-2.5 py-2 text-sm text-k-text outline-none focus:border-k-amber w-full'

export interface Foto { id: number; url: string | null; url_thumb: string | null; purgada: boolean; bytes: number; ancho?: number | null; alto?: number | null }
export interface Reporte {
  id: number; fecha: string; otm_id?: string; actividad_id?: number | null
  supervisor_id?: string; supervisor_nombre?: string; descripcion?: string
  creado_en?: string; fotos: Foto[]
  // Parte estructurado del supervisor (0032) + frente (0033)
  area?: string | null; frente?: string | null; turno?: string | null
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
  /** Qué porción de la partida grande es este tramo (0037): área y capa. */
  desglose_1?: string | null; desglose_2?: string | null
  dias_salto?: string[]; dias_medio?: string[]
  causa_nc_planner?: string | null; causa_nc_planner_cat?: string | null
  creado_por?: string; reportes: number[]
  /** Plazo en días hábiles; con él el API deriva la fecha que falte (0034). */
  plazo_dias?: number | null
  /** 0042 — la ejecuta otra empresa: ocupa sitio en el cronograma y arrastra
   *  nuestras fechas, pero NO entra al PPC (su atraso no es nuestro
   *  incumplimiento) ni tiene partida, metrado ni supervisor. */
  externa?: boolean; empresa?: string | null
}
export interface Restriccion {
  id: number; actividad_id: number; descripcion: string; tipo: string
  responsable?: string | null; fecha_requerida?: string | null
  liberada: boolean; liberada_en?: string | null
}

export interface Semana { lunes: string; fechas: string[]; actividades: Actividad[]; reportes: Reporte[] }

// Partida creada al programar a la que todavía le falta algo: OTM, lugar en el
// WBS, HH o precio de venta.
export interface PorUbicar {
  id: number; codigo: string; descripcion: string; unidad: string
  fase?: string | null; otm_id?: string | null
  metrado_presup: number; hh_presup: number; precio_unitario?: number
  naturaleza?: string | null; nivel?: number | null; parent_codigo?: string | null
  actividades: number; motivos: string[]
}

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

// Agrupa las actividades + reportes libres de un día por supervisor (el planner
// asigna cada actividad a uno). «Sin asignar» va al final; el resto alfabético.
const supLabel = (x: { supervisor_nombre?: string | null; responsable?: string | null }) =>
  x.supervisor_nombre || x.responsable || 'Sin asignar'

function agrupaPorSup(acts: Actividad[], libres: Reporte[]) {
  const m = new Map<string, { acts: Actividad[]; libres: Reporte[] }>()
  const get = (k: string) => { if (!m.has(k)) m.set(k, { acts: [], libres: [] }); return m.get(k)! }
  acts.forEach(a => get(supLabel(a)).acts.push(a))
  libres.forEach(r => get(supLabel(r)).libres.push(r))
  return [...m.entries()]
    .sort((a, b) => (a[0] === 'Sin asignar' ? 1 : b[0] === 'Sin asignar' ? -1 : a[0].localeCompare(b[0])))
    .map(([sup, v]) => ({ sup, ...v }))
}

export default function Programacion() {
  const qc = useQueryClient()
  // La pestaña TAMBIÉN va en la URL. Sin esto los filtros del LookAhead viajaban
  // en el enlace pero eran inalcanzables: al abrirlo la página volvía al plan
  // semanal, así que parecía que no se había guardado nada (Jean, 2026-08-01).
  const [vista, setVista] = useTab(TABS_PROG, 'semana') as
    [ 'semana' | 'lookahead' | 'histograma' | 'ppc', (v: string) => void ]
  const [agruparSup, setAgruparSup] = useState(false)   // plan semanal separado por supervisor
  const [lunes, setLunes] = useState(() => iso(lunesDe(new Date())))
  // `tipo` lo fija el paso 0 de ProgramarLote: 'libre' = actividad nuestra sin
  // partida (fechas + plazo, sin metrado), 'externa' = la ejecuta otra empresa.
  const [modalAct, setModalAct] = useState<{ modo: 'crear'; fecha: string; tipo?: 'libre' | 'externa' } | { modo: 'editar'; act: Actividad } | null>(null)
  const [modalLote, setModalLote] = useState<string | null>(null)   // fecha base del wizard «Programar actividad»
  const [repVer, setRepVer] = useState<Reporte | null>(null)
  const [verAlmacen, setVerAlmacen] = useState(false)
  const [verParte, setVerParte] = useState(false)
  const [verSustento, setVerSustento] = useState(false)
  const [verCalendario, setVerCalendario] = useState(false)
  const [verUbicar, setVerUbicar] = useState(false)

  // Contador de la bandeja: las partidas sin OTM no salen en ningún selector,
  // así que sin este aviso se quedarían olvidadas.
  const porUbicar = useQuery<PorUbicar[]>({
    queryKey: ['partidas-por-ubicar'],
    queryFn: () => api('/ev/partidas-por-ubicar'),
  })

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
        {/* Jerarquía de botones: UNA primaria (la acción que explica el módulo),
            dos secundarias de uso diario y el resto —lo de una vez al mes—
            dentro de «Más». Antes eran seis botones idénticos compitiendo. */}
        <div className="flex items-center gap-2">
          <button onClick={() => setModalLote(lunes)} className="btn btn-primario"
            title="Partidas del presupuesto, actividad libre sin metrado o trabajo de otra empresa">
            <Plus size={14} /> Programar actividad
          </button>
          {(porUbicar.data ?? []).length > 0 && (
            <button onClick={() => setVerUbicar(true)}
              title="Partidas creadas al programar a las que les falta OTM, lugar en el WBS, HH o precio de venta"
              className="btn btn-on font-bold">
              ⚑ Por completar ({(porUbicar.data ?? []).length})
            </button>
          )}
          <button onClick={() => setVerCalendario(v => !v)}
            title="Días de trabajo de la semana y feriados del proyecto"
            className={`btn ${verCalendario ? 'btn-on' : 'btn-secundario'}`}>
            <CalendarDays size={14} /> Calendario laboral
          </button>
          <button onClick={() => setVerSustento(true)}
            title="Sustento de valorización: partes y fotos por partida"
            className="btn btn-secundario">
            <FileText size={14} /> Reporte por partida
          </button>
          <MenuMas items={[
            { icono: <ClipboardList size={14} />, texto: 'Parte del día',
              ayuda: 'El parte diario tal como lo ve el supervisor (listo para copiar)',
              onClick: () => setVerParte(true) },
            { icono: <Printer size={14} />, texto: 'Reporte semanal',
              ayuda: 'Vista imprimible de la semana, con las fotos de campo',
              onClick: () => window.open(`/programacion/imprimir?lunes=${lunes}`, '_blank') },
            { icono: <HardDrive size={14} />, texto: 'Almacenamiento',
              ayuda: 'Cuánto ocupan las fotos por semana y purga manual',
              onClick: () => setVerAlmacen(v => !v), activo: verAlmacen },
          ]} />
        </div>
      </div>

      {verCalendario && <CalendarioLaboral />}
      {verAlmacen && <PanelAlmacenamiento onCambio={invalidar} />}
      {verParte && <ModalParteDia onClose={() => setVerParte(false)} />}
      {verSustento && <ModalReportePartida onClose={() => setVerSustento(false)} />}
      {verUbicar && <BandejaPorUbicar onClose={() => setVerUbicar(false)} />}

      {/* Vistas Last Planner: plan semanal / lookahead / aprendizaje */}
      <div className="flex gap-2">
        {TABS_PROG.map(({ id: k, label: l }) => (
          <button key={k} onClick={() => setVista(k)}
            className={`text-sm px-3 py-2 rounded-lg border font-medium ${
              vista === k ? 'border-k-amber bg-amber-500/10 text-k-amber' : 'border-k-border text-k-text2 hover:bg-k-raised'}`}>
            {l}
          </button>
        ))}
      </div>

      {/* Solo la tabla tipo Excel: la vista de tarjetas duplicaba la misma
          información con menos densidad y le robaba una franja a la
          cuadrícula (se retiró a pedido de Jean). */}
      {vista === 'lookahead' && (
        <LookaheadGrid onEditar={a => setModalAct({ modo: 'editar', act: desdeGrid(a) })}
          onProgramar={() => setModalLote(lunes)} />
      )}
      {vista === 'histograma' && <HistogramaMO />}

      {vista === 'ppc' && <PanelPPC />}

      {/* La vista de mes se retiró: el plan semanal es semanal por definición
          (Last Planner) y el horizonte largo ya lo da el LookAhead. */}
      {vista === 'semana' && (
        <div className="flex gap-1.5 items-center">
          <button onClick={() => setAgruparSup(v => !v)}
            title="Separa las tarjetas de cada día por supervisor"
            className={`ml-auto flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-lg border ${
              agruparSup ? 'border-k-amber text-k-amber bg-amber-500/10' : 'border-k-border text-k-text3 hover:bg-k-raised'}`}>
            <User size={12} /> Agrupar por supervisor
          </button>
        </div>
      )}

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
                <button title="Programar en este día" onClick={() => setModalLote(f)}
                  className="p-1 rounded-lg text-k-text3 hover:text-k-amber hover:bg-k-raised"><Plus size={15} /></button>
              </div>
              <div className="p-1.5 space-y-1.5 flex-1">
                {agruparSup ? agrupaPorSup(acts, libres).map(g => (
                  <div key={g.sup} className="space-y-1.5">
                    <div className="flex items-center gap-1 px-1 pt-0.5 border-b border-k-border/50 pb-0.5">
                      <User size={9} className={g.sup === 'Sin asignar' ? 'text-k-text3' : 'text-k-amber'} />
                      <span className="text-[9px] font-bold uppercase tracking-wide text-k-text2 truncate flex-1">{g.sup}</span>
                      <span className="text-[9px] text-k-text3">{g.acts.length + g.libres.length}</span>
                    </div>
                    {g.acts.map(a => (
                      <TarjetaActividad key={a.id} act={a} reps={a.reportes.map(id => repsPorId.get(id)!).filter(Boolean)}
                        onClick={() => setModalAct({ modo: 'editar', act: a })} />
                    ))}
                    {g.libres.map(r => (
                      <TarjetaReporte key={r.id} rep={r} onClick={() => setRepVer(r)} />
                    ))}
                  </div>
                )) : <>
                  {acts.map(a => (
                    <TarjetaActividad key={a.id} act={a} reps={a.reportes.map(id => repsPorId.get(id)!).filter(Boolean)}
                      onClick={() => setModalAct({ modo: 'editar', act: a })} />
                  ))}
                  {libres.map(r => (
                    <TarjetaReporte key={r.id} rep={r} onClick={() => setRepVer(r)} />
                  ))}
                </>}
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
        ⛔ = restricciones pendientes de liberar ·
        <span className="text-violet-300 font-bold"> EXTERNA</span> lo ejecuta otra empresa: ocupa su
        sitio y arrastra nuestras fechas, pero no cuenta en el PPC.
      </p>
      </>}

      {modalLote && (
        <ProgramarLote fechaBase={modalLote}
          onClose={() => setModalLote(null)}
          onCreado={() => { invalidar(); setModalLote(null) }}
          onLibre={tipo => { const f = modalLote; setModalLote(null); setModalAct({ modo: 'crear', fecha: f, tipo }) }} />
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
      className={`rounded-lg border cursor-pointer p-2 space-y-1 ${act.externa
        ? 'border-violet-500/30 bg-violet-500/[0.07] hover:bg-violet-500/[0.12]'
        : 'border-k-border bg-k-raised/60 hover:bg-k-raised'}`}>
      <div className="flex items-center gap-1 flex-wrap">
        {act.otm_id && <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-blue-500/15 text-k-blue border border-blue-500/20">{act.otm_id}</span>}
        {/* La marca de terceros también en el tablero semanal: aquí es donde el
            planner reparte el trabajo del día y tiene que ver de un vistazo que
            esta fila no la ejecuta su gente (ni cuenta en su PPC). */}
        {act.externa && (
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border text-violet-300 bg-violet-500/15 border-violet-500/30"
            title={`Lo ejecuta ${act.empresa || 'otra empresa'} — no depende de nosotros y no entra al PPC`}>
            EXTERNA
          </span>
        )}
        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${ESTADO_CLR[act.estado]}`}>{ESTADO_LBL[act.estado]}</span>
        {(act.rest_pend ?? 0) > 0 && (
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border text-k-red bg-red-500/10 border-red-500/30"
            title={`${act.rest_pend} restricción(es) pendiente(s) de liberar`}>⛔ {act.rest_pend}</span>
        )}
      </div>
      <div className={`text-[12px] leading-snug ${act.externa ? 'text-k-text2 italic' : 'text-k-text'}`}>{act.titulo}</div>
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
  datos: { modo: 'crear'; fecha: string; tipo?: 'libre' | 'externa' } | { modo: 'editar'; act: Actividad }
  repsPorId: Map<number, Reporte>
  onClose: () => void
  onChange: () => void
  onVerReporte: (r: Reporte) => void
}) {
  const editar = datos.modo === 'editar'
  const act = editar ? datos.act : null
  // Alta declarada «sin metrado» (libre o de terceros): el tercer campo es el
  // PLAZO en días, no el metrado. El metrado solo existe con partida detrás —
  // sin ella no hay dónde anotar el avance y el PPC la daría por no cumplida.
  const sinMetrado = !editar && datos.tipo != null
  const [form, setForm] = useState({
    titulo: act?.titulo ?? '', otm_id: act?.otm_id ?? '', descripcion: act?.descripcion ?? '',
    responsable: act?.responsable ?? '', supervisor_id: act?.supervisor_id ?? '',
    partida_id: act?.partida_id ?? 0,
    fecha: editar ? act!.fecha : datos.fecha,
    fecha_fin: act?.fecha_fin ?? '',
    metrado_prog: act?.metrado_prog != null ? String(act.metrado_prog) : '',
    und: act?.und ?? '',
    // Qué porción de la partida grande es este tramo (0037): en tierras «Área»
    // y «Capa», en estructuras «Eje» y «Nivel» — las etiquetas se configuran.
    desglose_1: act?.desglose_1 ?? '',
    desglose_2: act?.desglose_2 ?? '',
    dias_salto: act?.dias_salto ?? [],
    dias_medio: act?.dias_medio ?? [],
    // 0042 · trabajo de terceros: ocupa sitio en el cronograma y arrastra
    // nuestras fechas, pero no es un compromiso nuestro.
    externa: act?.externa ?? (datos.modo === 'crear' && datos.tipo === 'externa'),
    empresa: act?.empresa ?? '',
    plazo_dias: act?.plazo_dias != null ? String(act.plazo_dias) : '',
  })
  const [error, setError] = useState('')
  const [showNC, setShowNC] = useState(false)
  const [nuevaPartida, setNuevaPartida] = useState(false)
  const [lotePartidas, setLotePartidas] = useState(false)
  const [avisoLote, setAvisoLote] = useState('')

  // OJO: /ev/otms devuelve `otm_id` (no `id`) — usar otro nombre rompe el select.
  const otms = useQuery<{ otm_id: string; descripcion: string }[]>({
    queryKey: ['otms-lista'],
    queryFn: () => api('/ev/otms'),
  })
  const sups = useQuery<{ id: string; nombre: string }[]>({
    queryKey: ['supervisores-lista'],
    queryFn: () => api('/api/supervisores'),
  })
  // Empresas ya escritas (0042). Se autoalimenta con lo usado — no hay catálogo
  // que administrar: la lista existe para que la segunda vez se elija en vez de
  // teclearse, que es lo que evita «ELECTRO SAC» y «Electro S.A.C.».
  const empresas = useQuery<{ empresa: string; n: number }[]>({
    queryKey: ['empresas-usadas'],
    queryFn: () => api('/ev/programacion/empresas'),
    enabled: form.externa,
  })
  // Partidas de control de la OTM elegida (LPS: 1 actividad = 1 partida).
  // Sin OTM se ofrecen las de la bandeja «por ubicar»: en misceláneos se
  // programa antes de saber a qué obra va la partida.
  const partidas = useQuery<{ id: number; codigo: string; descripcion?: string; unidad?: string | null; metrado_presup?: number | string | null; fase?: string | null }[]>({
    queryKey: ['partidas-otm', form.otm_id],
    queryFn: () => api(form.otm_id
      ? `/ev/partidas?otm=${encodeURIComponent(form.otm_id)}`
      : '/ev/partidas?sin_otm=true'),
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
      // El título de la actividad se propone con el nombre de la partida: en el
      // caso normal («programar esta partida») no hay nada más que escribir, y
      // si es una etapa el planner le agrega « — Batido de material».
      titulo: f.titulo.trim() || (p?.descripcion ?? ''),
    }))
  }

  // Trabajo de producción = metrado + partida. Sin partida el metrado es un
  // espejismo: no hay dónde anotar el avance real (vive en la partida), no
  // suma al valor ganado y el PPC la cuenta como NO CUMPLIDA al cerrar la
  // semana aunque el trabajo se haya hecho. Se avisa acá y el API lo rechaza.
  const metradoNum = form.metrado_prog.trim() === '' ? null : Number(form.metrado_prog)
  const faltaPartida = !!metradoNum && !form.partida_id

  // Texto libre retirado del alta (Jean 2026-08-01): «Responsable / cuadrilla»
  // y la descripción se llenaban con prosa que no se puede filtrar, ordenar ni
  // sumar, y ocupaban sitio sin responder ninguna pregunta. Quien ejecuta ya lo
  // dice el SUPERVISOR (que además manda la actividad a su app de campo) o la
  // EMPRESA en una fila de terceros; el alcance lo dicen la partida y el metrado.
  //
  // Si una actividad YA tenía algo escrito, su campo sigue a la vista para poder
  // vaciarlo: ocultar texto que existe es esconderlo, no simplificar.
  const verResponsable = !!act?.responsable
  const verDescripcion = !!act?.descripcion
  // La empresa deja de ser opcional en una fila de terceros: es lo único que
  // queda para analizar (color de la barra, filtro, «cuántos días nos corrió»).
  // Se exige al crear; una fila vieja sin empresa se puede seguir guardando.
  const faltaEmpresa = form.externa && !form.empresa.trim() && !editar

  const guardar = useMutation({
    mutationFn: () => {
      // Una fila de terceros no lleva partida, metrado ni supervisor: se manda
      // limpia para que el API no tenga que rechazar restos del formulario.
      const base = form.externa ? {
        titulo: form.titulo, descripcion: form.descripcion, responsable: form.responsable,
        otm_id: form.otm_id || null, supervisor_id: null, partida_id: null,
        und: null, desglose_1: null, desglose_2: null,
        externa: true, empresa: form.empresa.trim() || null,
      } : {
        titulo: form.titulo, descripcion: form.descripcion, responsable: form.responsable,
        otm_id: form.otm_id || null, supervisor_id: form.supervisor_id || null,
        partida_id: form.partida_id || null, und: form.und.trim() || null,
        desglose_1: form.desglose_1.trim() || null,
        desglose_2: form.desglose_2.trim() || null,
        externa: false, empresa: form.empresa.trim() || null,
      }
      const metrado = form.externa ? null
        : form.metrado_prog.trim() === '' ? null : Number(form.metrado_prog)
      // Con plazo el API deriva la fecha que falte (0034). Solo viaja si el
      // planner lo escribió: mandarlo vacío desactivaría el modo por fechas.
      const plazo = form.plazo_dias.trim() === '' ? null : Number(form.plazo_dias)
      if (!editar) {
        return api('/ev/programacion/actividades', {
          method: 'POST',
          body: JSON.stringify({ ...base, proyecto_id: PROYECTO_ID, fecha: form.fecha,
            fecha_fin: form.fecha_fin || null, metrado_prog: metrado,
            ...(plazo ? { plazo_dias: plazo } : {}),
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
      if ((plazo ?? null) !== (act!.plazo_dias ?? null)) body.plazo_dias = plazo
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
          <h2 className="font-bold text-k-text">
            {editar ? 'Actividad'
              : form.externa ? 'Programar trabajo de otra empresa'
              : sinMetrado ? 'Programar actividad libre'
              : 'Programar actividad'}
          </h2>
          <div className="flex items-center gap-2">
            {act && <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${ESTADO_CLR[act.estado]}`}>{ESTADO_LBL[act.estado]}</span>}
            <button onClick={onClose} className="text-k-text3 hover:text-k-text"><X size={18} /></button>
          </div>
        </div>

        <div className="space-y-2">
          {/* El título es el nombre de LA ACTIVIDAD, no el de la partida: es lo
              que se lee en la fila del LookAhead y en la agenda del supervisor,
              y suele llevar la etapa o la zona («… — Batido de material»). Al
              elegir una partida se rellena solo con su descripción, así que en
              el caso normal no hay que escribir nada aquí. */}
          <input placeholder={form.externa
            ? 'Ej.: ELECTRO SAC — Montaje de bandejas'
            : sinMetrado ? 'Ej.: Montaje de andamios — zona norte'
            : 'Nombre de la actividad (se completa al elegir la partida)'}
            value={form.titulo} title="Lo que se lee en la fila del LookAhead y en la agenda del supervisor. Puede llevar la etapa o la zona; la partida puede llamarse distinto."
            onChange={e => setForm({ ...form, titulo: e.target.value })} className={inputCls} autoFocus={!editar} />

          {/* Trabajo de terceros (0042). Arriba del todo y con su propia banda
              porque cambia lo que significa TODO el formulario de abajo: sin
              metrado, sin partida y sin supervisor, y fuera del PPC. */}
          <label className={`flex items-start gap-2 rounded-lg px-3 py-2 border cursor-pointer ${
            form.externa ? 'border-violet-500/50 bg-violet-500/10' : 'border-k-border bg-k-raised/40'}`}>
            <input type="checkbox" checked={form.externa} className="mt-0.5"
              onChange={e => setForm({ ...form, externa: e.target.checked })} />
            <span className="text-[11px] leading-relaxed">
              <b className="text-k-text">Lo ejecuta otra empresa</b>
              <span className="text-k-text2"> — no depende de nosotros.</span>
              <span className="block text-k-text3">
                Ocupa su sitio en el cronograma y arrastra nuestras fechas con los mismos
                vínculos, pero <b>no entra al PPC</b>: su atraso no es nuestro incumplimiento.
              </span>
            </span>
          </label>

          {form.externa && (
            <div>
              <label className="text-[9px] uppercase font-bold text-k-text3">
                Empresa <span className="normal-case font-normal">(da el color de su barra y agrupa sus retrasos)</span>
              </label>
              <input list="empresas-usadas" placeholder="ELECTRO SAC" value={form.empresa}
                maxLength={80} onChange={e => setForm({ ...form, empresa: e.target.value })}
                className={`${inputCls} ${faltaEmpresa ? 'border-red-500/70' : ''}`} />
              <datalist id="empresas-usadas">
                {(empresas.data ?? []).map(e => <option key={e.empresa} value={e.empresa} />)}
              </datalist>
            </div>
          )}
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
            {form.externa || (sinMetrado && !form.partida_id) ? (
              // Así es como llega el dato: «nos toma 10 días». El API deriva la
              // F.Fin saltando los no laborables (mismo cálculo que el resto del
              // LookAhead), así que no hay que contar días a mano en el calendario.
              // Si luego se elige una partida, vuelve el metrado: ahí sí hay
              // dónde anotar el avance.
              <div>
                <label className="text-[9px] uppercase font-bold text-k-text3"
                  title="Días hábiles que dura. Se calcula la F.Fin saltando domingos y feriados; también puedes poner la F.Fin a mano.">
                  Plazo (días)
                </label>
                <input placeholder="10" inputMode="numeric" value={form.plazo_dias}
                  onChange={e => setForm({ ...form, plazo_dias: e.target.value })} className={inputCls} />
              </div>
            ) : (
              <div>
                <label className="text-[9px] uppercase font-bold text-k-text3" title="Se distribuye por día entre F.Inicio y F.Fin (LookAhead)">Metrado + und</label>
                <div className="flex gap-1">
                  <input placeholder="90" inputMode="decimal" value={form.metrado_prog}
                    onChange={e => setForm({ ...form, metrado_prog: e.target.value })} className={inputCls} />
                  <input placeholder="m3" value={form.und ?? ''} maxLength={10}
                    onChange={e => setForm({ ...form, und: e.target.value })} className={`${inputCls} w-16`} style={{ width: 64 }} />
                </div>
              </div>
            )}
          </div>

          {/* Desglose + saldo: la partida grande que se ejecuta en porciones.
              Solo tiene sentido con partida elegida — sin ella no hay de qué
              descontar ni qué subdividir. */}
          {!form.externa && form.partida_id > 0 && (
            <DesglosePartida partidaId={form.partida_id} excluir={act?.id ?? 0}
              metrado={form.metrado_prog}
              d1={form.desglose_1} d2={form.desglose_2}
              onCambio={(k, v) => setForm(f => ({ ...f, [k]: v }))} />
          )}

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
          {/* Partida, avisos y desglose no aplican a una fila de terceros: no
              ejecutamos ese trabajo, así que no hay avance nuestro que anotar. */}
          {!form.externa && <select value={form.partida_id || ''}
            onChange={e => {
              if (e.target.value === '__nueva') { setNuevaPartida(true); setLotePartidas(false); return }
              if (e.target.value === '__lote') { setLotePartidas(true); setNuevaPartida(false); return }
              elegirPartida(Number(e.target.value) || 0)
            }}
            className={`${inputCls} ${faltaPartida ? 'border-red-500/70' : ''}`}
            title="Partida de control que se trabajará (1 actividad = 1 partida)">
            <option value="">Sin partida — solo para actividades de apoyo (sin metrado)</option>
            {(partidas.data ?? []).map(p => (
              <option key={p.id} value={p.id}>{p.codigo} — {(p.descripcion ?? '').slice(0, 48)}</option>
            ))}
            <option value="__nueva">＋ Nueva partida (olvidada del presupuesto o adicional)…</option>
            <option value="__lote">＋＋ Varias partidas de una vez (pegar desde Excel)…</option>
          </select>}
          {!form.externa && !form.otm_id && (
            <p className="text-[10px] text-k-text3">
              Sin OTM se listan las partidas <b>por ubicar</b> (las que aún no se sabe a qué obra
              van). Elige la OTM arriba para ver las suyas.
            </p>
          )}
          {faltaPartida && (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-[11px] text-k-red">
              <b>Falta la partida.</b> Con metrado y sin partida no se puede registrar el avance
              real, la actividad no suma al valor ganado y el <b>PPC la contará como no
              cumplida</b> aunque el trabajo se haga. Elige una partida, créala, o
              borra el metrado si es una actividad de apoyo (reunión, traslado…).
            </div>
          )}
          {nuevaPartida && (
            <NuevaPartida otmId={form.otm_id || null} metrado={form.metrado_prog} und={form.und}
              titulo={form.titulo} padres={partidas.data ?? []}
              onCancelar={() => setNuevaPartida(false)}
              onCreada={p => {
                setNuevaPartida(false)
                // El metrado y la unidad de la partida BAJAN a la actividad (lo
                // mismo que hace elegirPartida con una existente): si no, la
                // actividad nace sin metrado y no se puede programar.
                partidas.refetch().then(() => setForm(f => ({
                  ...f, partida_id: p.id,
                  titulo: f.titulo.trim() || p.descripcion,
                  und: f.und || p.unidad,
                  metrado_prog: f.metrado_prog.trim() || p.metrado,
                })))
              }} />
          )}
          {lotePartidas && (
            <AltaPartidasLote otmId={form.otm_id || null} padres={partidas.data ?? []}
              onCancelar={() => setLotePartidas(false)}
              onListo={n => {
                setLotePartidas(false)
                setAvisoLote(`✓ ${n} partida(s) creadas. Elige aquí la de esta actividad; para programar`
                  + ' las demás de un golpe usa «Programar actividad» en la cabecera.')
                partidas.refetch()
              }} />
          )}
          {avisoLote && (
            <p className="text-[10px] text-k-green bg-green-500/10 border border-green-500/25 rounded-lg px-2.5 py-1.5">
              {avisoLote}
            </p>
          )}
          {/* Sin supervisor en las filas de terceros: nuestro supervisor no
              tarea trabajo ajeno, y asignárselo se la metería en su agenda de
              campo. */}
          <div className={verResponsable && !form.externa ? 'grid grid-cols-2 gap-2' : ''}>
            {!form.externa && (
              <select value={form.supervisor_id ?? ''} onChange={e => setForm({ ...form, supervisor_id: e.target.value })}
                className={inputCls} title="Supervisor asignado: la actividad le aparecerá en su app de campo">
                <option value="">Sin supervisor asignado</option>
                {(sups.data ?? []).map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
            )}
            {verResponsable && (
              <input placeholder={form.externa ? 'Contacto en la otra empresa' : 'Responsable / cuadrilla'}
                value={form.responsable ?? ''}
                onChange={e => setForm({ ...form, responsable: e.target.value })} className={inputCls} />
            )}
          </div>
          {verDescripcion && (
            <textarea placeholder="Descripción (alcance del día, metrados previstos…)" value={form.descripcion ?? ''}
              onChange={e => setForm({ ...form, descripcion: e.target.value })} rows={3} className={inputCls} />
          )}
          {error && <p className="text-k-red text-xs">{error}</p>}
          {faltaEmpresa && (
            <p className="text-[11px] text-k-red">
              Escribe la empresa: es el único dato de esta fila que sirve para analizar
              (color de su barra, filtro y «cuántos días nos corrió»).
            </p>
          )}
          <button onClick={() => guardar.mutate()}
            disabled={guardar.isPending || !form.titulo.trim() || faltaPartida || faltaEmpresa}
            title={faltaPartida ? 'Elige la partida o borra el metrado'
              : faltaEmpresa ? 'Falta la empresa' : undefined}
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

// ── Desglose de la partida grande y su saldo ─────────────────
// El caso de Jean (movimiento de tierras): RELLENO ZONA 5 son 15 000 m³ que no
// se hacen de una — se avanza por ÁREAS y CAPAS, de 200 en 200. La partida
// sigue siendo UNA (crear una hija por área-capa haría el WBS ilegible y
// rompería la comparación contra el contractual); lo que se subdivide es su
// programación, y por eso hace falta ver cuánto le queda al presupuesto.
interface SaldoResp {
  codigo: string; unidad?: string | null
  metrado_presup: number; programado: number; ejecutado: number
  saldo_por_programar: number; excedido: number
  pct_programado: number | null; pct_ejecutado: number | null
  desglose: { desglose_1: string | null; desglose_2: string | null; programado: number; actividades: number }[]
}

function DesglosePartida({ partidaId, excluir, metrado, d1, d2, onCambio }: {
  partidaId: number
  /** La actividad que se está editando no debe contarse contra su propio saldo. */
  excluir: number
  metrado: string
  d1: string; d2: string
  onCambio: (campo: 'desglose_1' | 'desglose_2', valor: string) => void
}) {
  const cfg = useQuery<{ etiqueta_desglose_1: string; etiqueta_desglose_2: string }>({
    queryKey: ['prog-config', PROYECTO_ID],
    queryFn: () => api(`/ev/programacion/config?proyecto_id=${PROYECTO_ID}`),
    staleTime: 10 * 60 * 1000,
  })
  const saldo = useQuery<SaldoResp>({
    queryKey: ['saldo-partida', partidaId, excluir],
    queryFn: () => api(`/ev/programacion/saldo-partida?partida_id=${partidaId}&excluir=${excluir}`),
  })
  const opciones = useQuery<{ desglose_1: string[]; desglose_2: string[] }>({
    queryKey: ['desgloses', partidaId],
    queryFn: () => api(`/ev/programacion/desgloses?partida_id=${partidaId}&proyecto_id=${PROYECTO_ID}`),
    staleTime: 5 * 60 * 1000,
  })
  // El API llega con el Redeploy; hasta entonces esto simplemente no aparece.
  if (saldo.isError || cfg.isError) return null

  const e1 = cfg.data?.etiqueta_desglose_1 ?? 'Área'
  const e2 = cfg.data?.etiqueta_desglose_2 ?? 'Capa'
  const s = saldo.data
  const und = s?.unidad ? ` ${s.unidad}` : ''
  const pedido = metrado.trim() === '' ? 0 : Number(metrado)
  // El saldo ya excluye esta actividad, así que el total con lo que se está
  // pidiendo ahora es lo que de verdad quedará comprometido.
  const restante = s ? s.saldo_por_programar - (Number.isFinite(pedido) ? pedido : 0) : null
  const nc = (v: number) => (Math.round(v * 1000) / 1000).toLocaleString('es-PE')

  return (
    <div className="rounded-lg border border-k-border bg-k-raised/40 px-3 py-2 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        {([[e1, 'desglose_1' as const, d1, opciones.data?.desglose_1 ?? []],
          [e2, 'desglose_2' as const, d2, opciones.data?.desglose_2 ?? []]] as const).map(
          ([etiqueta, campo, valor, sugerencias]) => (
            <div key={campo}>
              <label className="text-[9px] uppercase font-bold text-k-text3">
                {etiqueta} <span className="normal-case font-normal">(opcional)</span>
              </label>
              <input list={`sug-${campo}`} value={valor} placeholder={`Ej: ${etiqueta} 3`}
                onChange={e => onCambio(campo, e.target.value)} className={inputCls}
                title="Sirve para agrupar el lookahead en la reunión. Se escribe libre; abajo salen las que ya usaste." />
              <datalist id={`sug-${campo}`}>
                {sugerencias.map(v => <option key={v} value={v} />)}
              </datalist>
            </div>
          ))}
      </div>

      {s && s.metrado_presup > 0 && (
        <>
          <div className="flex items-center gap-2 text-[10px]">
            <div className="flex-1 h-2.5 bg-k-raised rounded overflow-hidden flex" title={
              `Ejecutado ${nc(s.ejecutado)}${und} · programado ${nc(s.programado)}${und} de ${nc(s.metrado_presup)}${und}`}>
              <div className="bg-green-500/70" style={{ width: `${Math.min(100, (s.ejecutado / s.metrado_presup) * 100)}%` }} />
              <div className="bg-k-plan/50" style={{
                width: `${Math.max(0, Math.min(100 - (s.ejecutado / s.metrado_presup) * 100,
                  ((s.programado - s.ejecutado) / s.metrado_presup) * 100))}%` }} />
            </div>
            <span className="text-k-text3 whitespace-nowrap">
              {nc(s.ejecutado)} hecho · {nc(s.programado)} programado de <b className="text-k-text2">{nc(s.metrado_presup)}{und}</b>
            </span>
          </div>
          <p className={`text-[10px] ${
            restante != null && restante < -0.0005 ? 'text-k-alerta' : 'text-k-text3'}`}>
            {restante == null ? null
              : restante < -0.0005
                ? <><b>Te pasas {nc(Math.abs(restante))}{und} del presupuesto de la partida.</b> Se
                  puede programar igual —la obra manda—, pero queda como mayor metrado por sustentar.</>
                : <>Quedarían <b className="text-k-text2">{nc(restante)}{und}</b> por programar de
                  esta partida{pedido > 0 ? ' después de este tramo' : ''}.</>}
          </p>
        </>
      )}

      {s && s.desglose.filter(x => x.desglose_1 || x.desglose_2).length > 0 && (
        <details className="text-[10px]">
          <summary className="cursor-pointer text-k-text3 hover:text-k-text2">
            Ya programado por {e1.toLowerCase()} / {e2.toLowerCase()}
          </summary>
          <div className="mt-1 space-y-0.5">
            {s.desglose.filter(x => x.desglose_1 || x.desglose_2).map((x, i) => (
              <div key={i} className="flex gap-2 text-k-text3">
                <span className="flex-1 truncate">
                  {x.desglose_1 ?? '—'}{x.desglose_2 ? ` · ${x.desglose_2}` : ''}
                </span>
                <span className="tabular-nums">{nc(x.programado)}{und}</span>
              </div>
            ))}
          </div>
        </details>
      )}
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

// Solo LECTURA + borrar. El alta de vínculos se hace en el LookAhead, donde se
// eligen con el ratón sobre la cuadrícula (modo 🔗 clic-clic, escribir «12FS+2»
// en la columna DESPUÉS DE, o encadenar varias seleccionadas). Aquí había un
// selector de dos pasos que obligaba a saber de memoria el proyecto y el número
// de la antecesora, sin ver ninguna fecha: funcionaba, pero era el peor sitio
// para hacerlo. Lo que sí hace falta desde el detalle es ver los vínculos que
// tiene y poder soltar uno (encargo de Jean 2026-08-01).
function Antecesoras({ act, onCambio }: { act: Actividad; onCambio: () => void }) {
  const qc = useQueryClient()
  interface Dep { id: number; predecesora_id: number; lag_dias: number; pred_titulo: string; pred_fecha_fin: string; pred_estado: string }
  const deps = useQuery<Dep[]>({
    queryKey: ['dependencias', act.id],
    queryFn: () => api(`/ev/programacion/actividades/${act.id}/dependencias`),
  })
  const invalidar = () => { qc.invalidateQueries({ queryKey: ['dependencias', act.id] }); onCambio() }
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
          <p className="text-[11px] text-k-text3">
            Sin antecesoras: puede arrancar cuando se quiera.{' '}
            <span className="text-k-text3">Para vincularla, usa <b>🔗 Vincular</b> en el LookAhead.</span>
          </p>
        )}
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

  const [zipCargando, setZipCargando] = useState(false)
  const [zipError, setZipError] = useState('')

  const qs = () => {
    const ids = [...sel].join(',')
    return `partidas=${ids}${desde ? `&desde=${desde}` : ''}${hasta ? `&hasta=${hasta}` : ''}`
  }

  // Combinado: abre la vista imprimible (un solo PDF con «Imprimir → Guardar»).
  const abrir = () => {
    window.open(`/programacion/reporte-partida?${qs()}`, '_blank')
    onClose()
  }

  // ZIP: un PDF por partida (para adjuntar a cada línea de la valorización).
  // Lo arma el API (fpdf2) con las fotos embebidas desde el disco del VPS.
  const descargarZip = async () => {
    setZipError(''); setZipCargando(true)
    try {
      const blob = await apiBlob(`/ev/programacion/reporte-partida.zip?${qs()}`)
      const nombre = desde || hasta
        ? `sustento_${desde || 'inicio'}_${hasta || 'hoy'}.zip`
        : 'sustento_valorizacion.zip'
      descargarBlob(blob, nombre)
      onClose()
    } catch (e) {
      setZipError((e as Error).message || 'No se pudo generar el ZIP')
    } finally {
      setZipCargando(false)
    }
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
          del más antiguo al más nuevo. Descárgalo como <b>ZIP con un PDF por partida</b> (ideal
          para adjuntar a cada línea de la valorización) o como un solo documento combinado.
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

        {zipError && <p className="text-k-red text-xs mb-2">{zipError}</p>}
        <div className="flex gap-2">
          <button onClick={descargarZip} disabled={sel.size === 0 || zipCargando}
            title="Descarga un ZIP con un PDF por partida"
            className="flex-1 flex items-center justify-center gap-2 bg-k-amber text-k-void font-bold rounded-lg py-2.5 text-sm disabled:opacity-40">
            {zipCargando
              ? <><Loader2 size={15} className="animate-spin" /> Generando PDFs…</>
              : <><FolderArchive size={15} /> Descargar ZIP ({sel.size} PDF{sel.size !== 1 ? 's' : ''})</>}
          </button>
          <button onClick={abrir} disabled={sel.size === 0 || zipCargando}
            title="Abre un solo documento combinado para imprimir o guardar como PDF"
            className="flex items-center justify-center gap-2 border border-k-border bg-k-raised text-k-text2 hover:border-k-amber rounded-lg py-2.5 px-3 text-sm disabled:opacity-40">
            <Printer size={15} /> Combinado
          </button>
        </div>
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
          {rep.frente ? ` · frente ${rep.frente}` : ''}
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

// ── PPC + Pareto de causas: el aprendizaje del Last Planner ──
function PanelPPC() {
  interface Resp {
    semanal: { lunes: string; comprometidas: number; cumplidas: number; no_cumplidas: number
      ppc: number | null
      /** congelada = ya se cerró y su número no volverá a cambiar */
      congelada?: boolean; parcial?: boolean; no_planificadas?: number
      /** 0041 — contra qué plan se midió. COMPROMETIDO ya no se mueve por
       *  reprogramar, aunque la semana siga abierta; VIGENTE sí. */
      origen?: 'CERRADA' | 'COMPROMETIDO' | 'VIGENTE' }[]
    cnc: { causa: string; etiqueta: string; n: number }[]
    pareto_restricciones?: { causa: string; etiqueta: string; n: number }[]
    por_supervisor: { supervisor_id: string; nombre?: string; comprometidas: number; cumplidas: number; ppc: number | null }[]
    /** 0040 — el indicador PAR del PPC. Va aparte a proposito: no se mezcla ni
     *  se arma un «PPC ampliado». El PPC mide la confiabilidad de la promesa;
     *  esto mide cuanto improvisa la obra. Dos numeros limpios valen mas que
     *  uno mezclado, y juntos son los que muestran mejora de verdad. */
    no_planificado?: {
      actividades: number; hh: number; hh_total: number; ratio: number | null
      hh_sin_actividad: number; sin_clasificar: number
      pareto_motivos: { motivo: string; etiqueta: string; n: number; improvisacion: boolean }[]
      no_cumplidas_causadas: number; no_cumplidas_total: number
    }
  }
  const [nSem, setNSem] = useState(8)
  const [verExport, setVerExport] = useState<'cliente' | 'oficina' | null>(null)
  // UNA semana para todo el tab: el cierre de arriba y la evaluación de abajo
  // miran lo mismo. Arranca en la PASADA, que es la que toca cerrar.
  const [lunes, setLunes] = useState(() => iso(lunesDe(new Date(Date.now() - 7 * 864e5))))
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
  const np = d?.no_planificado
  const maxMot = Math.max(1, ...(np?.pareto_motivos ?? []).map(c => c.n))
  const rest = d?.pareto_restricciones ?? []
  const maxRest = Math.max(1, ...rest.map(c => c.n))
  const pctTxt = (v: number | null) => (v == null ? '—' : `${(v * 100).toFixed(0)}%`)
  const ppcClr = (v: number | null) => (v == null ? 'text-k-text3' : v >= 0.75 ? 'text-k-green' : v >= 0.5 ? 'text-k-amber' : 'text-k-red')

  return (
    <div className="space-y-4">
      {/* Lo que se ENTREGA va arriba: son dos documentos distintos porque son
          dos lectores distintos. Al cliente se le explica el caso; «falta de
          materiales» o «falta de mano de obra» es diagnóstico interno. */}
      <div className="flex items-center justify-end gap-2 flex-wrap">
        {ppc.isFetching && <Loader2 size={14} className="animate-spin text-k-text3 mr-auto" />}
        <button onClick={() => setVerExport('cliente')} className="btn btn-secundario btn-sm"
          title="Avance día a día, cumplimiento de la semana y la explicación que escribió el planner. Sin categorías internas.">
          <Printer size={14} /> Reporte para el cliente
        </button>
        <button onClick={() => setVerExport('oficina')} className="btn btn-secundario btn-sm"
          title="Tendencia del PPC, Pareto de causas, restricciones y detalle por partidas. Para la gerencia y la oficina técnica.">
          <Printer size={14} /> Reporte para oficina
        </button>
      </div>

      {/* Cierre de la semana: congela el PPC (y es la reunión del Last Planner:
          revisar, poner causa a lo que no salió, cerrar). */}
      {/* key = la semana: cambiarla tira los ajustes sin cerrar, que eran de la
          semana anterior. */}
      <CierreSemana key={lunes} proyectoId={PROYECTO_ID} lunes={lunes} onLunes={setLunes} />

      {/* F030b: la evaluación semanal comprometido vs alcanzado — la MISMA
          semana que el cierre de arriba. */}
      <EvaluacionSemanal lunes={lunes} onLunes={setLunes} />

      <div className="flex items-center gap-2">
        <select value={nSem} onChange={e => setNSem(Number(e.target.value))} className={inputCls}>
          {[4, 8, 12, 26].map(n => <option key={n} value={n}>Últimas {n} semanas</option>)}
        </select>
        <span className="text-[11px] text-k-text3">para los indicadores de abajo</span>
      </div>
      {verExport && <ModalPpcExport destino={verExport} nSem={nSem} lunes={lunes}
        onClose={() => setVerExport(null)} />}

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

      {/* El indicador PAR. Un PPC alto puede convivir con una obra caótica: mide
          si se cumple lo prometido, no cuánto se improvisó. Estos dos juntos son
          los que sostienen una mejora — el PPC solo, no. */}
      {np && (
        <div className="bg-k-surface border border-k-border rounded-xl p-4">
          <p className="text-xs font-bold text-k-text mb-1">
            Trabajo no planificado{' '}
            <span className="text-k-text3 font-normal">(fuera del PPC — el indicador par)</span>
          </p>
          <p className="text-[10px] text-k-text3 mb-3">
            Horas del tareo que se fueron en trabajo que nadie comprometió. Se mide en HH y no en
            número de actividades porque una de 4 HH y una de 200 no pesan igual.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div className="bg-k-raised border border-k-border rounded-lg px-3 py-2">
              <div className={`font-mono text-2xl font-medium ${np.ratio == null ? 'text-k-text3'
                : np.ratio <= 0.15 ? 'text-k-green' : np.ratio <= 0.30 ? 'text-k-alerta' : 'text-k-red'}`}>
                {np.ratio == null ? '—' : `${(np.ratio * 100).toFixed(0)}%`}
              </div>
              <div className="text-[10px] uppercase text-k-text3 tracking-wide">HH no planificadas</div>
            </div>
            <div className="bg-k-raised border border-k-border rounded-lg px-3 py-2">
              <div className="font-mono text-2xl font-medium text-k-text">
                {np.hh.toLocaleString('es-PE')}
              </div>
              <div className="text-[10px] uppercase text-k-text3 tracking-wide">
                de {np.hh_total.toLocaleString('es-PE')} HH
              </div>
            </div>
            <div className="bg-k-raised border border-k-border rounded-lg px-3 py-2">
              <div className="font-mono text-2xl font-medium text-k-alerta">{np.actividades}</div>
              <div className="text-[10px] uppercase text-k-text3 tracking-wide">
                actividades{np.sin_clasificar ? ` · ${np.sin_clasificar} sin clasificar` : ''}
              </div>
            </div>
            {/* La frase que cambia la reunión semanal. */}
            <div className="bg-k-raised border border-k-border rounded-lg px-3 py-2"
              title="Incumplimientos cuya cuadrilla se fue a trabajo no planificado. Sin este vínculo el Pareto dice «nos falta gente» cuando la verdad es «nos metieron trabajo que no estaba».">
              <div className="font-mono text-2xl font-medium text-k-red">
                {np.no_cumplidas_causadas}
                <span className="text-sm text-k-text3">/{np.no_cumplidas_total}</span>
              </div>
              <div className="text-[10px] uppercase text-k-text3 tracking-wide">
                incumplim. que causó
              </div>
            </div>
          </div>
          {!!np.hh_sin_actividad && (
            <p className="text-[10px] text-k-text3 mt-2">
              Además <b className="text-k-text2">{np.hh_sin_actividad.toLocaleString('es-PE')} HH</b>{' '}
              cayeron en partidas sin ninguna actividad de la semana: no son planificadas ni no
              planificadas. Se informan porque callarlas dejaría el indicador corto.
            </p>
          )}
          {!!(np.pareto_motivos ?? []).length && (
            <div className="mt-3 space-y-2">
              <p className="text-[11px] font-bold text-k-text2">
                ¿Por qué entró? <span className="text-k-text3 font-normal">(Pareto de motivos)</span>
              </p>
              {np.pareto_motivos.map(m => (
                <div key={m.motivo} className="flex items-center gap-2">
                  <span className="text-[10px] text-k-text2 w-52 flex-shrink-0 truncate"
                    title={m.etiqueta}>{m.etiqueta}</span>
                  <div className="flex-1 h-4 bg-k-raised rounded overflow-hidden">
                    <div className={`h-full rounded ${m.motivo === 'OMISION_PLANNER' ? 'bg-amber-500/70'
                      : m.motivo === 'EMERGENCIA' ? 'bg-red-500/60'
                        : m.motivo === 'CLIENTE' ? 'bg-blue-500/60'
                          : m.motivo === 'ADELANTO' ? 'bg-green-500/60' : 'bg-k-text3/40'}`}
                      style={{ width: `${Math.round((m.n / maxMot) * 100)}%` }} />
                  </div>
                  <span className="text-[11px] font-bold text-k-text w-6 text-right">{m.n}</span>
                  <span className={`text-[9px] w-16 ${m.improvisacion ? 'text-k-text3' : 'text-k-green'}`}>
                    {m.improvisacion ? '' : 'no cuenta'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* La bandeja: el parte y las fotos que mandó campo, para clasificarlo. */}
      <NoPlanificadas proyectoId={PROYECTO_ID} nSem={nSem} lunes={lunes} />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* PPC semanal (meta lean: ≥75%) */}
        <div className="bg-k-surface border border-k-border rounded-xl p-4">
          <p className="text-xs font-bold text-k-text mb-3">PPC semanal <span className="text-k-text3 font-normal">(sano: ≥75%)</span></p>
          <div className="space-y-2">
            {(d?.semanal ?? []).map(w => (
              <div key={w.lunes} className="flex items-center gap-2">
                {/* Tres estados, no dos (0041): cerrada (el veredicto ya no se
                    recalcula), comprometida (el DENOMINADOR está congelado, así
                    que reprogramar no la mueve aunque siga abierta) y vigente
                    (se recalcula con el plan de hoy). Antes las dos últimas se
                    veían igual, y eran cosas muy distintas. */}
                <span title={w.congelada
                  ? `Semana cerrada${w.parcial ? ' con corte parcial' : ''}: este número ya no cambia`
                  : w.origen === 'COMPROMETIDO'
                    ? 'Semana comprometida: el denominador está congelado, reprogramar ya no mueve este número'
                    : 'Semana sin comprometer: se calcula sobre el plan vigente y aún puede cambiar'}
                  className={`w-3 flex-shrink-0 text-[9px] ${w.congelada ? 'text-k-green'
                    : w.origen === 'COMPROMETIDO' ? 'text-k-blue' : 'text-k-text3/50'}`}>
                  {w.congelada ? '🔒' : w.origen === 'COMPROMETIDO' ? '◉' : '○'}
                </span>
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

// Exportar el reporte de PPC. Son DOS documentos, no dos formatos del mismo:
//   · cliente — avance día a día, si se cumplió el compromiso y la explicación
//     que escribió el planner. Nunca la categoría interna: al cliente no se le
//     entrega «falta de materiales» ni «falta de mano de obra».
//   · oficina — tendencia del PPC, Pareto de causas (con categorías),
//     restricciones y detalle por partidas. Para el dueño y la oficina técnica.
function ModalPpcExport({ destino, nSem, lunes, onClose }: {
  destino: 'cliente' | 'oficina'
  nSem: number
  /** La semana que se está revisando arriba: el reporte del cliente arranca ahí. */
  lunes: string
  onClose: () => void
}) {
  const cliente = destino === 'cliente'
  const [conDetalle, setConDetalle] = useState(true)
  const [desde, setDesde] = useState(() => (cliente ? lunes : iso(lunesDe(new Date()))))
  const [hasta, setHasta] = useState(() => {
    const f = new Date((cliente ? lunes : iso(lunesDe(new Date()))) + 'T12:00:00')
    f.setDate(f.getDate() + 6); return iso(f)
  })
  const semanas = Math.max(1, Math.round(
    (new Date(hasta + 'T12:00:00').getTime() - new Date(desde + 'T12:00:00').getTime()) / (7 * 864e5)) + 1)

  const abrir = () => {
    const url = cliente
      ? `/programacion/ppc-cliente?desde=${desde}&hasta=${hasta}`
      : `/programacion/ppc-imprimir?semanas=${nSem}${conDetalle ? `&desde=${desde}&hasta=${hasta}` : ''}`
    window.open(url, '_blank')
    onClose()
  }

  // Presets: rango que termina el domingo de la semana de referencia y arranca
  // `nWeeks` semanas atrás (nWeeks=1 → solo esa semana).
  const rango = (nWeeks: number) => {
    const base = cliente ? new Date(lunes + 'T12:00:00') : new Date()
    const dgo = lunesDe(base); dgo.setDate(dgo.getDate() + 6)
    const lun = lunesDe(base); lun.setDate(lun.getDate() - (nWeeks - 1) * 7)
    setDesde(iso(lun)); setHasta(iso(dgo))
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-k-surface border border-k-border rounded-xl p-5 w-[480px]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-bold text-k-text flex items-center gap-2"><Printer size={16} className="text-k-amber" />
            {cliente ? 'Reporte para el cliente' : 'Reporte para oficina'}</h2>
          <button onClick={onClose} className="text-k-text3 hover:text-k-text"><X size={18} /></button>
        </div>
        <p className="text-xs text-k-text3 mb-4">
          {cliente ? <>Una hoja por semana: el avance <b>día a día</b>, lo que se hizo en la semana,
            si se cumplió el compromiso y la <b>explicación</b> que escribió el planner. Sin
            categorías internas de no cumplimiento.</>
            : <>La <b>hoja 1</b> es el tablero de gerencia: tendencia del PPC, Pareto de causas y
              restricciones de las últimas {nSem} semanas. Las <b>hojas siguientes</b> (horizontales)
              son el detalle por partidas del rango que elijas.</>}
        </p>

        {!cliente && (
          <label className="flex items-center gap-2 text-sm text-k-text2 mb-3 cursor-pointer">
            <input type="checkbox" checked={conDetalle} onChange={e => setConDetalle(e.target.checked)} className="accent-k-amber" />
            Incluir detalle semanal por partidas
          </label>
        )}

        {(cliente || conDetalle) && (
          <>
            <div className="flex gap-1.5 mb-2 flex-wrap">
              {([[cliente ? 'Esa semana' : 'Esta semana', 1], ['Últimas 2', 2], ['Últimas 4', 4], ['Últimas 8', 8]] as const).map(([l, n]) => (
                <button key={l} onClick={() => rango(n)}
                  className="text-[11px] px-2.5 py-1 rounded-lg border border-k-border text-k-text3 hover:border-k-amber">{l}</button>
              ))}
            </div>
            <div className="flex gap-3 mb-1">
              <div className="flex-1">
                <label className="block text-[10px] uppercase tracking-wider text-k-text3 mb-1">Desde</label>
                <input type="date" value={desde} onChange={e => setDesde(e.target.value)}
                  className="w-full bg-k-void border border-k-border rounded-lg px-3 py-2 text-sm text-k-text" />
              </div>
              <div className="flex-1">
                <label className="block text-[10px] uppercase tracking-wider text-k-text3 mb-1">Hasta</label>
                <input type="date" value={hasta} min={desde} onChange={e => setHasta(e.target.value)}
                  className="w-full bg-k-void border border-k-border rounded-lg px-3 py-2 text-sm text-k-text" />
              </div>
            </div>
            <p className="text-[10px] text-k-text3 mb-4">
              {semanas > 8 ? 'Máximo 8 semanas: se recortará el rango.'
                : `${semanas} semana${semanas !== 1 ? 's' : ''} (una hoja por semana).`}
            </p>
          </>
        )}

        <button onClick={abrir}
          className="w-full flex items-center justify-center gap-2 bg-k-amber text-k-void font-bold rounded-lg py-2.5 text-sm">
          <Printer size={15} /> Abrir reporte
        </button>
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

// ── Partida que no está en el presupuesto cargado ────────────
// Dos casos DISTINTOS que antes se guardaban igual (y ensuciaban el RO):
//
//   OLVIDADA   está en el contrato pero no se cargó a la BD. Es CONTRACTUAL y
//              sus HH sí existen (están en el presupuesto en papel): se piden.
//   ADICIONAL  trabajo fuera del contrato. Clave del negocio (Jean): en obra
//              las HH NO se conocen todavía — el dato llega al aprobarlo o al
//              terminarlo. Por eso son OPCIONALES y, mientras falten, la
//              partida queda marcada en ROJO en el LookAhead.
//
// Además se elige de qué partida CUELGA en el WBS: sin eso nace huérfana y
// aparece suelta al final del árbol de Valor Ganado en vez de dentro de su fase.
function NuevaPartida({ otmId, metrado, und, titulo, padres, onCancelar, onCreada }: {
  otmId: string | null; metrado: string; und: string; titulo: string
  padres: { id: number; codigo: string; descripcion?: string }[]
  onCancelar: () => void
  onCreada: (p: { id: number; descripcion: string; unidad: string; metrado: string }) => void
}) {
  // La descripción arranca con el TÍTULO de la actividad: para una partida
  // olvidada son la misma frase («Relleno y compactación Z5»), y escribirla dos
  // veces era trabajo tonto. Sigue siendo editable si el planner quiere que la
  // partida se llame distinto de la actividad de ese día.
  const [f, setF] = useState({
    codigo: '', descripcion: titulo.trim(), unidad: und || '', fase: '',
    metrado_presup: metrado || '', hh_presup: '', parent_codigo: '',
    naturaleza: 'CONTRACTUAL' as 'CONTRACTUAL' | 'ADICIONAL',
  })
  const [err, setErr] = useState('')
  // El código propuesto se pisa cuando el planner escribe el suyo; a partir de
  // ahí deja de recalcularse solo (si no, cambiar el padre le borraría lo tecleado).
  const [codigoTocado, setCodigoTocado] = useState(false)
  const adicional = f.naturaleza === 'ADICIONAL'
  // La fase es la clave con la que el RO cruza costo ↔ meta: sin ella la
  // partida no aparecería en el resultado operativo por fase.
  const fases = useQuery<{ codigo: string; nombre: string }[]>({
    queryKey: ['fases-catalogo'],
    queryFn: () => api('/ev/fases?proyecto_id=1'),
  })
  // Correlativo sugerido: el que le toca entre los hijos del padre elegido, o
  // el siguiente de la serie ADIC-## si es adicional. Se recalcula al cambiar
  // el padre o el tipo, que es justo lo que determina la numeración.
  const sugerido = useQuery<{ codigo: string }>({
    queryKey: ['siguiente-codigo', otmId, f.parent_codigo, f.naturaleza],
    queryFn: () => api('/ev/partidas/siguiente-codigo?' + new URLSearchParams({
      ...(otmId ? { otm: otmId } : {}),
      ...(f.parent_codigo ? { parent_codigo: f.parent_codigo } : {}),
      naturaleza: f.naturaleza,
    })),
  })
  // Derivado durante el render (no en un efecto): el input muestra lo tecleado
  // o, mientras nadie lo toque, la sugerencia vigente.
  const codigo = codigoTocado ? f.codigo : (sugerido.data?.codigo ?? '')
  // Sin descripción propia, la partida se llama como la actividad.
  const descripcion = (f.descripcion.trim() || titulo.trim())
  const crear = useMutation({
    mutationFn: () => api<{ id: number }>('/ev/partidas', {
      method: 'POST',
      body: JSON.stringify({
        codigo: codigo.trim(), otm_id: otmId, descripcion,
        unidad: f.unidad.trim(), fase: f.fase.trim(),
        parent_codigo: f.parent_codigo.trim() || null,
        metrado_presup: Number(f.metrado_presup) || 0,
        hh_presup: Number(f.hh_presup) || 0,      // 0 = adicional aún sin aprobar
        naturaleza: f.naturaleza,
        hitos: [{ numero: 1, descripcion: 'Ejecución', peso: 1, es_principal: true }],
      }),
    }),
    // Se devuelve la partida entera, no solo el id: el metrado y la unidad
    // tienen que bajar a la actividad. Sin esto la actividad nacía SIN metrado
    // y el LookAhead la mostraba vacía, sin celdas programadas.
    onSuccess: r => onCreada({
      id: r.id, descripcion, unidad: f.unidad.trim(),
      metrado: String(Number(f.metrado_presup) || ''),
    }),
    onError: (e: Error) => setErr(e.message),
  })
  // La descripción NO se exige: si está vacía, la partida hereda el título de
  // la actividad. Lo que sí se exige de una partida olvidada son sus HH, que
  // por definición existen en el presupuesto.
  const listo = codigo.trim() && descripcion && f.unidad.trim() && f.fase.trim()
    && (adicional || Number(f.hh_presup) > 0)
  const borde = adicional ? 'border-red-500/40 bg-red-500/5' : 'border-k-border bg-k-raised/40'
  return (
    <div className={`rounded-lg border px-3 py-2.5 space-y-2 ${borde}`}>
      <div className="flex gap-1.5">
        {([['CONTRACTUAL', 'Se me olvidó cargarla'], ['ADICIONAL', 'Adicional no presupuestado']] as const)
          .map(([v, lbl]) => (
            <button key={v} onClick={() => setF({ ...f, naturaleza: v })}
              className={`flex-1 text-[10px] font-bold py-1.5 rounded-lg border transition-colors ${
                f.naturaleza === v
                  ? (v === 'ADICIONAL' ? 'border-red-500/60 bg-red-500/15 text-k-red'
                                       : 'border-k-amber/60 bg-k-amber/15 text-k-amber')
                  : 'border-k-border text-k-text3 hover:bg-k-raised'}`}>
              {lbl}
            </button>
          ))}
      </div>
      <p className="text-[10px] text-k-text3">
        {adicional
          ? 'Trabajo FUERA del contrato. Va aparte en el Resultado Operativo.'
          : 'Está en el contrato pero no se cargó a la BD: es contractual y sus HH ya existen en tu presupuesto.'}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <div className="relative">
          <input placeholder={adicional ? 'Código (ej. ADIC-01)' : 'Código del presupuesto'}
            value={codigo}
            title={codigoTocado
              ? 'Código escrito a mano. El botón ↻ vuelve al correlativo sugerido.'
              : `Correlativo sugerido${f.parent_codigo ? ` dentro de ${f.parent_codigo}` : ''}. Puedes escribir otro.`}
            onChange={e => { setCodigoTocado(true); setF({ ...f, codigo: e.target.value }) }}
            className={`${inputCls} ${codigoTocado ? '' : 'text-k-amber'} pr-7`} />
          {codigoTocado && (
            <button onClick={() => { setCodigoTocado(false); setF({ ...f, codigo: '' }) }}
              title="Volver al correlativo sugerido"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-k-text3 hover:text-k-amber text-xs">
              ↻
            </button>
          )}
        </div>
        <select value={f.parent_codigo} onChange={e => setF({ ...f, parent_codigo: e.target.value })}
          className={inputCls}
          title="De qué partida cuelga en el árbol. Sin esto aparece suelta al final del WBS.">
          <option value="">Cuelga de… (raíz del WBS)</option>
          {padres.map(p => (
            <option key={p.id} value={p.codigo}>{p.codigo} — {(p.descripcion ?? '').slice(0, 32)}</option>
          ))}
        </select>
      </div>
      {/* Metrado y unidad JUNTOS: son un solo dato («800 m3»), separarlos
          obligaba a saltar de un lado a otro del formulario. */}
      <div className="grid grid-cols-[1fr_90px] gap-2">
        <input placeholder="Metrado de la partida" value={f.metrado_presup} inputMode="decimal"
          title="Metrado del presupuesto. Baja como meta de la actividad al crearla."
          onChange={e => setF({ ...f, metrado_presup: e.target.value })} className={inputCls} />
        <input placeholder="und" value={f.unidad}
          onChange={e => setF({ ...f, unidad: e.target.value })} className={inputCls} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input placeholder="Fase (ej. EST, CIV…)" value={f.fase} list="fases-adic"
          title="La fase es la clave con la que el Resultado Operativo cruza el costo con la meta"
          onChange={e => setF({ ...f, fase: e.target.value })} className={inputCls} />
        <input placeholder={adicional ? 'HH presupuestadas (opcional)' : 'HH del presupuesto'}
          value={f.hh_presup} inputMode="decimal"
          title={adicional
            ? 'Si el adicional todavía no está aprobado, déjalo vacío: la partida quedará marcada en rojo hasta que cargues el dato'
            : 'Cópialas de tu presupuesto: sin HH la partida no puede ganar valor y el rendimiento sale distorsionado'}
          onChange={e => setF({ ...f, hh_presup: e.target.value })}
          className={`${inputCls} ${!adicional && f.hh_presup.trim() === '' ? 'border-k-amber/50' : ''}`} />
      </div>
      <datalist id="fases-adic">
        {(fases.data ?? []).map(x => <option key={x.codigo} value={x.codigo}>{x.nombre}</option>)}
      </datalist>
      {/* La descripción va al final y es OPCIONAL: por defecto la partida se
          llama igual que la actividad, que es lo normal en una olvidada. */}
      <input value={f.descripcion} onChange={e => setF({ ...f, descripcion: e.target.value })}
        placeholder={titulo.trim()
          ? `Nombre de la partida (por defecto: ${titulo.trim().slice(0, 34)})`
          : 'Nombre de la partida'}
        title="Solo si la partida se llama distinto de la actividad de este día"
        className={inputCls} />
      <p className="text-[10px] text-k-text3">
        {adicional ? (
          <>Si aún no tienes las <b>HH</b> (normal hasta que aprueben el adicional), déjalas vacías: la
          partida queda <b className="text-k-red">en rojo</b> en el LookAhead para completarla después.
          Mientras tanto el trabajo <b>sí se mide</b> — consume HH del tareo sin ganar ninguna, que es
          lo que un adicional le hace al rendimiento.</>
        ) : (
          <>Las <b>HH son obligatorias</b> acá: si la partida está en el contrato, el dato existe.
          Sin él la partida gasta HH sin poder ganar ninguna y hunde el rendimiento de su fase.</>
        )}
        {!otmId && <> Se crea <b>sin OTM</b> y quedará en la bandeja <b>por ubicar</b>.</>}
      </p>
      {err && <p className="text-k-red text-xs">{err}</p>}
      <div className="flex gap-2">
        <button onClick={() => crear.mutate()} disabled={!listo || crear.isPending}
          className="flex-1 bg-k-amber text-black font-bold text-xs py-2 rounded-lg disabled:opacity-40">
          {crear.isPending ? 'Creando…' : 'Crear y usar esta partida'}
        </button>
        <button onClick={onCancelar}
          className="px-3 text-xs rounded-lg border border-k-border text-k-text2 hover:bg-k-raised">
          Cancelar
        </button>
      </div>
    </div>
  )
}

// ── Bandeja «partidas por ubicar» ────────────────────────────
// Las partidas creadas sin saber a qué OTM van (misceláneos: muchos proyectitos
// con su propio metrado y HH) no aparecen en NINGÚN selector de partida, así que
// sin esta lista se quedarían olvidadas. También recoge las que quedaron sueltas
// del WBS o sin HH.
function BandejaPorUbicar({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [sel, setSel] = useState<number | null>(null)
  const [otm, setOtm] = useState('')
  const [padre, setPadre] = useState('')
  const [codigo, setCodigo] = useState('')
  const [datos, setDatos] = useState<{ precio_unitario: string; hh_presup: string; metrado_presup: string }>(
    { precio_unitario: '', hh_presup: '', metrado_presup: '' })
  const [err, setErr] = useState('')

  const lista = useQuery<PorUbicar[]>({
    queryKey: ['partidas-por-ubicar'],
    queryFn: () => api('/ev/partidas-por-ubicar'),
  })
  const otms = useQuery<{ otm_id: string; descripcion: string }[]>({
    queryKey: ['otms-lista'], queryFn: () => api('/ev/otms'),
  })
  const padresQ = useQuery<{ id: number; codigo: string; descripcion?: string; fase?: string | null }[]>({
    queryKey: ['partidas-otm', otm],
    queryFn: () => api(`/ev/partidas?otm=${encodeURIComponent(otm)}`),
    enabled: !!otm,
  })
  const cerrarFila = () => {
    setSel(null); setOtm(''); setPadre(''); setCodigo(''); setErr('')
    setDatos({ precio_unitario: '', hh_presup: '', metrado_presup: '' })
  }
  const refrescar = () => {
    cerrarFila()
    qc.invalidateQueries({ queryKey: ['partidas-por-ubicar'] })
    qc.invalidateQueries({ queryKey: ['partidas-otm'] })
    qc.invalidateQueries({ queryKey: ['partidas'] })
  }
  // Un solo gesto: se completa lo que falte y, si además hace falta ubicarla,
  // se ubica. Antes la bandeja SOLO sabía ubicar, así que una partida cuyo
  // único problema era el precio no salía nunca de la lista por más que le
  // dieras a «Ubicar» (lo que Jean encontró el 2026-07-28).
  const guardar = useMutation({
    mutationFn: async (p: PorUbicar) => {
      const campos: Record<string, number> = {}
      for (const [k, v] of Object.entries(datos)) {
        if (v.trim() !== '') campos[k] = Number(v)
      }
      if (Object.values(campos).some(v => !Number.isFinite(v) || v < 0))
        throw new Error('Los valores deben ser números no negativos')
      if (Object.keys(campos).length)
        await api(`/ev/partidas/${p.id}/completar`, { method: 'PUT', body: JSON.stringify(campos) })
      // Solo se toca el sitio si de verdad cambia algo: en una partida que ya
      // tiene su OTM, «guardar» no debe reubicarla de rebote.
      const cambiaSitio = !!otm && (otm !== p.otm_id || !!padre || !!codigo.trim())
      if (cambiaSitio)
        await api(`/ev/partidas/${p.id}/ubicar`, {
          method: 'PUT',
          body: JSON.stringify({
            otm_id: otm, parent_codigo: padre || null, codigo: codigo.trim() || null,
          }),
        })
    },
    onSuccess: refrescar,
    onError: (e: Error) => setErr(e.message),
  })
  const MOTIVO: Record<string, string> = {
    SIN_OTM: 'Sin OTM', SIN_PADRE: 'Suelta del WBS', SIN_HH: 'Sin HH',
    SIN_PU: 'Sin precio de venta',
  }
  const AYUDA: Record<string, string> = {
    SIN_OTM: 'No se sabe a qué obra pertenece, así que no aparece en ningún selector de partida.',
    SIN_PADRE: 'Su código anuncia jerarquía pero no cuelga de nadie en el árbol de Valor Ganado.',
    SIN_HH: 'Sin HH presupuestadas no hay contra qué medir el rendimiento: el ISP sale vacío.',
    SIN_PU: 'La venta del RO es cantidad × precio unitario. Sin PU, la partida entra al resultado '
      + 'como costo puro sin venta: consume HH y no aporta ingreso.',
  }
  /** ¿Qué hay que resolver en esta partida? */
  const faltaUbicar = (p: PorUbicar) => p.motivos.some(m => m === 'SIN_OTM' || m === 'SIN_PADRE')
  const faltaDatos = (p: PorUbicar) => p.motivos.some(m => m === 'SIN_PU' || m === 'SIN_HH')

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center p-4 overflow-y-auto"
      onClick={onClose}>
      <div className="bg-k-surface border border-k-border rounded-2xl w-full max-w-3xl mt-8"
        onClick={e => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-k-border flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-k-text">Partidas por completar</h3>
            <p className="text-[11px] text-k-text3">
              Creadas al programar: les falta OTM, lugar en el WBS, HH o precio de venta.
              Pasa el cursor por cada etiqueta para ver qué implica.
            </p>
          </div>
          <button onClick={onClose} className="text-k-text3 hover:text-k-text"><X size={18} /></button>
        </div>
        <div className="p-3 space-y-2 max-h-[70vh] overflow-y-auto">
          {lista.isLoading && <p className="text-xs text-k-text3 text-center py-6">Cargando…</p>}
          {(lista.data ?? []).length === 0 && !lista.isLoading && (
            <p className="text-xs text-k-text3 text-center py-6">
              ✓ Todas las partidas están ubicadas.
            </p>
          )}
          {(lista.data ?? []).map(p => (
            <div key={p.id} className="rounded-lg border border-k-border bg-k-raised/40 px-3 py-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-mono text-[11px] font-bold text-k-text">{p.codigo}</span>
                    {p.naturaleza === 'ADICIONAL' && (
                      <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-red-500/15 text-k-red border border-red-500/25">ADICIONAL</span>
                    )}
                    {p.motivos.map(m => (
                      <span key={m} title={AYUDA[m]}
                        className="text-[9px] px-1 py-0.5 rounded bg-k-amber/15 text-k-amber border border-k-amber/25 cursor-help">
                        {MOTIVO[m] ?? m}
                      </span>
                    ))}
                  </div>
                  <p className="text-[11px] text-k-text2 truncate">{p.descripcion}</p>
                  <p className="text-[10px] text-k-text3">
                    {p.metrado_presup} {p.unidad} · {p.hh_presup} HH
                    {p.otm_id ? ` · ${p.otm_id}` : ''}
                    {p.actividades > 0 ? ` · ${p.actividades} actividad(es) programadas` : ''}
                  </p>
                </div>
                <button onClick={() => {
                  if (sel === p.id) { cerrarFila(); return }
                  setSel(p.id); setOtm(p.otm_id ?? ''); setPadre(''); setCodigo(''); setErr('')
                  // Los valores actuales quedan a la vista para no tener que
                  // buscarlos en otra pantalla.
                  setDatos({
                    precio_unitario: p.precio_unitario ? String(p.precio_unitario) : '',
                    hh_presup: p.hh_presup ? String(p.hh_presup) : '',
                    metrado_presup: p.metrado_presup ? String(p.metrado_presup) : '',
                  })
                }}
                  className="shrink-0 text-[11px] font-bold px-2.5 py-1 rounded-lg border border-k-amber/50 text-k-amber hover:bg-k-amber/10">
                  {sel === p.id ? 'Cerrar' : faltaUbicar(p) ? 'Ubicar' : 'Completar'}
                </button>
              </div>
              {sel === p.id && (
                <div className="mt-2 pt-2 border-t border-k-border space-y-2">
                  {/* Dónde va: solo si de verdad le falta sitio. */}
                  {faltaUbicar(p) && (
                    <>
                      <div className="grid grid-cols-2 gap-2">
                        <select value={otm} onChange={e => { setOtm(e.target.value); setPadre('') }}
                          className={inputCls}>
                          <option value="">Elige la OTM…</option>
                          {(otms.data ?? []).map(o => (
                            <option key={o.otm_id} value={o.otm_id}>
                              {o.otm_id} — {(o.descripcion ?? '').slice(0, 30)}
                            </option>
                          ))}
                        </select>
                        <select value={padre} onChange={e => setPadre(e.target.value)}
                          className={inputCls} disabled={!otm}
                          title="De qué partida cuelga en el árbol de Valor Ganado">
                          <option value="">Cuelga de… (raíz del WBS)</option>
                          {(padresQ.data ?? []).filter(x => x.id !== p.id).map(x => (
                            <option key={x.id} value={x.codigo}>
                              {x.codigo} — {(x.descripcion ?? '').slice(0, 28)}
                            </option>
                          ))}
                        </select>
                      </div>
                      <input placeholder={`Código (dejar vacío = ${p.codigo})`} value={codigo}
                        onChange={e => setCodigo(e.target.value)} className={inputCls}
                        title="Solo si la OTM destino ya usa ese código" />
                    </>
                  )}

                  {/* Lo que le falta de presupuesto. El PU es el que deja el RO
                      con costo y sin venta, así que va primero y explicado. */}
                  {faltaDatos(p) && (
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { k: 'precio_unitario' as const, l: `PU de venta (S/ por ${p.unidad})`,
                          falta: p.motivos.includes('SIN_PU') },
                        { k: 'hh_presup' as const, l: 'HH presupuestadas',
                          falta: p.motivos.includes('SIN_HH') },
                        { k: 'metrado_presup' as const, l: `Metrado (${p.unidad})`, falta: false },
                      ].map(f => (
                        <div key={f.k}>
                          <label className={`block text-[9px] uppercase tracking-wide mb-1 ${
                            f.falta ? 'text-k-amber font-bold' : 'text-k-text3'}`}>
                            {f.l}{f.falta ? ' *' : ''}
                          </label>
                          <input type="number" min="0" step="any" inputMode="decimal"
                            value={datos[f.k]} placeholder="0"
                            onChange={e => setDatos(d => ({ ...d, [f.k]: e.target.value }))}
                            className={`${inputCls} w-full ${f.falta && !datos[f.k].trim() ? 'border-k-amber' : ''}`} />
                        </div>
                      ))}
                    </div>
                  )}

                  {p.motivos.includes('SIN_PU') && (
                    <p className="text-[10px] text-k-text3 leading-relaxed">
                      <b className="text-k-text2">Por qué se te pide el PU:</b> la venta del Resultado
                      Operativo es <span className="font-mono">cantidad × PU</span>. Con el PU en cero
                      esta partida consume HH y plata y no aporta ni un sol de ingreso — el margen
                      sale mal sin que nada avise. {p.actividades > 0 && <>Ya tiene {p.actividades} actividad
                      programada, así que va a consumir horas.</>}
                    </p>
                  )}

                  {err && <p className="text-k-red text-[11px]">{err}</p>}
                  <button onClick={() => guardar.mutate(p)}
                    disabled={guardar.isPending || (faltaUbicar(p) && !otm)}
                    className="w-full bg-k-amber text-black font-bold text-xs py-2 rounded-lg disabled:opacity-40">
                    {guardar.isPending ? 'Guardando…'
                      : faltaUbicar(p) ? 'Ubicar y guardar' : 'Guardar'}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
