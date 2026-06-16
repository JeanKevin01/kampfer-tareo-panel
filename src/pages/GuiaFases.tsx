import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2, ChevronDown, ChevronRight, Info } from 'lucide-react'

const API = 'https://api.apps1.astraera.space'

interface Partida { id: number; otm_id: string; fase: string; sub_fase: string; descripcion: string; hh_presup: number; activo: boolean }

const FASES: Record<string, { nombre: string; color: string; light: string; desc: string; cuando: string }> = {
  FAB: { nombre: 'Fabricación en Planta',  color: '#1D9E75', light: '#E1F5EE',
    desc: 'Fabricación de estructuras, componentes y módulos en taller antes de ir a campo. Incluye arenado y pintura.',
    cuando: 'FABRICAC · ARENADO · PINTURA · ANTICORROS · HABILITACION DE ACCESORIO' },
  EST: { nombre: 'Montaje de Estructuras', color: '#3B82F6', light: '#EBF3FE',
    desc: 'Montaje e instalación de estructuras metálicas en campo. La disciplina más pesada del proyecto.',
    cuando: 'MONTAJE DE ESTRUCTURA · REFUERZO TIPO · INSTALACION DE GUARDAS · MODIFICAR INTERFERENCIA' },
  MEC: { nombre: 'Mecánico / Proceso',     color: '#D85A30', light: '#FDECE5',
    desc: 'Instalación y ajuste de equipos mecánicos: poleas, motores, reductores, válvulas, bombas. Alineamiento y grouteo.',
    cuando: 'TRABAJOS MECANICOS · ALINEAMIENTO · GROUTEO · COMISIONADO · POLEAS · PUENTE GRUA' },
  ELE: { nombre: 'Eléctrico',              color: '#BA7517', light: '#FDF3E0',
    desc: 'Tendido de cables, bandejas, tableros y puesta a tierra.',
    cuando: 'CABLEADO · CABLE TECK · BANDEJA METALICA · TABLERO · PUESTA A TIERRA · CONDUIT' },
  TUB: { nombre: 'Tuberías y Piping',      color: '#7F77DD', light: '#F0EFFE',
    desc: 'Habilitación, montaje y prueba de tuberías de proceso. Tie-In y soportería.',
    cuando: 'TUBERIA · TIE IN · HABILITAR TUBERIA · SOPORTERIA METALICA TUBERIAS · PIPING' },
  INS: { nombre: 'Instrumentación',        color: '#D4537E', light: '#FDE8EF',
    desc: 'Instalación de instrumentos de campo, señales y calibración de lazos.',
    cuando: 'INSTRUMENTO · SENSOR · TRANSMISOR · LOOP TEST · CALIBRACION DE LAZO' },
  CIV: { nombre: 'Civil y Geotécnico',     color: '#888780', light: '#F1EFE8',
    desc: 'Excavación, relleno, concreto, anclajes y demoliciones.',
    cuando: 'EXCAVACION · RELLENO · CONCRETO · PERNOS DE EXPANSION · DEMOLICION · GROUTEO CIVIL' },
  AND: { nombre: 'Andamios y Accesos',     color: '#0F8C6A', light: '#DDF4EE',
    desc: 'Instalación, modificación y desinstalación de andamios. Presente en casi todas las OTMs.',
    cuando: 'ANDAMIOS · PLATAFORMA DE TRABAJO · ANDAMIOS COLGANTES · TRANSPORTE INTERNO DE ANDAMIOS' },
  APY: { nombre: 'Apoyo Constructivo',     color: '#639922', light: '#EAF3DE',
    desc: 'Soporte directo: recepción de materiales, carguío, transporte interno, ploteo. Presente en todas las OTMs.',
    cuando: 'RECEPCION DE MATERIALES · CARGUIO · TRANSPORTE INTERNO · PLOTEO · APOYO PARA IZAJES' },
  ING: { nombre: 'Ingeniería de Campo',    color: '#D97706', light: '#FEF3C7',
    desc: 'Desarrollo de ingenierías menores, planos y topografía. OTM-0031 es exclusivamente ingeniería.',
    cuando: 'DESARROLLO DE INGENIERIAS · PLANOS MENORES · TOPOGRAFIA · INSPECCION QA/QC' },
  COM: { nombre: 'Pre-comisionado',        color: '#7C3ABD', light: '#EDE9FE',
    desc: 'Comisionado, pruebas funcionales y puesta en marcha. Para proyectos con arranque de equipos.',
    cuando: 'COMISIONADO · PRUEBA DE CALIBRACION · PUESTA EN MARCHA · PRUEBA FUNCIONAL' },
}

