export interface PayloadImportacion {
  nombre: string;
  equipos: Array<{
    uuid: string;
    tag: string;
    descriptorId: string;
    posicion: [number, number, number];
    rotacionY?: number;
  }>;
  conexiones: Array<{
    id: string;
    equipoA: string;
    puertoA: string;
    equipoB: string;
    puertoB: string;
    activo?: boolean;
  }>;
}

export const DEMO_FCC_D6210: PayloadImportacion = {
  nombre: 'FCC Concentración de Gas - Absorbedor Primario D-6210 (6100-1-50-0022 Rev.B)',
  equipos: [
    { uuid: 'd-6210', tag: 'D-6210', descriptorId: 'torre-fraccionadora', posicion: [0, 4, 0], rotacionY: 0 },
    { uuid: 'g-6215a', tag: 'G-6215A', descriptorId: 'bomba-centrifuga', posicion: [0, 0.65, 4], rotacionY: 0 },
    { uuid: 'g-6215b', tag: 'G-6215B', descriptorId: 'bomba-centrifuga', posicion: [2.5, 0.65, 4], rotacionY: 0 },
    { uuid: 'e-6215a', tag: 'E-6215A', descriptorId: 'intercambiador-tubular', posicion: [-5, 0.45, 1], rotacionY: 0 },
    { uuid: 'e-6215b', tag: 'E-6215B', descriptorId: 'intercambiador-tubular', posicion: [-5, 0.45, 3.5], rotacionY: 0 },
    { uuid: 'e-6216a', tag: 'E-6216A', descriptorId: 'intercambiador-tubular', posicion: [-9, 0.45, 1], rotacionY: 0 },
    { uuid: 'e-6216b', tag: 'E-6216B', descriptorId: 'intercambiador-tubular', posicion: [-9, 0.45, 3.5], rotacionY: 0 },
    { uuid: 'g-6216a', tag: 'G-6216A', descriptorId: 'bomba-centrifuga', posicion: [-7, 0.65, 6], rotacionY: 0 },
    { uuid: 'g-6216b', tag: 'G-6216B', descriptorId: 'bomba-centrifuga', posicion: [-4.5, 0.65, 6], rotacionY: 0 },
    { uuid: 'lv-16', tag: 'LV-16', descriptorId: 'valvula-control', posicion: [2, 0.475, 1.5], rotacionY: 0 },
    { uuid: 'fv-86', tag: 'FV-86', descriptorId: 'valvula-control', posicion: [-2.2, 0.475, 5.2], rotacionY: 0 },
    { uuid: 'mv-15a', tag: 'MV-15A', descriptorId: 'valvula-neumatica', posicion: [0.8, 0.425, 2.5], rotacionY: 0 },
    { uuid: 'mv-15b', tag: 'MV-15B', descriptorId: 'valvula-neumatica', posicion: [3.3, 0.425, 2.5], rotacionY: 0 },
    { uuid: 'lt-16', tag: 'LT-16', descriptorId: 'sensor-nivel', posicion: [1.6, 1, 0.6], rotacionY: 0 },
    { uuid: 'lg-46a', tag: 'LG-46A', descriptorId: 'indicador-nivel-vidrio', posicion: [1.6, 1.8, -0.4], rotacionY: 0 },
    { uuid: 'pi-63', tag: 'PI-63', descriptorId: 'sensor-presion', posicion: [-1.6, 6, 0.6], rotacionY: 0 },
    { uuid: 'ti-366', tag: 'TI-366', descriptorId: 'sensor-temperatura', posicion: [1.6, 0.8, -1.2], rotacionY: 0 },
    { uuid: 'fe-85', tag: 'FE-85', descriptorId: 'orificio-medidor', posicion: [-3.8, 0.2, 4.8], rotacionY: 0 },
    { uuid: 'ft-86', tag: 'FT-86', descriptorId: 'sensor-flujo', posicion: [-3.8, 0.5, 5.8], rotacionY: 0 },
    { uuid: 'psh-210', tag: 'PSH-210', descriptorId: 'switch-presion', posicion: [3.6, 1.2, 4.5], rotacionY: 0 },
    { uuid: 'psl-207', tag: 'PSL-207', descriptorId: 'switch-presion', posicion: [-6.5, 1.2, 7.2], rotacionY: 0 },
    { uuid: 'pah-206', tag: 'PAH-206', descriptorId: 'alarma-presion', posicion: [2.5, 1.2, 5.2], rotacionY: 0 },
    { uuid: 'pal-207', tag: 'PAL-207', descriptorId: 'alarma-presion', posicion: [-7.5, 1.2, 7.2], rotacionY: 0 },
    { uuid: 'st-2203', tag: 'ST-2203', descriptorId: 'filtro-estrainer', posicion: [-1.4, 0.3, 2.5], rotacionY: 0 },
  ],
  conexiones: [
    { id: 'c1', equipoA: 'd-6210', puertoA: 'salida-fondo', equipoB: 'st-2203', puertoB: 'entrada', activo: true },
    { id: 'c2', equipoA: 'st-2203', puertoA: 'salida', equipoB: 'g-6215a', puertoB: 'succion', activo: true },
    { id: 'c3', equipoA: 'g-6215a', puertoA: 'descarga', equipoB: 'mv-15a', puertoB: 'entrada', activo: true },
    { id: 'c4', equipoA: 'mv-15a', puertoA: 'salida', equipoB: 'e-6215a', puertoB: 'proceso-entrada', activo: true },
    { id: 'c5', equipoA: 'e-6215a', puertoA: 'proceso-salida', equipoB: 'e-6215b', puertoB: 'proceso-entrada', activo: true },
    { id: 'c6', equipoA: 'e-6215b', puertoA: 'proceso-salida', equipoB: 'e-6216a', puertoB: 'proceso-entrada', activo: true },
    { id: 'c7', equipoA: 'e-6216a', puertoA: 'proceso-salida', equipoB: 'e-6216b', puertoB: 'proceso-entrada', activo: true },
    { id: 'c8', equipoA: 'e-6216b', puertoA: 'proceso-salida', equipoB: 'g-6216a', puertoB: 'succion', activo: true },
    { id: 'c9', equipoA: 'g-6216a', puertoA: 'descarga', equipoB: 'fe-85', puertoB: 'entrada', activo: true },
    { id: 'c10', equipoA: 'fe-85', puertoA: 'salida', equipoB: 'fv-86', puertoB: 'entrada', activo: true },
    { id: 'c11', equipoA: 'lv-16', puertoA: 'salida', equipoB: 'd-6210', puertoB: 'entrada-superior', activo: true },
    { id: 'c12', equipoA: 'lt-16', puertoA: 'senal', equipoB: 'lv-16', puertoB: 'senal', activo: true },
    { id: 'c13', equipoA: 'ft-86', puertoA: 'senal', equipoB: 'fv-86', puertoB: 'senal', activo: true },
    { id: 'c14', equipoA: 'd-6210', puertoA: 'salida-fondo', equipoB: 'g-6215b', puertoB: 'succion', activo: false },
    { id: 'c15', equipoA: 'g-6215b', puertoA: 'descarga', equipoB: 'mv-15b', puertoB: 'entrada', activo: false },
  ],
};
