import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Loader2, ShieldCheck, UserPlus, KeyRound, Ban, X, Check, Lock, Search,
  HardHat, UserCog, TriangleAlert, Wand2, Copy,
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
  clave_inicial?: boolean
  creado_en: string
}

// Persona del padrón elegible para tener acceso (supervisor o trabajador).
interface Persona {
  origen: 'SUPERVISOR' | 'TRABAJADOR'
  id: string
  nombre: string
  cargo: string
  supervisor_id: string | null
  username: string | null
  username_sugerido: string
}

interface AccesoCreado { supervisor_id: string; nombre: string; username: string; password: string }

const ROLES = [
  { value: 'admin',      label: 'Admin',      desc: 'Acceso total al sistema' },
  { value: 'oficina',    label: 'Oficina',    desc: 'Panel completo' },
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
  const [nuevos, setNuevos] = useState<AccesoCreado[] | null>(null)

  const flash = (t: string) => { setAviso(t); setTimeout(() => setAviso(''), 4000) }

  const { data: usuarios = [], isLoading, error } = useQuery<Usuario[]>({
    queryKey: ['usuarios'],
    queryFn: () => api<Usuario[]>('/api/admin/usuarios'),
  })

  const baja = useMutation({
    mutationFn: (u: Usuario) => api(`/api/admin/usuarios/${u.id}/baja`, { method: 'PUT' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['usuarios'] }); flash('Usuario dado de baja') },
  })

  // Crea de golpe el acceso de los supervisores que aún no lo tienen.
  const sincronizar = useMutation({
    mutationFn: () => api<{ creados: AccesoCreado[]; ya_tenian: number }>(
      '/api/admin/usuarios/sincronizar-supervisores', { method: 'POST' }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['usuarios'] })
      qc.invalidateQueries({ queryKey: ['personal-elegible'] })
      if (r.creados.length) setNuevos(r.creados)
      else flash(`Todos los supervisores ya tienen acceso (${r.ya_tenian})`)
    },
  })

  const conClaveInicial = useMemo(
    () => usuarios.filter(u => u.activo && u.clave_inicial).length, [usuarios])

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
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-condensed font-extrabold text-k-text flex items-center gap-2">
            <ShieldCheck size={22} className="text-k-amber" /> Usuarios
          </h1>
          <p className="text-sm text-k-text3 mt-0.5">Quién puede entrar al panel y a la app de campo.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => sincronizar.mutate()} disabled={sincronizar.isPending}
            title="Crea el acceso (clave 1234) de todos los supervisores del padrón que aún no lo tienen"
            className="flex items-center gap-2 border border-k-border hover:border-k-amber text-k-text font-bold rounded-lg px-3 py-2.5 text-sm transition-colors disabled:opacity-50">
            {sincronizar.isPending ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />}
            Crear accesos de supervisores
          </button>
          <button onClick={() => setCrear(true)}
            className="flex items-center gap-2 bg-k-amber text-k-void font-bold rounded-lg px-4 py-2.5 text-sm hover:opacity-90 transition-opacity">
            <UserPlus size={15} /> Nuevo usuario
          </button>
        </div>
      </div>

      {aviso && (
        <div className="mb-4 flex items-center gap-2 text-sm text-k-green bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2">
          <Check size={15} /> {aviso}
        </div>
      )}

      {conClaveInicial > 0 && (
        <div className="mb-4 flex items-start gap-2 text-xs text-k-amber bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
          <TriangleAlert size={14} className="mt-0.5 flex-shrink-0" />
          <span>
            {conClaveInicial} usuario{conClaveInicial !== 1 ? 's' : ''} sigue{conClaveInicial !== 1 ? 'n' : ''} con la
            clave inicial <b>1234</b>. Está bien para el piloto, pero cualquiera con esa clave puede
            entrar en su nombre — cámbiala con la llave 🔑 cuando cada supervisor reciba su acceso.
          </span>
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
                <div className="text-[11px] text-k-text3 flex items-center gap-1.5">
                  @{u.username}{!u.activo && ' · inactivo'}
                  {u.activo && u.clave_inicial && (
                    <span className="text-k-amber font-bold" title="Sigue con la clave inicial 1234">· clave 1234</span>
                  )}
                </div>
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

      {crear && (
        <ModalCrear
          onClose={() => setCrear(false)}
          onDone={(acceso) => {
            setCrear(false)
            if (acceso) setNuevos([acceso]); else flash('Usuario creado')
          }} />
      )}
      {cambiarPwd && <ModalPassword usuario={cambiarPwd} onClose={() => setCambiarPwd(null)} onDone={() => { setCambiarPwd(null); flash('Contraseña actualizada') }} />}
      {nuevos && <ModalAccesos accesos={nuevos} onClose={() => setNuevos(null)} />}
    </div>
  )
}