const SUBFASES: Record<string, string[]> = {
  FAB: ['FAB.EST — Fabricación de estructuras','FAB.MEC — Fab. componentes mecánicos','FAB.PIN — Arenado y pintura de taller','FAB.ANC — Habilitación de accesorios','FAB.ENS — Ensamble y pre-armado'],
  EST: ['EST.LIG — Montaje estructura ligera','EST.MED — Montaje estructura mediana','EST.PES — Montaje estructura pesada','EST.MOD — Modificación estructuras existentes','EST.SOP — Soportería y fijaciones'],
  MEC: ['MEC.INS — Instalación de equipos','MEC.ALI — Alineamiento y centrado','MEC.GRO — Grouteo y fijación','MEC.PRU — Pruebas mecánicas','MEC.COM — Comisionado mecánico'],
  ELE: ['ELE.BAN — Bandejas y soportes','ELE.CAB — Tendido y conexionado cables','ELE.TAB — Tableros y equipos','ELE.PAT — Puesta a tierra','ELE.ILU — Iluminación'],
  TUB: ['TUB.HAB — Habilitación de tuberías','TUB.MON — Montaje de líneas','TUB.TIN — Tie-In y conexiones','TUB.SUP — Soportería de tuberías','TUB.PRU — Prueba hidrostática'],
  INS: ['INS.INS — Instalación de instrumentos','INS.CAB — Cableado de señales','INS.CAL — Calibración y loop test'],
  CIV: ['CIV.EXC — Excavación','CIV.REL — Relleno y compactación','CIV.CON — Concreto estructural','CIV.ANC — Anclajes y pernos','CIV.DEM — Demolición y corte'],
  AND: ['AND.INS — Instalación y certificación','AND.MOD — Modificación en campo','AND.DES — Desinstalación','AND.TRA — Transporte de andamios'],
  APY: ['APY.REC — Recepción e inspección materiales','APY.CAR — Carguío y descarguío','APY.TRA — Transporte interno','APY.PLO — Ploteo de rutas y camabaja','APY.IZA — Apoyo a izajes'],
  ING: ['ING.DIS — Ingeniería y planos menores','ING.TOP — Topografía y replanteo','ING.INS — Inspección técnica QA/QC'],
  COM: ['COM.PRU — Pruebas funcionales','COM.CAL — Calibración de equipos','COM.PUT — Puesta en marcha'],
}

