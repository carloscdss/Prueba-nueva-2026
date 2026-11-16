import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  type ConexionEnEscena,
  type Descriptor,
  type EquipoEnEscena,
  getDescriptor,
  siguienteTag,
  usarCatalogo,
} from '@/src/lib/catalogo';
import { hayColision, snapRejilla } from '@/src/lib/colocacion';

export type ModoEditor = 'seleccionar' | 'colocar' | 'conectar';
export type VistaActiva = 'planta' | 'pid' | 'boq' | 'hmi';

export const EQUIPOS_INICIALES: EquipoEnEscena[] = [
  {
    uuid: 'eq-tnq-101',
    tag: 'TNQ-101',
    descriptorId: 'tanque-vertical',
    posicion: [-5, 1.2, 0],
    rotacionY: 0,
    abierta: true,
    nivel: 62,
    presion: 1.4,
    flujo: 0,
  },
  {
    uuid: 'eq-bom-101',
    tag: 'BOM-101',
    descriptorId: 'bomba-centrifuga',
    posicion: [-1.5, 0.65, 0],
    rotacionY: 0,
    abierta: true,
    nivel: 0,
    presion: 1.01,
    flujo: 0,
  },
  {
    uuid: 'eq-xv-101',
    tag: 'XV-101',
    descriptorId: 'valvula-neumatica',
    posicion: [2, 0.45, 0],
    rotacionY: 0,
    abierta: true,
    nivel: 0,
    presion: 1.01,
    flujo: 0,
  },
  {
    uuid: 'eq-col-101',
    tag: 'COL-101',
    descriptorId: 'columna-resina',
    posicion: [5.5, 1.6, 0],
    rotacionY: 0,
    abierta: true,
    nivel: 48,
    presion: 1.25,
    flujo: 0,
  },
];

export const CONEXIONES_INICIALES: ConexionEnEscena[] = [
  {
    id: 'conn-1',
    equipoA: 'eq-tnq-101',
    puertoA: 'salida',
    equipoB: 'eq-bom-101',
    puertoB: 'succion',
    activo: false,
  },
  {
    id: 'conn-2',
    equipoA: 'eq-bom-101',
    puertoA: 'descarga',
    equipoB: 'eq-xv-101',
    puertoB: 'entrada',
    activo: false,
  },
  {
    id: 'conn-3',
    equipoA: 'eq-xv-101',
    puertoA: 'salida',
    equipoB: 'eq-col-101',
    puertoB: 'entrada',
    activo: false,
  },
];

interface UseEquiposParams {
  onCambioGrafo: (equipos: EquipoEnEscena[], conexiones: ConexionEnEscena[]) => void;
  mostrarAviso: (texto: string, tipo?: 'info' | 'exito' | 'error') => void;
}

