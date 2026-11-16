import { useCallback, useEffect } from 'react';
import { useAvisos } from './useAvisos';
import { CONEXIONES_INICIALES, EQUIPOS_INICIALES, useEquipos } from './useEquipos';
import { useHistorial } from './useHistorial';
import { useImportar } from './useImportar';
import { usePLC } from './usePLC';

/**
 * Facade puro: coordina hooks especializados y expone una interfaz plana a la UI.
 */
export function useEditor() {
  const { aviso, mostrarAviso, limpiarAviso } = useAvisos();
  const historial = useHistorial({
    equipos: EQUIPOS_INICIALES,
    conexiones: CONEXIONES_INICIALES,
  });

  const editorEquipos = useEquipos({
    onCambioGrafo: (equipos, conexiones) => {
      historial.registrarSnapshot({ equipos, conexiones });
    },
    mostrarAviso,
  });

  const plc = usePLC({
    equipos: editorEquipos.equipos,
    bombeoActivo: editorEquipos.bombeoActivo,
    onActualizarValvula: editorEquipos.setValvulaAbierta,
  });

  const importador = useImportar({
    catalogo: editorEquipos.catalogo,
    onAplicarGrafo: (equipos, conexiones) => {
      editorEquipos.cargarGrafoImportado(equipos, conexiones);
    },
    onCargarLazos: plc.cargarLazos,
    mostrarAviso,
  });

  const ejecutarUndo = useCallback(() => {
    const snap = historial.undo();
    if (snap) {
      editorEquipos.aplicarSnapshot(snap);
      mostrarAviso('Acción deshecha', 'info');
    }
  }, [historial, editorEquipos, mostrarAviso]);

  const ejecutarRedo = useCallback(() => {
    const snap = historial.redo();
    if (snap) {
      editorEquipos.aplicarSnapshot(snap);
      mostrarAviso('Acción rehecha', 'info');
    }
  }, [historial, editorEquipos, mostrarAviso]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) ejecutarRedo();
        else ejecutarUndo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        ejecutarRedo();
      } else if (e.key === 'Escape') {
        editorEquipos.cambiarModo('seleccionar');
        editorEquipos.setSeleccionadoUuid(null);
      } else if (e.key.toLowerCase() === 'r' && editorEquipos.seleccionadoUuid) {
        editorEquipos.rotarEquipo(editorEquipos.seleccionadoUuid);
      } else if (
        (e.key === 'Delete' || e.key === 'Backspace') &&
        editorEquipos.seleccionadoUuid
      ) {
        editorEquipos.eliminarEquipo(editorEquipos.seleccionadoUuid);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [ejecutarUndo, ejecutarRedo, editorEquipos]);

  return {
    ...editorEquipos,
    plc,
    importador,
    aviso,
    limpiarAviso,
    puedeUndo: historial.puedeUndo,
    puedeRedo: historial.puedeRedo,
    ejecutarUndo,
    ejecutarRedo,
  };
}
