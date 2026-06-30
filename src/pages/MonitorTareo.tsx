import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Activity, AlertTriangle, CalendarDays, Clock, RefreshCw, CheckCircle, ArrowDown, ArrowUp, ShieldCheck, Users, GitMerge, Copy } from 'lucide-react'

import { API_BASE } from '@/lib/api'
const API = API_BASE
const req = (p: string) => fetch(`${API}${p}`).then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json() })
const fmt = (v: number) => v.toLocaleString('es-PE', { maximumFractionDigits: 1 })
const hoyISO = () => new Date().toISOString().slice(0, 10)

// ── Tipos ──
interface OtmHH { otm_id: string; hh: number; n_partidas: number }
interface FilaHH {
  trab_id: string; nombre: string; total_hh: number; jornada: number
  diff: number; estado: 'ok' | 'bajo' | 'extra'; multi_otm: boolean
  n_partidas: number; otms: OtmHH[]
}
interface RespHH {
  resumen: { fecha: string; jornada: number; trabajadores: number; ok: number; bajo: number; extra: number }
  filas: FilaHH[]
}
interface Flag { tipo: string; sev: 'alta' | 'media'; msg: string }
interface Anom {
  partida_id: number; codigo: string; otm_id: string; descripcion: string
  fase: string; unidad: string; hh_gastadas: number; hh_ganadas: number
  metrado_ejec: number; pf_acum: number; pct_avance: number; flags: Flag[]
}
interface RespAnom { otm: string | null; semana: number; total: number; anomalias: Anom[] }
interface OTM { id: string; nombre?: string }
interface SemAuto { semana: number; activa: boolean }

const EST = {
  ok:    { lbl: 'Cuadra',      cls: 'text-k-green', bg: 'bg-green-500/10 border-green-500/20', Icon: CheckCircle },
  bajo:  { lbl: 'Bajo jornada', cls: 'text-amber-300', bg: 'bg-amber-500/10 border-amber-500/25', Icon: ArrowDown },
  extra: { lbl: 'Horas extra',  cls: 'text-k-red', bg: 'bg-red-500/10 border-red-500/20', Icon: ArrowUp },
} as const