function BarDisciplina({ fase, hh, total, partidas, otms, active, onClick }: {
  fase: string; hh: number; total: number; partidas: number; otms: string[]
  active: boolean; onClick: () => void
}) {
  const f = FASES[fase]
  if (!f) return null
  const pct = total > 0 ? (hh / total * 100) : 0
  const barW = Math.max(pct * 1.6, 1)

  return (
    <div className={`rounded-xl border transition-all cursor-pointer ${
      active ? 'border-2' : 'border'
    }`}
      style={{ borderColor: active ? f.color : '#252f45', background: active ? f.light+'44' : '#141926' }}
      onClick={onClick}
    >
      <div className="px-4 py-3 flex items-center gap-3">
        <span className="font-mono text-sm font-bold w-10 flex-shrink-0" style={{ color: f.color }}>{fase}</span>
        <div className="flex-1">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium text-k-text">{f.nombre}</span>
            <span className="font-mono text-xs font-bold text-k-green">{hh.toLocaleString('es-PE', {maximumFractionDigits:1})} HH</span>
          </div>
          <div className="h-2.5 bg-k-border rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-700"
              style={{ width: `${barW}%`, background: f.color }} />
          </div>
          <div className="flex items-center justify-between mt-1">
            <span className="text-[10px] text-k-text3">{partidas} partida{partidas !== 1 ? 's' : ''} · {otms.length} OTM{otms.length !== 1 ? 's' : ''}</span>
            <span className="text-[10px] text-k-text3">{pct.toFixed(1)}%</span>
          </div>
        </div>
        <span className="text-k-text3 flex-shrink-0">
          {active ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
      </div>

      {active && (
        <div className="px-4 pb-4 pt-1 border-t border-k-border grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div>
            <p className="text-[10px] font-bold text-k-text3 uppercase tracking-wider mb-2">Sub-fases</p>
            {(SUBFASES[fase] || []).map(sf => (
              <div key={sf} className="flex items-center gap-2 mb-1.5">
                <span className="font-mono text-[11px] font-bold flex-shrink-0" style={{ color: f.color }}>
                  {sf.split(' — ')[0]}
                </span>
                <span className="text-[11px] text-k-text2">{sf.split(' — ')[1]}</span>
              </div>
            ))}
          </div>
          <div>
            <p className="text-[10px] font-bold text-k-text3 uppercase tracking-wider mb-2">Descripción</p>
            <p className="text-[11px] text-k-text2 leading-relaxed mb-3">{f.desc}</p>
            <p className="text-[10px] font-bold text-k-text3 uppercase tracking-wider mb-2">Keywords en el XLS</p>
            <p className="text-[11px] text-k-text3 font-mono">{f.cuando}</p>
            {otms.length > 0 && (
              <>
                <p className="text-[10px] font-bold text-k-text3 uppercase tracking-wider mb-2 mt-3">OTMs</p>
                <div className="flex flex-wrap gap-1">
                  {otms.map(o => (
                    <span key={o} className="font-mono text-[10px] px-2 py-0.5 rounded border border-k-border text-k-text3 bg-k-raised">{o}</span>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function GuiaFases() {
  const [activeFase, setActiveFase] = useState<string | null>(null)

  const { data: partidas = [], isLoading } = useQuery<Partida[]>({
    queryKey: ['ev-partidas-all'],
    queryFn: () => fetch(`${API}/ev/partidas`).then(r => r.json()),
    refetchInterval: 30_000,
  })

  const stats = useMemo(() => {
    const map: Record<string, { hh: number; partidas: number; otms: Set<string> }> = {}
    for (const p of partidas.filter(p => p.activo && p.fase)) {
      if (!map[p.fase]) map[p.fase] = { hh: 0, partidas: 0, otms: new Set() }
      map[p.fase].hh += p.hh_presup || 0
      map[p.fase].partidas++
      if (p.otm_id) map[p.fase].otms.add(p.otm_id)
    }
    return map
  }, [partidas])

  const totalHH   = Object.values(stats).reduce((s, v) => s + v.hh, 0)
  const totalPart = partidas.filter(p => p.activo).length
  const otmsUnicos = [...new Set(partidas.filter(p => p.activo && p.otm_id).map(p => p.otm_id))]

  // Ordenar fases por HH desc, primero las que tienen datos, luego sin datos
  const fasesConDatos    = Object.entries(stats).sort((a, b) => b[1].hh - a[1].hh)
  const fasesSinDatos    = Object.keys(FASES).filter(f => !stats[f])
  const fasesOrdenadas   = [...fasesConDatos.map(([f]) => f), ...fasesSinDatos]

  return (
    <div className="space-y-6">

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'HH presupuestadas', value: isLoading ? '…' : totalHH.toLocaleString('es-PE', {maximumFractionDigits:0}), suffix: 'HH' },
          { label: 'Partidas importadas', value: isLoading ? '…' : String(totalPart), suffix: '' },
          { label: 'OTMs cargadas',       value: isLoading ? '…' : String(otmsUnicos.length), suffix: '' },
        ].map(k => (
          <div key={k.label} className="bg-k-surface border border-k-border rounded-xl p-4">
            <div className="font-mono text-2xl font-medium text-k-amber mb-1">
              {k.value}<span className="text-base text-k-text3 ml-1">{k.suffix}</span>
            </div>
            <div className="text-[10px] text-k-text3 uppercase tracking-wide">{k.label}</div>
          </div>
        ))}
      </div>

      {/* Barra de info */}
      {!isLoading && totalPart === 0 && (
        <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
          <Info size={16} className="text-k-amber mt-0.5 flex-shrink-0" />
          <div className="text-sm text-k-amber2">
            Aún no hay partidas cargadas. Ve a <strong>Valor Ganado → Importar</strong> y sube los archivos XLS del ingeniero de costos con la columna B (Fase) completada.
            El peso por disciplina se actualizará automáticamente.
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

        {/* Peso por disciplina — dinámico */}
        <div className="bg-k-surface border border-k-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-k-border bg-k-raised">
            <h2 className="text-sm font-bold text-k-text">Peso por disciplina</h2>
            <p className="text-[11px] text-k-text3 mt-0.5">
              Se actualiza automáticamente al importar nuevas OTMs · {totalHH > 0 ? `${totalHH.toLocaleString('es-PE',{maximumFractionDigits:0})} HH totales` : 'Sin datos aún'}
            </p>
          </div>
          <div className="p-4 space-y-2">
            {isLoading ? (
              <div className="flex items-center gap-2 py-6 text-k-text3 text-sm">
                <Loader2 size={14} className="animate-spin" /> Cargando partidas...
              </div>
            ) : (
              fasesOrdenadas.map(fase => {
                const d = stats[fase] || { hh: 0, partidas: 0, otms: new Set() }
                return (
                  <BarDisciplina
                    key={fase}
                    fase={fase}
                    hh={d.hh}
                    total={totalHH}
                    partidas={d.partidas}
                    otms={[...d.otms]}
                    active={activeFase === fase}
                    onClick={() => setActiveFase(activeFase === fase ? null : fase)}
                  />
                )
              })
            )}
          </div>
        </div>

        {/* Guía de referencia — estática */}
        <div className="bg-k-surface border border-k-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-k-border bg-k-raised">
            <h2 className="text-sm font-bold text-k-text">Guía de referencia — Estándar Kampfer v1.0</h2>
            <p className="text-[11px] text-k-text3 mt-0.5">
              Cómo llenar la columna B en los archivos XLS del ingeniero de costos
            </p>
          </div>
          <div className="divide-y divide-k-border overflow-y-auto" style={{ maxHeight: 600 }}>
            {Object.entries(FASES).map(([code, f]) => (
              <div key={code} className="px-4 py-3">
                <div className="flex items-center gap-3 mb-1">
                  <span className="font-mono text-sm font-bold w-9 flex-shrink-0" style={{ color: f.color }}>{code}</span>
                  <span className="text-sm font-medium text-k-text">{f.nombre}</span>
                </div>
                <p className="text-[11px] text-k-text3 ml-12 mb-1.5">{f.desc}</p>
                <div className="ml-12">
                  <div className="flex flex-wrap gap-1">
                    {f.cuando.split(' · ').map(kw => (
                      <span key={kw} className="font-mono text-[9px] px-1.5 py-0.5 rounded border border-k-border text-k-text3 bg-k-raised">
                        {kw}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="px-4 py-3 border-t border-k-border bg-k-raised">
            <p className="text-[11px] text-k-text3">
              <span className="text-k-amber font-bold">Recuerda:</span> solo las filas donde la columna B tiene valor se importan como partidas. Los subtotales y nodos padre sin Fase se ignoran.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}