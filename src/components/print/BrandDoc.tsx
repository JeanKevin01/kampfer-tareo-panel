// Identidad visual sobria de KAMPFER para TODOS los documentos exportables
// (sustento por partida, reporte semanal, lookahead). Un solo lugar define la
// marca — wordmark, tipografía, color de acento, cabecera y pie — para que los
// PDFs que ve el cliente salgan consistentes. Estilos propios (clases `kd-*`),
// sin depender de Tailwind ni de la paleta k-* del panel: estas vistas viven
// FUERA del Layout y deben verse igual pase lo que pase con el tema.
//
// Fuente: Geist Variable / Geist Mono (las que el panel ya carga globalmente).
// Acento único: ámbar del sistema (#f59e0b) sobre tinta carbón; el resto neutro.
import type { ReactNode } from 'react'
import { Printer } from 'lucide-react'

const hoyLargo = () =>
  new Date().toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' })

/** Monograma + wordmark. Sobrio: cuadro ámbar con la K, nombre en Geist. */
function Marca() {
  return (
    <div className="kd-marca">
      <span className="kd-mono-k" aria-hidden>K</span>
      <span className="kd-wm">
        <span className="kd-wm-nombre">KAMPFER</span>
        <span className="kd-wm-tag">Oficina técnica de construcción</span>
      </span>
    </div>
  )
}

export interface BrandDocProps {
  /** Etiqueta del tipo de documento, ej. "Sustento de valorización". */
  tipo: string
  titulo: ReactNode
  /** Metadatos bajo el título (proyecto, periodo, "generado el…"). */
  meta?: ReactNode
  /** Texto de ayuda junto al botón de imprimir (no sale en el PDF). */
  hint?: string
  /** Regla CSS de @page, ej. "size: A3 landscape; margin: 10mm". */
  page?: string
  /** true = ancho completo (tablas anchas tipo lookahead); false = documento. */
  wide?: boolean
  /** Banner de aviso bajo la cabecera (ej. fotos purgadas). */
  aviso?: ReactNode
  children: ReactNode
}

export default function BrandDoc({
  tipo, titulo, meta, hint, page, wide, aviso, children,
}: BrandDocProps) {
  return (
    <div className="kd-root">
      <style>{`
        .kd-root {
          --tinta: #10151f; --tinta2: #55606f; --tinta3: #8a93a1;
          --acento: #f59e0b; --linea: #d9dee6; --linea2: #eef1f5;
          background: #fff; color: var(--tinta); min-height: 100vh;
          font-family: 'Geist Variable', ui-sans-serif, system-ui, sans-serif;
          -webkit-print-color-adjust: exact; print-color-adjust: exact;
        }
        .kd-root ::selection { background: #fde4b0; }
        @media print { .kd-noprint { display: none !important; } }
        ${page ? `@page { ${page} }` : '@page { margin: 14mm; }'}

        .kd-bar {
          position: sticky; top: 0; z-index: 5; display: flex; gap: 14px;
          align-items: center; padding: 10px 32px;
          background: #fbfcfd; border-bottom: 1px solid var(--linea);
        }
        .kd-btn {
          display: inline-flex; align-items: center; gap: 7px;
          padding: 9px 18px; background: var(--tinta); color: #fff; border: 0;
          border-radius: 8px; font-weight: 600; font-size: 13px; cursor: pointer;
          font-family: inherit; letter-spacing: .01em;
        }
        .kd-btn:hover { background: #1c2432; }
        .kd-hint { font-size: 12px; color: var(--tinta2); }

        .kd-page {
          margin: 0 auto; padding: ${wide ? '26px 30px' : '36px 44px 48px'};
          max-width: ${wide ? '100%' : '840px'};
        }

        /* Cabecera de marca */
        .kd-marca { display: flex; align-items: center; gap: 11px; }
        .kd-mono-k {
          width: 34px; height: 34px; flex: none; border-radius: 7px;
          background: var(--acento); color: #1a1206; font-weight: 800;
          font-size: 22px; line-height: 34px; text-align: center;
          box-shadow: inset 0 0 0 1px rgba(0,0,0,.06);
        }
        .kd-wm { display: flex; flex-direction: column; line-height: 1.05; }
        .kd-wm-nombre { font-weight: 700; font-size: 18px; letter-spacing: .16em; }
        .kd-wm-tag { font-size: 10px; color: var(--tinta2); letter-spacing: .04em; margin-top: 2px; }

        .kd-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; }
        .kd-tipo {
          font-size: 10.5px; font-weight: 700; letter-spacing: .18em;
          text-transform: uppercase; color: #8a5a06;
          background: #fdf3dd; border: 1px solid #f5d99a;
          padding: 5px 11px; border-radius: 999px; white-space: nowrap;
        }
        .kd-rule { height: 2px; background: var(--tinta); margin: 16px 0 14px; position: relative; }
        .kd-rule::after {
          content: ''; position: absolute; left: 0; top: 0; height: 2px;
          width: 68px; background: var(--acento);
        }
        .kd-titulo { font-size: 25px; font-weight: 700; letter-spacing: -.01em; line-height: 1.12; margin: 0; }
        .kd-meta { font-size: 12.5px; color: var(--tinta2); margin-top: 6px; line-height: 1.5; }

        .kd-aviso {
          font-size: 11.5px; color: #8a5a06; background: #fdf6e6;
          border: 1px solid #f0d69a; border-radius: 8px;
          padding: 9px 13px; margin: 14px 0 0;
        }

        .kd-foot {
          margin-top: 34px; padding-top: 10px; border-top: 1px solid var(--linea);
          font-size: 10px; color: var(--tinta3); letter-spacing: .02em;
          display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap;
        }
      `}</style>

      <div className="kd-bar kd-noprint">
        <button className="kd-btn" onClick={() => window.print()}>
          <Printer size={14} /> Imprimir / Guardar PDF
        </button>
        {hint && <span className="kd-hint">{hint}</span>}
      </div>

      <div className="kd-page">
        <div className="kd-head">
          <Marca />
          <span className="kd-tipo">{tipo}</span>
        </div>
        <div className="kd-rule" />
        <h1 className="kd-titulo">{titulo}</h1>
        {meta && <div className="kd-meta">{meta}</div>}
        {aviso && <div className="kd-aviso">{aviso}</div>}

        {children}

        <div className="kd-foot">
          <span>KAMPFER · del tareo al Resultado Operativo</span>
          <span>{tipo} · generado el {hoyLargo()}</span>
        </div>
      </div>
    </div>
  )
}
