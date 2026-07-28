// ── Personal ─────────────────────────────────────────────────
// Encargo de Jean (2026-07-26): Importar, QRs e Impresión QR eran entradas
// sueltas del menú aunque las tres son cosas que se le hacen AL PERSONAL. Aquí
// pasan a ser pestañas de esta misma página (la pestaña viaja en la URL, así
// que los enlaces viejos siguen funcionando).
import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Search, UserPlus, UserX, X, Loader2, CheckCircle, XCircle,
  Users, Upload, QrCode, Printer,
} from 'lucide-react'

import { api } from '@/lib/api'
import { TabsPagina } from '@/components/TabsPagina'
import { useTab, type TabDef } from '@/lib/tabs'
import ImportarPersonal from '@/pages/ImportarPersonal'
import QRs from '@/pages/QRs'
import ImpresionQR from '@/pages/ImpresionQR'

interface Trabajador {
  id: string; nombre: string; cargo: string; dni?: string; activo: boolean
  tipo?: string
}
/** Lo que devuelve el alta cuando además crea el acceso a la app de campo. */
interface AltaOk { nombre: string; usuario?: string | null; password?: string | null }

const FORM_VACIO = { nombre: '', cargo: '', dni: '', tipo: 'DIRECTO', es_supervisor: false }

const TABS: TabDef[] = [
  { id: 'personal',  label: 'Personal',     icon: Users },
  { id: 'importar',  label: 'Importar',     icon: Upload },
  { id: 'qrs',       label: 'QRs',          icon: QrCode },
  { id: 'impresion', label: 'Impresión QR', icon: Printer },
]

export default function Trabajadores() {
  const [tab, setTab] = useTab(TABS)
  return (
    <div className="space-y-5">
      <TabsPagina tabs={TABS} activo={tab} onCambiar={setTab} />
      {tab === 'personal'  && <PanelPersonal />}
      {tab === 'importar'  && <ImportarPersonal />}
      {tab === 'qrs'       && <QRs />}
      {tab === 'impresion' && <ImpresionQR />}
    </div>
  )
}

