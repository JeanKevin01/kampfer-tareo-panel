# CLAUDE.md — kampfer-panel

Responder en español. Panel React del sistema KAMPFER.

## ⚠️ Regla #1

**Push a `main` = deploy AUTOMÁTICO a producción (Cloudflare Pages).**
Nunca pushear sin `npm run build` verde en local.

## Comandos

`npm ci` · `npm run dev` · `npm run lint` · `npm run build`

## Convenciones

- Páginas en `src/pages/`, rutas en `src/App.tsx`, menú en `src/components/Sidebar.tsx`.
- URL del API: SIEMPRE desde `API_BASE` (`src/lib/api.ts`, env `VITE_API_URL`). No hardcodear URLs.
- Auth: interceptor global en `src/main.tsx` (monkey-patch de fetch — se reemplaza por un helper
  `api<T>()` en la tarea F5.1 del plan; hasta entonces, no duplicar manejo de token en páginas).
- TanStack Query para data fetching en páginas nuevas.
- Commits convencionales `tipo(scope): descripción` en español.

## Estado conocido (plan vigente: PLAN_MAESTRO v3.1 en `Analisis Claude/` del workspace)

- `npm run lint` tiene ~43 errores pre-existentes → en CI es informativo (`continue-on-error`);
  al limpiarlos (F5) hacerlo bloqueante. No introducir errores nuevos.
- `PROYECTO_ID = 1` hardcodeado en Presupuesto.tsx y Rentabilidad.tsx — se retira con el selector
  de proyecto (F3.3, store zustand `useProyecto` + header `X-Proyecto-Id`).
- zustand está instalado y sin uso: reservado para F3.3. No agregar otros state managers.
- Placeholders Inventario/Valorización: los reemplazan Costos (F2.2) y Valorización (F2.8).
- `ValorGanado.tsx` (~1,400 líneas) es el hub EV; candidato a dividirse, no crecer.
