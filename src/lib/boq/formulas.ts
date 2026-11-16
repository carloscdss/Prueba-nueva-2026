export type UnidadMedida = 'm' | 'm2' | 'm3' | 'kg' | 'unidad';

export interface PrecioUnitarioItem {
  id: string;
  nombre: string;
  categoria: string;
  unidad: UnidadMedida | string;
  precio_unitario: number;
  formula: string;
}

export interface PartidaManualBOQ {
  id: string;
  partida: string;
  categoria: string;
  unidad: UnidadMedida;
  cantidad: number;
  precio_unitario: number;
  fuente: string;
}

/** Precios referenciales de tubería de acero al carbono Sch40 por diámetro en pulgadas ($/m). */
export const PRECIO_TUBERIA_POR_METRO: Record<number, number> = {
  0.5: 18,
  1: 26,
  2: 45.5,
  3: 62,
  4: 78,
  6: 95,
  8: 125,
  10: 185,
  12: 230,
  16: 340,
  20: 460,
  24: 590,
};

/** Espesor estándar Sch40 en mm por diámetro nominal (pulgadas). */
export const ESPESOR_SCH40_MM: Record<number, number> = {
  0.5: 2.77,
  1: 3.38,
  2: 3.91,
  3: 5.49,
  4: 6.02,
  6: 7.11,
  8: 8.18,
  10: 9.27,
  12: 10.31,
  16: 12.7,
  20: 15.09,
  24: 17.48,
};

/** Peso lineal referencial de perfiles de acero estructural (kg/m). */
export const PESO_PERFIL_POR_METRO: Record<string, number> = {
  'IPR-8x4': 19.3,
  'IPR-10x5.75': 32.7,
  'IPR-12x6.5': 45.0,
  'IPE-200': 22.4,
  'IPE-300': 42.2,
  'Canal-U-6': 12.2,
  'Angulo-3x3x1/4': 7.29,
  'Tubo-Estructural-4x4': 14.4,
};

/** Precios unitarios de cables eléctricos por calibre ($/m). */
export const PRECIO_CABLE_POR_METRO: Record<string, number> = {
  '12AWG': 1.35,
  '10AWG': 1.85,
  '8AWG': 2.45,
  '4AWG': 3.5,
  '2AWG': 5.4,
  '1/0AWG': 8.2,
  'Instrumentacion-Par': 3.5,
};

export const PRECIO_CONCRETO_M3 = 185;
export const PRECIO_ACERO_KG = 1.2;

export const FORMULAS = {
  /**
   * Calcula el peso teórico de acero al carbono (kg) y costo de tubería:
   * W = L * 0.02466 * (OD_mm - t_mm) * t_mm
   */
  tuberia: (longitud_m: number, diametro_pulg: number, espesor_mm?: number) => {
    const t = espesor_mm ?? ESPESOR_SCH40_MM[diametro_pulg] ?? 7.11;
    const od_mm = diametro_pulg * 25.4;
    const peso_kg = Math.max(0, longitud_m * 0.02466 * Math.max(1, od_mm - t) * t);
    const precio_m = PRECIO_TUBERIA_POR_METRO[diametro_pulg] ?? 125;
    return {
      peso_kg: Number(peso_kg.toFixed(2)),
      costo: Number((longitud_m * precio_m).toFixed(2)),
    };
  },

  /**
   * Calcula volumen de concreto (m³), acero de refuerzo estimado (80 kg/m³) y costo.
   */
  concreto: (
    largo_m: number,
    ancho_m: number,
    espesor_m: number,
    precioM3 = PRECIO_CONCRETO_M3
  ) => {
    const volumen_m3 = Math.max(0, largo_m * ancho_m * espesor_m);
    const acero_kg = volumen_m3 * 80;
    return {
      volumen_m3: Number(volumen_m3.toFixed(3)),
      acero_kg: Number(acero_kg.toFixed(1)),
      costo: Number((volumen_m3 * precioM3).toFixed(2)),
    };
  },

  /**
   * Calcula peso total y costo de acero estructural según perfil y longitud.
   */
  acero_estructural: (
    perfil: string,
    longitud_m: number,
    precioKg = PRECIO_ACERO_KG
  ) => {
    const kgPorM = PESO_PERFIL_POR_METRO[perfil] ?? 22.4;
    const peso_kg = Math.max(0, longitud_m * kgPorM);
    return {
      peso_kg: Number(peso_kg.toFixed(2)),
      costo: Number((peso_kg * precioKg).toFixed(2)),
    };
  },

  /**
   * Calcula costo de tendido eléctrico por calibre AWG y longitud.
   */
  cable_electrico: (longitud_m: number, calibre: string) => {
    const precio_m = PRECIO_CABLE_POR_METRO[calibre] ?? 3.5;
    return {
      costo: Number((Math.max(0, longitud_m) * precio_m).toFixed(2)),
    };
  },
};

