import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Seguridad Fase 1: inyecta la API key (si está configurada) en TODAS las llamadas
// a la API, sin tocar cada página. Solo añade el header al host de la API.
const API_KEY = import.meta.env.VITE_API_KEY as string | undefined
const API_HOST = (import.meta.env.VITE_API_URL as string | undefined) ?? 'https://api.apps1.astraera.space'
if (API_KEY) {
  const _fetch = window.fetch.bind(window)
  window.fetch = (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (url && url.startsWith(API_HOST)) {
      init.headers = { ...(init.headers || {}), 'X-API-Key': API_KEY }
    }
    return _fetch(input, init)
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
