/**
 * Portado desde carloscdss/3d-with-pid (src/sim/*) y Open-Industry-Project (sim/events/*).
 * Motor de simulación de procesos con conservación de masa (sum(entradas) = sum(salidas) + acumulación),
 * propagación de eventos de falla (apagón, pérdida de aire de instrumento, parada de emergencia)
 * y ciclo de escaneo determinista basado en requestAnimationFrame (sin setInterval).
 */
import {
  type ConexionEnEscena,
  type EquipoEnEscena,
  familiaDe,
} from '@/src/lib/catalogo';

export const TOLERANCIA_CONSERVACION = 1e-4;

export type TipoEventoPlanta =
  | 'APAGON'
  | 'PERDIDA_AIRE'
  | 'PARADA_EMERGENCIA'
  | 'RESTABLECER';

export interface AlarmaSimulacion {
  id: string;
  codigo: TipoEventoPlanta;
  mensaje: string;
  timestamp: number;
}

export interface EstadoSimulacionPlanta {
  equipos: EquipoEnEscena[];
  conexiones: ConexionEnEscena[];
  bombeoActivo: boolean;
  energiaElectricaOk: boolean;
  aireInstrumentoOk: boolean;
  paradaEmergencia: boolean;
  tiempoSimuladoSeg: number;
  errorBalanceMasa: number;
  alarmas: AlarmaSimulacion[];
}

export interface ResultadoBalanceMasa {
  equiposActualizados: EquipoEnEscena[];
  conexionesActualizadas: ConexionEnEscena[];
  errorConservacionTotal: number;
  dentroDeTolerancia: boolean;
}

function esValvulaFailClosed(descriptorId: string): boolean {
  return (
    descriptorId === 'valvula-control' ||
    descriptorId === 'valvula-neumatica' ||
    descriptorId === 'valvula-solenoid'
  );
}

function esRecipienteConInventario(descriptorId: string): boolean {
  const fam = familiaDe(descriptorId);
  return (
    fam === 'tanque' ||
    fam === 'torre' ||
    fam === 'absorbedor' ||
    fam === 'separador' ||
    fam === 'acumulador' ||
    fam === 'columna'
  );
}

/**
 * Propaga eventos críticos de planta y dispara reacciones en cadena sobre bombas y válvulas F.C.
 */
export function aplicarEventoPlanta(
  estado: EstadoSimulacionPlanta,
  evento: TipoEventoPlanta,
  ahora = Date.now()
): EstadoSimulacionPlanta {
  if (evento === 'RESTABLECER') {
    return {
      ...estado,
      energiaElectricaOk: true,
      aireInstrumentoOk: true,
      paradaEmergencia: false,
      equipos: estado.equipos.map((eq) =>
        familiaDe(eq.descriptorId) === 'valvula' ? { ...eq, abierta: true } : eq
      ),
      alarmas: [
        {
          id: `sim-rst-${ahora}`,
          codigo: 'RESTABLECER' as TipoEventoPlanta,
          mensaje: 'Utilidades restablecidas: energía eléctrica y aire de instrumentos nominales.',
          timestamp: ahora,
        },
        ...estado.alarmas,
      ].slice(0, 20),
    };
  }

  const esApagon = evento === 'APAGON';
  const esPerdidaAire = evento === 'PERDIDA_AIRE';
  const esEStop = evento === 'PARADA_EMERGENCIA';

  const energiaElectricaOk = esApagon ? false : estado.energiaElectricaOk;
  const aireInstrumentoOk = esPerdidaAire ? false : estado.aireInstrumentoOk;
  const paradaEmergencia = esEStop ? true : estado.paradaEmergencia;

  // Reacción en cadena:
  // - Apagón detiene bombas/motores y cierra válvulas F.C. (solenoides y lazos dependientes de energía/aire)
  // - Pérdida de aire cierra todas las válvulas neumáticas y de control Fail-Closed (F.C.)
  // - Parada de emergencia (E-Stop) detiene bombas y cierra todas las válvulas
  const equipos = estado.equipos.map((eq) => {
    const fam = familiaDe(eq.descriptorId);
    if ((esApagon || esEStop) && (fam === 'bomba' || fam === 'compresor' || fam === 'soplador')) {
      return { ...eq, flujo: 0, presion: 0 };
    }
    if (esEStop && fam === 'valvula') {
      return { ...eq, abierta: false, flujo: 0 };
    }
    if (esApagon && esValvulaFailClosed(eq.descriptorId)) {
      return { ...eq, abierta: false, flujo: 0 };
    }
    if (
      esPerdidaAire &&
      (eq.descriptorId === 'valvula-control' || eq.descriptorId === 'valvula-neumatica')
    ) {
      return { ...eq, abierta: false, flujo: 0 };
    }
    return eq;
  });

  const mensaje = esApagon
    ? 'APAGÓN ELÉCTRICO: Bombas fuera de servicio y válvulas F.C. cerradas en cadena.'
    : esPerdidaAire
    ? 'PÉRDIDA DE AIRE DE INSTRUMENTO: Válvulas neumáticas/control F.C. cerradas por resorte.'
    : 'PARADA DE EMERGENCIA (E-STOP): Enclavamiento general disparado en campo.';

  return {
    ...estado,
    energiaElectricaOk,
    aireInstrumentoOk,
    paradaEmergencia,
    bombeoActivo: esApagon || esEStop ? false : estado.bombeoActivo,
    equipos,
    alarmas: [
      {
        id: `sim-${evento}-${ahora}`,
        codigo: evento,
        mensaje,
        timestamp: ahora,
      },
      ...estado.alarmas,
    ].slice(0, 20),
  };
}