/** Lista base de precios unitarios reales (USD, mercado Venezuela 2024 / FCC D-6210). */
export const PRECIOS_UNITARIOS_BASE: PrecioUnitarioItem[] = [
  { id: 'torre-fraccionadora', nombre: 'Torre fraccionadora / Absorbedor 8m', categoria: 'Proceso', unidad: 'unidad', precio_unitario: 95000, formula: 'cantidad' },
  { id: 'intercambiador-tubular', nombre: 'Intercambiador tubular casco-tubo', categoria: 'Proceso', unidad: 'unidad', precio_unitario: 14500, formula: 'cantidad' },
  { id: 'bomba-centrifuga', nombre: 'Bomba centrífuga 50 HP', categoria: 'Mecanica', unidad: 'unidad', precio_unitario: 6800, formula: 'cantidad' },
  { id: 'valvula-control', nombre: 'Válvula de control 8" con posicionador', categoria: 'Instrumentacion', unidad: 'unidad', precio_unitario: 4200, formula: 'cantidad' },
  { id: 'valvula-neumatica', nombre: 'Válvula neumática de bloqueo 10"', categoria: 'Instrumentacion', unidad: 'unidad', precio_unitario: 2400, formula: 'cantidad' },
  { id: 'sensor-presion', nombre: 'Transmisor presión 300 PSI', categoria: 'Instrumentacion', unidad: 'unidad', precio_unitario: 850, formula: 'cantidad' },
  { id: 'sensor-nivel', nombre: 'Transmisor de nivel radar/dP', categoria: 'Instrumentacion', unidad: 'unidad', precio_unitario: 1150, formula: 'cantidad' },
  { id: 'sensor-temperatura', nombre: 'Transmisor de temperatura RTD', categoria: 'Instrumentacion', unidad: 'unidad', precio_unitario: 720, formula: 'cantidad' },
  { id: 'sensor-flujo', nombre: 'Transmisor de flujo dP', categoria: 'Instrumentacion', unidad: 'unidad', precio_unitario: 1650, formula: 'cantidad' },
  { id: 'indicador-nivel-vidrio', nombre: 'Indicador nivel cristal (LG)', categoria: 'Instrumentacion', unidad: 'unidad', precio_unitario: 560, formula: 'cantidad' },
  { id: 'switch-presion', nombre: 'Presostato PSH/PSL', categoria: 'Instrumentacion', unidad: 'unidad', precio_unitario: 420, formula: 'cantidad' },
  { id: 'alarma-presion', nombre: 'Anunciador / Alarma presión PAH/PAL', categoria: 'Instrumentacion', unidad: 'unidad', precio_unitario: 380, formula: 'cantidad' },
  { id: 'orificio-medidor', nombre: 'Placa orificio medidora 8"', categoria: 'Tuberia', unidad: 'unidad', precio_unitario: 580, formula: 'cantidad' },
  { id: 'filtro-estrainer', nombre: 'Strainer Y-Type / Succión 10"', categoria: 'Tuberia', unidad: 'unidad', precio_unitario: 1200, formula: 'cantidad' },
  { id: 'tuberia-cs-10-sch40', nombre: 'Tubería CS 10" Sch40', categoria: 'Tuberia', unidad: 'm', precio_unitario: 185, formula: 'longitud * 185' },
  { id: 'tuberia-cs-8-sch40', nombre: 'Tubería CS 8" Sch40', categoria: 'Tuberia', unidad: 'm', precio_unitario: 125, formula: 'longitud * 125' },
  { id: 'tuberia-cs-6-sch40', nombre: 'Tubería CS 6" Sch40', categoria: 'Tuberia', unidad: 'm', precio_unitario: 95, formula: 'longitud * 95' },
  { id: 'codo-90-grados', nombre: 'Codo 90° radio largo 10" Sch40', categoria: 'Tuberia', unidad: 'unidad', precio_unitario: 285, formula: 'cantidad' },
  { id: 'brida-welding-neck', nombre: 'Brida Welding Neck 10" 300# RF', categoria: 'Tuberia', unidad: 'unidad', precio_unitario: 420, formula: 'cantidad' },
  { id: 'fundacion-equipo', nombre: 'Concreto armado f\'c=250 kg/cm² fundación', categoria: 'Civil', unidad: 'm3', precio_unitario: 185, formula: 'volumen * 185' },
  { id: 'acero-estructural', nombre: 'Acero estructural A36 plataformas', categoria: 'Civil', unidad: 'kg', precio_unitario: 1.2, formula: 'longitud * peso_perfil * 1.2' },
  { id: 'cable-4awg', nombre: 'Cable eléctrico 4 AWG / Instrumentación', categoria: 'Electrica', unidad: 'm', precio_unitario: 3.5, formula: 'longitud * 3.5' },
  { id: 'pintura-exterior', nombre: 'Pintura epóxica anticorrosiva industrial', categoria: 'Arquitectura', unidad: 'm2', precio_unitario: 12, formula: 'area * 12' },
];

