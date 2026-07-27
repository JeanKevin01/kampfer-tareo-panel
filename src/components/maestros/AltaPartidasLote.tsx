// ── Alta de VARIAS partidas de una vez ───────────────────────
// Encargo de Jean: «si se le olvidaron 4 partidas, este proceso es tedioso».
// Crear una por una el formulario completo son 4 × 6 campos. Aquí se pegan
// directamente desde el Excel del presupuesto (una fila por partida) y se
// crean todas juntas.
//
// Reutiliza POST /ev/importar, que ya hace upsert por (código, OTM), calcula
// nivel/parent_codigo y crea el hito «Ejecución» silencioso. Es el mismo camino
// del importador de Excel, sin pedir un archivo.
import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'

import { api } from '@/lib/api'

const inputCls = 'bg-k-raised border border-k-border rounded-lg px-2.5 py-2 text-sm text-k-text outline-none focus:border-k-amber w-full'

interface Fila {
  codigo: string; descripcion: string; unidad: string
  metrado: number; hh: number; error?: string
}

/** Una fila pegada desde Excel: CÓDIGO ⇥ DESCRIPCIÓN ⇥ UND ⇥ METRADO ⇥ HH.
 *  Se acepta ; o , como separador para quien copie de un CSV. */
function parsearFilas(texto: string): Fila[] {
  const lineas = texto.split('\n').map(l => l.trim()).filter(Boolean)
  const out: Fila[] = []
  const vistos = new Set<string>()
  for (const [i, linea] of lineas.entries()) {
    const sep = linea.includes('\t') ? '\t' : linea.includes(';') ? ';' : ','
    const c = linea.split(sep).map(x => x.trim())
    // Cabecera pegada sin querer: se salta en silencio.
    if (i === 0 && /c[oó]digo|codigo/i.test(c[0] ?? '')) continue
    const [codigo = '', descripcion = '', unidad = '', met = '', hh = ''] = c
    const num = (v: string) => Number(String(v).replace(/\s/g, '').replace(',', '.'))
    const fila: Fila = {
      codigo, descripcion, unidad,
      metrado: num(met) || 0, hh: num(hh) || 0,
    }
    if (!codigo) fila.error = 'sin código'
    else if (vistos.has(codigo.toUpperCase())) fila.error = 'código repetido en la lista'
    else if (!descripcion) fila.error = 'sin descripción'
    else if (met && !Number.isFinite(num(met))) fila.error = 'metrado no numérico'
    else if (hh && !Number.isFinite(num(hh))) fila.error = 'HH no numéricas'
    vistos.add(codigo.toUpperCase())
    out.push(fila)
  }
  return out
}

