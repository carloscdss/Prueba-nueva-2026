import type { Descriptor, EquipoEnEscena } from './catalogo';
import { getDescriptor } from './catalogo';

export function snapRejilla(valor: number, paso = 0.5): number {
  return Math.round(valor / paso) * paso;
}

export function dimensionesRotadas(
  descriptor: Descriptor | undefined,
  rotacionY: number
): { ancho: number; profundidad: number } {
  const anchoBase = descriptor?.dimensiones.ancho ?? 1.2;
  const profBase = descriptor?.dimensiones.profundidad ?? 1.2;
  const cuartos = Math.abs(Math.round(rotacionY / (Math.PI / 2))) % 2;
  return cuartos === 1
    ? { ancho: profBase, profundidad: anchoBase }
    : { ancho: anchoBase, profundidad: profBase };
}

export function hayColision(
  x: number,
  z: number,
  descriptor: Descriptor | undefined,
  rotacionY: number,
  equipos: ReadonlyArray<EquipoEnEscena>,
  catalogo: ReadonlyArray<Descriptor>,
  ignorarUuid?: string
): boolean {
  const dimA = dimensionesRotadas(descriptor, rotacionY);
  const margen = 0.25;

  for (const eq of equipos) {
    if (eq.uuid === ignorarUuid) continue;
    const descB = getDescriptor(eq.descriptorId, catalogo);
    const dimB = dimensionesRotadas(descB, eq.rotacionY);
    const dx = Math.abs(x - eq.posicion[0]);
    const dz = Math.abs(z - eq.posicion[2]);
    if (
      dx < (dimA.ancho + dimB.ancho) / 2 + margen &&
      dz < (dimA.profundidad + dimB.profundidad) / 2 + margen
    ) {
      return true;
    }
  }
  return false;
}
