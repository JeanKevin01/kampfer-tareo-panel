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
- Auth: SIEMPRE `api<T>()`/`apiBlob()` de `src/lib/api.ts` (inyectan token y manejan 401).
  El monkey-patch de fetch se eliminó (Fase S 2026-07-19): `fetch` crudo solo con motivo
  documentado (ej. healthcheck del Monitor).
- TanStack Query para data fetching en páginas nuevas.
- Commits convencionales `tipo(scope): descripción` en español.

## Estado conocido (plan vigente: PLAN_MAESTRO_CONSOLIDADO.md en `Analisis Claude/`)

- `npm run lint` está en **0 errores y es BLOQUEANTE en CI** (+ typecheck `tsc -b`).
  No introducir errores nuevos: el push a main no despliega si el CI falla.
- `PROYECTO_ID = 1` hardcodeado en Presupuesto.tsx y Rentabilidad.tsx — se retira con el selector
  de proyecto (F3.3, store zustand `useProyecto` + header `X-Proyecto-Id`).
- zustand está instalado y sin uso: reservado para F3.3. No agregar otros state managers.
- Placeholders Inventario/Valorización: los reemplazan Costos (F2.2) y Valorización (F2.8).
- `ValorGanado.tsx` (~1,400 líneas) es el hub EV; candidato a dividirse, no crecer.
