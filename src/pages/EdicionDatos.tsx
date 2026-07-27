// ── Datos maestros ───────────────────────────────────────────
// Centro ÚNICO de lo que se carga al inicio desde las plantillas Excel
// (encargo de Jean 2026-07-26: «no hay un panel donde pueda modificarlo o
// eliminarlo todo»). La edición existía pero estaba repartida y escondida —
// la de partidas vivía en Valor Ganado → «Configuración» —, y a los documentos
// de costo solo se les podía dar de baja. Aquí se reúne todo.
import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  Search, Pencil, X, Loader2, Save, Users, ClipboardList,
  Package, FileSpreadsheet, Target,
} from 'lucide-react'

import { api } from '@/lib/api'
import { TabConfig as PartidasMaestro } from '@/pages/ValorGanado'
import CostosMaestro from '@/components/maestros/CostosMaestro'
import AltaPartidasLote from '@/components/maestros/AltaPartidasLote'
import Presupuesto from '@/pages/Presupuesto'

type Tab = 'partidas' | 'costos' | 'presupuesto' | 'trabajadores' | 'otms'
interface Trabajador { id: string; nombre: string; cargo: string; dni?: string; activo: boolean }
interface OTM { id: string; descripcion: string; estado: string; area?: string; cc?: string }

const ESTADOS_OTM = ['EJECUCION', 'POR INICIAR', 'CERRADA', 'CONCLUIDA']