export default function MonitorTareo() {
  const [tab, setTab] = useState<'hh' | 'anom' | 'integridad'>('hh')

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Activity size={22} className="text-k-amber" />
        <div>
          <h1 className="text-xl font-extrabold text-k-text tracking-wide">MONITOR DE TAREO</h1>
          <p className="text-xs text-k-text3">Detección de errores · HH por trabajador/OTM · anomalías de PF</p>
        </div>
      </div>

      <div className="flex gap-2">
        <button onClick={() => setTab('hh')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold border transition-colors ${tab === 'hh' ? 'bg-k-amber text-k-void border-k-amber' : 'bg-k-surface text-k-text2 border-k-border hover:border-k-amber/40'}`}>
          <Clock size={15} /> HH diario por OTM
        </button>
        <button onClick={() => setTab('anom')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold border transition-colors ${tab === 'anom' ? 'bg-k-amber text-k-void border-k-amber' : 'bg-k-surface text-k-text2 border-k-border hover:border-k-amber/40'}`}>
          <AlertTriangle size={15} /> Anomalías / PF
        </button>
        <button onClick={() => setTab('integridad')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold border transition-colors ${tab === 'integridad' ? 'bg-k-amber text-k-void border-k-amber' : 'bg-k-surface text-k-text2 border-k-border hover:border-k-amber/40'}`}>
          <ShieldCheck size={15} /> Integridad
        </button>
      </div>

      {tab === 'hh' ? <TabHHDiario /> : tab === 'anom' ? <TabAnomalias /> : <TabIntegridad />}
    </div>
  )
}

// ════════════════════════ HH diario por OTM ════════════════════════
function TabHHDiario() {
  const [fecha, setFecha] = useState(hoyISO())
  const { data, isLoading, refetch, isFetching } = useQuery<RespHH>({
    queryKey: ['monitor-hh', fecha], queryFn: () => req(`/api/monitor/hh-diario?fecha=${fecha}`),
  })
  const r = data?.resumen

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-k-text3 mb-1">Fecha</label>
          <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
            className="bg-k-void border border-k-border focus:border-k-amber rounded-lg px-3 py-2 text-sm text-k-text font-mono outline-none" />
        </div>
        <button onClick={() => refetch()} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-k-surface border border-k-border text-k-text2 text-sm hover:border-k-amber/40">
          <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} /> Actualizar
        </button>
        {r && (
          <div className="flex items-center gap-2 ml-auto text-xs">
            <span className="px-2.5 py-1 rounded-md bg-k-surface border border-k-border text-k-text3">Jornada <b className="text-k-text font-mono">{r.jornada} HH</b></span>
            <span className="px-2.5 py-1 rounded-md bg-green-500/10 border border-green-500/20 text-k-green font-bold">{r.ok} cuadran</span>
            <span className="px-2.5 py-1 rounded-md bg-amber-500/10 border border-amber-500/25 text-amber-300 font-bold">{r.bajo} bajo</span>
            <span className="px-2.5 py-1 rounded-md bg-red-500/10 border border-red-500/20 text-k-red font-bold">{r.extra} extra</span>
          </div>
        )}
      </div>

      {isLoading ? <Cargando /> : (data?.filas.length ?? 0) === 0 ? (
        <Vacio icon={<CalendarDays size={28} />} texto="Sin registros de tareo para esta fecha." />
      ) : (
        <div className="rounded-xl border border-k-border overflow-hidden bg-k-surface">
          <table className="w-full" style={{ fontSize: 13 }}>
            <thead>
              <tr className="bg-k-raised border-b border-k-border text-[10px] uppercase tracking-wider text-k-text3">
                <th className="text-left py-2.5 px-3">Trabajador</th>
                <th className="text-right py-2.5 px-3">Total HH</th>
                <th className="text-right py-2.5 px-3">Jornada</th>
                <th className="text-right py-2.5 px-3">Dif.</th>
                <th className="text-left py-2.5 px-3">Estado</th>
                <th className="text-left py-2.5 px-3">OTMs (HH)</th>
              </tr>
            </thead>
            <tbody>
              {data!.filas.map(f => {
                const e = EST[f.estado]
                return (
                  <tr key={f.trab_id} className="border-b border-k-border/60 hover:bg-k-raised/40">
                    <td className="py-2 px-3">
                      <span className="text-k-text font-medium">{f.nombre}</span>
                      <span className="ml-2 font-mono text-[10px] text-k-text3">{f.trab_id}</span>
                    </td>
                    <td className={`py-2 px-3 text-right font-mono font-bold ${e.cls}`}>{fmt(f.total_hh)}</td>
                    <td className="py-2 px-3 text-right font-mono text-k-text3">{fmt(f.jornada)}</td>
                    <td className={`py-2 px-3 text-right font-mono ${f.diff === 0 ? 'text-k-text3' : f.diff < 0 ? 'text-amber-300' : 'text-k-red'}`}>
                      {f.diff > 0 ? '+' : ''}{fmt(f.diff)}
                    </td>
                    <td className="py-2 px-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-bold ${e.bg} ${e.cls}`}>
                        <e.Icon size={11} /> {e.lbl}
                      </span>
                    </td>
                    <td className="py-2 px-3">
                      <div className="flex flex-wrap gap-1">
                        {f.otms.map(o => (
                          <span key={o.otm_id} className={`font-mono text-[10px] px-1.5 py-0.5 rounded border ${f.multi_otm ? 'border-k-amber/40 text-k-amber bg-k-amber/5' : 'border-k-border text-k-text3'}`}>
                            {o.otm_id}: {fmt(o.hh)}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ════════════════════════ Anomalías / PF ════════════════════════
function TabAnomalias() {
  const { data: otms } = useQuery<OTM[]>({ queryKey: ['otms-mon'], queryFn: () => req('/api/otms?activas=true') })
  const { data: semanas } = useQuery<SemAuto[]>({ queryKey: ['sem-mon'], queryFn: () => req('/ev/semanas-auto') })
  const semActiva = semanas?.slice().reverse().find(s => s.activa)?.semana ?? semanas?.[semanas.length - 1]?.semana ?? 1
  const [otm, setOtm] = useState('')
  const [sem, setSem] = useState<number | null>(null)
  const semana = sem ?? semActiva

  const { data, isLoading, refetch, isFetching } = useQuery<RespAnom>({
    queryKey: ['monitor-anom', otm, semana],
    queryFn: () => req(`/ev/monitor/anomalias?semana=${semana}${otm ? `&otm=${encodeURIComponent(otm)}` : ''}`),
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-k-text3 mb-1">OTM</label>
          <select value={otm} onChange={e => setOtm(e.target.value)}
            className="bg-k-void border border-k-border focus:border-k-amber rounded-lg px-3 py-2 text-sm text-k-text outline-none min-w-[200px]">
            <option value="">Todas</option>
            {otms?.map(o => <option key={o.id} value={o.id}>{o.id}{o.nombre ? ` — ${o.nombre}` : ''}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-k-text3 mb-1">Semana</label>
          <select value={semana} onChange={e => setSem(Number(e.target.value))}
            className="bg-k-void border border-k-border focus:border-k-amber rounded-lg px-3 py-2 text-sm text-k-text font-mono outline-none">
            {semanas?.map(s => <option key={s.semana} value={s.semana}>Sem {s.semana}{s.activa ? ' (activa)' : ''}</option>)}
          </select>
        </div>
        <button onClick={() => refetch()} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-k-surface border border-k-border text-k-text2 text-sm hover:border-k-amber/40">
          <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} /> Actualizar
        </button>
        {data && (
          <span className={`ml-auto px-3 py-1.5 rounded-md border text-xs font-bold ${data.total > 0 ? 'bg-red-500/10 border-red-500/20 text-k-red' : 'bg-green-500/10 border-green-500/20 text-k-green'}`}>
            {data.total > 0 ? `${data.total} anomalía${data.total !== 1 ? 's' : ''}` : 'Sin anomalías ✓'}
          </span>
        )}
      </div>

      {isLoading ? <Cargando /> : (data?.anomalias.length ?? 0) === 0 ? (
        <Vacio icon={<CheckCircle size={28} className="text-k-green" />} texto="No se detectaron anomalías en el tareo de esta semana." />
      ) : (
        <div className="space-y-2">
          {data!.anomalias.map(a => (
            <div key={a.partida_id} className="rounded-lg border border-k-border bg-k-surface p-3">
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <span className="font-mono text-[11px] text-k-amber">{a.codigo}</span>
                <span className="text-xs text-k-text2 flex-1 min-w-[200px] truncate" title={a.descripcion}>{a.descripcion}</span>
                <span className="font-mono text-[10px] text-k-text3">{a.otm_id}</span>
              </div>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {a.flags.map((fl, i) => (
                  <span key={i} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-medium ${fl.sev === 'alta' ? 'bg-red-500/10 border-red-500/20 text-k-red' : 'bg-amber-500/10 border-amber-500/25 text-amber-300'}`}>
                    <AlertTriangle size={10} /> {fl.msg}
                  </span>
                ))}
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-k-text3 font-mono">
                <span>HH gast: <b className="text-k-text2">{fmt(a.hh_gastadas)}</b></span>
                <span>HH gan: <b className="text-k-text2">{fmt(a.hh_ganadas)}</b></span>
                <span>Met. real: <b className="text-k-text2">{fmt(a.metrado_ejec)} {a.unidad}</b></span>
                <span>PF: <b className={a.pf_acum > 0 && a.pf_acum < 0.85 ? 'text-k-red' : a.pf_acum > 1.2 ? 'text-amber-300' : 'text-k-green'}>{a.pf_acum.toFixed(2)}</b></span>
                <span>Avance: <b className="text-k-text2">{(a.pct_avance * 100).toFixed(0)}%</b></span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ════════════════════════ Integridad de datos ════════════════════════
interface Conflicto {
  id: number; trabajador_id: string; trabajador_nombre: string; fecha: string
  sup1_nombre: string | null; sup2_nombre: string | null; hh_1: number; hh_2: number; estado: string
}
interface DupMiembro { id: string; nombre: string; cargo: string | null; activo: boolean; n_tareo: number; n_reg: number }
interface DupGrupo { nombre: string; miembros: DupMiembro[] }
interface DupResp { total_grupos: number; grupos: DupGrupo[] }
interface DobleHH { trab_id: string; nombre: string; n_sesiones: number; n_supervisores: number; n_otms: number; total_hh: number }
interface DobleResp { fecha: string; total: number; filas: DobleHH[] }

const post = (p: string, body: unknown) =>
  fetch(`${API}${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.detail || `${r.status}`); return j })

function TabIntegridad() {
  const qc = useQueryClient()
  const [fecha, setFecha] = useState(hoyISO())
  const { data: conflictos } = useQuery<Conflicto[]>({ queryKey: ['conflictos'], queryFn: () => req('/ev/conflictos') })
  const { data: dups } = useQuery<DupResp>({ queryKey: ['dups-trab'], queryFn: () => req('/api/trabajadores/duplicados') })
  const { data: doble } = useQuery<DobleResp>({ queryKey: ['doble-hh', fecha], queryFn: () => req(`/api/monitor/duplicados-hh?fecha=${fecha}`) })
  const [keep, setKeep] = useState<Record<string, string>>({})  // nombreGrupo -> id a conservar
  const [msg, setMsg] = useState('')

  const resolver = useMutation({
    mutationFn: (id: number) => post('/ev/conflictos/resolver', { conflicto_id: id, resolucion: 'revisado', notas: 'Resuelto desde el Monitor' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['conflictos'] }),
  })
  const merge = useMutation({
    mutationFn: (v: { from_id: string; to_id: string }) => post('/api/trabajadores/merge', v),
    onSuccess: (_d, v) => { setMsg(`✓ ${v.from_id} fusionado en ${v.to_id}`); qc.invalidateQueries({ queryKey: ['dups-trab'] }) },
    onError: (e: Error) => setMsg(`✗ ${e.message}`),
  })

  const pendientes = (conflictos ?? []).filter(c => c.estado !== 'RESUELTO')

  const mejorId = (g: DupGrupo) => g.miembros.slice().sort((a, b) => (b.n_tareo + b.n_reg) - (a.n_tareo + a.n_reg))[0]?.id
  const fusionarGrupo = (g: DupGrupo) => {
    const to = keep[g.nombre] || mejorId(g)
    const otros = g.miembros.filter(m => m.id !== to)
    if (!to || !otros.length) return
    if (!window.confirm(`Fusionar ${otros.map(o => o.id).join(', ')} → ${to} (${g.nombre})?\nSe reasignan todas las HH y se desactiva(n) el/los duplicado(s).`)) return
    otros.forEach(o => merge.mutate({ from_id: o.id, to_id: to }))
  }

  return (
    <div className="space-y-6">
      {msg && <p className={`text-xs font-bold ${msg.startsWith('✓') ? 'text-k-green' : 'text-k-red'}`}>{msg}</p>}

      {/* Trabajadores duplicados */}
      <section>
        <h2 className="flex items-center gap-2 text-sm font-bold text-k-text mb-2"><Users size={15} className="text-k-amber" /> Trabajadores duplicados</h2>
        {(dups?.grupos.length ?? 0) === 0 ? (
          <p className="text-xs text-k-text3">No se detectaron nombres repetidos con distinto ID. ✓</p>
        ) : (
          <div className="space-y-2">
            {dups!.grupos.map(g => {
              const to = keep[g.nombre] || mejorId(g)
              return (
                <div key={g.nombre} className="rounded-lg border border-k-border bg-k-surface p-3">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-xs font-bold text-k-text2">{g.nombre}</span>
                    <button onClick={() => fusionarGrupo(g)} disabled={merge.isPending}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-k-amber text-k-void text-[11px] font-bold disabled:opacity-50">
                      <GitMerge size={12} /> Fusionar duplicados
                    </button>
                  </div>
                  <div className="space-y-1">
                    {g.miembros.map(m => (
                      <label key={m.id} className={`flex items-center gap-2 text-[11px] px-2 py-1 rounded cursor-pointer ${m.id === to ? 'bg-k-green/10 border border-k-green/25' : 'bg-k-raised'}`}>
                        <input type="radio" name={`keep-${g.nombre}`} checked={m.id === to} onChange={() => setKeep({ ...keep, [g.nombre]: m.id })} />
                        <span className="font-mono text-k-amber">{m.id}</span>
                        <span className="text-k-text2 flex-1">{m.cargo ?? '—'}</span>
                        <span className="text-k-text3">tareo: <b className="text-k-text2">{m.n_tareo}</b></span>
                        <span className="text-k-text3">reg: <b className="text-k-text2">{m.n_reg}</b></span>
                        {!m.activo && <span className="text-[9px] text-k-red">inactivo</span>}
                        {m.id === to && <span className="text-[9px] text-k-green font-bold">CONSERVAR</span>}
                      </label>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Conflictos de HH */}
      <section>
        <h2 className="flex items-center gap-2 text-sm font-bold text-k-text mb-2"><AlertTriangle size={15} className="text-k-amber" /> Conflictos de HH (multi-supervisor)</h2>
        {pendientes.length === 0 ? (
          <p className="text-xs text-k-text3">Sin conflictos pendientes. ✓</p>
        ) : (
          <div className="rounded-xl border border-k-border overflow-hidden bg-k-surface">
            <table className="w-full" style={{ fontSize: 12 }}>
              <thead>
                <tr className="bg-k-raised border-b border-k-border text-[10px] uppercase tracking-wider text-k-text3">
                  <th className="text-left py-2 px-3">Trabajador</th><th className="text-left py-2 px-3">Fecha</th>
                  <th className="text-left py-2 px-3">Supervisores</th><th className="text-right py-2 px-3">HH</th><th className="py-2 px-3"></th>
                </tr>
              </thead>
              <tbody>
                {pendientes.map(c => (
                  <tr key={c.id} className="border-b border-k-border/60">
                    <td className="py-2 px-3 text-k-text">{c.trabajador_nombre}</td>
                    <td className="py-2 px-3 font-mono text-k-text3">{c.fecha}</td>
                    <td className="py-2 px-3 text-k-text2">{c.sup1_nombre ?? '—'} ↔ {c.sup2_nombre ?? '—'}</td>
                    <td className="py-2 px-3 text-right font-mono text-k-red">{fmt(c.hh_1)} + {fmt(c.hh_2)}</td>
                    <td className="py-2 px-3 text-right">
                      <button onClick={() => resolver.mutate(c.id)} className="px-2 py-1 rounded-md bg-k-surface border border-k-border text-k-text2 text-[11px] hover:border-k-green/40">Marcar resuelto</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Doble registro de HH */}
      <section>
        <div className="flex items-center justify-between gap-2 mb-2">
          <h2 className="flex items-center gap-2 text-sm font-bold text-k-text"><Copy size={15} className="text-k-amber" /> Doble registro de HH (mismo día, varias sesiones)</h2>
          <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
            className="bg-k-void border border-k-border focus:border-k-amber rounded-lg px-2 py-1 text-xs text-k-text font-mono outline-none" />
        </div>
        {(doble?.filas.length ?? 0) === 0 ? (
          <p className="text-xs text-k-text3">Nadie con HH en más de una sesión ese día. ✓</p>
        ) : (
          <div className="space-y-1">
            {doble!.filas.map(d => (
              <div key={d.trab_id} className="flex items-center gap-3 text-[11px] bg-k-surface border border-red-500/20 rounded px-3 py-2">
                <span className="font-mono text-k-amber">{d.trab_id}</span>
                <span className="text-k-text flex-1">{d.nombre}</span>
                <span className="text-k-text3">{d.n_sesiones} sesiones · {d.n_supervisores} sup · {d.n_otms} OTM</span>
                <span className="font-mono font-bold text-k-red">{fmt(d.total_hh)} HH</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

// ── Auxiliares ──
function Cargando() {
  return <div className="flex items-center justify-center py-16 text-k-text3 text-sm gap-2"><RefreshCw size={16} className="animate-spin" /> Cargando…</div>
}
function Vacio({ icon, texto }: { icon: React.ReactNode; texto: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-k-text3 gap-3">
      {icon}<p className="text-sm">{texto}</p>
    </div>
  )
}