export default function AltaPartidasLote({ otmId, padres, onListo, onCancelar }: {
  otmId: string | null
  padres: { id: number; codigo: string; descripcion?: string }[]
  onListo: (n: number) => void
  onCancelar: () => void
}) {
  const [texto, setTexto] = useState('')
  const [fase, setFase] = useState('')
  const [parent, setParent] = useState('')
  const [naturaleza, setNaturaleza] = useState<'CONTRACTUAL' | 'ADICIONAL'>('CONTRACTUAL')
  const [err, setErr] = useState('')

  const fases = useQuery<{ codigo: string; nombre: string }[]>({
    queryKey: ['fases-catalogo'],
    queryFn: () => api('/ev/fases?proyecto_id=1'),
  })
  const filas = parsearFilas(texto)
  const validas = filas.filter(f => !f.error)
  const conError = filas.filter(f => f.error)
  const sinHH = naturaleza === 'CONTRACTUAL' && validas.some(f => f.hh <= 0)

  // OJO: el importador responde partidas_creadas / partidas_actualizadas, y
  // los errores de fila viajan como 400 (los recoge onError, no onSuccess).
  const crear = useMutation({
    mutationFn: () => api<{ partidas_creadas: number; partidas_actualizadas: number }>('/ev/importar', {
      method: 'POST',
      body: JSON.stringify({
        partidas: validas.map(f => ({
          codigo: f.codigo, otm_id: otmId, fase: fase.trim() || null,
          descripcion: f.descripcion, unidad: f.unidad || 'und',
          metrado_presup: f.metrado, hh_presup: f.hh,
          naturaleza, parent_codigo: parent || null,
        })),
      }),
    }),
    onSuccess: r => onListo((r.partidas_creadas ?? 0) + (r.partidas_actualizadas ?? 0)),
    onError: (e: Error) => setErr(e.message),
  })

  return (
    <div className="rounded-lg border border-k-border bg-k-raised/40 px-3 py-2.5 space-y-2">
      <p className="text-[11px] font-bold text-k-text">Pegar varias partidas desde Excel</p>
      <p className="text-[10px] text-k-text3">
        Una fila por partida, en este orden:
        <b> CÓDIGO · DESCRIPCIÓN · UND · METRADO · HH</b>. Copia las celdas del presupuesto y
        pégalas aquí tal cual — si copias también la fila de títulos, se ignora.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <select value={fase} onChange={e => setFase(e.target.value)} className={inputCls}
          title="Fase común a todas: es la clave con la que el RO cruza costo y meta">
          <option value="">Fase de todas…</option>
          {(fases.data ?? []).map(f => (
            <option key={f.codigo} value={f.codigo}>{f.codigo} — {f.nombre}</option>
          ))}
        </select>
        <select value={parent} onChange={e => setParent(e.target.value)} className={inputCls}
          title="De qué partida cuelgan en el árbol de Valor Ganado">
          <option value="">Cuelgan de… (raíz del WBS)</option>
          {padres.map(p => (
            <option key={p.id} value={p.codigo}>{p.codigo} — {(p.descripcion ?? '').slice(0, 30)}</option>
          ))}
        </select>
      </div>
      <div className="flex gap-1.5">
        {([['CONTRACTUAL', 'Olvidadas del presupuesto'], ['ADICIONAL', 'Adicionales']] as const).map(([v, l]) => (
          <button key={v} onClick={() => setNaturaleza(v)}
            className={`flex-1 text-[10px] font-bold py-1.5 rounded-lg border ${
              naturaleza === v
                ? (v === 'ADICIONAL' ? 'border-red-500/60 bg-red-500/15 text-k-red' : 'border-k-amber/60 bg-k-amber/15 text-k-amber')
                : 'border-k-border text-k-text3 hover:bg-k-raised'}`}>
            {l}
          </button>
        ))}
      </div>
      <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={6}
        placeholder={'02.01.05\tRelleno y compactación Z9\tm3\t800\t1200\n02.01.06\tPerfilado de talud\tm2\t450\t300'}
        className={`${inputCls} font-mono text-[11px]`} />

      {filas.length > 0 && (
        <div className="rounded-lg border border-k-border overflow-hidden">
          <div className="max-h-40 overflow-y-auto">
            <table className="w-full text-[10px]">
              <thead className="bg-k-raised">
                <tr>{['Código', 'Descripción', 'Und', 'Metrado', 'HH', ''].map(h => (
                  <th key={h} className="px-2 py-1 text-left font-bold text-k-text3 uppercase">{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {filas.map((f, i) => (
                  <tr key={i} className={`border-t border-k-border ${f.error ? 'bg-red-500/10' : ''}`}>
                    <td className="px-2 py-1 font-mono text-k-text">{f.codigo || '—'}</td>
                    <td className="px-2 py-1 text-k-text2 max-w-[160px] truncate">{f.descripcion || '—'}</td>
                    <td className="px-2 py-1 text-k-text3">{f.unidad || 'und'}</td>
                    <td className="px-2 py-1 text-right font-mono text-k-text2">{f.metrado || '—'}</td>
                    <td className={`px-2 py-1 text-right font-mono ${f.hh > 0 ? 'text-k-text2' : 'text-k-amber'}`}>
                      {f.hh || '—'}
                    </td>
                    <td className="px-2 py-1 text-k-red">{f.error ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {sinHH && (
        <p className="text-[10px] text-k-amber">
          ⚠ Hay partidas contractuales <b>sin HH</b>: quedarán marcadas en rojo hasta que las
          cargues, porque una partida sin HH gasta horas sin poder ganar ninguna.
        </p>
      )}
      {conError.length > 0 && (
        <p className="text-[10px] text-k-red">{conError.length} fila(s) con problemas: se omiten.</p>
      )}
      {err && <p className="text-k-red text-xs">{err}</p>}
      <div className="flex gap-2">
        <button onClick={() => crear.mutate()} disabled={!validas.length || !fase.trim() || crear.isPending}
          title={!fase.trim() ? 'Elige la fase' : undefined}
          className="flex-1 bg-k-amber text-black font-bold text-xs py-2 rounded-lg disabled:opacity-40 flex items-center justify-center gap-1.5">
          {crear.isPending && <Loader2 size={12} className="animate-spin" />}
          {crear.isPending ? 'Creando…' : `Crear ${validas.length || ''} partida(s)`}
        </button>
        <button onClick={onCancelar}
          className="px-3 text-xs rounded-lg border border-k-border text-k-text2 hover:bg-k-raised">
          Cancelar
        </button>
      </div>
    </div>
  )
}
