import { useMemo, useState } from 'react';
import { FileUp, GitCommitHorizontal, MousePointer, Search, X } from 'lucide-react';
import type { Descriptor } from '@/src/lib/catalogo';
import type { ModoEditor, VistaActiva } from '@/src/hooks/useEquipos';

interface SidebarCatalogoProps {
  catalogo: Descriptor[];
  cargando: boolean;
  error: string | null;
  descriptorActivoId: string | null;
  modo: ModoEditor;
  vista: VistaActiva;
  abierto: boolean;
  onCerrar: () => void;
  onSeleccionarDescriptor: (descriptor: Descriptor) => void;
  onCambiarModo: (modo: ModoEditor) => void;
  onCambiarVista: (vista: VistaActiva) => void;
  onAbrirImportador: () => void;
}

export function SidebarCatalogo({
  catalogo,
  cargando,
  error,
  descriptorActivoId,
  modo,
  vista,
  abierto,
  onCerrar,
  onSeleccionarDescriptor,
  onCambiarModo,
  onCambiarVista,
  onAbrirImportador,
}: SidebarCatalogoProps) {
  const [busqueda, setBusqueda] = useState('');
  const [categoriaActiva, setCategoriaActiva] = useState('Todas');

  const categorias = useMemo(() => {
    const unicas = Array.from(new Set(catalogo.map((item) => item.categoria)));
    return ['Todas', ...unicas];
  }, [catalogo]);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return catalogo.filter((item) => {
      const coincideCat = categoriaActiva === 'Todas' || item.categoria === categoriaActiva;
      if (!coincideCat) return false;
      if (!q) return true;
      return (
        item.nombre.toLowerCase().includes(q) ||
        item.prefijo.toLowerCase().includes(q) ||
        item.id.toLowerCase().includes(q)
      );
    });
  }, [catalogo, categoriaActiva, busqueda]);

  const contenido = (
    <div className="flex h-full flex-col bg-[#0f1626] text-slate-100">
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-100">Catálogo de Equipos</h2>
          <p className="text-xs text-slate-400 tabular-nums">
            {catalogo.length} familias disponibles
          </p>
        </div>
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar panel de catálogo"
          className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-md text-slate-400 hover:bg-slate-800 hover:text-slate-100 lg:hidden"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Selector de vista rápido en móvil */}
      <div className="grid grid-cols-4 gap-1 border-b border-slate-800 p-2 md:hidden">
        {(
          [
            { id: 'planta', label: 'Planta' },
            { id: 'pid', label: 'P&ID' },
            { id: 'hmi', label: 'HMI' },
            { id: 'boq', label: 'BOQ' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => {
              onCambiarVista(tab.id);
              onCerrar();
            }}
            className={`min-h-[40px] rounded-md text-xs font-medium transition-colors ${
              vista === tab.id
                ? 'bg-sky-600 text-white'
                : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Importación As-Built P&ID */}
      <div className="border-b border-slate-800 px-3 pt-3 pb-2">
        <button
          type="button"
          onClick={() => {
            onAbrirImportador();
            onCerrar();
          }}
          className="inline-flex min-h-[40px] w-full items-center justify-center gap-2 rounded-md border border-sky-700/60 bg-sky-950/40 px-3 py-2 text-xs font-medium text-sky-200 transition-colors hover:bg-sky-900/50 focus-visible:outline-2 focus-visible:outline-sky-500"
        >
          <FileUp className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Importar JSON P&amp;ID</span>
        </button>
      </div>

      {/* Modos de herramienta */}
      <div className="grid grid-cols-2 gap-2 border-b border-slate-800 p-3">
        <button
          type="button"
          onClick={() => onCambiarModo('seleccionar')}
          className={`inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-sky-500 ${
            modo === 'seleccionar'
              ? 'border-sky-500 bg-sky-600/20 text-sky-200'
              : 'border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-700'
          }`}
        >
          <MousePointer className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Seleccionar</span>
        </button>
        <button
          type="button"
          onClick={() => onCambiarModo('conectar')}
          className={`inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-sky-500 ${
            modo === 'conectar'
              ? 'border-sky-500 bg-sky-600/20 text-sky-200'
              : 'border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-700'
          }`}
        >
          <GitCommitHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Conectar</span>
        </button>
      </div>

      {/* Buscador y filtros */}
      <div className="space-y-2.5 border-b border-slate-800 p-3">
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-500"
            aria-hidden="true"
          />
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar equipo o prefijo..."
            className="min-h-[40px] w-full rounded-md border border-slate-800 bg-[#090d16] pr-3 pl-8 text-xs text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
          />
        </div>

        <div className="flex gap-1 overflow-x-auto pb-1">
          {categorias.map((cat) => {
            const activa = categoriaActiva === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoriaActiva(cat)}
                className={`whitespace-nowrap shrink-0 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  activa
                    ? 'bg-slate-800 text-slate-100'
                    : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>
      </div>

      {/* Lista de catálogo */}
      <div className="flex-1 space-y-1.5 overflow-y-auto p-3">
        {cargando && (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="h-14 animate-pulse rounded-md border border-slate-800/80 bg-slate-900/60"
              />
            ))}
          </div>
        )}

        {error && (
          <div className="rounded-md border border-rose-500/40 bg-rose-950/40 p-3 text-xs text-rose-200">
            {error}
          </div>
        )}

        {!cargando && !error && filtrados.length === 0 && (
          <p className="py-6 text-center text-xs text-slate-500">
            No hay equipos que coincidan con el filtro.
          </p>
        )}

        {!cargando &&
          !error &&
          filtrados.map((item) => {
            const activo = modo === 'colocar' && descriptorActivoId === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onSeleccionarDescriptor(item);
                  onCerrar();
                }}
                className={`flex min-h-[48px] w-full items-center gap-3 rounded-md border px-3 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-sky-500 ${
                  activo
                    ? 'border-sky-500 bg-sky-600/15 text-slate-100'
                    : 'border-slate-800/90 bg-[#131c2e]/70 text-slate-200 hover:border-slate-700 hover:bg-[#131c2e]'
                }`}
              >
                <span
                  className="h-7 w-1.5 shrink-0 rounded-sm"
                  style={{ backgroundColor: item.color }}
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium text-slate-100">
                    {item.nombre}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-400 tabular-nums">
                    <span className="font-mono text-slate-300">{item.prefijo}</span>
                    <span aria-hidden="true">·</span>
                    <span className="truncate">{item.categoria}</span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {item.dimensiones.ancho}×{item.dimensiones.alto}m
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden w-72 shrink-0 border-r border-slate-800 lg:block">
        {contenido}
      </aside>

      {/* Mobile / tablet slide-over drawer */}
      {abierto && (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <div
            className="fixed inset-0 bg-black/65"
            onClick={onCerrar}
            aria-hidden="true"
          />
          <aside className="relative z-10 h-full w-[min(300px,86vw)] border-r border-slate-800 shadow-2xl">
            {contenido}
          </aside>
        </div>
      )}
    </>
  );
}
