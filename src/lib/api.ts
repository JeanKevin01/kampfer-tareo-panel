// Fuente única de la URL base del API. Se configura por entorno con VITE_API_URL.
// NO embeber API keys aquí: el cliente se autentica con el token JWT del usuario (login).
import { getToken, clearToken } from './auth'

export const API_BASE =
  (import.meta.env.VITE_API_URL as string | undefined) ?? 'https://api.apps1.astraera.space'

// ── F5.1: helper único de llamadas al API ─────────────────────
// Regla del plan: toda página que se toque migra de `fetch(`${API}...`)` a `api<T>()`.
// El monkey-patch de main.tsx se borra cuando `grep -rn 'fetch(\`\${API' src/pages` = 0.

export class ApiError extends Error {
  status: number
  detail: string
  constructor(status: number, detail: string) {
    super(detail)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }
}

/** Llama al API: agrega el token, valida `r.ok` y devuelve el JSON tipado.
 *  Lanza `ApiError{status, detail}` con el mensaje real del backend.
 *  401 con sesión activa = token vencido → vuelve al login (igual que el interceptor). */
export async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { ...(init.headers as Record<string, string> || {}) }
  const tk = getToken()
  if (tk) headers['Authorization'] = `Bearer ${tk}`
  // FormData define su propio Content-Type (boundary del multipart) — no pisarlo.
  if (init.body && !(init.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers })

  if (res.status === 401 && tk && !path.includes('/api/auth/login')) {
    clearToken()
    location.reload()
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new ApiError(res.status, (data as { detail?: string }).detail || `Error ${res.status}`)
  }
  return res.json() as Promise<T>
}
