import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// F5.1 completo (Fase S 2026-07-19): el monkey-patch global de fetch se
// eliminó — TODAS las llamadas al API pasan por api<T>()/apiBlob() de
// @/lib/api, que inyectan el token y manejan el 401 (sesión vencida).

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
