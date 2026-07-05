import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Loader2, ShieldCheck, UserPlus, KeyRound, Ban, X, Check, Lock,
} from 'lucide-react'
import { currentUser } from '@/lib/auth'
import { api } from '@/lib/api'

interface Usuario {
  id: number
  username: string
  rol: string
  nombre: string | null
  activo: boolean
  supervisor_id?: string | null
  creado_en: string
}

interface Supervisor {
  id: string
  nombre: string
}

const ROLES = [
  { value: 'admin',      label: 'Admin',      desc: 'Acceso total al sistema' },
  { value: 'oficina',    label: 'Oficina',    desc: 'Panel completo' },
  { value: 'supervisor', label: 'Supervisor', desc: 'App de campo' },
]

const rolStyle = (rol: string) =>
  rol === 'admin'   ? 'text-k-amber bg-amber-500/10 border-amber-500/20'
  : rol === 'oficina' ? 'text-k-blue bg-blue-500/10 border-blue-500/20'
  :                     'text-k-green bg-green-500/10 border-green-500/20'

export default function Usuarios() {
  const qc = useQueryClient()
  const yo = currentUser()
  const [crear, setCrear] = useState(false)
  const [cambiarPwd, setCambiarPwd] = useState<Usuario | null>(null)
  const [aviso, setAviso] = useState('')

  const flash = (t: string) => { setAviso(t); setTimeout(() => setAviso(''), 3000) }

  const { data: usuarios = [], isLoading, error } = useQuery<Usuario[]>({
    queryKey: ['usuarios'],
    queryFn: () => api<Usuario[]>('/api/admin/usuarios'),
  })

  const baja = useMutation({
    mutationFn: (u: Usuario) => api(`/api/admin/usuarios/${u.id}/baja`, { method: 'PUT' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['usuarios'] }); flash('Usuario dado de baja') },
  })

  // Solo admin puede ver/usar esta pantalla
  if (yo?.rol !== 'admin') {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <Lock size={40} className="text-k-text3 mb-3" />
        <p className="text-k-text font-bold">Acceso restringido</p>
        <p className="text-k-text3 text-sm mt-1">Solo los administradores pueden gestionar usuarios.</p>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto p-1">
      {/* Cabecera */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-condensed font-extrabold text-k-text flex items-center gap-2">
            <ShieldCheck size={22} className="text-k-amber" /> Usuarios
          </h1>
          <p className="text-sm text-k-text3 mt-0.5">Quién puede entrar al panel y a la app de campo.</p>
        </div>
        <button onClick={() => setCrear(true)}
          className="flex items-center gap-2 bg-k-amber text-k-void font-bold rounded-lg px-4 py-2.5 text-sm hover:opacity-90 transition-opacity">
          <UserPlus size={15} /> Nuevo usuario
        </button>
      </div>

      {aviso && (
        <div className="mb-4 flex items-center gap-2 text-sm text-k-green bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2">
          <Check size={15} /> {aviso}
        </div>
      )}

      {/* Lista */}
      {isLoading ? (
        <div className="flex items-center gap-2 py-10 text-k-text3 text-sm justify-center">
          <Loader2 size={15} className="animate-spin" /> Cargando usuarios...
        </div>
      ) : error ? (
        <div className="text-center py-10 text-k-red text-sm">
          No se pudo cargar la lista. ¿Tu sesión sigue activa y eres admin?
        </div>
      ) : (
        <div className="bg-k-surface border border-k-border rounded-xl overflow-hidden">
          {usuarios.map(u => (
            <div key={u.id}
              className={`flex items-center gap-3 px-4 py-3 border-b border-k-border last:border-0 ${!u.activo ? 'opacity-50' : ''}`}>
              <div className="w-9 h-9 rounded-full bg-amber-500/15 text-k-amber flex items-center justify-center text-sm font-bold flex-shrink-0">
                {(u.nombre || u.username).charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-k-text truncate">
                  {u.nombre || u.username}
                  {u.username === yo?.username && <span className="ml-2 text-[10px] text-k-text3 font-normal">(tú)</span>}
                </div>
                <div className="text-[11px] text-k-text3">@{u.username}{!u.activo && ' · inactivo'}</div>
              </div>
              <span className={`text-[10px] font-bold uppercase tracking-wider border rounded px-2 py-0.5 ${rolStyle(u.rol)}`}>
                {u.rol}{u.rol === 'supervisor' && u.supervisor_id ? ` · ${u.supervisor_id}` : ''}
              </span>
              <button onClick={() => setCambiarPwd(u)} title="Cambiar contraseña"
                className="text-k-text3 hover:text-k-amber p-1.5 rounded-lg hover:bg-k-raised transition-colors">
                <KeyRound size={15} />
              </button>
              {u.activo && u.username !== yo?.username && (
                <button
                  onClick={() => { if (confirm(`¿Dar de baja a ${u.nombre || u.username}? No podrá iniciar sesión.`)) baja.mutate(u) }}
                  disabled={baja.isPending}
                  title="Dar de baja"
                  className="text-k-text3 hover:text-k-red p-1.5 rounded-lg hover:bg-k-raised transition-colors disabled:opacity-40">
                  <Ban size={15} />
                </button>
              )}
            </div>
          ))}
          {usuarios.length === 0 && (
            <div className="text-center py-8 text-k-text3 text-sm">Sin usuarios aún.</div>
          )}
        </div>
      )}

      {crear && <ModalCrear onClose={() => setCrear(false)} onDone={() => { setCrear(false); flash('Usuario creado') }} />}
      {cambiarPwd && <ModalPassword usuario={cambiarPwd} onClose={() => setCambiarPwd(null)} onDone={() => { setCambiarPwd(null); flash('Contraseña actualizada') }} />}
    </div>
  )
}

// ── Modal: crear usuario ──────────────────────────────────────
function ModalCrear({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const qc = useQueryClient()
  const [username, setUsername] = useState('')
  const [nombre, setNombre] = useState('')
  const [rol, setRol] = useState('oficina')
  const [password, setPassword] = useState('')
  const [supervisorId, setSupervisorId] = useState('')
  const [error, setError] = useState('')

  // F0.6: un usuario con rol supervisor queda ligado a un supervisor del padrón
  // (esa identidad viaja en su token y evita que envíe tareo a nombre de otro).
  const { data: supervisores = [] } = useQuery<Supervisor[]>({
    queryKey: ['supervisores-activos'],
    queryFn: () => api<Supervisor[]>('/api/supervisores'),
    enabled: rol === 'supervisor',
  })

  const crear = useMutation({
    mutationFn: () => {
      const body: Record<string, string> = { username, nombre, rol, password }
      if (rol === 'supervisor') body.supervisor_id = supervisorId
      return api('/api/admin/usuarios', { method: 'POST', body: JSON.stringify(body) })
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['usuarios'] }); onDone() },
    onError: (e: Error) => setError(e.message),
  })

  return (
    <Modal title="Nuevo usuario" onClose={onClose}>
      <div className="space-y-3">
        <Campo label="Usuario (para iniciar sesión)">
          <input value={username} onChange={e => setUsername(e.target.value.trim())} autoFocus
            placeholder="ej. jperez" className={inputCls} />
        </Campo>
        <Campo label="Nombre para mostrar">
          <input value={nombre} onChange={e => setNombre(e.target.value)}
            placeholder="ej. Juan Pérez" className={inputCls} />
        </Campo>
        <Campo label="Rol">
          <div className="grid grid-cols-3 gap-2">
            {ROLES.map(r => (
              <button key={r.value} type="button" onClick={() => setRol(r.value)}
                className={`text-left border rounded-lg px-2.5 py-2 transition-colors ${
                  rol === r.value ? 'border-k-amber bg-amber-500/10' : 'border-k-border hover:border-k-border2'}`}>
                <div className="text-xs font-bold text-k-text">{r.label}</div>
                <div className="text-[9px] text-k-text3 leading-tight mt-0.5">{r.desc}</div>
              </button>
            ))}
          </div>
        </Campo>
        {rol === 'supervisor' && (
          <Campo label="Supervisor del padrón (su identidad en campo)">
            <select value={supervisorId} onChange={e => setSupervisorId(e.target.value)}
              className={inputCls}>
              <option value="">— Elegir supervisor —</option>
              {supervisores.map(s => (
                <option key={s.id} value={s.id}>{s.id} · {s.nombre}</option>
              ))}
            </select>
          </Campo>
        )}
        <Campo label="Contraseña">
          <input type="text" value={password} onChange={e => setPassword(e.target.value)}
            placeholder="mínimo 4 caracteres" className={inputCls} />
        </Campo>
        {error && <p className="text-xs text-k-red font-bold">{error}</p>}
        <button onClick={() => { setError(''); crear.mutate() }}
          disabled={crear.isPending || !username || password.length < 4 || (rol === 'supervisor' && !supervisorId)}
          className="w-full flex items-center justify-center gap-2 bg-k-amber text-k-void font-bold rounded-lg py-2.5 text-sm disabled:opacity-50">
          {crear.isPending ? <Loader2 size={15} className="animate-spin" /> : <UserPlus size={15} />} Crear usuario
        </button>
      </div>
    </Modal>
  )
}

