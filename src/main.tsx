import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { getToken, clearToken } from './lib/auth'

// Seguridad Fase 1+2: inyecta API key (si está) y el token JWT (Bearer) en TODAS las
// llamadas a la API, sin tocar cada página. Si la API responde 401 con token presente,
// la sesión expiró → limpia y recarga (vuelve al login).
const API_KEY = import.meta.env.VITE_API_KEY as string | undefined
const API_HOST = (import.meta.env.VITE_API_URL as string | undefined) ?? 'https://api.apps1.astraera.space'
const _fetch = window.fetch.bind(window)
window.fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  if (url && url.startsWith(API_HOST)) {
    const h: Record<string, string> = { ...(init.headers as Record<string, string> || {}) }
    if (API_KEY) h['X-API-Key'] = API_KEY
    const tk = getToken()
    if (tk) h['Authorization'] = `Bearer ${tk}`
    init.headers = h
  }
  const res = await _fetch(input, init)
  if (res.status === 401 && getToken() && url && url.startsWith(API_HOST) && !url.includes('/api/auth/login')) {
    clearToken()
    location.reload()
  }
  return res
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
