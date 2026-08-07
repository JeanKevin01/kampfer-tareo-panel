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

/** ¿La sesión puede leer los endpoints cerrados con `require_role("oficina")`?
 *
 *  El API tiene DOS clases de endpoint cerrados a oficina, no una:
 *    · todo `/ev/*` (el motor de valor ganado), y
 *    · un puñado FUERA de `/ev` que se leen desde módulos que el supervisor sí
 *      ve — `/api/histograma-personal`, `/admin/supervisores/matriz`,
 *      `/api/cuadrillas-habituales`.
 *
 *  La 1ª ronda de la auditoría filtró el menú grepeando `/ev/` y por eso dejó
 *  fuera la segunda clase. Esta función existe para que la regla se escriba
 *  UNA vez y valga tanto para el menú como para las pestañas de dentro.
 *
 *  Ante un rol desconocido devuelve `true`: ocultar de más deja a alguien sin su
 *  herramienta, y el 403 del API sigue protegiendo el dato igual. Esto es
 *  cosmética honesta, NO una medida de seguridad. */
export function esOficina(): boolean {
  return currentUser()?.rol !== 'supervisor'
}

export function logout() { clearToken(); location.reload() }