export function useEquipos({ onCambioGrafo, mostrarAviso }: UseEquiposParams) {
  const { catalogo, cargando: cargandoCatalogo, error: errorCatalogo } = usarCatalogo();
  const [equipos, setEquipos] = useState<EquipoEnEscena[]>(EQUIPOS_INICIALES);
  const [conexiones, setConexiones] = useState<ConexionEnEscena[]>(CONEXIONES_INICIALES);
  const [seleccionadoUuid, setSeleccionadoUuid] = useState<string | null>('eq-tnq-101');
  const [descriptorActivoId, setDescriptorActivoId] = useState<string | null>(null);
  const [modo, setModo] = useState<ModoEditor>('seleccionar');
  const [vista, setVista] = useState<VistaActiva>('planta');
  const [origenConexion, setOrigenConexion] = useState<string | null>(null);

  const descriptorActivo = useMemo(
    () => (descriptorActivoId ? getDescriptor(descriptorActivoId, catalogo) ?? null : null),
    [descriptorActivoId, catalogo]
  );

  const equipoSeleccionado = useMemo(
    () => equipos.find((e) => e.uuid === seleccionadoUuid) ?? null,
    [equipos, seleccionadoUuid]
  );

  // Regla crítica: bombeoActivo se deriva de conexiones.some(c => c.activo)
  const bombeoActivo = useMemo(() => conexiones.some((c) => c.activo), [conexiones]);

  // Simulación determinista ligera cuando bombeoActivo está encendido
  useEffect(() => {
    if (!bombeoActivo) return;
    const intervalo = setInterval(() => {
      setEquipos((prev) => {
        const hayValvulaCerrada = prev.some(
          (e) =>
            (e.tag === 'LV-16' || e.tag === 'XV-101' || e.descriptorId === 'valvula-control') &&
            !e.abierta
        );
        return prev.map((eq) => {
          const fam = eq.descriptorId.split('-')[0];
          if (fam === 'bomba' || fam === 'soplador' || fam === 'compresor') {
            return { ...eq, presion: hayValvulaCerrada ? 5.2 : 4.6, flujo: hayValvulaCerrada ? 4.0 : 42.5 };
          }
          if (fam === 'valvula') {
            return { ...eq, flujo: eq.abierta ? 42.5 : 0 };
          }
          if (
            fam === 'tanque' ||
            fam === 'columna' ||
            fam === 'torre' ||
            fam === 'separador' ||
            fam === 'acumulador'
          ) {
            const esDestino = fam === 'columna' || fam === 'torre';
            const delta = esDestino ? (hayValvulaCerrada ? -0.4 : 1.5) : -0.6;
            const nuevoNivel = Math.max(10, Math.min(98, Number((eq.nivel + delta).toFixed(1))));
            return {
              ...eq,
              nivel: nuevoNivel,
              presion: Number((1.05 + nuevoNivel * 0.025).toFixed(2)),
            };
          }
          return eq;
        });
      });
    }, 350);
    return () => clearInterval(intervalo);
  }, [bombeoActivo]);

  const activarColocacion = useCallback((descriptor: Descriptor) => {
    setDescriptorActivoId(descriptor.id);
    setModo('colocar');
    setOrigenConexion(null);
  }, []);

  const cambiarModo = useCallback((nuevoModo: ModoEditor) => {
    setModo(nuevoModo);
    setOrigenConexion(null);
    if (nuevoModo !== 'colocar') {
      setDescriptorActivoId(null);
    }
  }, []);

  const colocarEquipo = useCallback(
    (x: number, z: number) => {
      if (!descriptorActivo) return;
      const sx = snapRejilla(x);
      const sz = snapRejilla(z);

      if (hayColision(sx, sz, descriptorActivo, 0, equipos, catalogo)) {
        mostrarAviso('Espacio ocupado: ajusta la posición para evitar colisión', 'error');
        return;
      }

      const tag = siguienteTag(descriptorActivo.prefijo, equipos);
      const nuevo: EquipoEnEscena = {
        uuid: `eq-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        tag,
        descriptorId: descriptorActivo.id,
        posicion: [sx, descriptorActivo.dimensiones.alto / 2, sz],
        rotacionY: 0,
        abierta: true,
        nivel: 40,
        presion: 1.01,
        flujo: 0,
      };

      const siguientes = [...equipos, nuevo];
      setEquipos(siguientes);
      setSeleccionadoUuid(nuevo.uuid);
      onCambioGrafo(siguientes, conexiones);
      mostrarAviso(`${tag} colocado en (${sx}, ${sz})`, 'exito');
    },
    [descriptorActivo, equipos, catalogo, conexiones, onCambioGrafo, mostrarAviso]
  );

  const seleccionarOConectar = useCallback(
    (uuid: string) => {
      if (modo === 'conectar') {
        if (!origenConexion) {
          setOrigenConexion(uuid);
          setSeleccionadoUuid(uuid);
          mostrarAviso('Selecciona el equipo destino para conectar', 'info');
          return;
        }
        if (origenConexion === uuid) {
          setOrigenConexion(null);
          return;
        }
        const eqA = equipos.find((e) => e.uuid === origenConexion);
        const eqB = equipos.find((e) => e.uuid === uuid);
        const descA = eqA ? getDescriptor(eqA.descriptorId, catalogo) : undefined;
        const descB = eqB ? getDescriptor(eqB.descriptorId, catalogo) : undefined;
        const nuevaConn: ConexionEnEscena = {
          id: `conn-${Date.now()}`,
          equipoA: origenConexion,
          puertoA: descA?.puertos[descA.puertos.length - 1]?.id ?? 'salida',
          equipoB: uuid,
          puertoB: descB?.puertos[0]?.id ?? 'entrada',
          activo: bombeoActivo,
        };
        const siguientesConn = [...conexiones, nuevaConn];
        setConexiones(siguientesConn);
        setOrigenConexion(null);
        setSeleccionadoUuid(uuid);
        onCambioGrafo(equipos, siguientesConn);
        mostrarAviso(`Tubería conectada: ${eqA?.tag ?? ''} → ${eqB?.tag ?? ''}`, 'exito');
        return;
      }

      setSeleccionadoUuid(uuid);
    },
    [modo, origenConexion, equipos, catalogo, bombeoActivo, conexiones, onCambioGrafo, mostrarAviso]
  );

  const moverEquipo = useCallback(
    (uuid: string, dx: number, dz: number) => {
      const actual = equipos.find((e) => e.uuid === uuid);
      if (!actual) return;
      const desc = getDescriptor(actual.descriptorId, catalogo);
      const nx = snapRejilla(actual.posicion[0] + dx);
      const nz = snapRejilla(actual.posicion[2] + dz);

      if (hayColision(nx, nz, desc, actual.rotacionY, equipos, catalogo, uuid)) {
        mostrarAviso('Movimiento bloqueado por colisión', 'error');
        return;
      }

      const siguientes = equipos.map((e) =>
        e.uuid === uuid ? { ...e, posicion: [nx, e.posicion[1], nz] as [number, number, number] } : e
      );
      setEquipos(siguientes);
      onCambioGrafo(siguientes, conexiones);
    },
    [equipos, catalogo, conexiones, onCambioGrafo, mostrarAviso]
  );

  const rotarEquipo = useCallback(
    (uuid: string) => {
      const siguientes = equipos.map((e) =>
        e.uuid === uuid ? { ...e, rotacionY: (e.rotacionY + Math.PI / 2) % (Math.PI * 2) } : e
      );
      setEquipos(siguientes);
      onCambioGrafo(siguientes, conexiones);
    },
    [equipos, conexiones, onCambioGrafo]
  );

  const toggleValvula = useCallback(
    (uuid: string) => {
      const siguientes = equipos.map((e) => (e.uuid === uuid ? { ...e, abierta: !e.abierta } : e));
      setEquipos(siguientes);
      onCambioGrafo(siguientes, conexiones);
    },
    [equipos, conexiones, onCambioGrafo]
  );

  const eliminarEquipo = useCallback(
    (uuid: string) => {
      const eq = equipos.find((e) => e.uuid === uuid);
      const siguientesEquipos = equipos.filter((e) => e.uuid !== uuid);
      const siguientesConexiones = conexiones.filter((c) => c.equipoA !== uuid && c.equipoB !== uuid);
      setEquipos(siguientesEquipos);
      setConexiones(siguientesConexiones);
      if (seleccionadoUuid === uuid) setSeleccionadoUuid(null);
      onCambioGrafo(siguientesEquipos, siguientesConexiones);
      if (eq) mostrarAviso(`${eq.tag} eliminado`, 'info');
    },
    [equipos, conexiones, seleccionadoUuid, onCambioGrafo, mostrarAviso]
  );

  const toggleBombeo = useCallback(() => {
    const siguienteEstado = !bombeoActivo;
    const siguientesConexiones = conexiones.map((c) => ({ ...c, activo: siguienteEstado }));
    setConexiones(siguientesConexiones);
    onCambioGrafo(equipos, siguientesConexiones);
    mostrarAviso(siguienteEstado ? 'Bombeo de proceso activado' : 'Bombeo detenido', 'info');
  }, [bombeoActivo, conexiones, equipos, onCambioGrafo, mostrarAviso]);

  const setValvulaAbierta = useCallback((uuid: string, abierta: boolean) => {
    setEquipos((prev) =>
      prev.map((e) => (e.uuid === uuid ? { ...e, abierta } : e))
    );
  }, []);

  const cargarGrafoImportado = useCallback(
    (nuevosEquipos: EquipoEnEscena[], nuevasConexiones: ConexionEnEscena[]) => {
      setEquipos(nuevosEquipos);
      setConexiones(nuevasConexiones);
      setSeleccionadoUuid(nuevosEquipos[0]?.uuid ?? null);
      onCambioGrafo(nuevosEquipos, nuevasConexiones);
    },
    [onCambioGrafo]
  );

  const inyectarNivelAlto = useCallback(() => {
    setEquipos((prev) =>
      prev.map((e) => {
        const fam = e.descriptorId.split('-')[0];
        if (fam === 'torre' || fam === 'columna' || fam === 'tanque') {
          return { ...e, nivel: 91, presion: 3.35 };
        }
        return e;
      })
    );
    mostrarAviso('Simulación: Nivel crítico 91% inyectado para validar interlock PLC', 'info');
  }, [mostrarAviso]);

  const restablecerProceso = useCallback(() => {
    setEquipos((prev) =>
      prev.map((e) => ({
        ...e,
        abierta: true,
        nivel: e.descriptorId === 'torre-fraccionadora' ? 52 : 45,
        presion: 1.2,
      }))
    );
    mostrarAviso('Condiciones de proceso restablecidas a estado nominal', 'exito');
  }, [mostrarAviso]);

  const aplicarSnapshot = useCallback(
    (snapshot: { equipos: EquipoEnEscena[]; conexiones: ConexionEnEscena[] }) => {
      setEquipos(snapshot.equipos);
      setConexiones(snapshot.conexiones);
    },
    []
  );

  return {
    catalogo,
    cargandoCatalogo,
    errorCatalogo,
    equipos,
    conexiones,
    seleccionadoUuid,
    equipoSeleccionado,
    descriptorActivo,
    modo,
    vista,
    setVista,
    origenConexion,
    bombeoActivo,
    setSeleccionadoUuid,
    activarColocacion,
    cambiarModo,
    colocarEquipo,
    seleccionarOConectar,
    moverEquipo,
    rotarEquipo,
    toggleValvula,
    setValvulaAbierta,
    cargarGrafoImportado,
    inyectarNivelAlto,
    restablecerProceso,
    eliminarEquipo,
    toggleBombeo,
    aplicarSnapshot,
  };
}