function PanelPersonal() {
  const qc = useQueryClient()
  const [search, setSearch]         = useState('')
  const [cargoFilter, setCargoFilter] = useState('TODOS')
  const [showModal, setShowModal]   = useState(false)
  // Los mismos campos que pide el importador de Excel: dar de alta a mano no
  // puede dejar a medias una ficha que el Excel sí completa.
  const [form, setForm]             = useState({ ...FORM_VACIO })
  const [formError, setFormError]   = useState('')
  const [alta, setAlta]             = useState<AltaOk | null>(null)

  const { data: trabajadores = [], isLoading } = useQuery<Trabajador[]>({
    queryKey: ['trabajadores'],
    queryFn: () => api<Trabajador[]>('/admin/trabajadores'),
  })

  const addMutation = useMutation({
    mutationFn: (d: typeof FORM_VACIO) =>
      api<AltaOk>('/admin/trabajador', { method: 'POST', body: JSON.stringify(d) }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['trabajadores'] })
      qc.invalidateQueries({ queryKey: ['supervisores'] })
      // Si de paso quedó como supervisor, su acceso a la app se muestra UNA
      // vez: la clave inicial no se vuelve a poder consultar.
      setAlta(r?.usuario ? r : null)
      setShowModal(false); setForm({ ...FORM_VACIO }); setFormError('')
    },
    onError: (e: Error) => setFormError(e.message),
  })

  const bajaMutation = useMutation({
    mutationFn: (id: string) =>
      api(`/admin/trabajador/${id}/baja`, { method: 'PUT' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trabajadores'] }),
  })

  const cargos = useMemo(() =>
    ['TODOS', ...[...new Set(trabajadores.map(t => t.cargo))].sort()], [trabajadores])

  const filtered = useMemo(() => trabajadores.filter(t => {
    const q = search.toUpperCase()
    return (t.nombre.includes(q) || t.cargo.includes(q) || t.id.includes(q)) &&
           (cargoFilter === 'TODOS' || t.cargo === cargoFilter)
  }), [trabajadores, search, cargoFilter])

  const activos   = trabajadores.filter(t => t.activo).length
  const inactivos = trabajadores.filter(t => !t.activo).length

  const handleSubmit = () => {
    if (!form.nombre.trim() || !form.cargo.trim()) { setFormError('Nombre y cargo son obligatorios'); return }
    addMutation.mutate({ ...form,
      nombre: form.nombre.toUpperCase(), cargo: form.cargo.toUpperCase() })
  }

  return (
    <div className="space-y-5">

      {/* El acceso a la app se muestra UNA vez: la clave inicial no se puede
          volver a consultar (queda hasheada). */}
      {alta && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 flex items-start gap-3">
          <CheckCircle size={16} className="text-k-amber mt-0.5 flex-shrink-0" />
          <div className="flex-1 text-sm text-k-text2">
            <b className="text-k-text">{alta.nombre}</b> quedó registrado con acceso de supervisor.
            Usuario <b className="text-k-amber font-mono">{alta.usuario}</b> · clave{' '}
            <b className="text-k-amber font-mono">{alta.password}</b>.
            <span className="block text-[11px] text-k-text3 mt-0.5">
              Anótalo ahora: la clave no se puede volver a consultar. La cambia él al entrar.
            </span>
          </div>
          <button onClick={() => setAlta(null)} className="text-k-text3 hover:text-k-text"><X size={16} /></button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-k-text2 text-sm">Personal activo e inactivo del proyecto</p>
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-k-amber hover:bg-k-amber2 text-black font-bold text-sm px-4 py-2.5 rounded-lg transition-colors">
          <UserPlus size={15} /> Agregar trabajador
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total',     value: trabajadores.length, color: 'text-k-text'  },
          { label: 'Activos',   value: activos,             color: 'text-k-green' },
          { label: 'Inactivos', value: inactivos,           color: 'text-k-text3' },
        ].map(s => (
          <div key={s.label} className="bg-k-surface border border-k-border rounded-xl p-4 flex items-center gap-4">
            <div className={`font-mono text-3xl font-medium ${s.color}`}>{isLoading ? '…' : s.value}</div>
            <div className="text-[11px] text-k-text3 uppercase tracking-wide">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-k-text3" />
          <input type="text" placeholder="Buscar por nombre, cargo o ID…"
            value={search} onChange={e => setSearch(e.target.value)}
            className="w-full bg-k-raised border border-k-border rounded-lg pl-9 pr-4 py-2.5 text-sm text-k-text placeholder:text-k-text3 outline-none focus:border-k-amber transition-colors" />
        </div>
        <select value={cargoFilter} onChange={e => setCargoFilter(e.target.value)}
          className="bg-k-raised border border-k-border rounded-lg px-4 py-2.5 text-sm text-k-text2 outline-none focus:border-k-amber transition-colors">
          {cargos.map(c => <option key={c} value={c} className="bg-k-raised">{c}</option>)}
        </select>
      </div>

      {/* Tabla */}
      <div className="bg-k-surface border border-k-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-k-raised border-b border-k-border">
                {['ID','Nombre','Cargo','Tipo','DNI','Estado','Acción'].map((h, i) => (
                  <th key={h} className={`px-4 py-3 text-[11px] font-bold text-k-text3 uppercase tracking-wider ${i === 6 ? 'text-right' : 'text-left'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-k-text3 text-sm">
                  <Loader2 size={16} className="animate-spin inline mr-2" />Cargando trabajadores…
                </td></tr>
              )}
              {!isLoading && filtered.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-k-text3 text-sm">
                  Sin resultados para ese filtro
                </td></tr>
              )}
              {filtered.map(t => (
                <tr key={t.id} className="border-b border-k-border last:border-0 hover:bg-k-raised/40 transition-colors">
                  <td className="px-4 py-3"><span className="font-mono text-xs text-k-amber">{t.id}</span></td>
                  <td className="px-4 py-3">
                    <span className={`text-sm font-medium ${t.activo ? 'text-k-text' : 'text-k-text3 line-through'}`}>
                      {t.nombre}
                    </span>
                  </td>
                  <td className="px-4 py-3"><span className="text-xs text-k-text2">{t.cargo}</span></td>
                  <td className="px-4 py-3">
                    <span title={(t.tipo ?? 'DIRECTO') === 'INDIRECTO'
                      ? 'Personal de staff: sus HH van a gastos generales'
                      : 'Personal de campo: sus HH van al costo directo'}
                      className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border cursor-help ${
                        (t.tipo ?? 'DIRECTO') === 'INDIRECTO'
                          ? 'text-k-blue bg-blue-500/10 border-blue-500/20'
                          : 'text-k-text2 bg-k-raised border-k-border'}`}>
                      {(t.tipo ?? 'DIRECTO') === 'INDIRECTO' ? 'Indirecto' : 'Directo'}
                    </span>
                  </td>
                  <td className="px-4 py-3"><span className="font-mono text-xs text-k-text3">{t.dni || '—'}</span></td>
                  <td className="px-4 py-3">
                    {t.activo
                      ? <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase text-k-green bg-green-500/10 border border-green-500/20 px-2 py-0.5 rounded">
                          <CheckCircle size={10} /> Activo
                        </span>
                      : <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase text-k-text3 bg-k-raised border border-k-border px-2 py-0.5 rounded">
                          <XCircle size={10} /> Inactivo
                        </span>
                    }
                  </td>
                  <td className="px-4 py-3 text-right">
                    {t.activo && (
                      <button
                        onClick={() => confirm(`¿Dar de baja a ${t.nombre}?`) && bajaMutation.mutate(t.id)}
                        disabled={bajaMutation.isPending}
                        className="inline-flex items-center gap-1.5 text-[11px] font-bold text-k-red bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40">
                        <UserX size={11} /> Baja
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!isLoading && filtered.length > 0 && (
          <div className="px-4 py-2 border-t border-k-border bg-k-raised">
            <span className="text-[11px] text-k-text3">{filtered.length} de {trabajadores.length} trabajadores</span>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-k-surface border border-k-border2 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-condensed font-bold text-xl text-k-text">Agregar trabajador</h2>
              <button onClick={() => { setShowModal(false); setFormError('') }} className="text-k-text3 hover:text-k-text">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-4">
              {[
                { key: 'nombre', label: 'Nombre completo *', placeholder: 'APELLIDOS NOMBRE' },
                { key: 'cargo',  label: 'Cargo *',           placeholder: 'OFICIAL MECÁNICO' },
                { key: 'dni',    label: 'DNI (opcional)',     placeholder: '12345678' },
              ].map(f => (
                <div key={f.key}>
                  <label className="text-[11px] font-bold text-k-text3 uppercase tracking-wider block mb-1.5">{f.label}</label>
                  <input type="text" placeholder={f.placeholder}
                    value={form[f.key as 'nombre' | 'cargo' | 'dni']}
                    onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                    maxLength={f.key === 'dni' ? 8 : undefined}
                    className="w-full bg-k-raised border border-k-border2 rounded-lg px-4 py-2.5 text-sm text-k-text placeholder:text-k-text3 outline-none focus:border-k-amber transition-colors" />
                </div>
              ))}

              {/* Directo / indirecto: separa el costo de campo del de staff en
                  el Resultado Operativo, así que no puede quedar al azar. */}
              <div>
                <label className="text-[11px] font-bold text-k-text3 uppercase tracking-wider block mb-1.5">
                  Tipo de personal *
                </label>
                <select value={form.tipo}
                  onChange={e => setForm(p => ({ ...p, tipo: e.target.value }))}
                  className="w-full bg-k-raised border border-k-border2 rounded-lg px-4 py-2.5 text-sm text-k-text outline-none focus:border-k-amber transition-colors">
                  <option value="DIRECTO">Directo — personal de campo</option>
                  <option value="INDIRECTO">Indirecto — personal de staff</option>
                </select>
                <p className="text-[11px] text-k-text3 mt-1.5">
                  {form.tipo === 'DIRECTO'
                    ? 'Ejecuta las partidas en obra: sus HH van al costo directo.'
                    : 'Oficina técnica, supervisión, apoyo: sus HH van a gastos generales.'}
                </p>
              </div>

              {/* Ser supervisor es un ROL encima de la ficha, no otra persona. */}
              <label className="flex items-start gap-2.5 cursor-pointer bg-k-raised border border-k-border2 rounded-lg px-4 py-3">
                <input type="checkbox" checked={form.es_supervisor}
                  onChange={e => setForm(p => ({
                    ...p, es_supervisor: e.target.checked,
                    // Quien reporta es staff; sigue siendo cambiable a mano.
                    tipo: e.target.checked ? 'INDIRECTO' : p.tipo,
                  }))}
                  className="accent-k-amber mt-0.5" />
                <span>
                  <span className="text-sm text-k-text font-medium">¿Reporta desde la app? (supervisor)</span>
                  <span className="block text-[11px] text-k-text3 mt-0.5">
                    {form.es_supervisor
                      ? 'Se le crea su acceso a la app de campo con la clave inicial 1234.'
                      : 'No — es lo habitual. Marcarlo solo si va a tomar el tareo en obra.'}
                  </span>
                </span>
              </label>

              {formError && (
                <p className="text-k-red text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{formError}</p>
              )}
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => { setShowModal(false); setFormError('') }}
                className="flex-1 bg-k-raised border border-k-border text-k-text2 font-bold text-sm py-2.5 rounded-lg hover:bg-k-border transition-colors">
                Cancelar
              </button>
              <button onClick={handleSubmit} disabled={addMutation.isPending}
                className="flex-1 bg-k-amber hover:bg-k-amber2 disabled:opacity-40 text-black font-bold text-sm py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2">
                {addMutation.isPending ? <><Loader2 size={14} className="animate-spin" />Guardando…</> : '✓ Registrar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}