import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, ChevronDown, ChevronRight, Info, Plus, BookOpen, Database } from 'lucide-react'

import { API_BASE, api } from '@/lib/api'
import type { Fase as FaseCat } from '@/lib/catalogos'
const API = API_BASE
const PROYECTO_ID = 1

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

// ── Tab "Catálogo del proyecto": CRUD de la tabla `fases` del API ──
const inputCat = 'bg-k-raised border border-k-border rounded px-2 py-1 text-xs text-k-text outline-none focus:border-k-amber'

function CatalogoFases() {
  const qc = useQueryClient()
  const [nueva, setNueva] = useState({ codigo: '', nombre: '', color: '#D97706' })
  const [error, setError] = useState('')

  const fases = useQuery<FaseCat[]>({
    queryKey: ['fases', 'todas'],
    queryFn: () => api(`/ev/fases?proyecto_id=${PROYECTO_ID}&incluir_inactivas=true`),
  })

  const invalidar = () => { qc.invalidateQueries({ queryKey: ['fases'] }); setError('') }

  const crear = useMutation({
    mutationFn: () => api('/ev/fases', {
      method: 'POST', body: JSON.stringify({ proyecto_id: PROYECTO_ID, ...nueva }),
    }),
    onSuccess: () => { invalidar(); setNueva({ codigo: '', nombre: '', color: '#D97706' }) },
    onError: (e: Error) => setError(e.message),
  })
  const editar = useMutation({
    mutationFn: ({ id, ...campos }: { id: number } & Partial<FaseCat>) =>
      api(`/ev/fases/${id}`, { method: 'PUT', body: JSON.stringify(campos) }),
    onSuccess: invalidar,
    onError: (e: Error) => setError(e.message),
  })

  return (
    <div className="bg-k-surface border border-k-border rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-k-border bg-k-raised">
        <h2 className="text-sm font-bold text-k-text">Catálogo de fases del proyecto</h2>
        <p className="text-[11px] text-k-text3 mt-0.5">
          Estas fases alimentan los desplegables (Costos, importadores) y los nombres del Resultado Operativo.
          El código no se puede cambiar después de creado; una fase que ya no aplica se desactiva.
        </p>
      </div>

      {/* Alta */}
      <div className="px-4 py-3 border-b border-k-border flex flex-wrap items-center gap-2">
        <input placeholder="Código (ej. 11 o CIV)" value={nueva.codigo}
          onChange={e => setNueva({ ...nueva, codigo: e.target.value })} className={`${inputCat} w-36`} />
        <input placeholder="Nombre (ej. Obras civiles)" value={nueva.nombre}
          onChange={e => setNueva({ ...nueva, nombre: e.target.value })} className={`${inputCat} w-64`} />
        <input type="color" value={nueva.color} title="Color"
          onChange={e => setNueva({ ...nueva, color: e.target.value })}
          className="w-8 h-7 rounded border border-k-border bg-k-raised cursor-pointer" />
        <button onClick={() => crear.mutate()} disabled={crear.isPending || !nueva.codigo.trim() || !nueva.nombre.trim()}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-k-amber text-black font-bold disabled:opacity-40">
          <Plus size={12} /> Agregar fase
        </button>
        {error && <span className="text-k-red text-xs">{error}</span>}
      </div>

      {/* Tabla */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[10px] uppercase text-k-text3 border-b border-k-border">
              <th className="text-left px-4 py-2">Código</th>
              <th className="text-left px-3 py-2">Nombre</th>
              <th className="text-left px-3 py-2">Color</th>
              <th className="text-left px-3 py-2">Orden</th>
              <th className="text-left px-3 py-2">Activa</th>
            </tr>
          </thead>
          <tbody>
            {(fases.data ?? []).map(f => (
              <tr key={f.id} className={`border-b border-k-border/40 ${f.activo ? '' : 'opacity-45'}`}>
                <td className="px-4 py-1.5 font-mono font-bold" style={{ color: f.color || undefined }}>{f.codigo}</td>
                <td className="px-3 py-1.5">
                  <input defaultValue={f.nombre} className={`${inputCat} w-72`}
                    onBlur={e => { const v = e.target.value.trim(); if (v && v !== f.nombre) editar.mutate({ id: f.id, nombre: v }) }} />
                </td>
                <td className="px-3 py-1.5">
                  <input type="color" defaultValue={f.color || '#888780'}
                    onBlur={e => { if (e.target.value !== f.color) editar.mutate({ id: f.id, color: e.target.value }) }}
                    className="w-8 h-6 rounded border border-k-border bg-k-raised cursor-pointer" />
                </td>
                <td className="px-3 py-1.5">
                  <input type="number" defaultValue={f.orden} className={`${inputCat} w-16`}
                    onBlur={e => { const v = Number(e.target.value); if (v !== f.orden) editar.mutate({ id: f.id, orden: v }) }} />
                </td>
                <td className="px-3 py-1.5">
                  <input type="checkbox" checked={f.activo} className="accent-amber-500 cursor-pointer"
                    onChange={e => editar.mutate({ id: f.id, activo: e.target.checked })} />
                </td>
              </tr>
            ))}
            {fases.isLoading && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-k-text3">
                <Loader2 size={14} className="animate-spin inline mr-2" />Cargando catálogo…
              </td></tr>
            )}
            {!fases.isLoading && (fases.data ?? []).length === 0 && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-k-text3">
                Catálogo vacío (aplica la migración 0018 en el API).
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function GuiaFases() {
  const [activeFase, setActiveFase] = useState<string | null>(null)
  const [tab, setTab] = useState<'guia' | 'catalogo'>('guia')

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

      {/* Tabs: guía de referencia vs catálogo editable */}
      <div className="flex gap-2">
        {([['guia', 'Guía de referencia', BookOpen], ['catalogo', 'Catálogo del proyecto', Database]] as const).map(([k, l, Icon]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border font-medium ${
              tab === k ? 'border-k-amber bg-amber-500/10 text-k-amber' : 'border-k-border text-k-text2 hover:bg-k-raised'}`}>
            <Icon size={14} /> {l}
          </button>
        ))}
      </div>

      {tab === 'catalogo' && <CatalogoFases />}

      {tab === 'guia' && <>
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
      </>}
    </div>
  )
}