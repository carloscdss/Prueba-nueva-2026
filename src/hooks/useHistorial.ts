import { useCallback, useRef, useState } from 'react';
import type { ConexionEnEscena, EquipoEnEscena } from '@/src/lib/catalogo';

export interface SnapshotGrafo {
  equipos: EquipoEnEscena[];
  conexiones: ConexionEnEscena[];
}

export function useHistorial(inicial: SnapshotGrafo) {
  const pilaRef = useRef<SnapshotGrafo[]>([
    {
      equipos: structuredClone(inicial.equipos),
      conexiones: structuredClone(inicial.conexiones),
    },
  ]);
  const [indice, setIndice] = useState(0);

  const registrarSnapshot = useCallback((snapshot: SnapshotGrafo) => {
    const siguienteIndice = pilaRef.current.length > 0 ? Math.min(indice + 1, pilaRef.current.length) : 0;
    const recortada = pilaRef.current.slice(0, siguienteIndice);
    recortada.push({
      equipos: structuredClone(snapshot.equipos),
      conexiones: structuredClone(snapshot.conexiones),
    });
    if (recortada.length > 40) {
      recortada.shift();
    }
    pilaRef.current = recortada;
    setIndice(recortada.length - 1);
  }, [indice]);

  const undo = useCallback((): SnapshotGrafo | null => {
    if (indice <= 0) return null;
    const nuevoIndice = indice - 1;
    setIndice(nuevoIndice);
    return structuredClone(pilaRef.current[nuevoIndice]);
  }, [indice]);

  const redo = useCallback((): SnapshotGrafo | null => {
    if (indice >= pilaRef.current.length - 1) return null;
    const nuevoIndice = indice + 1;
    setIndice(nuevoIndice);
    return structuredClone(pilaRef.current[nuevoIndice]);
  }, [indice]);

  return {
    puedeUndo: indice > 0,
    puedeRedo: indice < pilaRef.current.length - 1,
    registrarSnapshot,
    undo,
    redo,
  };
}