export default function EdicionDatos() {
  const qc = useQueryClient()
  const [tab, setTab]           = useState<Tab>('partidas')
  const [proyecto, setProyecto] = useState('')       // '' = todos, para Partidas
  const [lote, setLote]         = useState(false)    // alta masiva pegando del Excel
  const [nLote, setNLote]       = useState(0)
  const [search, setSearch]     = useState('')
  const [editTrab, setEditTrab] = useState<Trabajador | null>(null)
  const [editOTM,  setEditOTM]  = useState<OTM | null>(null)
  const [saving,   setSaving]   = useState(false)
  const [saveMsg,  setSaveMsg]  = useState('')

  /* ── Trabajadores ── */
  const { data: trabajadores = [], isLoading: loadT } = useQuery<Trabajador[]>({
    queryKey: ['trabajadores'],
    queryFn: () => api<Trabajador[]>('/admin/trabajadores'),
  })

  const filteredT = useMemo(() => {
    const q = search.toUpperCase()
    return trabajadores.filter(t =>
      t.nombre.includes(q) || t.cargo.includes(q) || t.id.includes(q))
  }, [trabajadores, search])

  async function guardarTrabajador() {
    if (!editTrab) return
    setSaving(true); setSaveMsg('')
    try {
      await api(`/admin/trabajador/${editTrab.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          nombre: editTrab.nombre.toUpperCase(),
          cargo:  editTrab.cargo.toUpperCase(),
          dni:    editTrab.dni ?? '',
        }),
      })
      qc.invalidateQueries({ queryKey: ['trabajadores'] })
      setSaveMsg('✓ Guardado')
      setTimeout(() => { setEditTrab(null); setSaveMsg('') }, 800)
    } catch (e) { setSaveMsg('Error: ' + (e as Error).message) }
    setSaving(false)
  }

  /* ── OTMs ── */
  const { data: otms = [], isLoading: loadO } = useQuery<OTM[]>({
    queryKey: ['otms-all'],
    queryFn: () => api<OTM[]>('/api/otms'),
  })
  // Partidas del proyecto elegido: son los padres candidatos del alta masiva.
  const { data: partidasOtm = [] } = useQuery<{ id: number; codigo: string; descripcion?: string }[]>({
    queryKey: ['ev-partidas', proyecto],
    queryFn: () => api(`/ev/partidas?otm=${encodeURIComponent(proyecto)}`),
    enabled: !!proyecto,
  })

  const filteredO = useMemo(() => {
    const q = search.toUpperCase()
    return otms.filter(o => o.id.includes(q) || o.descripcion?.toUpperCase().includes(q))
  }, [otms, search])

  const otmMutation = useMutation({
    mutationFn: (o: OTM) =>
      api('/admin/otm', { method: 'POST', body: JSON.stringify(o) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['otms-all'] })
      qc.invalidateQueries({ queryKey: ['otms'] })
      setEditOTM(null)
    },
  })

  const isLoading = tab === 'trabajadores' ? loadT : loadO

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-k-text">Datos maestros</h1>
        <p className="text-k-text2 text-sm">
          Todo lo que se carga al inicio desde las plantillas Excel, en un solo sitio:
          revisar, corregir y dar de baja.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 bg-k-raised border border-k-border rounded-xl p-1 w-fit flex-wrap">
        {([
          ['partidas',     'Partidas',     Target],
          ['costos',       'Costos',       Package],
          ['presupuesto',  'Presupuesto',  FileSpreadsheet],
          ['trabajadores', 'Trabajadores', Users],
          ['otms',         'Proyectos',    ClipboardList],
        ] as [Tab, string, React.ElementType][]).map(([id, label, Icon]) => (
          <button key={id} onClick={() => { setTab(id); setSearch('') }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
              tab === id
                ? 'bg-k-amber text-black'
                : 'text-k-text2 hover:text-k-text'
            }`}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {/* Búsqueda — solo para las tablas de esta página (las otras traen la suya) */}
      {(tab === 'trabajadores' || tab === 'otms') && (
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-k-text3" />
          <input type="text"
            placeholder={tab === 'trabajadores' ? 'Buscar por nombre, cargo o ID…' : 'Buscar por ID o descripción…'}
            value={search} onChange={e => setSearch(e.target.value)}
            className="w-full bg-k-raised border border-k-border rounded-lg pl-9 pr-4 py-2.5 text-sm text-k-text placeholder:text-k-text3 outline-none focus:border-k-amber transition-colors" />
        </div>
      )}

      {/* Partidas de control: el mismo editor de Valor Ganado → Configuración */}
      {tab === 'partidas' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <select value={proyecto} onChange={e => setProyecto(e.target.value)}
              className="bg-k-raised border border-k-border rounded-lg px-3 py-2 text-sm text-k-text outline-none focus:border-k-amber">
              <option value="">Todos los proyectos</option>
              {otms.map(o => <option key={o.id} value={o.id}>{o.id} — {(o.descripcion ?? '').slice(0, 40)}</option>)}
            </select>
            <button onClick={() => { setLote(v => !v); setNLote(0) }} disabled={!proyecto}
              title={proyecto ? 'Pegar varias filas del Excel del presupuesto' : 'Elige primero el proyecto'}
              className={`text-xs font-bold px-3 py-2 rounded-lg border disabled:opacity-40 ${
                lote ? 'border-k-amber bg-k-amber/15 text-k-amber' : 'border-k-border text-k-text2 hover:bg-k-raised'}`}>
              ＋＋ Cargar varias
            </button>
            <p className="text-[11px] text-k-text3">
              Metrado, HH, fase, unidad e hitos. Desactivar una partida con trabajo registrado
              pide confirmación y te dice qué tiene colgado.
            </p>
          </div>
          {lote && proyecto && (
            <AltaPartidasLote otmId={proyecto} padres={partidasOtm}
              onCancelar={() => setLote(false)}
              onListo={n => { setLote(false); setNLote(n); qc.invalidateQueries({ queryKey: ['ev-partidas'] }) }} />
          )}
          {nLote > 0 && (
            <p className="text-[11px] text-k-green">✓ {nLote} partida(s) cargadas.</p>
          )}
          <PartidasMaestro otm={proyecto || undefined} />
        </div>
      )}

      {/* Documentos de costo (import .xlsx de Costos) */}
      {tab === 'costos' && <CostosMaestro />}

      {/* Presupuesto: la página completa (versiones, líneas, APU, congelar) */}
      {tab === 'presupuesto' && (
        <div className="space-y-3">
          <p className="text-[11px] text-k-text3 bg-k-raised border border-k-border rounded-lg px-3 py-2">
            Las líneas del presupuesto <b>CONTRACTUAL</b> se editan aquí mientras la versión esté
            en BORRADOR. La <b>META</b> nace del import de la plantilla PU y no se edita línea a
            línea a propósito: sus HH salen del APU, así que corregirlas a mano dejaría el costo
            meta descuadrado. Para cambiarla, vuelve a importar el PU en una versión nueva.
          </p>
          <Presupuesto />
        </div>
      )}

      {/* Catálogo de fases: su CRUD ya vive en Guía de Fases, no se duplica */}
      {(tab === 'partidas' || tab === 'costos') && (
        <p className="text-[11px] text-k-text3">
          ¿Falta una fase o quieres renombrarla? Está en{' '}
          <Link to="/guia-fases" className="text-k-amber hover:underline">Guía de Fases → Catálogo del proyecto</Link>.
        </p>
      )}

      {/* Tabla Trabajadores */}
      {tab === 'trabajadores' && (
        <div className="bg-k-surface border border-k-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-k-raised border-b border-k-border">
                  {['ID','Nombre','Cargo','DNI','Estado','Editar'].map((h, i) => (
                    <th key={h} className={`px-4 py-3 text-[11px] font-bold text-k-text3 uppercase tracking-wider ${i === 5 ? 'text-center' : 'text-left'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-k-text3 text-sm">
                    <Loader2 size={16} className="animate-spin inline mr-2" />Cargando…
                  </td></tr>
                )}
                {filteredT.map(t => (
                  <tr key={t.id} className="border-b border-k-border last:border-0 hover:bg-k-raised/40 transition-colors">
                    <td className="px-4 py-3"><span className="font-mono text-xs text-k-amber">{t.id}</span></td>
                    <td className="px-4 py-3"><span className={`text-sm font-medium ${t.activo ? 'text-k-text' : 'text-k-text3 line-through'}`}>{t.nombre}</span></td>
                    <td className="px-4 py-3"><span className="text-xs text-k-text2">{t.cargo}</span></td>
                    <td className="px-4 py-3"><span className="font-mono text-xs text-k-text3">{t.dni || '—'}</span></td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border ${
                        t.activo ? 'text-k-green bg-green-500/10 border-green-500/20' : 'text-k-text3 bg-k-raised border-k-border'
                      }`}>{t.activo ? 'Activo' : 'Inactivo'}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => setEditTrab({ ...t })}
                        className="inline-flex items-center gap-1.5 text-[11px] font-bold text-k-blue bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/20 px-3 py-1.5 rounded-lg transition-colors">
                        <Pencil size={11} /> Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!isLoading && (
            <div className="px-4 py-2 border-t border-k-border bg-k-raised">
              <span className="text-[11px] text-k-text3">{filteredT.length} de {trabajadores.length} trabajadores</span>
            </div>
          )}
        </div>
      )}

      {/* Tabel proyectos */}
      {tab === 'otms' && (
        <div className="bg-k-surface border border-k-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-k-raised border-b border-k-border">
                  {['OTM','Descripción','Área','Centro de Costo','Estado','Editar'].map((h, i) => (
                    <th key={h} className={`px-4 py-3 text-[11px] font-bold text-k-text3 uppercase tracking-wider ${i === 5 ? 'text-center' : 'text-left'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-k-text3 text-sm">
                    <Loader2 size={16} className="animate-spin inline mr-2" />Cargando…
                  </td></tr>
                )}
                {filteredO.map(o => (
                  <tr key={o.id} className="border-b border-k-border last:border-0 hover:bg-k-raised/40 transition-colors">
                    <td className="px-4 py-3"><span className="font-mono text-xs font-bold text-k-amber">{o.id}</span></td>
                    <td className="px-4 py-3 max-w-xs"><span className="text-sm text-k-text line-clamp-2">{o.descripcion}</span></td>
                    <td className="px-4 py-3"><span className="text-xs text-k-text2">{o.area || '—'}</span></td>
                    <td className="px-4 py-3"><span className="font-mono text-xs text-k-text2">{o.cc || '—'}</span></td>
                    <td className="px-4 py-3">
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded border text-k-green bg-green-500/10 border-green-500/20">{o.estado}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => setEditOTM({ ...o })}
                        className="inline-flex items-center gap-1.5 text-[11px] font-bold text-k-blue bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/20 px-3 py-1.5 rounded-lg transition-colors">
                        <Pencil size={11} /> Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!isLoading && (
            <div className="px-4 py-2 border-t border-k-border bg-k-raised">
              <span className="text-[11px] text-k-text3">{filteredO.length} proyectos</span>
            </div>
          )}
        </div>
      )}

      {/* Modal editar Trabajador */}
      {editTrab && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-k-surface border border-k-border2 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="font-condensed font-bold text-xl text-k-text">Editar trabajador</h2>
                <p className="text-xs text-k-amber font-mono mt-0.5">ID: {editTrab.id}</p>
              </div>
              <button onClick={() => { setEditTrab(null); setSaveMsg('') }} className="text-k-text3 hover:text-k-text"><X size={18} /></button>
            </div>
            <div className="space-y-4">
              {[
                { key: 'nombre', label: 'Nombre completo *' },
                { key: 'cargo',  label: 'Cargo *' },
                { key: 'dni',    label: 'DNI (opcional)' },
              ].map(f => (
                <div key={f.key}>
                  <label className="text-[11px] font-bold text-k-text3 uppercase tracking-wider block mb-1.5">{f.label}</label>
                  <input type="text"
                    value={(editTrab as unknown as Record<string, string>)[f.key] ?? ''}
                    onChange={e => setEditTrab(p => p ? ({ ...p, [f.key]: e.target.value }) : p)}
                    className="w-full bg-k-raised border border-k-border2 rounded-lg px-4 py-2.5 text-sm text-k-text outline-none focus:border-k-amber transition-colors" />
                </div>
              ))}
              {saveMsg && (
                <p className={`text-xs px-3 py-2 rounded-lg border ${
                  saveMsg.startsWith('✓')
                    ? 'text-k-green bg-green-500/10 border-green-500/20'
                    : 'text-k-red bg-red-500/10 border-red-500/20'
                }`}>{saveMsg}</p>
              )}
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => { setEditTrab(null); setSaveMsg('') }}
                className="flex-1 bg-k-raised border border-k-border text-k-text2 font-bold text-sm py-2.5 rounded-lg hover:bg-k-border transition-colors">Cancelar</button>
              <button onClick={guardarTrabajador} disabled={saving}
                className="flex-1 bg-k-amber hover:bg-k-amber2 disabled:opacity-40 text-black font-bold text-sm py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {saving ? 'Guardando…' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal editar OTM */}
      {editOTM && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-k-surface border border-k-border2 rounded-2xl p-6 w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="font-condensed font-bold text-xl text-k-text">Editar OTM</h2>
                <p className="text-xs text-k-amber font-mono mt-0.5">{editOTM.id}</p>
              </div>
              <button onClick={() => setEditOTM(null)} className="text-k-text3 hover:text-k-text"><X size={18} /></button>
            </div>
            <div className="space-y-4">
              <div className="col-span-2">
                <label className="text-[11px] font-bold text-k-text3 uppercase tracking-wider block mb-1.5">Descripción *</label>
                <textarea rows={2} value={editOTM.descripcion}
                  onChange={e => setEditOTM(p => p ? ({ ...p, descripcion: e.target.value }) : p)}
                  className="w-full bg-k-raised border border-k-border2 rounded-lg px-4 py-2.5 text-sm text-k-text outline-none focus:border-k-amber transition-colors resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { key: 'area', label: 'Área' },
                  { key: 'cc',   label: 'Centro de Costo' },
                ].map(f => (
                  <div key={f.key}>
                    <label className="text-[11px] font-bold text-k-text3 uppercase tracking-wider block mb-1.5">{f.label}</label>
                    <input type="text"
                      value={(editOTM as unknown as Record<string, string>)[f.key] ?? ''}
                      onChange={e => setEditOTM(p => p ? ({ ...p, [f.key]: e.target.value }) : p)}
                      className="w-full bg-k-raised border border-k-border2 rounded-lg px-4 py-2.5 text-sm text-k-text outline-none focus:border-k-amber transition-colors" />
                  </div>
                ))}
                <div>
                  <label className="text-[11px] font-bold text-k-text3 uppercase tracking-wider block mb-1.5">Estado</label>
                  <select value={editOTM.estado}
                    onChange={e => setEditOTM(p => p ? ({ ...p, estado: e.target.value }) : p)}
                    className="w-full bg-k-raised border border-k-border2 rounded-lg px-4 py-2.5 text-sm text-k-text outline-none focus:border-k-amber transition-colors">
                    {ESTADOS_OTM.map(e => <option key={e} value={e} className="bg-k-raised">{e}</option>)}
                  </select>
                </div>
              </div>
            </div>
            {otmMutation.isError && (
              <p className="text-k-red text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mt-4">
                {(otmMutation.error as Error).message}
              </p>
            )}
            <div className="flex gap-3 mt-6">
              <button onClick={() => setEditOTM(null)}
                className="flex-1 bg-k-raised border border-k-border text-k-text2 font-bold text-sm py-2.5 rounded-lg hover:bg-k-border transition-colors">Cancelar</button>
              <button onClick={() => otmMutation.mutate(editOTM)} disabled={otmMutation.isPending}
                className="flex-1 bg-k-amber hover:bg-k-amber2 disabled:opacity-40 text-black font-bold text-sm py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2">
                {otmMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {otmMutation.isPending ? 'Guardando…' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}