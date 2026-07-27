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
- **Color = significado** (`src/index.css`): `k-amber` acción/marca · `k-plan` lo previsto ·
  `k-green` hecho y conforme · `k-alerta` atención · `k-red` problema · `k-wbs` estructura
  (etapas/partidas) · `k-dinero` costo/venta/margen · `k-blue` información y ayuda. No inventar
  colores sueltos de Tailwind para datos: si hace falta uno nuevo, es un token nuevo.
- **Botones**: `btn` + `btn-primario` (UNA por pantalla) | `btn-secundario` | `btn-terciario` |
  `btn-peligro`, más `btn-on` para el que abre un panel y `btn-sm` en barras densas. Si una
  cabecera pasa de 4 botones, los de menos uso van dentro de `<MenuMas>`.
  Regla: **página tocada = migrada** (igual que se hizo con `api<T>()`).
- Commits convencionales `tipo(scope): descripción` en español.

## Estado conocido (plan vigente: PLAN_MAESTRO_CONSOLIDADO.md en `Analisis Claude/`)

- `npm run lint` está en **0 errores y es BLOQUEANTE en CI** (+ typecheck `tsc -b`).
  No introducir errores nuevos: el push a main no despliega si el CI falla.
- `PROYECTO_ID = 1` hardcodeado en Presupuesto.tsx y Rentabilidad.tsx — se retira con el selector
  de proyecto (F3.3, store zustand `useProyecto` + header `X-Proyecto-Id`).
- zustand está instalado y sin uso: reservado para F3.3. No agregar otros state managers.
- Placeholders Inventario/Valorización: los reemplazan Costos (F2.2) y Valorización (F2.8).
- `ValorGanado.tsx` (~1,400 líneas) es el hub EV; candidato a dividirse, no crecer.
