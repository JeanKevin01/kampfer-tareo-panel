import { useState } from 'react'
import { setToken } from '@/lib/auth'
import { Lock, User, Loader2 } from 'lucide-react'

const API = (import.meta.env.VITE_API_URL as string | undefined) ?? 'https://api.apps1.astraera.space'

export default function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      const r = await fetch(`${API}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.detail || 'No se pudo iniciar sesión')
      setToken(d.token)
      location.reload()
    } catch (err) {
      setError((err as Error).message)
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-k-void px-4">
      <form onSubmit={submit} className="w-full max-w-sm bg-k-surface border border-k-border rounded-2xl p-8 space-y-5">
        <div className="text-center">
          <div className="font-condensed font-extrabold text-2xl text-k-amber tracking-[.2em]">KAMPFER</div>
          <p className="text-xs text-k-text3 mt-1">Panel Maestro · Iniciar sesión</p>
        </div>

        <div>
          <label className="block text-[10px] uppercase tracking-wider text-k-text3 mb-1">Usuario</label>
          <div className="flex items-center gap-2 bg-k-void border border-k-border focus-within:border-k-amber rounded-lg px-3">
            <User size={15} className="text-k-text3" />
            <input value={username} onChange={e => setUsername(e.target.value)} autoFocus autoComplete="username"
              className="flex-1 bg-transparent py-2.5 text-sm text-k-text outline-none" placeholder="admin" />
          </div>
        </div>

        <div>
          <label className="block text-[10px] uppercase tracking-wider text-k-text3 mb-1">Contraseña</label>
          <div className="flex items-center gap-2 bg-k-void border border-k-border focus-within:border-k-amber rounded-lg px-3">
            <Lock size={15} className="text-k-text3" />
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password"
              className="flex-1 bg-transparent py-2.5 text-sm text-k-text outline-none" placeholder="••••••••" />
          </div>
        </div>

        {error && <p className="text-xs text-k-red font-bold">{error}</p>}

        <button type="submit" disabled={loading || !username || !password}
          className="w-full flex items-center justify-center gap-2 bg-k-amber text-k-void font-bold rounded-lg py-2.5 text-sm disabled:opacity-50">
          {loading ? <Loader2 size={15} className="animate-spin" /> : <Lock size={15} />} Ingresar
        </button>
      </form>
    </div>
  )
}