// ── Modal: cambiar contraseña ─────────────────────────────────
function ModalPassword({ usuario, onClose, onDone }: { usuario: Usuario; onClose: () => void; onDone: () => void }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const guardar = useMutation({
    mutationFn: () => api(`/api/admin/usuarios/${usuario.id}/password`, {
      method: 'PUT', body: JSON.stringify({ password }),
    }),
    onSuccess: onDone,
    onError: (e: Error) => setError(e.message),
  })

  return (
    <Modal title={`Cambiar contraseña · ${usuario.nombre || usuario.username}`} onClose={onClose}>
      <div className="space-y-3">
        <Campo label="Nueva contraseña">
          <input type="text" value={password} onChange={e => setPassword(e.target.value)} autoFocus
            placeholder="mínimo 4 caracteres" className={inputCls} />
        </Campo>
        {error && <p className="text-xs text-k-red font-bold">{error}</p>}
        <button onClick={() => { setError(''); guardar.mutate() }}
          disabled={guardar.isPending || password.length < 4}
          className="w-full flex items-center justify-center gap-2 bg-k-amber text-k-void font-bold rounded-lg py-2.5 text-sm disabled:opacity-50">
          {guardar.isPending ? <Loader2 size={15} className="animate-spin" /> : <KeyRound size={15} />} Guardar
        </button>
      </div>
    </Modal>
  )
}

// ── Helpers UI ────────────────────────────────────────────────
const inputCls = 'w-full bg-k-void border border-k-border focus:border-k-amber rounded-lg px-3 py-2.5 text-sm text-k-text outline-none transition-colors'

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] uppercase tracking-wider text-k-text3 mb-1">{label}</label>
      {children}
    </div>
  )
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-k-surface border border-k-border rounded-2xl p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-k-text">{title}</h2>
          <button onClick={onClose} className="text-k-text3 hover:text-k-text p-1 rounded-lg hover:bg-k-raised">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