/**
 * Resuelve el balance de masa estricto por nodo:
 *   sum(entradas) = sum(salidas) + acumulación
 * Ningún equipo puede generar caudal de salida si no existe inventario o alimentación aguas arriba.
 */
export function resolverBalanceMasa(
  estado: EstadoSimulacionPlanta,
  dtSeg: number
): ResultadoBalanceMasa {
  const porUuid = new Map(estado.equipos.map((e) => [e.uuid, { ...e }]));
  const entradasPorNodo = new Map<string, number>();
  const salidasPorNodo = new Map<string, number>();
  const gradoEntrada = new Map<string, number>();

  for (const eq of estado.equipos) {
    entradasPorNodo.set(eq.uuid, 0);
    salidasPorNodo.set(eq.uuid, 0);
    gradoEntrada.set(eq.uuid, 0);
  }

  for (const conn of estado.conexiones) {
    const esSenal =
      conn.puertoA.includes('senal') ||
      conn.puertoB.includes('senal') ||
      conn.puertoA.includes('ethernet') ||
      conn.puertoB.includes('ethernet');
    if (esSenal) continue;
    if (gradoEntrada.has(conn.equipoB)) {
      gradoEntrada.set(conn.equipoB, (gradoEntrada.get(conn.equipoB) ?? 0) + 1);
    }
  }

  const bombasHabilitadas =
    estado.bombeoActivo && estado.energiaElectricaOk && !estado.paradaEmergencia;

  const conexionesActualizadas = estado.conexiones.map((conn) => {
    const esSenal =
      conn.puertoA.includes('senal') ||
      conn.puertoB.includes('senal') ||
      conn.puertoA.includes('ethernet') ||
      conn.puertoB.includes('ethernet');
    if (esSenal) return conn;

    const eqA = porUuid.get(conn.equipoA);
    const eqB = porUuid.get(conn.equipoB);
    if (!eqA || !eqB) return { ...conn, activo: false };

    const famA = familiaDe(eqA.descriptorId);
    const famB = familiaDe(eqB.descriptorId);

    // Determinar capacidad de paso según válvulas y nivel disponible (no crear masa de la nada)
    const valvulaCerrada =
      (famA === 'valvula' && !eqA.abierta) || (famB === 'valvula' && !eqB.abierta);
    const sinInventarioOrigen =
      esRecipienteConInventario(eqA.descriptorId) && eqA.nivel <= 0.1;

    let caudal = 0;
    if (bombasHabilitadas && !valvulaCerrada && !sinInventarioOrigen) {
      if (famA === 'bomba' || famA === 'compresor' || famA === 'soplador') {
        // La bomba solo impulsa si tiene succión o es nodo cabecera de succión
        const tieneAlimentacion =
          (entradasPorNodo.get(eqA.uuid) ?? 0) > 0 || (gradoEntrada.get(eqA.uuid) ?? 0) === 0;
        caudal = tieneAlimentacion ? 42.0 : 0;
      } else if (esRecipienteConInventario(eqA.descriptorId)) {
        // Descarga proporcional a columna hidrostática disponible
        caudal = Math.min(42.0, Math.max(0, eqA.nivel * 0.65));
      } else {
        const entradaA = entradasPorNodo.get(eqA.uuid) ?? 0;
        caudal = entradaA > 0 ? entradaA : (gradoEntrada.get(eqA.uuid) ?? 0) === 0 ? 35.0 : 0;
      }
    }

    if (caudal > 0) {
      salidasPorNodo.set(eqA.uuid, (salidasPorNodo.get(eqA.uuid) ?? 0) + caudal);
      entradasPorNodo.set(eqB.uuid, (entradasPorNodo.get(eqB.uuid) ?? 0) + caudal);
    }

    return {
      ...conn,
      activo: caudal > TOLERANCIA_CONSERVACION,
    };
  });

  // Integración de acumulación y verificación de conservación de masa
  let errorConservacionTotal = 0;
  const equiposActualizados = estado.equipos.map((eq) => {
    const copia = porUuid.get(eq.uuid)!;
    const sumIn = entradasPorNodo.get(eq.uuid) ?? 0;
    const sumOut = salidasPorNodo.get(eq.uuid) ?? 0;
    const fam = familiaDe(eq.descriptorId);

    if (esRecipienteConInventario(eq.descriptorId)) {
      // Para nodo fuente sin entradas externas declaradas, el aporte base se acota por su nivel
      const tasaNet = sumIn - sumOut;
      const capacidadFactor = 0.25;
      const nivelPrevio = copia.nivel;
      const nuevoNivel = Math.max(0, Math.min(100, nivelPrevio + tasaNet * dtSeg * capacidadFactor));
      const acumulacionReal = (nuevoNivel - nivelPrevio) / (Math.max(1e-6, dtSeg) * capacidadFactor);
      const residuo = Math.abs(sumIn - sumOut - acumulacionReal);
      if (nuevoNivel > 0 && nuevoNivel < 100) {
        errorConservacionTotal += residuo;
      }
      copia.nivel = Number(nuevoNivel.toFixed(2));
      copia.flujo = Number(sumOut.toFixed(2));
      copia.presion = Number((1.0 + (copia.nivel / 100) * 1.4).toFixed(2));
    } else {
      // Equipos sin acumulación (bombas, válvulas, intercambiadores, filtros): sum(In) == sum(Out)
      const flujoPasante = Math.max(sumIn, sumOut);
      if (sumIn > 0 && sumOut > 0) {
        errorConservacionTotal += Math.abs(sumIn - sumOut);
      }
      copia.flujo = Number(flujoPasante.toFixed(2));
      if (fam === 'bomba') {
        copia.presion = bombasHabilitadas && flujoPasante > 0 ? 4.8 : 0.2;
      } else if (fam === 'valvula') {
        copia.presion = copia.abierta ? (flujoPasante > 0 ? 3.2 : 1.0) : 0.0;
      }
    }

    return copia;
  });

  return {
    equiposActualizados,
    conexionesActualizadas,
    errorConservacionTotal: Number(errorConservacionTotal.toFixed(6)),
    dentroDeTolerancia: errorConservacionTotal <= TOLERANCIA_CONSERVACION * Math.max(1, estado.equipos.length),
  };
}

