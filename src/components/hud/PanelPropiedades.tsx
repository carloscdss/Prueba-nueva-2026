import { RotateCw, SlidersHorizontal, Trash2, X } from 'lucide-react';
import {
  type Descriptor,
  type EquipoEnEscena,
  familiaDe,
  getDescriptor,
} from '@/src/lib/catalogo';

interface PanelPropiedadesProps {
  equipo: EquipoEnEscena | null;
  catalogo: Descriptor[];
  bombeoActivo: boolean;
  onDeseleccionar: () => void;
  onMover: (uuid: string, dx: number, dz: number) => void;
  onRotar: (uuid: string) => void;
  onToggleValvula: (uuid: string) => void;
  onEliminar: (uuid: string) => void;
}

export function PanelPropiedades({
  equipo,
  catalogo,
  bombeoActivo,
  onDeseleccionar,
  onMover,
  onRotar,
  onToggleValvula,
  onEliminar,
}: PanelPropiedadesProps) {
  const descriptor = equipo ? getDescriptor(equipo.descriptorId, catalogo) : undefined;
  const familia = equipo ? familiaDe(equipo.descriptorId) : '';
  const grados = equipo ? Math.round(((equipo.rotacionY * 180) / Math.PI) % 360) : 0;

  const cuerpo = !equipo ? (
    <div className="flex h-full flex-col items-center justify-center p-6 text-center">
      <SlidersHorizontal className="mb-3 h-6 w-6 text-slate-600" aria-hidden="true" />
      <h2 className="text-sm font-semibold text-slate-200">Inspector de Propiedades</h2>
      <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
        Selecciona un equipo en el plano para inspeccionar sus coordenadas, orientación y variables de proceso.
      </p>
    </div>
  ) : (
    <div className="flex h-full flex-col overflow-y-auto bg-[#0f1626] text-slate-100">
      <div className="flex items-start justify-between gap-3 border-b border-slate-800 px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="font-mono text-base font-semibold tracking-tight text-slate-100 tabular-nums">
              {equipo.tag}
            </h2>
          </div>
          <p className="mt-0.5 truncate text-xs text-slate-400">
            {descriptor?.nombre ?? equipo.descriptorId} · {familia}
          </p>
        </div>

        <button
          type="button"
          onClick={onDeseleccionar}
          aria-label="Cerrar inspector"
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-slate-400 hover:bg-slate-800 hover:text-slate-100 lg:hidden"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Variables de proceso en tiempo real */}
      <div className="border-b border-slate-800 p-4">
        <div className="mb-2.5 flex items-center justify-between">
          <span className="text-xs font-medium text-slate-400">Variables de proceso</span>
          <span
            className={`text-xs font-medium ${
              bombeoActivo ? 'text-emerald-400' : 'text-slate-500'
            }`}
          >
            {bombeoActivo ? 'En operación' : 'En espera'}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="border-t border-slate-800 pt-2">
            <div className="text-[11px] text-slate-400">Nivel</div>
            <div className="mt-0.5 font-mono text-sm font-semibold text-slate-100 tabular-nums">
              {equipo.nivel.toFixed(1)}
              <span className="ml-1 text-xs font-normal text-slate-400">%</span>
            </div>
          </div>
          <div className="border-t border-slate-800 pt-2">
            <div className="text-[11px] text-slate-400">Presión</div>
            <div className="mt-0.5 font-mono text-sm font-semibold text-slate-100 tabular-nums">
              {equipo.presion.toFixed(2)}
              <span className="ml-1 text-xs font-normal text-slate-400">bar</span>
            </div>
          </div>
          <div className="border-t border-slate-800 pt-2">
            <div className="text-[11px] text-slate-400">Flujo</div>
            <div className="mt-0.5 font-mono text-sm font-semibold text-slate-100 tabular-nums">
              {equipo.flujo.toFixed(1)}
              <span className="ml-1 text-xs font-normal text-slate-400">m³/h</span>
            </div>
          </div>
          <div className="border-t border-slate-800 pt-2">
            <div className="text-[11px] text-slate-400">Orientación</div>
            <div className="mt-0.5 font-mono text-sm font-semibold text-slate-100 tabular-nums">
              {grados}°
            </div>
          </div>
        </div>
      </div>

      {/* Posición y orientación */}
      <div className="space-y-3 border-b border-slate-800 p-4">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-slate-400">Coordenadas (m)</span>
          <span className="font-mono text-slate-200 tabular-nums">
            X {equipo.posicion[0].toFixed(1)} · Z {equipo.posicion[2].toFixed(1)}
          </span>
        </div>

        <div className="grid grid-cols-4 gap-1.5">
          <button
            type="button"
            onClick={() => onMover(equipo.uuid, -0.5, 0)}
            className="min-h-[44px] rounded-md border border-slate-800 bg-slate-900 font-mono text-xs text-slate-200 hover:bg-slate-800"
          >
            X −
          </button>
          <button
            type="button"
            onClick={() => onMover(equipo.uuid, 0.5, 0)}
            className="min-h-[44px] rounded-md border border-slate-800 bg-slate-900 font-mono text-xs text-slate-200 hover:bg-slate-800"
          >
            X +
          </button>
          <button
            type="button"
            onClick={() => onMover(equipo.uuid, 0, -0.5)}
            className="min-h-[44px] rounded-md border border-slate-800 bg-slate-900 font-mono text-xs text-slate-200 hover:bg-slate-800"
          >
            Z −
          </button>
          <button
            type="button"
            onClick={() => onMover(equipo.uuid, 0, 0.5)}
            className="min-h-[44px] rounded-md border border-slate-800 bg-slate-900 font-mono text-xs text-slate-200 hover:bg-slate-800"
          >
            Z +
          </button>
        </div>

        {familia === 'valvula' && (
          <button
            type="button"
            onClick={() => onToggleValvula(equipo.uuid)}
            className={`min-h-[44px] w-full rounded-md border px-3 py-2 text-xs font-semibold transition-colors ${
              equipo.abierta
                ? 'border-emerald-700/60 bg-emerald-950/50 text-emerald-200 hover:bg-emerald-900/50'
                : 'border-amber-700/60 bg-amber-950/50 text-amber-200 hover:bg-amber-900/50'
            }`}
          >
            Válvula: {equipo.abierta ? 'Abierta (Pasar a cerrada)' : 'Cerrada (Pasar a abierta)'}
          </button>
        )}
      </div>

      {/* Acciones principales */}
      <div className="mt-auto grid grid-cols-2 gap-2 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={() => onRotar(equipo.uuid)}
          className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-sky-500"
        >
          <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Rotar 90°</span>
        </button>

        <button
          type="button"
          onClick={() => onEliminar(equipo.uuid)}
          className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-md border border-rose-800/70 bg-rose-950/40 px-3 py-2 text-xs font-medium text-rose-200 hover:bg-rose-900/50 focus-visible:outline-2 focus-visible:outline-rose-500"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Eliminar</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop inspector */}
      <aside className="hidden w-80 shrink-0 border-l border-slate-800 bg-[#0f1626] lg:block">
        {cuerpo}
      </aside>

      {/* Mobile bottom sheet (solo visible cuando hay un equipo seleccionado) */}
      {equipo && (
        <section
          aria-label="Propiedades del equipo seleccionado"
          className="fixed right-0 bottom-0 left-0 z-30 max-h-[46dvh] overflow-y-auto rounded-t-xl border-t border-slate-800 bg-[#0f1626] shadow-2xl lg:hidden"
        >
          {cuerpo}
        </section>
      )}
    </>
  );
}
