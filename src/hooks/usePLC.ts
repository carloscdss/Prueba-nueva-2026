import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { EquipoEnEscena } from '@/src/lib/catalogo';
import {
  type AlarmaHMI,
  LAZOS_FCC,
  type LazoControl,
  REGLAS_PLC_INICIALES,
  type ReglaPLC,
} from '@/src/lib/plc';

interface UsePLCParams {
  equipos: EquipoEnEscena[];
  bombeoActivo: boolean;
  onActualizarValvula: (uuid: string, abierta: boolean) => void;
}

export function usePLC({ equipos, bombeoActivo, onActualizarValvula }: UsePLCParams) {
  const [reglas, setReglas] = useState<ReglaPLC[]>(REGLAS_PLC_INICIALES);
  const [lazos, setLazos] = useState<LazoControl[]>(LAZOS_FCC);
  const [alarmas, setAlarmas] = useState<AlarmaHMI[]>([]);
  const [historialesPV, setHistorialesPV] = useState<Record<string, number[]>>({});
  const integralRef = useRef<Record<string, number>>({});

  const equiposRef = useRef(equipos);
  equiposRef.current = equipos;

  const reglasRef = useRef(reglas);
  reglasRef.current = reglas;

  const lazosRef = useRef(lazos);
  lazosRef.current = lazos;

  const onActualizarValvulaRef = useRef(onActualizarValvula);
  onActualizarValvulaRef.current = onActualizarValvula;

  // Evaluación periódica de reglas PLC + lazos PID sin efectos secundarios dentro de updaters
  useEffect(() => {
    const timer = setInterval(() => {
      const eqLista = equiposRef.current;
      const porTag = new Map(eqLista.map((e) => [e.tag, e]));
      const actualizacionesValvula: Array<{ uuid: string; abierta: boolean }> = [];
      const nuevasAlarmas: AlarmaHMI[] = [];

      // 1. Evaluar reglas de enclavamiento (interlocks)
      let reglasCambiaron = false;
      const siguientesReglas = reglasRef.current.map((regla) => {
        if (!regla.habilitada) {
          if (regla.disparada) {
            reglasCambiaron = true;
            return { ...regla, disparada: false };
          }
          return regla;
        }
        const sensor = porTag.get(regla.tagSensor);
        if (!sensor) {
          if (regla.disparada) {
            reglasCambiaron = true;
            return { ...regla, disparada: false };
          }
          return regla;
        }
        const valorActual = regla.parametro === 'nivel' ? sensor.nivel : sensor.presion;
        const condicionCumplida = valorActual > regla.umbral;

        if (condicionCumplida) {
          const actuador = porTag.get(regla.tagActuador);
          if (actuador && actuador.abierta !== regla.accionAbierta) {
            actualizacionesValvula.push({ uuid: actuador.uuid, abierta: regla.accionAbierta });
          }
          if (!regla.disparada) {
            nuevasAlarmas.push({
              id: `alm-${regla.id}-${Date.now()}`,
              tag: regla.tagSensor,
              mensaje: `${regla.nombre}: ${regla.parametro} ${valorActual.toFixed(1)} > ${regla.umbral} → ${regla.tagActuador} ${regla.accionAbierta ? 'ABIERTA' : 'CERRADA'}`,
              prioridad: 'HIGH',
              timestamp: Date.now(),
              reconocida: false,
            });
          }
        }

        if (regla.disparada !== condicionCumplida) {
          reglasCambiaron = true;
          return { ...regla, disparada: condicionCumplida };
        }
        return regla;
      });

      if (reglasCambiaron) {
        setReglas(siguientesReglas);
      }

      if (nuevasAlarmas.length > 0) {
        setAlarmas((prevAlm) => {
          const pendientes = nuevasAlarmas.filter(
            (n) => !prevAlm.some((a) => a.tag === n.tag && !a.reconocida)
          );
          if (pendientes.length === 0) return prevAlm;
          return [...pendientes, ...prevAlm].slice(0, 25);
        });
      }

      // 2. Evaluar lazos PID cuando el bombeo está activo
      if (bombeoActivo) {
        const siguientesLazos = lazosRef.current.map((lazo) => {
          const sensor = eqLista.find(
            (e) => e.uuid === lazo.instrumentoPV || e.tag === lazo.instrumentoPV
          );
          const actuador = eqLista.find(
            (e) => e.uuid === lazo.instrumentoOP || e.tag === lazo.instrumentoOP
          );
          if (!sensor) return lazo;

          const pvActual = lazo.tag.startsWith('LIC')
            ? porTag.get('D-6210')?.nivel ?? porTag.get('COL-101')?.nivel ?? sensor.nivel
            : sensor.flujo > 0
            ? sensor.flujo
            : 45 + Math.sin(Date.now() / 1200) * 12;

          let nuevaOP = lazo.op;
          if (lazo.modo === 'AUTO') {
            const error = lazo.sp - pvActual;
            const prevInt = integralRef.current[lazo.id] ?? 0;
            const nextInt = Math.max(-40, Math.min(40, prevInt + error * 0.15));
            integralRef.current[lazo.id] = nextInt;
            nuevaOP = Math.max(
              0,
              Math.min(100, Math.round((lazo.kp ?? 1.2) * error + (lazo.ki ?? 0.25) * nextInt + 45))
            );
            // Solo abrir por PID si ningún interlock crítico cerró la válvula
            if (actuador && pvActual <= (lazo.alarmaAlta ?? 85)) {
              const deberiaAbrir = nuevaOP > 10;
              if (actuador.abierta !== deberiaAbrir) {
                actualizacionesValvula.push({ uuid: actuador.uuid, abierta: deberiaAbrir });
              }
            }
          }

          return {
            ...lazo,
            pv: Number(pvActual.toFixed(1)),
            op: nuevaOP,
          };
        });

        setLazos(siguientesLazos);
        setHistorialesPV((prevHist) => {
          const copia = { ...prevHist };
          for (const l of siguientesLazos) {
            copia[l.id] = [...(copia[l.id] ?? []), l.pv].slice(-28);
          }
          return copia;
        });
      }

      for (const act of actualizacionesValvula) {
        onActualizarValvulaRef.current(act.uuid, act.abierta);
      }
    }, 250);

    return () => clearInterval(timer);
  }, [bombeoActivo]);

  const cambiarModoLazo = useCallback((id: string, modo: 'AUTO' | 'MANUAL') => {
    setLazos((prev) => prev.map((l) => (l.id === id ? { ...l, modo } : l)));
  }, []);

  const cambiarSetpoint = useCallback((id: string, sp: number) => {
    setLazos((prev) =>
      prev.map((l) => (l.id === id ? { ...l, sp: Math.max(0, Math.min(100, sp)) } : l))
    );
  }, []);

  const cambiarOutputManual = useCallback(
    (id: string, op: number) => {
      const targetLazo = lazosRef.current.find((l) => l.id === id);
      if (targetLazo) {
        const act = equiposRef.current.find(
          (e) => e.uuid === targetLazo.instrumentoOP || e.tag === targetLazo.instrumentoOP
        );
        if (act) onActualizarValvulaRef.current(act.uuid, op > 10);
      }
      setLazos((prev) => prev.map((l) => (l.id === id ? { ...l, op } : l)));
    },
    []
  );

  const toggleRegla = useCallback((id: string) => {
    setReglas((prev) => prev.map((r) => (r.id === id ? { ...r, habilitada: !r.habilitada } : r)));
  }, []);

  const agregarRegla = useCallback((nueva: Omit<ReglaPLC, 'id' | 'disparada'>) => {
    setReglas((prev) => [
      ...prev,
      { ...nueva, id: `r-${Date.now()}`, disparada: false },
    ]);
  }, []);

  const cargarLazos = useCallback((nuevos: LazoControl[]) => {
    setLazos(nuevos);
    integralRef.current = {};
  }, []);

  const reconocerAlarma = useCallback((id: string) => {
    setAlarmas((prev) => prev.map((a) => (a.id === id ? { ...a, reconocida: true } : a)));
  }, []);

  const alarmasActivasCount = useMemo(
    () => alarmas.filter((a) => !a.reconocida).length,
    [alarmas]
  );

  return {
    reglas,
    lazos,
    alarmas,
    alarmasActivasCount,
    historialesPV,
    cambiarModoLazo,
    cambiarSetpoint,
    cambiarOutputManual,
    toggleRegla,
    agregarRegla,
    cargarLazos,
    reconocerAlarma,
  };
}
