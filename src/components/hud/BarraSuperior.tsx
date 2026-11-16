import {
  LayoutGrid,
  Menu,
  Play,
  Redo2,
  Square,
  Undo2,
  X,
} from 'lucide-react';
import type { VistaActiva } from '@/src/hooks/useEquipos';

interface BarraSuperiorProps {
  vista: VistaActiva;
  onCambiarVista: (vista: VistaActiva) => void;
  bombeoActivo: boolean;
  onToggleBombeo: () => void;
  puedeUndo: boolean;
  puedeRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  sidebarAbierto: boolean;
  onToggleSidebar: () => void;
  equiposCount: number;
  conexionesCount: number;
  alarmasActivasCount?: number;
}

const VISTAS: ReadonlyArray<{ id: VistaActiva; label: string; labelCorto: string }> = [
  { id: 'planta', label: 'Planta 2D/3D', labelCorto: 'Planta 3D' },
  { id: 'pid', label: 'P&ID (ISA-5.1)', labelCorto: 'P&ID' },
  { id: 'hmi', label: 'HMI / PLC', labelCorto: 'HMI / PLC' },
  { id: 'boq', label: 'Cómputos BOQ', labelCorto: 'BOQ' },
];

export function BarraSuperior({
  vista,
  onCambiarVista,
  bombeoActivo,
  onToggleBombeo,
  puedeUndo,
  puedeRedo,
  onUndo,
  onRedo,
  sidebarAbierto,
  onToggleSidebar,
  equiposCount,
  conexionesCount,
  alarmasActivasCount = 0,
}: BarraSuperiorProps) {
  return (
    <header className="sticky top-0 z-30 shrink-0 border-b border-slate-800 bg-[#0d1322]">
      <div className="flex h-14 items-center justify-between gap-2 px-3 sm:gap-4 sm:px-5">
        <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
          <button
            type="button"
            onClick={onToggleSidebar}
            aria-label={sidebarAbierto ? 'Cerrar catálogo' : 'Abrir catálogo'}
            className="inline-flex min-h-[42px] min-w-[42px] items-center justify-center rounded-md border border-slate-800 bg-slate-900/90 text-slate-200 transition-colors hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-sky-500 lg:hidden"
          >
            {sidebarAbierto ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>

          <div className="flex shrink-0 items-center gap-2 whitespace-nowrap">
            <LayoutGrid className="h-4 w-4 shrink-0 text-sky-400" aria-hidden="true" />
            <span className="text-sm font-semibold tracking-tight text-slate-100">
              Planta Viva
            </span>
          </div>

          <span className="hidden whitespace-nowrap text-xs text-slate-500 tabular-nums md:inline">
            {equiposCount} equipos · {conexionesCount} líneas
          </span>
        </div>

        <nav
          aria-label="Vistas del gemelo digital"
          className="hidden items-center gap-1 rounded-lg border border-slate-800 bg-[#090d16] p-1 md:flex"
        >
          {VISTAS.map((item) => {
            const activa = vista === item.id;
            const texto =
              item.id === 'hmi' && alarmasActivasCount > 0
                ? `${item.label} (${alarmasActivasCount})`
                : item.label;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onCambiarVista(item.id)}
                className={`shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-sky-500 ${
                  activa
                    ? 'bg-slate-800 text-slate-100'
                    : item.id === 'hmi' && alarmasActivasCount > 0
                    ? 'text-rose-300 hover:text-rose-200'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {texto}
              </button>
            );
          })}
        </nav>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <div className="hidden items-center gap-1 sm:flex">
            <button
              type="button"
              disabled={!puedeUndo}
              onClick={onUndo}
              title="Deshacer (Ctrl+Z)"
              aria-label="Deshacer"
              className="inline-flex min-h-[38px] min-w-[38px] items-center justify-center rounded-md border border-slate-800 bg-slate-900 text-slate-200 transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-sky-500"
            >
              <Undo2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              disabled={!puedeRedo}
              onClick={onRedo}
              title="Rehacer (Ctrl+Y)"
              aria-label="Rehacer"
              className="inline-flex min-h-[38px] min-w-[38px] items-center justify-center rounded-md border border-slate-800 bg-slate-900 text-slate-200 transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-sky-500"
            >
              <Redo2 className="h-4 w-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={onToggleBombeo}
            className={`inline-flex min-h-[42px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-sky-500 sm:gap-2 sm:px-3.5 ${
              bombeoActivo
                ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                : 'bg-sky-600 text-white hover:bg-sky-500'
            }`}
          >
            {bombeoActivo ? (
              <>
                <Square className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                <span>Detener flujo</span>
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                <span>Iniciar flujo</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Selector de vista 1-tap en móvil (sin invadir más de ~12% del viewport) */}
      <nav
        aria-label="Navegación móvil"
        className="grid grid-cols-4 border-t border-slate-800/80 bg-[#090d16] md:hidden"
      >
        {VISTAS.map((item) => {
          const activa = vista === item.id;
          const texto =
            item.id === 'hmi' && alarmasActivasCount > 0
              ? `${item.labelCorto} (${alarmasActivasCount})`
              : item.labelCorto;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onCambiarVista(item.id)}
              className={`min-h-[42px] whitespace-nowrap border-b-2 px-1 text-xs font-medium transition-colors ${
                activa
                  ? 'border-sky-400 bg-slate-900/70 text-slate-100'
                  : item.id === 'hmi' && alarmasActivasCount > 0
                  ? 'border-transparent text-rose-300'
                  : 'border-transparent text-slate-400'
              }`}
            >
              {texto}
            </button>
          );
        })}
      </nav>
    </header>
  );
}
