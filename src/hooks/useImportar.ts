import { useCallback, useState } from 'react';
import {
  type ConexionEnEscena,
  type Descriptor,
  type EquipoEnEscena,
  getDescriptor,
} from '@/src/lib/catalogo';
import { LAZOS_FCC, type LazoControl } from '@/src/lib/plc';

export interface ItemValidacionImportar {
  tag: string;
  descriptorId: string;
  estado: 'ok' | 'advertencia' | 'error';
  detalle: string;
}

export interface ResultadoValidacionImportar {
  valido: boolean;
  errorSyntax?: string;
  items: ItemValidacionImportar[];
  equiposNormalizados: EquipoEnEscena[];
  conexionesNormalizadas: ConexionEnEscena[];
  lazosDetectados?: LazoControl[];
}

interface UseImportarParams {
  catalogo: Descriptor[];
  onAplicarGrafo: (
    equipos: EquipoEnEscena[],
    conexiones: ConexionEnEscena[],
    nombre: string
  ) => void;
  onCargarLazos?: (lazos: LazoControl[]) => void;
  mostrarAviso: (texto: string, tipo?: 'info' | 'exito' | 'error') => void;
}

export function useImportar({
  catalogo,
  onAplicarGrafo,
  onCargarLazos,
  mostrarAviso,
}: UseImportarParams) {
  const [modalAbierto, setModalAbierto] = useState(false);

  const validarJson = useCallback(
    (raw: string): ResultadoValidacionImportar => {
      try {
        const parsed = JSON.parse(raw) as {
          nombre?: string;
          equipos?: Array<{
            uuid?: string;
            tag?: string;
            descriptorId?: string;
            posicion?: [number, number, number];
            rotacionY?: number;
          }>;
          conexiones?: Array<{
            id?: string;
            equipoA?: string;
            puertoA?: string;
            equipoB?: string;
            puertoB?: string;
            activo?: boolean;
          }>;
          lazos_plc?: LazoControl[];
        };

        if (!Array.isArray(parsed.equipos) || !Array.isArray(parsed.conexiones)) {
          return {
            valido: false,
            errorSyntax: 'El JSON debe contener arreglos "equipos" y "conexiones".',
            items: [],
            equiposNormalizados: [],
            conexionesNormalizadas: [],
          };
        }

        const tagsVistos = new Set<string>();
        const items: ItemValidacionImportar[] = [];
        const equiposNormalizados: EquipoEnEscena[] = [];

        for (const eq of parsed.equipos) {
          const tag = (eq.tag ?? 'SIN-TAG').replace(/\s+/g, '');
          const uuid = (eq.uuid ?? tag.toLowerCase()).replace(/\s+/g, '');
          const descriptorId = eq.descriptorId ?? '';
          const desc = getDescriptor(descriptorId, catalogo);

          if (!desc) {
            items.push({
              tag,
              descriptorId,
              estado: 'error',
              detalle: 'descriptorId no existe en manifest.json',
            });
          } else if (tagsVistos.has(tag)) {
            items.push({
              tag,
              descriptorId,
              estado: 'error',
              detalle: 'Tag duplicado',
            });
          } else {
            const seNormalizo = tag !== eq.tag;
            items.push({
              tag,
              descriptorId,
              estado: seNormalizo ? 'advertencia' : 'ok',
              detalle: seNormalizo ? `Tag normalizado (${eq.tag} → ${tag})` : 'Válido',
            });
          }

          tagsVistos.add(tag);
          equiposNormalizados.push({
            uuid,
            tag,
            descriptorId,
            posicion: eq.posicion ?? [0, (desc?.dimensiones.alto ?? 1) / 2, 0],
            rotacionY: eq.rotacionY ?? 0,
            abierta: true,
            nivel: descriptorId === 'torre-fraccionadora' ? 54 : 38,
            presion: 1.2,
            flujo: 0,
          });
        }

        const uuids = new Set(equiposNormalizados.map((e) => e.uuid));
        const conexionesNormalizadas: ConexionEnEscena[] = parsed.conexiones
          .filter((c) => c.equipoA && c.equipoB && uuids.has(c.equipoA) && uuids.has(c.equipoB))
          .map((c, idx) => ({
            id: c.id ?? `conn-${idx + 1}`,
            equipoA: c.equipoA!,
            puertoA: c.puertoA ?? 'salida',
            equipoB: c.equipoB!,
            puertoB: c.puertoB ?? 'entrada',
            activo: Boolean(c.activo),
          }));

        const hayErrores = items.some((i) => i.estado === 'error');
        const lazosDetectados = Array.isArray(parsed.lazos_plc)
          ? parsed.lazos_plc
          : parsed.nombre?.includes('D-6210')
          ? LAZOS_FCC
          : undefined;

        return {
          valido: !hayErrores && equiposNormalizados.length > 0,
          items,
          equiposNormalizados,
          conexionesNormalizadas,
          lazosDetectados,
        };
      } catch (err: unknown) {
        return {
          valido: false,
          errorSyntax: err instanceof Error ? err.message : 'JSON inválido',
          items: [],
          equiposNormalizados: [],
          conexionesNormalizadas: [],
        };
      }
    },
    [catalogo]
  );

  const aplicarImportacion = useCallback(
    (resultado: ResultadoValidacionImportar, nombre = 'Levantamiento P&ID') => {
      if (!resultado.valido) {
        mostrarAviso('Corrige los errores antes de aplicar el levantamiento', 'error');
        return;
      }
      onAplicarGrafo(resultado.equiposNormalizados, resultado.conexionesNormalizadas, nombre);
      if (resultado.lazosDetectados && onCargarLazos) {
        onCargarLazos(resultado.lazosDetectados);
      }
      setModalAbierto(false);
      mostrarAviso(
        `Levantamiento aplicado: ${resultado.equiposNormalizados.length} equipos y ${resultado.conexionesNormalizadas.length} líneas`,
        'exito'
      );
    },
    [onAplicarGrafo, onCargarLazos, mostrarAviso]
  );

  return {
    modalAbierto,
    abrirModal: () => setModalAbierto(true),
    cerrarModal: () => setModalAbierto(false),
    validarJson,
    aplicarImportacion,
  };
}
