// Manejo de sesión (Fase 2): token JWT propio guardado en localStorage.
const TOKEN_KEY = 'kampfer_token'

export interface AuthUser { username: string; rol: string; nombre: string; exp: number }

export function getToken(): string | null { return localStorage.getItem(TOKEN_KEY) }
export function setToken(t: string) { localStorage.setItem(TOKEN_KEY, t) }
export function clearToken() { localStorage.removeItem(TOKEN_KEY) }

function b64urlDecode(s: string): string {
  s = s.replace(/-/g, '+').replace(/_/g, '/')
  while (s.length % 4) s += '='
  const bin = atob(s)
  // Decodifica como UTF-8 (para nombres con tildes)
  return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)))
}

export function decodeToken(t: string | null): AuthUser | null {
  if (!t) return null
  try {
    const body = t.split('.')[0]
    const p = JSON.parse(b64urlDecode(body))
    return { username: p.sub, rol: p.rol, nombre: p.nombre || '', exp: p.exp || 0 }
  } catch { return null }
}

/** Usuario actual si hay token válido y no expirado; si no, null. */
export function currentUser(): AuthUser | null {
  const u = decodeToken(getToken())
  if (!u || (u.exp && u.exp * 1000 < Date.now())) return null
  return u
}

export function logout() { clearToken(); location.reload() }
