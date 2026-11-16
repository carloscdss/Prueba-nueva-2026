import { useMemo, useState } from 'react';
import { Database, FileCode2, X } from 'lucide-react';
import type { ResultadoValidacionImportar } from '@/src/hooks/useImportar';
import { DEMO_FCC_D6210 } from '@/src/lib/fccDemo';
import { PLANTA_AGUA_M7451 } from '@/src/lib/plantaAguaM7451';

interface ImportadorModalProps {
  abierto: boolean;
  validarJson: (raw: string) => ResultadoValidacionImportar;
  onAplicar: (resultado: ResultadoValidacionImportar, nombre?: string) => void;
  onCerrar: () => void;
}

export function ImportadorModal({
  abierto,
  validarJson,
  onAplicar,
  onCerrar,
}: ImportadorModalProps) {
  const [rawJson, setRawJson] = useState('');

  const resultado = useMemo(() => {
    if (!rawJson.trim()) return null;
    return validarJson(rawJson);
  }, [rawJson, validarJson]);

  if (!abierto) return null;

  const cargarDemoFcc = () => {
    setRawJson(JSON.stringify(DEMO_FCC_D6210, null, 2));
  };

  const cargarPlantaM7451 = () => {
    const serialized = JSON.stringify(PLANTA_AGUA_M7451, null, 2);
    setRawJson(serialized);
    const validado = validarJson(serialized);
    if (validado.valido) {
      onAplicar(validado, PLANTA_AGUA_M7451.nombre);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Importar levantamiento P&ID"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 backdrop-blur-[2px]"
    >
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-slate-800 bg-[#0f1626] text-slate-100 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <div className="flex items-center gap-2">
            <FileCode2 className="h-4 w-4 text-sky-400" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-slate-100">
              Importar Levantamiento As-Built (JSON P&amp;ID)
            </h2>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar importador"
            className="inline-flex min-h-[38px] min-w-[38px] items-center justify-center rounded-md text-slate-400 hover:bg-slate-800 hover:text-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-slate-400">
              Pega el JSON normalizado (con <code className="font-mono text-slate-300">equipos[]</code> y{' '}
              <code className="font-mono text-slate-300">conexiones[]</code>) o carga una planta de ingeniería.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={cargarPlantaM7451}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-md bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-500"
              >
                <Database className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Cargar Planta Agua M-7451</span>
              </button>
              <button
                type="button"
                onClick={cargarDemoFcc}
                className="min-h-[38px] rounded-md border border-slate-700 bg-slate-900 px-3 text-xs font-medium text-sky-300 hover:bg-slate-800"
              >
                Cargar Demo FCC D-6210
              </button>
            </div>
          </div>

          <textarea
            value={rawJson}
            onChange={(e) => setRawJson(e.target.value)}
            rows={8}
            placeholder='{"nombre": "...", "equipos": [...], "conexiones": [...]}'
            className="w-full rounded-md border border-slate-800 bg-[#090d16] p-3 font-mono text-xs text-slate-200 placeholder:text-slate-600 focus:border-sky-500 focus:outline-none"
          />

          {resultado?.errorSyntax && (
            <div className="rounded-md border border-rose-800/70 bg-rose-950/40 p-3 text-xs text-rose-200">
              Error de sintaxis: {resultado.errorSyntax}
            </div>
          )}

          {resultado && resultado.items.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400 tabular-nums">
                <span>Validación contra manifest.json</span>
                <span>
                  {resultado.equiposNormalizados.length} equipos ·{' '}
                  {resultado.conexionesNormalizadas.length} conexiones
                  {resultado.lazosDetectados
                    ? ` · ${resultado.lazosDetectados.length} lazos PLC`
                    : ''}
                </span>
              </div>

              <div className="max-h-48 divide-y divide-slate-800/70 overflow-y-auto rounded-md border border-slate-800 bg-[#090d16]">
                {resultado.items.map((item, idx) => (
                  <div
                    key={`${item.tag}-${idx}`}
                    className="flex items-center justify-between gap-3 px-3 py-2 text-xs"
                  >
                    <div className="min-w-0 truncate">
                      <span className="font-mono font-semibold text-slate-100">{item.tag}</span>
                      <span className="mx-1.5 text-slate-600">·</span>
                      <span className="font-mono text-slate-400">{item.descriptorId}</span>
                    </div>
                    <span
                      className={`shrink-0 text-xs font-medium ${
                        item.estado === 'ok'
                          ? 'text-emerald-400'
                          : item.estado === 'advertencia'
                          ? 'text-amber-400'
                          : 'text-rose-400'
                      }`}
                    >
                      {item.detalle}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-800 px-4 py-3">
          <button
            type="button"
            onClick={onCerrar}
            className="min-h-[40px] rounded-md border border-slate-700 bg-slate-900 px-4 text-xs font-medium text-slate-300 hover:bg-slate-800"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!resultado?.valido}
            onClick={() => resultado && onAplicar(resultado)}
            className="min-h-[40px] rounded-md bg-sky-600 px-4 text-xs font-semibold text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Aplicar a Planta
          </button>
        </div>
      </div>
    </div>
  );
}
