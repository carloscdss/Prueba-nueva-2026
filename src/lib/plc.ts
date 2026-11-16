export type ModoLazo = 'AUTO' | 'MANUAL';
export type TipoLazo = 'PI' | 'PID' | 'ON-OFF';
export type PrioridadAlarma = 'CRITICAL' | 'HIGH' | 'LOW' | 'INFO';

export interface ReglaPLC {
  id: string;
  nombre: string;
  habilitada: boolean;
  disparada: boolean;
  tagSensor: string;
  parametro: 'nivel' | 'presion';
  umbral: number;
  tagActuador: string;
  accionAbierta: boolean;
}

export interface LazoControl {
  id: string;
  tag: string;
  tipo: TipoLazo;
  pv: number;
  sp: number;
  op: number;
  modo: ModoLazo;
  instrumentoPV: string;
  instrumentoOP: string;
  kp?: number;
  ki?: number;
  alarmaAlta?: number;
  alarmaBaja?: number;
}

export interface AlarmaHMI {
  id: string;
  tag: string;
  mensaje: string;
  prioridad: PrioridadAlarma;
  timestamp: number;
  reconocida: boolean;
}

export const REGLAS_PLC_INICIALES: ReglaPLC[] = [
  {
    id: 'r-d6210-hi',
    nombre: 'Interlock Nivel Alto D-6210',
    habilitada: true,
    disparada: false,
    tagSensor: 'D-6210',
    parametro: 'nivel',
    umbral: 85,
    tagActuador: 'LV-16',
    accionAbierta: false,
  },
  {
    id: 'r-col101-hi',
    nombre: 'Interlock Nivel Alto COL-101',
    habilitada: true,
    disparada: false,
    tagSensor: 'COL-101',
    parametro: 'nivel',
    umbral: 85,
    tagActuador: 'XV-101',
    accionAbierta: false,
  },
];

export const LAZOS_FCC: LazoControl[] = [
  {
    id: 'lic-16',
    tag: 'LIC-16',
    tipo: 'PID',
    pv: 52,
    sp: 50,
    op: 45,
    modo: 'AUTO',
    instrumentoPV: 'lt-16',
    instrumentoOP: 'lv-16',
    kp: 1.2,
    ki: 0.25,
    alarmaAlta: 85,
    alarmaBaja: 15,
  },
  {
    id: 'fic-86',
    tag: 'FIC-86',
    tipo: 'PID',
    pv: 42,
    sp: 60,
    op: 50,
    modo: 'AUTO',
    instrumentoPV: 'ft-86',
    instrumentoOP: 'fv-86',
    kp: 1.5,
    ki: 0.3,
    alarmaAlta: 95,
  },
];
