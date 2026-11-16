import { useState } from 'react';
import { AlertTriangle, Plus, RotateCcw, ShieldCheck, Zap } from 'lucide-react';
import type { AlarmaHMI, LazoControl, ReglaPLC } from '@/src/lib/plc';

interface PanelHMIProps {
  lazos: LazoControl[];
  reglas: ReglaPLC[];
  alarmas: AlarmaHMI[];
  historialesPV: Record<string, number[]>;
  bombeoActivo: boolean;
  onCambiarModo: (id: string, modo: 'AUTO' | 'MANUAL') => void;
  onCambiarSetpoint: (id: string, sp: number) => void;
  onCambiarOutputManual: (id: string, op: number) => void;
  onToggleRegla: (id: string) => void;
  onAgregarRegla: (nueva: Omit<ReglaPLC, 'id' | 'disparada'>) => void;
  onReconocerAlarma: (id: string) => void;
  onInyectarNivelAlto: () => void;
  onRestablecerProceso: () => void;
}

export function PanelHMI({
  lazos,
  reglas,
  alarmas,
  historialesPV,
  bombeoActivo,
  onCambiarModo,
  onCambiarSetpoint,
  onCambiarOutputManual,
  onToggleRegla,
  onAgregarRegla,
  onReconocerAlarma,
  onInyectarNivelAlto,
  onRestablecerProceso,
}: PanelHMIProps) {
  const [mostrarFormRegla, setMostrarFormRegla] = useState(false);
  const [nombreRegla, setNombreRegla] = useState('Interlock Presión Alta');
  const [tagSensor, setTagSensor] = useState('D-6210');
  const [parametro, setParametro] = useState<'nivel' | 'presion'>('nivel');
  const [umbral, setUmbral] = useState(85);
  const [tagActuador, setTagActuador] = useState('LV-16');

  const manejarCrearRegla = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombreRegla.trim() || !tagSensor.trim() || !tagActuador.trim()) return;
    onAgregarRegla({
      nombre: nombreRegla.trim(),
      habilitada: true,
      tagSensor: tagSensor.trim().toUpperCase(),
      parametro,
      umbral: Number(umbral) || 85,
      tagActuador: tagActuador.trim().toUpperCase(),
      accionAbierta: false,
    });
    setMostrarFormRegla(false);
  };

  return (
    <main className="min-h-0 flex-1 overflow-auto bg-[#090d16] p-4 sm:p-6">
      <div className="mx-auto max-w-5xl space-y-6 pb-8">
        {/* Cabecera y botones de prueba de escenario PLC */}
        <div className="flex flex-col gap-3 border-b border-slate-800 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-base font-semibold text-slate-100">
              Operación HMI y Lazos de Control PLC
            </h1>
            <p className="text-xs text-slate-400">
              Controladores PID y enclavamientos vinculados al modelo 3D ·{' '}
              <span className={bombeoActivo ? 'text-emerald-400' : 'text-slate-400'}>
                {bombeoActivo ? 'Lazo en ejecución continua' : 'En espera (inicia flujo para PID)'}
              </span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onInyectarNivelAlto}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md border border-amber-700/70 bg-amber-950/60 px-3 text-xs font-semibold text-amber-200 transition-colors hover:bg-amber-900/60"
            >
              <Zap className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
              <span>Simular Nivel Alto (91%)</span>
            </button>
            <button
              type="button"
              onClick={onRestablecerProceso}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900 px-3 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-800"
            >
              <RotateCcw className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
              <span>Restablecer</span>
            </button>
          </div>
        </div>

        {/* Caras de lazo ISA-101 */}
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {lazos.map((lazo) => {
            const puntos = historialesPV[lazo.id] ?? [lazo.pv, lazo.pv];
            const ancho = 260;
            const alto = 56;
            const d = puntos
              .map((val, idx) => {
                const x = (idx / Math.max(1, puntos.length - 1)) * ancho;
                const y = alto - (Math.max(0, Math.min(100, val)) / 100) * alto;
                return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
              })
              .join(' ');
            const ySp = alto - (Math.max(0, Math.min(100, lazo.sp)) / 100) * alto;

            return (
              <div
                key={lazo.id}
                className="flex flex-col gap-3 rounded-lg border border-slate-800 bg-[#0f1626] p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h2 className="font-mono text-base font-semibold text-slate-100">
                      {lazo.tag}
                    </h2>
                    <p className="font-mono text-[11px] text-slate-400">
                      {lazo.tipo} · PV {lazo.instrumentoPV} → OP {lazo.instrumentoOP}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      onCambiarModo(lazo.id, lazo.modo === 'AUTO' ? 'MANUAL' : 'AUTO')
                    }
                    className={`min-h-[44px] rounded-md border px-3.5 font-mono text-xs font-semibold transition-colors ${
                      lazo.modo === 'AUTO'
                        ? 'border-sky-600/70 bg-sky-950/60 text-sky-200 hover:bg-sky-900/60'
                        : 'border-amber-600/70 bg-amber-950/60 text-amber-200 hover:bg-amber-900/60'
                    }`}
                  >
                    {lazo.modo}
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-3 border-t border-slate-800 pt-3 font-mono">
                  <div>
                    <div className="text-[11px] text-slate-400">PV</div>
                    <div className="text-lg font-semibold text-sky-400 tabular-nums">
                      {lazo.pv.toFixed(1)}%
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-400">SP</div>
                    <div className="text-lg font-semibold text-amber-300 tabular-nums">
                      {lazo.sp.toFixed(1)}%
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-400">OP</div>
                    <div className="text-lg font-semibold text-emerald-400 tabular-nums">
                      {lazo.op.toFixed(0)}%
                    </div>
                  </div>
                </div>

                <svg
                  viewBox={`0 0 ${ancho} ${alto}`}
                  className="h-14 w-full rounded border border-slate-800 bg-[#090d16]"
                >
                  <line
                    x1={0}
                    y1={ySp}
                    x2={ancho}
                    y2={ySp}
                    stroke="#f59e0b"
                    strokeDasharray="4 3"
                    strokeWidth="1"
                  />
                  <path d={d} fill="none" stroke="#38bdf8" strokeWidth="2" />
                </svg>

                <div className="space-y-2 border-t border-slate-800 pt-3">
                  <label className="flex items-center justify-between text-xs text-slate-300">
                    <span>Setpoint (SP)</span>
                    <span className="font-mono tabular-nums">{lazo.sp}%</span>
                  </label>
                  <input
                    type="range"
                    min={10}
                    max={95}
                    value={lazo.sp}
                    onChange={(e) => onCambiarSetpoint(lazo.id, Number(e.target.value))}
                    className="h-7 w-full accent-amber-400"
                  />

                  {lazo.modo === 'MANUAL' && (
                    <>
                      <label className="flex items-center justify-between text-xs text-slate-300">
                        <span>Salida Manual (OP)</span>
                        <span className="font-mono tabular-nums">{lazo.op}%</span>
                      </label>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={lazo.op}
                        onChange={(e) => onCambiarOutputManual(lazo.id, Number(e.target.value))}
                        className="h-7 w-full accent-emerald-400"
                      />
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </section>

        {/* Reglas de Enclavamiento PLC (Interlocks) */}
        <section className="rounded-lg border border-slate-800 bg-[#0f1626] p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-sky-400" aria-hidden="true" />
              <h2 className="text-xs font-semibold text-slate-200">
                Reglas PLC / Enclavamientos (Interlocks)
              </h2>
            </div>

            <button
              type="button"
              onClick={() => setMostrarFormRegla((prev) => !prev)}
              className="inline-flex min-h-[38px] items-center gap-1 rounded-md border border-slate-700 bg-slate-900 px-3 text-xs font-medium text-slate-200 hover:bg-slate-800"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{mostrarFormRegla ? 'Cancelar' : 'Nueva regla'}</span>
            </button>
          </div>

          {mostrarFormRegla && (
            <form
              onSubmit={manejarCrearRegla}
              className="mb-4 grid grid-cols-1 gap-2 rounded-md border border-slate-800 bg-[#090d16] p-3 sm:grid-cols-6"
            >
              <input
                type="text"
                value={nombreRegla}
                onChange={(e) => setNombreRegla(e.target.value)}
                placeholder="Nombre del interlock"
                className="min-h-[40px] rounded border border-slate-700 bg-slate-900 px-2.5 text-xs text-slate-100 sm:col-span-2"
              />
              <input
                type="text"
                value={tagSensor}
                onChange={(e) => setTagSensor(e.target.value)}
                placeholder="Sensor (ej. D-6210)"
                className="min-h-[40px] rounded border border-slate-700 bg-slate-900 px-2.5 font-mono text-xs text-slate-100"
              />
              <select
                value={parametro}
                onChange={(e) => setParametro(e.target.value as 'nivel' | 'presion')}
                className="min-h-[40px] rounded border border-slate-700 bg-slate-900 px-2 text-xs text-slate-100"
              >
                <option value="nivel">Nivel (%)</option>
                <option value="presion">Presión (bar)</option>
              </select>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  value={umbral}
                  onChange={(e) => setUmbral(Number(e.target.value))}
                  aria-label="Umbral"
                  className="min-h-[40px] w-full rounded border border-slate-700 bg-slate-900 px-2.5 font-mono text-xs text-slate-100"
                />
                <input
                  type="text"
                  value={tagActuador}
                  onChange={(e) => setTagActuador(e.target.value)}
                  placeholder="Actuador"
                  className="min-h-[40px] w-full rounded border border-slate-700 bg-slate-900 px-2 font-mono text-xs text-slate-100"
                />
              </div>
              <button
                type="submit"
                className="min-h-[40px] rounded bg-sky-600 px-3 text-xs font-semibold text-white hover:bg-sky-500"
              >
                Guardar regla
              </button>
            </form>
          )}

          <div className="divide-y divide-slate-800">
            {reglas.map((regla) => (
              <div
                key={regla.id}
                className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-100">
                    <span>{regla.nombre}</span>
                    <span
                      className={`font-mono text-[11px] font-semibold ${
                        !regla.habilitada
                          ? 'text-slate-500'
                          : regla.disparada
                          ? 'text-rose-400'
                          : 'text-emerald-400'
                      }`}
                    >
                      {!regla.habilitada
                        ? 'PAUSADA'
                        : regla.disparada
                        ? 'DISPARADA'
                        : 'ARMADA'}
                    </span>
                  </div>
                  <p className="mt-0.5 font-mono text-[11px] text-slate-400">
                    SI {regla.tagSensor}.{regla.parametro} &gt; {regla.umbral} → {regla.tagActuador}{' '}
                    {regla.accionAbierta ? 'ABRIR' : 'CERRAR'}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => onToggleRegla(regla.id)}
                  className={`min-h-[40px] shrink-0 rounded-md border px-3 text-xs font-medium transition-colors ${
                    regla.habilitada
                      ? 'border-emerald-700/60 bg-emerald-950/40 text-emerald-200 hover:bg-emerald-900/50'
                      : 'border-slate-700 bg-slate-900 text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  {regla.habilitada ? 'Habilitada' : 'Deshabilitada'}
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Cola de alarmas */}
        <section className="rounded-lg border border-slate-800 bg-[#0f1626] p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-rose-400" aria-hidden="true" />
              <h2 className="text-xs font-semibold text-slate-200">
                Registro de Alarmas de Proceso
              </h2>
            </div>
            <span className="font-mono text-xs text-slate-400 tabular-nums">
              {alarmas.filter((a) => !a.reconocida).length} activas
            </span>
          </div>

          {alarmas.length === 0 ? (
            <p className="text-xs text-slate-500">
              Sin alarmas activas. Inicia el flujo o pulsa &ldquo;Simular Nivel Alto (91%)&rdquo; para validar la respuesta automática del PLC.
            </p>
          ) : (
            <div className="divide-y divide-slate-800">
              {alarmas.map((alm) => (
                <div
                  key={alm.id}
                  className={`flex flex-col gap-2 py-2.5 text-xs sm:flex-row sm:items-center sm:justify-between ${
                    alm.reconocida ? 'opacity-50' : ''
                  }`}
                >
                  <div className="min-w-0">
                    <span className="font-mono font-semibold text-rose-400">{alm.tag}</span>
                    <span className="mx-2 text-slate-600">·</span>
                    <span className="text-slate-200">{alm.mensaje}</span>
                  </div>
                  {!alm.reconocida && (
                    <button
                      type="button"
                      onClick={() => onReconocerAlarma(alm.id)}
                      className="min-h-[40px] shrink-0 rounded border border-slate-700 bg-slate-900 px-3 text-xs font-medium text-slate-200 hover:bg-slate-800"
                    >
                      Reconocer
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