// ── Modal: crear usuario ──────────────────────────────────────
// Dos caminos: PERSONAL DEL PADRÓN (se elige de la lista → acceso de campo con
// su identidad ligada, para que la app no le pida elegirse a sí mismo) o
// MANUAL (oficina/admin, gente que no está en el padrón de obra).
function ModalCrear({ onClose, onDone }: { onClose: () => void; onDone: (a?: AccesoCreado) => void }) {
  const qc = useQueryClient()
  const [modo, setModo] = useState<'padron' | 'manual'>('padron')
  const [error, setError] = useState('')

  // — Camino padrón —
  const [busca, setBusca] = useState('')
  const [sel, setSel] = useState<Persona | null>(null)
  const [userPadron, setUserPadron] = useState('')
  const [pwdPadron, setPwdPadron] = useState('1234')

  // — Camino manual —
  const [username, setUsername] = useState('')
  const [nombre, setNombre] = useState('')
  const [rol, setRol] = useState('oficina')
  const [password, setPassword] = useState('')

  const { data: personal = [], isLoading } = useQuery<Persona[]>({
    queryKey: ['personal-elegible'],
    queryFn: () => api<Persona[]>('/api/admin/personal-elegible'),
    enabled: modo === 'padron',
  })

  const filtrado = useMemo(() => {
    const q = busca.trim().toLowerCase()
    const base = q.length < 2 ? personal : personal.filter(p =>
      p.nombre.toLowerCase().includes(q) || p.cargo.toLowerCase().includes(q) || p.id === q)
    return base.slice(0, 40)
  }, [personal, busca])

  const elegir = (p: Persona) => {
    setSel(p)
    setUserPadron(p.username_sugerido)
    setPwdPadron('1234')
    setError('')
  }

  const crearPadron = useMutation({
    mutationFn: () => api<AccesoCreado>('/api/admin/usuarios/desde-personal', {
      method: 'POST',
      body: JSON.stringify({ origen: sel!.origen, id: sel!.id, username: userPadron, password: pwdPadron }),
    }),
    onSuccess: (a) => {
      qc.invalidateQueries({ queryKey: ['usuarios'] })
      qc.invalidateQueries({ queryKey: ['personal-elegible'] })
      qc.invalidateQueries({ queryKey: ['supervisores-activos'] })
      onDone(a)
    },
    onError: (e: Error) => setError(e.message),
  })

  const crearManual = useMutation({
    mutationFn: () => api('/api/admin/usuarios', {
      method: 'POST', body: JSON.stringify({ username, nombre, rol, password }),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['usuarios'] }); onDone() },
    onError: (e: Error) => setError(e.message),
  })

  return (
    <Modal title="Nuevo usuario" onClose={onClose}>
      <div className="flex gap-2 mb-4">
        {([['padron', 'Personal de obra'], ['manual', 'Oficina / Admin']] as const).map(([v, l]) => (
          <button key={v} type="button" onClick={() => { setModo(v); setError('') }}
            className={`flex-1 text-xs font-bold rounded-lg py-2 border transition-colors ${
              modo === v ? 'border-k-amber bg-amber-500/10 text-k-text' : 'border-k-border text-k-text3 hover:border-k-border2'}`}>
            {l}
          </button>
        ))}
      </div>

      {modo === 'padron' ? (
        <div className="space-y-3">
          {!sel ? (
            <>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-k-text3" />
                <input value={busca} onChange={e => setBusca(e.target.value)} autoFocus
                  placeholder="Buscar por nombre, cargo o código…"
                  className={inputCls + ' pl-9'} />
              </div>
              <div className="max-h-72 overflow-y-auto border border-k-border rounded-lg divide-y divide-k-border">
                {isLoading ? (
                  <div className="flex items-center gap-2 justify-center py-6 text-k-text3 text-xs">
                    <Loader2 size={14} className="animate-spin" /> Cargando personal…
                  </div>
                ) : filtrado.length === 0 ? (
                  <div className="text-center py-6 text-k-text3 text-xs">
                    Sin resultados. El personal se carga en «Importar» o en Trabajadores.
                  </div>
                ) : filtrado.map(p => (
                  <button key={`${p.origen}-${p.id}`} type="button"
                    onClick={() => !p.username && elegir(p)}
                    disabled={!!p.username}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors ${
                      p.username ? 'opacity-45 cursor-default' : 'hover:bg-k-raised'}`}>
                    {p.origen === 'SUPERVISOR'
                      ? <UserCog size={15} className="text-k-amber flex-shrink-0" />
                      : <HardHat size={15} className="text-k-text3 flex-shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold text-k-text truncate">{p.nombre}</div>
                      <div className="text-[10px] text-k-text3 truncate">{p.id} · {p.cargo}</div>
                    </div>
                    {p.username
                      ? <span className="text-[9px] text-k-green font-bold whitespace-nowrap">ya tiene @{p.username}</span>
                      : p.origen === 'TRABAJADOR'
                        ? <span className="text-[9px] text-k-blue font-bold whitespace-nowrap">pasa a supervisor</span>
                        : null}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-k-text3 leading-snug">
                Elegir a un <b className="text-k-text">trabajador</b> lo registra además como supervisor
                del padrón: podrá reportar el tareo desde la app y entrará directo a su nombre.
              </p>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2.5 border border-k-amber/40 bg-amber-500/5 rounded-lg px-3 py-2.5">
                {sel.origen === 'SUPERVISOR'
                  ? <UserCog size={16} className="text-k-amber" /> : <HardHat size={16} className="text-k-amber" />}
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold text-k-text truncate">{sel.nombre}</div>
                  <div className="text-[10px] text-k-text3">
                    {sel.id} · {sel.cargo}
                    {sel.origen === 'TRABAJADOR' && ' · se registrará como supervisor'}
                  </div>
                </div>
                <button type="button" onClick={() => { setSel(null); setError('') }}
                  className="text-[10px] text-k-text3 hover:text-k-amber font-bold">Cambiar</button>
              </div>
              <Campo label="Usuario (lo teclea en el celular)">
                <input value={userPadron} onChange={e => setUserPadron(e.target.value.trim().toLowerCase())}
                  autoFocus className={inputCls} />
              </Campo>
              <Campo label="Contraseña inicial">
                <input type="text" value={pwdPadron} onChange={e => setPwdPadron(e.target.value)}
                  className={inputCls} />
              </Campo>
              {error && <p className="text-xs text-k-red font-bold">{error}</p>}
              <button onClick={() => { setError(''); crearPadron.mutate() }}
                disabled={crearPadron.isPending || !userPadron || pwdPadron.length < 4}
                className="w-full flex items-center justify-center gap-2 bg-k-amber text-k-void font-bold rounded-lg py-2.5 text-sm disabled:opacity-50">
                {crearPadron.isPending ? <Loader2 size={15} className="animate-spin" /> : <UserPlus size={15} />}
                Crear acceso
              </button>
            </>
          )}
        </div>
      ) : (
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
            <div className="grid grid-cols-2 gap-2">
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
          <p className="text-[10px] text-k-text3 leading-snug">
            Los accesos de <b className="text-k-text">supervisor</b> se crean desde «Personal de obra»
            para que queden ligados a su ficha del padrón.
          </p>
          <Campo label="Contraseña">
            <input type="text" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="mínimo 4 caracteres" className={inputCls} />
          </Campo>
          {error && <p className="text-xs text-k-red font-bold">{error}</p>}
          <button onClick={() => { setError(''); crearManual.mutate() }}
            disabled={crearManual.isPending || !username || password.length < 4}
            className="w-full flex items-center justify-center gap-2 bg-k-amber text-k-void font-bold rounded-lg py-2.5 text-sm disabled:opacity-50">
            {crearManual.isPending ? <Loader2 size={15} className="animate-spin" /> : <UserPlus size={15} />} Crear usuario
          </button>
        </div>
      )}
    </Modal>
  )
}

// ── Modal: accesos recién creados (para entregárselos al supervisor) ──
function ModalAccesos({ accesos, onClose }: { accesos: AccesoCreado[]; onClose: () => void }) {
  const [copiado, setCopiado] = useState(false)
  const texto = accesos.map(a => `${a.nombre}: usuario ${a.username} / clave ${a.password}`).join('\n')
  const copiar = () => {
    navigator.clipboard?.writeText(texto).then(() => {
      setCopiado(true); setTimeout(() => setCopiado(false), 2000)
    }).catch(() => {})
  }
  return (
    <Modal title={accesos.length === 1 ? 'Acceso creado' : `${accesos.length} accesos creados`} onClose={onClose}>
      <p className="text-xs text-k-text3 mb-3">
        Entrégale estos datos a cada supervisor: con eso entra a la app de campo y el sistema ya sabe
        quién es (no tiene que elegirse de una lista).
      </p>
      <div className="border border-k-border rounded-lg divide-y divide-k-border max-h-64 overflow-y-auto mb-3">
        {accesos.map(a => (
          <div key={a.username} className="px-3 py-2.5">
            <div className="text-xs font-bold text-k-text">{a.nombre}</div>
            <div className="text-[11px] text-k-text3 mt-0.5">
              usuario <span className="text-k-amber font-bold font-mono">{a.username}</span>
              {'  ·  '}clave <span className="text-k-amber font-bold font-mono">{a.password}</span>
            </div>
          </div>
        ))}
      </div>
      <button onClick={copiar}
        className="w-full flex items-center justify-center gap-2 border border-k-border hover:border-k-amber text-k-text font-bold rounded-lg py-2.5 text-sm transition-colors mb-2">
        {copiado ? <Check size={15} className="text-k-green" /> : <Copy size={15} />}
        {copiado ? 'Copiado' : 'Copiar la lista'}
      </button>
      <button onClick={onClose}
        className="w-full bg-k-amber text-k-void font-bold rounded-lg py-2.5 text-sm">Listo</button>
    </Modal>
  )
}

// ── Modal: cambiar contraseña ─────────────────────────────────
function ModalPassword({ usuario, onClose, onDone }: { usuario: Usuario; onClose: () => void; onDone: () => void }) {
  const qc = useQueryClient()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const guardar = useMutation({
    mutationFn: () => api(`/api/admin/usuarios/${usuario.id}/password`, {
      method: 'PUT', body: JSON.stringify({ password }),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['usuarios'] }); onDone() },
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
