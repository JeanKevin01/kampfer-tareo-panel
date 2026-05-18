import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, UserPlus, UserX, X, Loader2, CheckCircle, XCircle } from 'lucide-react'

const API = 'https://api.apps1.astraera.space'

interface Trabajador {
  id: string; nombre: string; cargo: string; dni?: string; activo: boolean
}

export default function Trabajadores() {
  const qc = useQueryClient()
  const [search, setSearch]         = useState('')
  const [cargoFilter, setCargoFilter] = useState('TODOS')
  const [showModal, setShowModal]   = useState(false)
  const [form, setForm]             = useState({ nombre: '', cargo: '', dni: '' })
  const [formError, setFormError]   = useState('')

  const { data: trabajadores = [], isLoading } = useQuery<Trabajador[]>({
    queryKey: ['trabajadores'],
    queryFn: () => fetch(API + '/admin/trabajadores').then(r => r.json()),
  })

  const addMutation = useMutation({
    mutationFn: (d: { nombre: string; cargo: string; dni: string }) =>
      fetch(API + '/admin/trabajador', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(d),
      }).then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.detail || 'Error'); return j }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['trabajadores'] })
      setShowModal(false); setForm({ nombre: '', cargo: '', dni: '' }); setFormError('')
    },
    onError: (e: Error) => setFormError(e.message),
  })

  const bajaMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(API + `/admin/trabajador/${id}/baja`, { method: 'PUT' }).then(r => r.json()),
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
    addMutation.mutate({ nombre: form.nombre.toUpperCase(), cargo: form.cargo.toUpperCase(), dni: form.dni })
  }

  return (
    <div className="space-y-5">

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
                {['ID','Nombre','Cargo','DNI','Estado','Acción'].map((h, i) => (
                  <th key={h} className={`px-4 py-3 text-[11px] font-bold text-k-text3 uppercase tracking-wider ${i === 5 ? 'text-right' : 'text-left'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-k-text3 text-sm">
                  <Loader2 size={16} className="animate-spin inline mr-2" />Cargando trabajadores…
                </td></tr>
              )}
              {!isLoading && filtered.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-k-text3 text-sm">
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
                    value={form[f.key as keyof typeof form]}
                    onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                    maxLength={f.key === 'dni' ? 8 : undefined}
                    className="w-full bg-k-raised border border-k-border2 rounded-lg px-4 py-2.5 text-sm text-k-text placeholder:text-k-text3 outline-none focus:border-k-amber transition-colors" />
                </div>
              ))}
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