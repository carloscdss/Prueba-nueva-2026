import { useEffect, useState } from 'react';

export type TipoPuerto = 'proceso' | 'instrumento' | 'electrico';

export interface PuertoCatalogo {
  id: string;
  tipo: TipoPuerto;
  pos: [number, number, number];
  dir: [number, number, number];
}

export interface Descriptor {
  id: string;
  nombre: string;
  categoria: string;
  prefijo: string;
  color: string;
  precio: number;
  unidad?: string;
  precio_base?: number;
  formula_calculo?: string;
  especificaciones?: string[];
  dimensiones: {
    ancho: number;
    alto: number;
    profundidad: number;
  };
  puertos: PuertoCatalogo[];
}

export interface EquipoEnEscena {
  uuid: string;
  tag: string;
  descriptorId: string;
  posicion: [number, number, number];
  rotacionY: number;
  abierta: boolean;
  nivel: number;
  presion: number;
  flujo: number;
}

export interface ConexionEnEscena {
  id: string;
  equipoA: string;
  puertoA: string;
  equipoB: string;
  puertoB: string;
  activo: boolean;
}

export function familiaDe(descriptorId: string): string {
  if (!descriptorId) return 'equipo';
  return descriptorId.split('-')[0];
}

export function siguienteTag(
  prefijo: string,
  equipos: ReadonlyArray<{ tag: string }>
): string {
  const limpio = (prefijo || 'EQ').toUpperCase();
  const regex = new RegExp(`^${limpio}-(\\d+)$`);
  let max = 100;
  for (const eq of equipos) {
    const match = eq.tag.match(regex);
    if (match) {
      const n = Number.parseInt(match[1], 10);
      if (n > max) max = n;
    }
  }
  return `${limpio}-${max + 1}`;
}

let cacheCatalogo: Descriptor[] | null = null;

export function getDescriptor(
  id: string,
  lista?: ReadonlyArray<Descriptor>
): Descriptor | undefined {
  const fuente = lista ?? cacheCatalogo ?? [];
  return fuente.find((item) => item.id === id);
}

export function usarCatalogo(): {
  catalogo: Descriptor[];
  cargando: boolean;
  error: string | null;
} {
  const [catalogo, setCatalogo] = useState<Descriptor[]>(() => cacheCatalogo ?? []);
  const [cargando, setCargando] = useState<boolean>(cacheCatalogo === null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let montado = true;
    if (cacheCatalogo) {
      setCatalogo(cacheCatalogo);
      setCargando(false);
      return;
    }

    fetch('/catalogo/manifest.json')
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`No se pudo cargar manifest.json (${res.status})`);
        }
        return (await res.json()) as Descriptor[];
      })
      .then((data) => {
        if (!montado) return;
        cacheCatalogo = data;
        setCatalogo(data);
        setCargando(false);
      })
      .catch((err: unknown) => {
        if (!montado) return;
        setError(err instanceof Error ? err.message : 'Error cargando catálogo');
        setCargando(false);
      });

    return () => {
      montado = false;
    };
  }, []);

  return { catalogo, cargando, error };
}
