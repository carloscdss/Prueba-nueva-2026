/**
 * Portado desde carloscdss/3d-with-pid (src/drafting/*).
 * Proyección P&ID 2D: layout topológico DAG (Algoritmo de Kahn), routing ortogonal
 * con detección y evasión de colisiones, y simbología vectorial ISA-5.1.
 */
import {
  type ConexionEnEscena,
  type Descriptor,
  type EquipoEnEscena,
  familiaDe,
  getDescriptor,
} from '@/src/lib/catalogo';
import { dimensionesRotadas } from '@/src/lib/colocacion';

export interface RectanguloObstaculo {
  uuid: string;
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

export interface Punto2D {
  x: number;
  y: number;
}

export interface RutaOrtogonalPID {
  puntos: Punto2D[];
  pathSvg: string;
  tuvoDesvio: boolean;
}

export interface PrimitivaSvgISA {
  tipo: 'circle' | 'rect' | 'polygon' | 'path' | 'line';
  props: Record<string, string | number>;
}

export interface SimboloISA51 {
  categoriaSimbolo:
    | 'bomba'
    | 'valvula'
    | 'recipiente'
    | 'torre'
    | 'intercambiador'
    | 'instrumento'
    | 'controlador_plc'
    | 'filtro';
  primitivas: PrimitivaSvgISA[];
  etiquetaInterna?: string;
}

/**
 * Ordenamiento topológico (Algoritmo de Kahn) sobre el grafo dirigido de equipos y conexiones.
 * Útil para proyectar flujos P&ID de izquierda a derecha y asignar capas de proceso.
 */
export function ordenamientoTopologicoKahn(
  equipos: ReadonlyArray<EquipoEnEscena>,
  conexiones: ReadonlyArray<ConexionEnEscena>
): { orden: string[]; capas: Map<string, number> } {
  const gradoEntrada = new Map<string, number>();
  const adyacencia = new Map<string, string[]>();
  const capas = new Map<string, number>();

  for (const eq of equipos) {
    gradoEntrada.set(eq.uuid, 0);
    adyacencia.set(eq.uuid, []);
    capas.set(eq.uuid, 0);
  }

  for (const c of conexiones) {
    if (!adyacencia.has(c.equipoA) || !gradoEntrada.has(c.equipoB)) continue;
    if (c.equipoA === c.equipoB) continue;
    adyacencia.get(c.equipoA)!.push(c.equipoB);
    gradoEntrada.set(c.equipoB, (gradoEntrada.get(c.equipoB) ?? 0) + 1);
  }

  const cola: string[] = [];
  for (const [uuid, grado] of gradoEntrada.entries()) {
    if (grado === 0) cola.push(uuid);
  }

  const orden: string[] = [];
  const visitados = new Set<string>();

  while (cola.length > 0) {
    const actual = cola.shift()!;
    orden.push(actual);
    visitados.add(actual);
    const capaActual = capas.get(actual) ?? 0;

    for (const vecino of adyacencia.get(actual) ?? []) {
      capas.set(vecino, Math.max(capas.get(vecino) ?? 0, capaActual + 1));
      const siguienteGrado = (gradoEntrada.get(vecino) ?? 0) - 1;
      gradoEntrada.set(vecino, siguienteGrado);
      if (siguienteGrado === 0) {
        cola.push(vecino);
      }
    }
  }

  // Manejo seguro de ciclos (reciclos de proceso o lazos de control cerrados)
  for (const eq of equipos) {
    if (!visitados.has(eq.uuid)) {
      orden.push(eq.uuid);
    }
  }

  return { orden, capas };
}

/**
 * Construye los rectángulos de colisión 2D para cada equipo en el plano P&ID.
 */
export function construirObstaculosPID(
  equipos: ReadonlyArray<EquipoEnEscena>,
  catalogo: ReadonlyArray<Descriptor>,
  escala: number,
  margenPx = 8
): RectanguloObstaculo[] {
  return equipos.map((eq) => {
    const desc = getDescriptor(eq.descriptorId, catalogo);
    const dim = dimensionesRotadas(desc, eq.rotacionY);
    const w = Math.max(24, dim.ancho * escala);
    const h = Math.max(24, dim.profundidad * escala);
    const cx = eq.posicion[0] * escala;
    const cy = eq.posicion[2] * escala;
    return {
      uuid: eq.uuid,
      xMin: cx - w / 2 - margenPx,
      xMax: cx + w / 2 + margenPx,
      yMin: cy - h / 2 - margenPx,
      yMax: cy + h / 2 + margenPx,
    };
  });
}

function segmentoIntersectaRect(
  p1: Punto2D,
  p2: Punto2D,
  rect: RectanguloObstaculo
): boolean {
  const minX = Math.min(p1.x, p2.x);
  const maxX = Math.max(p1.x, p2.x);
  const minY = Math.min(p1.y, p2.y);
  const maxY = Math.max(p1.y, p2.y);

  // Segmento horizontal o vertical ortogonal
  if (Math.abs(p1.y - p2.y) < 0.01) {
    const y = p1.y;
    return y > rect.yMin && y < rect.yMax && maxX > rect.xMin && minX < rect.xMax;
  }
  if (Math.abs(p1.x - p2.x) < 0.01) {
    const x = p1.x;
    return x > rect.xMin && x < rect.xMax && maxY > rect.yMin && minY < rect.yMax;
  }
  return maxX > rect.xMin && minX < rect.xMax && maxY > rect.yMin && minY < rect.yMax;
}

function rutaTieneColision(
  puntos: Punto2D[],
  obstaculos: ReadonlyArray<RectanguloObstaculo>,
  excluirA: string,
  excluirB: string
): RectanguloObstaculo | null {
  for (let i = 0; i < puntos.length - 1; i++) {
    for (const rect of obstaculos) {
      if (rect.uuid === excluirA || rect.uuid === excluirB) continue;
      if (segmentoIntersectaRect(puntos[i], puntos[i + 1], rect)) {
        return rect;
      }
    }
  }
  return null;
}

function puntosAPathSvg(puntos: Punto2D[]): string {
  if (puntos.length === 0) return '';
  return puntos
    .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');
}

/**
 * Calcula una ruta ortogonal entre `origen` y `destino` evitando atravesar equipos intermedios.
 */
export function calcularRutaOrtogonalSinColisiones(
  origen: Punto2D,
  destino: Punto2D,
  obstaculos: ReadonlyArray<RectanguloObstaculo>,
  uuidA: string,
  uuidB: string
): RutaOrtogonalPID {
  const xMid = (origen.x + destino.x) / 2;
  const yMid = (origen.y + destino.y) / 2;

  const candidatas: Punto2D[][] = [
    // H-V-H clásica
    [origen, { x: xMid, y: origen.y }, { x: xMid, y: destino.y }, destino],
    // V-H-V alternativa
    [origen, { x: origen.x, y: yMid }, { x: destino.x, y: yMid }, destino],
  ];

  for (const pts of candidatas) {
    if (!rutaTieneColision(pts, obstaculos, uuidA, uuidB)) {
      return {
        puntos: pts,
        pathSvg: puntosAPathSvg(pts),
        tuvoDesvio: false,
      };
    }
  }

  // Si ambas candidatas intersectan algún equipo, rodear por arriba o por abajo del obstáculo
  const obstaculo = rutaTieneColision(candidatas[0], obstaculos, uuidA, uuidB);
  if (obstaculo) {
    const pad = 18;
    const yArriba = obstaculo.yMin - pad;
    const yAbajo = obstaculo.yMax + pad;
    const costoArriba =
      Math.abs(origen.y - yArriba) + Math.abs(destino.y - yArriba);
    const costoAbajo =
      Math.abs(origen.y - yAbajo) + Math.abs(destino.y - yAbajo);
    const yDesvio = costoArriba <= costoAbajo ? yArriba : yAbajo;

    const ptsDesvio: Punto2D[] = [
      origen,
      { x: origen.x, y: yDesvio },
      { x: destino.x, y: yDesvio },
      destino,
    ];
    if (!rutaTieneColision(ptsDesvio, obstaculos, uuidA, uuidB)) {
      return {
        puntos: ptsDesvio,
        pathSvg: puntosAPathSvg(ptsDesvio),
        tuvoDesvio: true,
      };
    }
  }

  return {
    puntos: candidatas[0],
    pathSvg: puntosAPathSvg(candidatas[0]),
    tuvoDesvio: false,
  };
}

/**
 * Genera los trazos vectoriales SVG según norma ISA-5.1 para cada familia de equipo/instrumento.
 */
export function generarSimboloISA51(
  descriptorId: string,
  tag: string,
  w: number,
  h: number,
  color: string,
  abierta: boolean
): SimboloISA51 {
  const fam = familiaDe(descriptorId);
  const prefijoTag = tag.split('-')[0] || 'XX';

  // Bombas / Sopladores / Compresores: círculo + triángulo direccional ISA-5.1
  if (fam === 'bomba' || fam === 'soplador' || fam === 'compresor') {
    const r = Math.max(13, Math.min(w, h) * 0.45);
    return {
      categoriaSimbolo: 'bomba',
      primitivas: [
        {
          tipo: 'circle',
          props: { cx: 0, cy: 0, r, fill: '#0f172a', stroke: color, strokeWidth: 2 },
        },
        {
          tipo: 'polygon',
          props: {
            points: `${-r * 0.45},${-r * 0.52} ${r * 0.65},0 ${-r * 0.45},${r * 0.52}`,
            fill: color,
            opacity: 0.9,
          },
        },
        {
          tipo: 'line',
          props: { x1: 0, y1: -r, x2: r * 1.15, y2: -r, stroke: color, strokeWidth: 2 },
        },
      ],
    };
  }

  // Válvulas: bowtie ISA-5.1 + vástago + actuador según tipo
  if (fam === 'valvula') {
    const colorAct = abierta ? '#10b981' : '#ef4444';
    const primitivas: PrimitivaSvgISA[] = [
      {
        tipo: 'polygon',
        props: {
          points: '-15,-9 0,0 -15,9',
          fill: abierta ? '#0f172a' : '#450a0a',
          stroke: colorAct,
          strokeWidth: 2,
        },
      },
      {
        tipo: 'polygon',
        props: {
          points: '15,-9 0,0 15,9',
          fill: abierta ? '#0f172a' : '#450a0a',
          stroke: colorAct,
          strokeWidth: 2,
        },
      },
      {
        tipo: 'line',
        props: { x1: 0, y1: 0, x2: 0, y2: -13, stroke: '#94a3b8', strokeWidth: 1.8 },
      },
    ];

    if (descriptorId === 'valvula-manual') {
      primitivas.push({
        tipo: 'line',
        props: { x1: -10, y1: -13, x2: 10, y2: -13, stroke: colorAct, strokeWidth: 2.2 },
      });
    } else if (descriptorId === 'valvula-solenoid') {
      primitivas.push({
        tipo: 'rect',
        props: {
          x: -7,
          y: -22,
          width: 14,
          height: 10,
          fill: '#0f172a',
          stroke: colorAct,
          strokeWidth: 1.8,
        },
      });
    } else {
      // Diafragma neumático / control (semicírculo ISA-5.1)
      primitivas.push({
        tipo: 'path',
        props: {
          d: 'M -11 -13 A 11 11 0 0 1 11 -13 Z',
          fill: '#0f172a',
          stroke: colorAct,
          strokeWidth: 1.8,
        },
      });
    }

    return { categoriaSimbolo: 'valvula', primitivas };
  }

  // Intercambiador de calor: círculo con línea interna en Z (serpentín)
  if (fam === 'intercambiador') {
    const r = Math.max(14, Math.min(w, h) * 0.45);
    return {
      categoriaSimbolo: 'intercambiador',
      primitivas: [
        {
          tipo: 'circle',
          props: { cx: 0, cy: 0, r, fill: '#0f172a', stroke: color, strokeWidth: 2 },
        },
        {
          tipo: 'path',
          props: {
            d: `M ${-r * 0.75} 0 L ${-r * 0.25} ${-r * 0.45} L ${r * 0.25} ${r * 0.45} L ${r * 0.75} 0`,
            fill: 'none',
            stroke: color,
            strokeWidth: 1.8,
          },
        },
      ],
    };
  }

  // Instrumentación ISA-5.1: burbuja circular con barra horizontal central
  if (
    fam === 'sensor' ||
    fam === 'switch' ||
    fam === 'alarma' ||
    fam === 'indicador' ||
    fam === 'controlador' ||
    fam === 'selector' ||
    fam === 'analizador' ||
    fam === 'manometro' ||
    fam === 'convertidor'
  ) {
    const r = Math.max(15, Math.min(w, h) * 0.45);
    return {
      categoriaSimbolo: 'instrumento',
      etiquetaInterna: prefijoTag,
      primitivas: [
        {
          tipo: 'circle',
          props: { cx: 0, cy: 0, r, fill: '#0f172a', stroke: color, strokeWidth: 2 },
        },
        {
          tipo: 'line',
          props: {
            x1: -r,
            y1: 0,
            x2: r,
            y2: 0,
            stroke: color,
            strokeWidth: 1,
            ...(fam === 'controlador' ? {} : { strokeDasharray: '2 2' }),
          },
        },
      ],
    };
  }

  // PLC / HMI / Gabinete: símbolo DCS/PLC ISA-5.1 (cuadrado con círculo inscrito)
  if (fam === 'gabinete' || fam === 'plc' || fam === 'hmi' || fam === 'ups') {
    const s = Math.max(26, Math.min(w, h) * 0.8);
    return {
      categoriaSimbolo: 'controlador_plc',
      etiquetaInterna: prefijoTag,
      primitivas: [
        {
          tipo: 'rect',
          props: {
            x: -s / 2,
            y: -s / 2,
            width: s,
            height: s,
            rx: 2,
            fill: '#0f172a',
            stroke: color,
            strokeWidth: 1.8,
          },
        },
        {
          tipo: 'circle',
          props: {
            cx: 0,
            cy: 0,
            r: s * 0.42,
            fill: 'none',
            stroke: color,
            strokeWidth: 1.4,
          },
        },
      ],
    };
  }

  // Filtros / Strainers
  if (fam === 'filtro' || fam === 'orificio') {
    return {
      categoriaSimbolo: 'filtro',
      primitivas: [
        {
          tipo: 'rect',
          props: {
            x: -w * 0.42,
            y: -h * 0.42,
            width: w * 0.84,
            height: h * 0.84,
            rx: 3,
            fill: '#0f172a',
            stroke: color,
            strokeWidth: 1.8,
          },
        },
        {
          tipo: 'line',
          props: {
            x1: -w * 0.3,
            y1: -h * 0.3,
            x2: w * 0.3,
            y2: h * 0.3,
            stroke: color,
            strokeWidth: 1.4,
            strokeDasharray: '3 2',
          },
        },
      ],
    };
  }

  // Recipientes, tanques y torres: cápsula con línea de nivel
  const rw = Math.max(24, w * 0.88);
  const rh = Math.max(30, h * 0.92);
  return {
    categoriaSimbolo: fam === 'torre' || fam === 'absorbedor' ? 'torre' : 'recipiente',
    primitivas: [
      {
        tipo: 'rect',
        props: {
          x: -rw / 2,
          y: -rh / 2,
          width: rw,
          height: rh,
          rx: rw * 0.38,
          fill: '#0f172a',
          stroke: color,
          strokeWidth: 2,
        },
      },
      {
        tipo: 'line',
        props: {
          x1: -rw * 0.4,
          y1: rh * 0.12,
          x2: rw * 0.4,
          y2: rh * 0.12,
          stroke: '#38bdf8',
          strokeWidth: 1.4,
          strokeDasharray: '3 2',
        },
      },
    ],
  };
}