/** Partidas manuales de levantamiento real para FCC D-6210 (civil, estructuras, pintura, tendido). */
export const PARTIDAS_MANUALES_FCC: PartidaManualBOQ[] = [
  {
    id: 'man-fcc-1',
    partida: 'Fundaciones de concreto armado (D-6210 + 4 bombas + 4 cambiadores)',
    categoria: 'Civil',
    unidad: 'm3',
    cantidad: 45,
    precio_unitario: 185,
    fuente: 'Plano Civil 6100-1-50-0022',
  },
  {
    id: 'man-fcc-2',
    partida: 'Acero estructural A36 para plataformas y pipe-rack',
    categoria: 'Civil',
    unidad: 'kg',
    cantidad: 2800,
    precio_unitario: 1.2,
    fuente: 'Plano Estructural E-6210',
  },
  {
    id: 'man-fcc-3',
    partida: 'Pintura epóxica anticorrosiva en recipientes y líneas',
    categoria: 'Arquitectura',
    unidad: 'm2',
    cantidad: 850,
    precio_unitario: 12,
    fuente: 'Especificación NACE SP0188',
  },
  {
    id: 'man-fcc-4',
    partida: 'Cable de instrumentación apantallado 4-20 mA',
    categoria: 'Electrica',
    unidad: 'm',
    cantidad: 450,
    precio_unitario: 3.5,
    fuente: 'Listado de Lazos LIC-16 / FIC-86',
  },
  {
    id: 'man-fcc-5',
    partida: 'Tubería de aire de instrumentación 1/2" SS316',
    categoria: 'Tuberia',
    unidad: 'm',
    cantidad: 120,
    precio_unitario: 45,
    fuente: 'Levantamiento campo área D-6210',
  },
];