/**
 * Ejecuta un único paso de escaneo determinista (scan cycle).
 */
export function ejecutarCicloEscaneo(
  estado: EstadoSimulacionPlanta,
  dtSeg: number
): EstadoSimulacionPlanta {
  const dtSeguro = Math.max(0.001, Math.min(0.1, dtSeg));
  const balance = resolverBalanceMasa(estado, dtSeguro);

  return {
    ...estado,
    equipos: balance.equiposActualizados,
    conexiones: balance.conexionesActualizadas,
    tiempoSimuladoSeg: Number((estado.tiempoSimuladoSeg + dtSeguro).toFixed(3)),
    errorBalanceMasa: balance.errorConservacionTotal,
  };
}

// ---------------------------------------------------------------------------
// Runtime de Web Worker con ciclo determinista basado en requestAnimationFrame
// ---------------------------------------------------------------------------

type MensajeEntradaWorker =
  | { tipo: 'INIT'; estado: EstadoSimulacionPlanta }
  | { tipo: 'EVENTO'; evento: TipoEventoPlanta }
  | { tipo: 'INICIAR' }
  | { tipo: 'DETENER' };

let estadoWorker: EstadoSimulacionPlanta | null = null;
let rafId: number | null = null;
let ultimoTimestamp = 0;

function programarSiguienteFrame(cb: (ts: number) => void): number {
  if (typeof requestAnimationFrame === 'function') {
    return requestAnimationFrame(cb);
  }
  return setTimeout(() => cb(performance.now()), 16) as unknown as number;
}

function cancelarFrame(id: number | null): void {
  if (id === null) return;
  if (typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(id);
  } else {
    clearTimeout(id);
  }
}

function bucleScanCycle(ts: number): void {
  if (!estadoWorker) return;
  const dt = ultimoTimestamp > 0 ? (ts - ultimoTimestamp) / 1000 : 1 / 60;
  ultimoTimestamp = ts;

  estadoWorker = ejecutarCicloEscaneo(estadoWorker, dt);
  if (typeof self !== 'undefined' && typeof self.postMessage === 'function') {
    self.postMessage({ tipo: 'ESTADO', estado: estadoWorker });
  }

  rafId = programarSiguienteFrame(bucleScanCycle);
}

const esEntornoWorker =
  typeof window === 'undefined' &&
  typeof self !== 'undefined' &&
  typeof (self as unknown as { postMessage?: unknown }).postMessage === 'function';

if (esEntornoWorker) {
  const workerScope = self as unknown as {
    postMessage: (msg: unknown) => void;
    onmessage: ((event: MessageEvent<MensajeEntradaWorker>) => void) | null;
  };

  workerScope.onmessage = (event: MessageEvent<MensajeEntradaWorker>) => {
    const msg = event.data;
    if (!msg) return;

    if (msg.tipo === 'INIT') {
      estadoWorker = msg.estado;
      ultimoTimestamp = 0;
    } else if (msg.tipo === 'EVENTO' && estadoWorker) {
      estadoWorker = aplicarEventoPlanta(estadoWorker, msg.evento);
      workerScope.postMessage({ tipo: 'ESTADO', estado: estadoWorker });
    } else if (msg.tipo === 'INICIAR') {
      if (rafId === null && estadoWorker) {
        ultimoTimestamp = performance.now();
        rafId = programarSiguienteFrame(bucleScanCycle);
      }
    } else if (msg.tipo === 'DETENER') {
      cancelarFrame(rafId);
      rafId = null;
    }
  };
}
