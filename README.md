# kampfer-panel

Panel web del sistema KAMPFER (*del tareo al Resultado Operativo sin Excel*): dashboard de tareo,
padrón y QRs, Valor Ganado/ISP, presupuesto y Resultado Operativo para oficina técnica.

React 19 · Vite · TypeScript · TanStack Query · Tailwind · Recharts.

## Comandos

```bash
npm ci          # instalar
npm run dev     # desarrollo (http://localhost:5173)
npm run lint    # eslint (hoy con errores pre-existentes; ver nota CI)
npm run build   # build de producción (bloqueante en CI)
```

## Configuración

- `VITE_API_URL` — URL del API (default: `https://api.apps1.astraera.space`), ver `src/lib/api.ts`.
- Auth: JWT en localStorage; el interceptor global vive en `src/main.tsx` (inyecta `Authorization`
  y maneja 401 → logout).

## Deploy

**Cloudflare Pages con deploy AUTOMÁTICO al hacer push a `main`.** Antes de pushear: `npm run build`
local en verde. El CI de GitHub Actions (`.github/workflows/build.yml`) valida build (bloqueante) y
lint (informativo hasta saldar los errores pre-existentes — tarea F5 del plan).

## Estructura

- `src/pages/` — una página por ruta (rutas en `src/App.tsx`, menú en `src/components/Sidebar.tsx`).
- `src/lib/` — `api.ts` (API_BASE), `auth.ts` (token), `wbs.ts` (árbol WBS compartido).
- `ValorGanado.tsx` — hub del módulo EV con tabs (TabISP, TabDiario, etc.).
