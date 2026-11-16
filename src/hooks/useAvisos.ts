import { useCallback, useEffect, useRef, useState } from 'react';

export interface Aviso {
  id: number;
  texto: string;
  tipo: 'info' | 'exito' | 'error';
}

export function useAvisos() {
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const limpiarAviso = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setAviso(null);
  }, []);

  const mostrarAviso = useCallback(
    (texto: string, tipo: Aviso['tipo'] = 'info') => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      setAviso({ id: Date.now(), texto, tipo });
      timerRef.current = setTimeout(() => {
        setAviso(null);
        timerRef.current = null;
      }, 3200);
    },
    []
  );

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { aviso, mostrarAviso, limpiarAviso };
}
