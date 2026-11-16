/**
 * Portado desde carloscdss/3d-with-pid (src/geometry/*) y Open-Industry-Project (part-sdk).
 * Generadores paramétricos de geometría industrial 3D (domos torisféricos, bridas, patas,
 * visores de nivel, volutas, actuadores bowtie, bandejas tóricas, canales y gabinetes).
 */
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { familiaDe } from '@/src/lib/catalogo';

export interface OpcionesGeometriaEquipo {
  ancho: number;
  alto: number;
  profundidad: number;
  colorBase?: string;
  seleccionado?: boolean;
  abierta?: boolean;
  nivel?: number;
  flujo?: number;
  bombeoActivo?: boolean;
  descriptorId?: string;
}

// Pool de materiales estructurales compartidos para minimizar compilación de shaders en móvil
function crearMaterialCompartido(params: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial(params);
  mat.userData.shared = true;
  return mat;
}

const MAT_BRIDA_SHARED = crearMaterialCompartido({ color: '#cbd5e1', metalness: 0.78, roughness: 0.28 });
const MAT_ACERO_OSCURO_SHARED = crearMaterialCompartido({ color: '#334155', metalness: 0.72, roughness: 0.4 });
const MAT_BASE_OSCURA_SHARED = crearMaterialCompartido({ color: '#1e293b', metalness: 0.58, roughness: 0.48 });
const MAT_VASTAGO_SHARED = crearMaterialCompartido({ color: '#cbd5e1', metalness: 0.85, roughness: 0.2 });
const MAT_VIDRIO_SHARED = crearMaterialCompartido({ color: '#e2e8f0', transparent: true, opacity: 0.35, roughness: 0.15, metalness: 0.1 });
const MAT_FLUIDO_SHARED = crearMaterialCompartido({ color: '#0ea5e9', emissive: '#0284c7', emissiveIntensity: 0.75, roughness: 0.25 });
const MAT_POSICIONADOR_SHARED = crearMaterialCompartido({ color: '#0ea5e9', metalness: 0.55, roughness: 0.35 });
const MAT_ANILLO_SHARED = crearMaterialCompartido({ color: '#94a3b8', metalness: 0.75, roughness: 0.28 });
const MAT_CANAL_SHARED = crearMaterialCompartido({ color: '#475569', metalness: 0.72, roughness: 0.38 });
const MAT_PUERTA_SHARED = crearMaterialCompartido({ color: '#64748b', metalness: 0.62, roughness: 0.32 });
const MAT_PLACA_NEMA_SHARED = crearMaterialCompartido({ color: '#0f172a', emissive: '#0ea5e9', emissiveIntensity: 0.45, metalness: 0.4, roughness: 0.3 });
const MAT_PANTALLA_LCD_SHARED = crearMaterialCompartido({ color: '#0f172a', emissive: '#22d3ee', emissiveIntensity: 0.55, metalness: 0.3, roughness: 0.2 });

/**
 * Crea un domo torisférico ASME (LatheGeometry) con radio `r` y altura `hDomo`.
 * Si `invertido` es true, apunta hacia abajo (fondo del recipiente).
 */
export function createTorisphericalDomeGeometry(
  r: number,
  hDomo: number,
  invertido = false,
  radialSegments = 24
): THREE.LatheGeometry {
  const pts: THREE.Vector2[] = [];
  const pasos = 10;
  for (let i = 0; i <= pasos; i++) {
    const t = i / pasos;
    const angulo = (t * Math.PI) / 2;
    const x = Math.cos(angulo) * r;
    // Perfil elíptico-torisférico 2:1 con transición suave en la pestaña (knuckle)
    const yBase = Math.sin(angulo) * hDomo;
    const y = invertido ? -yBase : yBase;
    pts.push(new THREE.Vector2(Math.max(0.001, x), y));
  }
  const geom = new THREE.LatheGeometry(pts, radialSegments);
  geom.computeVertexNormals();
  return geom;
}

/**
 * Crea una brida industrial Weld-Neck con cara resaltada (Raised Face) y collar de pernos.
 */
export function createFlangeGeometry(
  radioTubo: number,
  espesor = 0.055
): THREE.Group {
  const grupo = new THREE.Group();

  const disco = new THREE.Mesh(
    new THREE.CylinderGeometry(radioTubo * 1.65, radioTubo * 1.65, espesor, 14),
    MAT_BRIDA_SHARED
  );
  grupo.add(disco);

  const cuello = new THREE.Mesh(
    new THREE.CylinderGeometry(radioTubo, radioTubo * 1.25, espesor * 1.3, 12),
    MAT_BRIDA_SHARED
  );
  cuello.position.y = -espesor * 0.9;
  grupo.add(cuello);

  return grupo;
}

/**
 * Crea el cuerpo 3D tipo "bowtie" (doble cono convergente) característico de válvulas industriales.
 */
export function createBowtieValveBodyGeometry(
  largo = 0.72,
  radioExtremo = 0.16,
  radioCentro = 0.065
): THREE.BufferGeometry {
  const half = largo / 2;
  const pts: THREE.Vector2[] = [
    new THREE.Vector2(radioExtremo, -half),
    new THREE.Vector2(radioExtremo, -half * 0.85),
    new THREE.Vector2(radioCentro, 0),
    new THREE.Vector2(radioExtremo, half * 0.85),
    new THREE.Vector2(radioExtremo, half),
  ];
  const geom = new THREE.LatheGeometry(pts, 16);
  geom.rotateZ(Math.PI / 2);
  geom.computeVertexNormals();
  return geom;
}

/**
 * Crea un tanque/recipiente a presión con cilindro + 2 domos torisféricos + 4 patas +
 * bridas entrada/salida + visor de nivel emisivo.
 */
export function createTankGeometry(opts: OpcionesGeometriaEquipo): THREE.Group {
  const grupo = new THREE.Group();
  const w = opts.ancho || 1.6;
  const h = opts.alto || 2.4;
  const d = opts.profundidad || 1.6;
  const r = Math.min(w, d) * 0.44;
  const hDomo = Math.min(r * 0.48, h * 0.16);
  const cuerpoH = h * 0.58;
  const yBaseCuerpo = -h * 0.04;

  const matCuerpo = new THREE.MeshStandardMaterial({
    color: opts.colorBase ?? '#94a3b8',
    metalness: 0.65,
    roughness: 0.32,
    emissive: opts.seleccionado ? '#38bdf8' : '#000000',
    emissiveIntensity: opts.seleccionado ? 0.35 : 0,
  });
  const matAceroOscuro = MAT_ACERO_OSCURO_SHARED;

  // Cilindro principal
  const cuerpo = new THREE.Mesh(
    new THREE.CylinderGeometry(r, r, cuerpoH, 24),
    matCuerpo
  );
  cuerpo.position.y = yBaseCuerpo;
  cuerpo.castShadow = true;
  cuerpo.receiveShadow = true;
  grupo.add(cuerpo);

  // Domo torisférico superior e inferior
  const domoSup = new THREE.Mesh(
    createTorisphericalDomeGeometry(r, hDomo, false, 24),
    matCuerpo
  );
  domoSup.position.y = yBaseCuerpo + cuerpoH / 2;
  domoSup.castShadow = true;
  grupo.add(domoSup);

  const domoInf = new THREE.Mesh(
    createTorisphericalDomeGeometry(r, hDomo, true, 24),
    matCuerpo
  );
  domoInf.position.y = yBaseCuerpo - cuerpoH / 2;
  grupo.add(domoInf);

  // 4 patas estructurales con zapatas de apoyo
  const radioPatas = r * 0.78;
  const altoPata = h * 0.42;
  for (let i = 0; i < 4; i++) {
    const ang = (i * Math.PI) / 2 + Math.PI / 4;
    const px = Math.cos(ang) * radioPatas;
    const pz = Math.sin(ang) * radioPatas;
    const pata = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.055, altoPata, 10),
      matAceroOscuro
    );
    pata.position.set(px, -h / 2 + altoPata / 2, pz);
    pata.castShadow = true;
    grupo.add(pata);

    const zapata = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.04, 0.16),
      matAceroOscuro
    );
    zapata.position.set(px, -h / 2 + 0.02, pz);
    grupo.add(zapata);
  }

  // Bridas de entrada (izquierda superior) y salida (derecha inferior)
  const bridaEntrada = createFlangeGeometry(0.075);
  bridaEntrada.rotation.z = Math.PI / 2;
  bridaEntrada.position.set(-(r + 0.12), yBaseCuerpo + cuerpoH * 0.28, 0);
  grupo.add(bridaEntrada);

  const bridaSalida = createFlangeGeometry(0.075);
  bridaSalida.rotation.z = -Math.PI / 2;
  bridaSalida.position.set(r + 0.12, yBaseCuerpo - cuerpoH * 0.28, 0);
  grupo.add(bridaSalida);

  // Visor de nivel emisivo
  const nivelFrac = Math.max(0.05, Math.min(1, (opts.nivel ?? 50) / 100));
  const altoVisor = cuerpoH * 0.72;
  const tuboVidrio = new THREE.Mesh(
    new THREE.CylinderGeometry(0.042, 0.042, altoVisor, 10),
    MAT_VIDRIO_SHARED
  );
  tuboVidrio.position.set(0, yBaseCuerpo, r + 0.08);
  grupo.add(tuboVidrio);

  const fluido = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.03, altoVisor, 10),
    MAT_FLUIDO_SHARED
  );
  fluido.name = 'visorFluido';
  fluido.userData = { yBaseCuerpo, altoVisor };
  fluido.scale.y = nivelFrac;
  fluido.position.set(
    0,
    yBaseCuerpo - altoVisor / 2 + (altoVisor * nivelFrac) / 2,
    r + 0.08
  );
  grupo.add(fluido);

  return grupo;
}

/**
 * Crea una bomba centrífuga con base/patín + voluta toroidal + motor cilíndrico separado + bridas.
 */
export function createPumpGeometry(opts: OpcionesGeometriaEquipo): THREE.Group {
  const grupo = new THREE.Group();
  const w = opts.ancho || 1.6;
  const h = opts.alto || 1.3;
  const d = opts.profundidad || 0.9;
  const activo = Boolean(opts.bombeoActivo);

  const matBomba = new THREE.MeshStandardMaterial({
    color: opts.colorBase ?? '#38bdf8',
    metalness: 0.65,
    roughness: 0.3,
    emissive: opts.seleccionado ? '#38bdf8' : '#000000',
    emissiveIntensity: opts.seleccionado ? 0.35 : 0,
  });
  const matBase = MAT_BASE_OSCURA_SHARED;
  const matMotor = new THREE.MeshStandardMaterial({
    color: activo ? '#059669' : '#475569',
    metalness: 0.6,
    roughness: 0.38,
    emissive: activo ? '#10b981' : '#000000',
    emissiveIntensity: activo ? 0.4 : 0,
  });

  // Patín/Base estructural
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(w * 0.95, 0.14, d * 0.84),
    matBase
  );
  base.position.y = -h / 2 + 0.07;
  base.castShadow = true;
  base.receiveShadow = true;
  grupo.add(base);

  // Voluta centrífuga (toroide + carcasa del rodete)
  const rVoluta = Math.min(h * 0.28, d * 0.34);
  const voluta = new THREE.Mesh(
    new THREE.TorusGeometry(rVoluta, rVoluta * 0.36, 14, 24),
    matBomba
  );
  voluta.rotation.y = Math.PI / 2;
  voluta.position.set(-w * 0.24, -h / 2 + 0.14 + rVoluta * 1.15, 0);
  voluta.castShadow = true;
  grupo.add(voluta);

  const centroImpulsor = new THREE.Mesh(
    new THREE.CylinderGeometry(rVoluta * 0.72, rVoluta * 0.72, 0.22, 18),
    matBomba
  );
  centroImpulsor.rotation.z = Math.PI / 2;
  centroImpulsor.position.copy(voluta.position);
  grupo.add(centroImpulsor);

  // Motor cilíndrico separado + acople
  const acople = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.06, w * 0.2, 12),
    matBase
  );
  acople.rotation.z = Math.PI / 2;
  acople.position.set(-w * 0.04, voluta.position.y, 0);
  grupo.add(acople);

  const motor = new THREE.Mesh(
    new THREE.CylinderGeometry(rVoluta * 0.85, rVoluta * 0.85, w * 0.42, 18),
    matMotor
  );
  motor.rotation.z = Math.PI / 2;
  motor.position.set(w * 0.22, voluta.position.y, 0);
  motor.castShadow = true;
  grupo.add(motor);

  const cajaBornera = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 0.14, 0.18),
    matBase
  );
  cajaBornera.position.set(w * 0.22, voluta.position.y + rVoluta * 0.95, 0);
  grupo.add(cajaBornera);

  // Brida de succión axial y brida de descarga superior
  const bridaSuccion = createFlangeGeometry(0.075);
  bridaSuccion.rotation.z = Math.PI / 2;
  bridaSuccion.position.set(-w * 0.44, voluta.position.y, 0);
  grupo.add(bridaSuccion);

  const bridaDescarga = createFlangeGeometry(0.07);
  bridaDescarga.position.set(voluta.position.x, voluta.position.y + rVoluta * 1.45, 0);
  grupo.add(bridaDescarga);

  return grupo;
}

/**
 * Crea una válvula industrial con cuerpo bowtie 3D + vástago + actuador según tipo.
 */
export function createValveGeometry(opts: OpcionesGeometriaEquipo): THREE.Group {
  const grupo = new THREE.Group();
  const abierta = opts.abierta !== false;
  const colorEstado = abierta ? '#10b981' : '#ef4444';
  const id = opts.descriptorId ?? 'valvula-manual';

  const matCuerpo = new THREE.MeshStandardMaterial({
    color: opts.colorBase ?? '#64748b',
    metalness: 0.72,
    roughness: 0.28,
    emissive: opts.seleccionado ? '#38bdf8' : '#000000',
    emissiveIntensity: opts.seleccionado ? 0.35 : 0,
  });
  const matVastago = MAT_VASTAGO_SHARED;
  const matActuador = new THREE.MeshStandardMaterial({
    color: colorEstado,
    metalness: 0.55,
    roughness: 0.35,
    emissive: opts.seleccionado ? '#38bdf8' : colorEstado,
    emissiveIntensity: opts.seleccionado ? 0.45 : 0.25,
  });

  // Cuerpo bowtie 3D + bridas laterales
  const bowtie = new THREE.Mesh(
    createBowtieValveBodyGeometry(0.68, 0.16, 0.065),
    matCuerpo
  );
  bowtie.castShadow = true;
  grupo.add(bowtie);

  const bridaIzq = createFlangeGeometry(0.085, 0.04);
  bridaIzq.rotation.z = Math.PI / 2;
  bridaIzq.position.x = -0.34;
  grupo.add(bridaIzq);

  const bridaDer = createFlangeGeometry(0.085, 0.04);
  bridaDer.rotation.z = -Math.PI / 2;
  bridaDer.position.x = 0.34;
  grupo.add(bridaDer);

  // Vástago
  const vastago = new THREE.Mesh(
    new THREE.CylinderGeometry(0.032, 0.032, 0.34, 12),
    matVastago
  );
  vastago.position.y = 0.2;
  grupo.add(vastago);

  // Actuador según tipo
  if (id === 'valvula-manual') {
    const aroVolante = new THREE.Mesh(
      new THREE.TorusGeometry(0.2, 0.028, 10, 22),
      matActuador
    );
    aroVolante.rotation.x = Math.PI / 2;
    aroVolante.position.y = 0.38;
    grupo.add(aroVolante);

    const cruz1 = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.025, 0.03), matActuador);
    cruz1.position.y = 0.38;
    grupo.add(cruz1);
    const cruz2 = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.025, 0.38), matActuador);
    cruz2.position.y = 0.38;
    grupo.add(cruz2);
  } else if (id === 'valvula-neumatica') {
    const domo = new THREE.Mesh(
      createTorisphericalDomeGeometry(0.21, 0.14, false, 20),
      matActuador
    );
    domo.position.y = 0.36;
    domo.castShadow = true;
    grupo.add(domo);

    const plato = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.22, 0.06, 20),
      matActuador
    );
    plato.position.y = 0.34;
    grupo.add(plato);
  } else if (id === 'valvula-control') {
    // Diafragma superior + caja posicionador I/P lateral
    const domo = new THREE.Mesh(
      createTorisphericalDomeGeometry(0.2, 0.13, false, 20),
      matActuador
    );
    domo.position.y = 0.38;
    grupo.add(domo);

    const plato = new THREE.Mesh(
      new THREE.CylinderGeometry(0.21, 0.21, 0.06, 20),
      matActuador
    );
    plato.position.y = 0.36;
    grupo.add(plato);

    const cajaPosicionador = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.18, 0.16),
      MAT_POSICIONADOR_SHARED
    );
    cajaPosicionador.position.set(0.18, 0.22, 0);
    grupo.add(cajaPosicionador);
  } else if (id === 'valvula-solenoid') {
    const bobina = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.17, 0.16),
      matActuador
    );
    bobina.position.y = 0.38;
    grupo.add(bobina);
  } else {
    // Válvula de seguridad / alivio (resorte + descarga lateral)
    const capuchon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.11, 0.26, 14),
      matActuador
    );
    capuchon.position.y = 0.38;
    grupo.add(capuchon);

    const descarga = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 0.22, 12),
      matCuerpo
    );
    descarga.rotation.z = Math.PI / 2;
    descarga.position.set(0.18, 0.08, 0);
    grupo.add(descarga);
  }

  return grupo;
}

/**
 * Crea una torre fraccionadora / absorbedor con cilindro alto, bandejas tóricas, domo, falda y 4 bridas.
 */
export function createTowerGeometry(opts: OpcionesGeometriaEquipo): THREE.Group {
  const grupo = new THREE.Group();
  const w = opts.ancho || 2.2;
  const h = Math.max(opts.alto || 8, 8);
  const r = Math.max(0.75, Math.min(w, opts.profundidad || w) * 0.42);
  const hFalda = h * 0.14;
  const hDomo = r * 0.55;
  const hCuerpo = h - hFalda - hDomo;

  const matTorre = new THREE.MeshStandardMaterial({
    color: opts.colorBase ?? '#64748b',
    metalness: 0.65,
    roughness: 0.32,
    emissive: opts.seleccionado ? '#38bdf8' : '#000000',
    emissiveIntensity: opts.seleccionado ? 0.35 : 0,
  });
  const matAnillo = MAT_ANILLO_SHARED;
  const matFalda = MAT_ACERO_OSCURO_SHARED;

  // Falda de soporte inferior
  const falda = new THREE.Mesh(
    new THREE.CylinderGeometry(r * 0.98, r * 1.12, hFalda, 24),
    matFalda
  );
  falda.position.y = -h / 2 + hFalda / 2;
  falda.castShadow = true;
  falda.receiveShadow = true;
  grupo.add(falda);

  // Cilindro alto
  const cuerpo = new THREE.Mesh(
    new THREE.CylinderGeometry(r, r, hCuerpo, 28),
    matTorre
  );
  cuerpo.position.y = -h / 2 + hFalda + hCuerpo / 2;
  cuerpo.castShadow = true;
  cuerpo.receiveShadow = true;
  grupo.add(cuerpo);

  // Domo torisférico superior
  const domo = new THREE.Mesh(
    createTorisphericalDomeGeometry(r, hDomo, false, 28),
    matTorre
  );
  domo.position.y = -h / 2 + hFalda + hCuerpo;
  grupo.add(domo);

  // Bandejas tóricas internas/externas (6 anillos)
  for (let i = 1; i <= 6; i++) {
    const yBandeja = -h / 2 + hFalda + (hCuerpo * i) / 7;
    const anillo = new THREE.Mesh(
      new THREE.TorusGeometry(r + 0.03, 0.032, 10, 28),
      matAnillo
    );
    anillo.rotation.x = Math.PI / 2;
    anillo.position.y = yBandeja;
    grupo.add(anillo);
  }

  // 4 bridas de alimentación / extracción en elevaciones escalonadas
  const elevaciones = [0.2, 0.42, 0.65, 0.85];
  elevaciones.forEach((frac, idx) => {
    const lado = idx % 2 === 0 ? 1 : -1;
    const brida = createFlangeGeometry(0.09, 0.06);
    brida.rotation.z = lado > 0 ? -Math.PI / 2 : Math.PI / 2;
    brida.position.set(lado * (r + 0.14), -h / 2 + hFalda + hCuerpo * frac, 0);
    grupo.add(brida);
  });

  return grupo;
}

/**
 * Crea un intercambiador tubular TEMA con cilindro horizontal, 2 canales (cajas) y bridas en 4 lados.
 */
export function createHeatExchangerGeometry(
  opts: OpcionesGeometriaEquipo
): THREE.Group {
  const grupo = new THREE.Group();
  const w = opts.ancho || 1.8;
  const h = opts.alto || 0.9;
  const d = opts.profundidad || 0.9;
  const r = Math.min(h, d) * 0.36;

  const matCasco = new THREE.MeshStandardMaterial({
    color: opts.colorBase ?? '#f59e0b',
    metalness: 0.62,
    roughness: 0.34,
    emissive: opts.seleccionado ? '#38bdf8' : '#000000',
    emissiveIntensity: opts.seleccionado ? 0.35 : 0,
  });
  const matCanal = MAT_CANAL_SHARED;

  // Cilindro horizontal (casco)
  const casco = new THREE.Mesh(
    new THREE.CylinderGeometry(r, r, w * 0.68, 22),
    matCasco
  );
  casco.rotation.z = Math.PI / 2;
  casco.castShadow = true;
  grupo.add(casco);

  // 2 canales extremos (cajas)
  const canalIzq = new THREE.Mesh(
    new THREE.BoxGeometry(w * 0.16, r * 2.05, r * 2.05),
    matCanal
  );
  canalIzq.position.x = -w * 0.42;
  canalIzq.castShadow = true;
  grupo.add(canalIzq);

  const canalDer = new THREE.Mesh(
    new THREE.BoxGeometry(w * 0.16, r * 2.05, r * 2.05),
    matCanal
  );
  canalDer.position.x = w * 0.42;
  canalDer.castShadow = true;
  grupo.add(canalDer);

  // Soportes de silla (2)
  [-w * 0.22, w * 0.22].forEach((sx) => {
    const soporte = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, h * 0.36, r * 1.6),
      matCanal
    );
    soporte.position.set(sx, -h * 0.3, 0);
    grupo.add(soporte);
  });

  // Bridas 4 lados (casco arriba/abajo + tubos izq/der)
  const bridaArriba = createFlangeGeometry(0.065, 0.045);
  bridaArriba.position.set(-w * 0.14, r + 0.1, 0);
  grupo.add(bridaArriba);

  const bridaAbajo = createFlangeGeometry(0.065, 0.045);
  bridaAbajo.rotation.z = Math.PI;
  bridaAbajo.position.set(w * 0.14, -(r + 0.1), 0);
  grupo.add(bridaAbajo);

  const bridaIzq = createFlangeGeometry(0.065, 0.045);
  bridaIzq.rotation.z = Math.PI / 2;
  bridaIzq.position.set(-w * 0.54, 0, 0);
  grupo.add(bridaIzq);

  const bridaDer = createFlangeGeometry(0.065, 0.045);
  bridaDer.rotation.z = -Math.PI / 2;
  bridaDer.position.set(w * 0.54, 0, 0);
  grupo.add(bridaDer);

  return grupo;
}

/**
 * Crea un gabinete NEMA / tablero de control con cuerpo, puerta frontal con bisagras,
 * rejilla de ventilación y placa de identificación.
 */
export function createCabinetGeometry(opts: OpcionesGeometriaEquipo): THREE.Group {
  const grupo = new THREE.Group();
  const w = opts.ancho || 1.0;
  const h = opts.alto || 2.0;
  const d = opts.profundidad || 0.8;

  const matCuerpo = new THREE.MeshStandardMaterial({
    color: opts.colorBase ?? '#475569',
    metalness: 0.58,
    roughness: 0.38,
    emissive: opts.seleccionado ? '#38bdf8' : '#000000',
    emissiveIntensity: opts.seleccionado ? 0.35 : 0,
  });
  const matPuerta = MAT_PUERTA_SHARED;
  const matMetal = MAT_BASE_OSCURA_SHARED;

  // Cuerpo principal
  const caja = new THREE.Mesh(new THREE.BoxGeometry(w, h, d * 0.92), matCuerpo);
  caja.position.z = -d * 0.04;
  caja.castShadow = true;
  caja.receiveShadow = true;
  grupo.add(caja);

  // Puerta frontal + 2 bisagras + manija
  const puerta = new THREE.Mesh(
    new THREE.BoxGeometry(w * 0.92, h * 0.92, 0.04),
    matPuerta
  );
  puerta.position.z = d * 0.44;
  grupo.add(puerta);

  [-h * 0.28, h * 0.28].forEach((hy) => {
    const bisagra = new THREE.Mesh(
      new THREE.CylinderGeometry(0.022, 0.022, 0.1, 8),
      matMetal
    );
    bisagra.position.set(-w * 0.46, hy, d * 0.46);
    grupo.add(bisagra);
  });

  const manija = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.16, 0.04), matMetal);
  manija.position.set(w * 0.38, 0, d * 0.47);
  grupo.add(manija);

  // Rejilla de ventilación inferior
  for (let i = 0; i < 4; i++) {
    const lama = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.58, 0.025, 0.02),
      matMetal
    );
    lama.position.set(0, -h * 0.34 + i * 0.055, d * 0.465);
    grupo.add(lama);
  }

  // Placa de identificación superior
  const placa = new THREE.Mesh(
    new THREE.BoxGeometry(w * 0.46, h * 0.09, 0.015),
    MAT_PLACA_NEMA_SHARED
  );
  placa.position.set(0, h * 0.34, d * 0.47);
  grupo.add(placa);

  return grupo;
}

/**
 * Crea un recipiente filtro industrial (multimedia / carbón activado / estrainer)
 * con casco vertical, domos torisféricos, registro frontal y 3 patas estructurales.
 */
export function createFilterVesselGeometry(opts: OpcionesGeometriaEquipo): THREE.Group {
  const grupo = new THREE.Group();
  const w = Math.max(0.65, opts.ancho || 0.7);
  const h = Math.max(0.85, opts.alto || 0.95);
  const d = Math.max(0.65, opts.profundidad || 0.7);
  const r = Math.min(w, d) * 0.42;
  const hDomo = r * 0.42;
  const cuerpoH = h * 0.54;

  const matFiltro = new THREE.MeshStandardMaterial({
    color: opts.colorBase ?? '#64748b',
    metalness: 0.68,
    roughness: 0.3,
    emissive: opts.seleccionado ? '#38bdf8' : '#000000',
    emissiveIntensity: opts.seleccionado ? 0.38 : 0,
  });

  const cuerpo = new THREE.Mesh(new THREE.CylinderGeometry(r, r, cuerpoH, 18), matFiltro);
  cuerpo.position.y = 0.04;
  cuerpo.castShadow = true;
  grupo.add(cuerpo);

  const domoSup = new THREE.Mesh(createTorisphericalDomeGeometry(r, hDomo, false, 18), matFiltro);
  domoSup.position.y = 0.04 + cuerpoH / 2;
  grupo.add(domoSup);

  const domoInf = new THREE.Mesh(createTorisphericalDomeGeometry(r, hDomo, true, 18), matFiltro);
  domoInf.position.y = 0.04 - cuerpoH / 2;
  grupo.add(domoInf);

  // Tapa / manway superior y bridas laterales
  const bocaHombre = createFlangeGeometry(r * 0.32, 0.04);
  bocaHombre.position.set(0, 0.04 + cuerpoH / 2 + hDomo + 0.02, 0);
  grupo.add(bocaHombre);

  const bridaIn = createFlangeGeometry(0.055, 0.04);
  bridaIn.rotation.z = Math.PI / 2;
  bridaIn.position.set(-(r + 0.08), 0.12, 0);
  grupo.add(bridaIn);

  const bridaOut = createFlangeGeometry(0.055, 0.04);
  bridaOut.rotation.z = -Math.PI / 2;
  bridaOut.position.set(r + 0.08, -0.06, 0);
  grupo.add(bridaOut);

  // 3 patas estructurales
  for (let i = 0; i < 3; i++) {
    const ang = (i * Math.PI * 2) / 3;
    const pata = new THREE.Mesh(
      new THREE.CylinderGeometry(0.032, 0.036, h * 0.36, 8),
      MAT_ACERO_OSCURO_SHARED
    );
    pata.position.set(Math.cos(ang) * r * 0.72, -h * 0.3, Math.sin(ang) * r * 0.72);
    grupo.add(pata);
  }

  return grupo;
}

/**
 * Crea instrumentación de campo industrial (transmisores HART, analizadores, manómetros,
 * placas orificio y visores) compartiendo materiales base.
 */
export function createInstrumentGeometry(opts: OpcionesGeometriaEquipo): THREE.Group {
  const grupo = new THREE.Group();
  const id = opts.descriptorId ?? '';
  const fam = familiaDe(id);

  const matCuerpo = new THREE.MeshStandardMaterial({
    color: opts.colorBase ?? '#22d3ee',
    metalness: 0.62,
    roughness: 0.3,
    emissive: opts.seleccionado ? '#38bdf8' : '#000000',
    emissiveIntensity: opts.seleccionado ? 0.45 : 0,
  });

  if (id === 'orificio-medidor') {
    const disco = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.1, 18), matCuerpo);
    disco.rotation.z = Math.PI / 2;
    grupo.add(disco);
    const brida1 = createFlangeGeometry(0.09, 0.04);
    brida1.rotation.z = Math.PI / 2;
    brida1.position.x = -0.09;
    grupo.add(brida1);
    const brida2 = createFlangeGeometry(0.09, 0.04);
    brida2.rotation.z = -Math.PI / 2;
    brida2.position.x = 0.09;
    grupo.add(brida2);
    return grupo;
  }

  if (id === 'indicador-nivel-vidrio') {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.78, 12), MAT_VIDRIO_SHARED);
    grupo.add(col);
    const interno = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.56, 10), MAT_FLUIDO_SHARED);
    interno.position.y = -0.06;
    grupo.add(interno);
    [-0.36, 0.36].forEach((py) => {
      const br = createFlangeGeometry(0.055, 0.035);
      br.rotation.z = Math.PI / 2;
      br.position.set(-0.08, py, 0);
      grupo.add(br);
    });
    return grupo;
  }

  // Vástago / proceso + cabezal transmisor cilíndrico antideflagrante + visor LCD
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.28, 8), MAT_VASTAGO_SHARED);
  stem.position.y = -0.14;
  grupo.add(stem);

  const esAnalizador = fam === 'analizador' || fam === 'convertidor';
  if (esAnalizador) {
    const caja = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.16), matCuerpo);
    caja.position.y = 0.08;
    grupo.add(caja);
    const lcd = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.02), MAT_PANTALLA_LCD_SHARED);
    lcd.position.set(0, 0.1, 0.085);
    grupo.add(lcd);
  } else {
    const cabeza = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.11, 16), matCuerpo);
    cabeza.rotation.x = Math.PI / 2;
    cabeza.position.y = 0.08;
    grupo.add(cabeza);
    const bisel = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.02, 14), MAT_PANTALLA_LCD_SHARED);
    bisel.rotation.x = Math.PI / 2;
    bisel.position.set(0, 0.08, 0.06);
    grupo.add(bisel);
  }

  return grupo;
}

/**
 * Limpia geometrías y materiales no compartidos de un THREE.Group construido proceduralmente.
 */
export function disposeGroupResources(grupo: THREE.Object3D): void {
  grupo.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose();
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) {
        if (m && !m.userData?.shared) {
          m.dispose();
        }
      }
    }
  });
}

/**
 * Componente R3F que renderiza la geometría paramétrica industrial correspondiente
 * a cada familia/descriptor del catálogo sin primitivas planas.
 */
export function GeometriaEquipo3D({
  descriptorId,
  ancho,
  alto,
  profundidad,
  colorBase,
  seleccionado,
  abierta,
  nivel,
  flujo,
  bombeoActivo,
}: {
  descriptorId: string;
  ancho: number;
  alto: number;
  profundidad: number;
  colorBase: string;
  seleccionado: boolean;
  abierta: boolean;
  nivel: number;
  flujo: number;
  bombeoActivo: boolean;
}) {
  const fam = familiaDe(descriptorId);

  const grupo = useMemo(() => {
    const opts: OpcionesGeometriaEquipo = {
      ancho,
      alto,
      profundidad,
      colorBase,
      seleccionado,
      abierta,
      nivel,
      flujo,
      bombeoActivo,
      descriptorId,
    };

    if (
      descriptorId === 'torre-fraccionadora' ||
      descriptorId === 'absorbedor'
    ) {
      return createTowerGeometry(opts);
    }
    if (
      descriptorId === 'tanque-vertical' ||
      descriptorId === 'columna-resina' ||
      descriptorId === 'separador-vertical' ||
      descriptorId === 'separador-horizontal' ||
      descriptorId === 'acumulador-proceso'
    ) {
      return createTankGeometry(opts);
    }
    if (
      descriptorId === 'bomba-centrifuga' ||
      descriptorId === 'soplador-centrifugo' ||
      descriptorId === 'compresor-centrifugo'
    ) {
      return createPumpGeometry(opts);
    }
    if (fam === 'valvula') {
      return createValveGeometry(opts);
    }
    if (descriptorId === 'intercambiador-tubular') {
      return createHeatExchangerGeometry(opts);
    }
    if (descriptorId === 'gabinete-base' || descriptorId === 'ups-industrial') {
      return createCabinetGeometry(opts);
    }
    if (descriptorId === 'filtro-estrainer' || fam === 'filtro') {
      return createFilterVesselGeometry(opts);
    }
    if (
      fam === 'sensor' ||
      fam === 'analizador' ||
      fam === 'switch' ||
      fam === 'alarma' ||
      fam === 'indicador' ||
      fam === 'controlador' ||
      fam === 'selector' ||
      fam === 'manometro' ||
      fam === 'convertidor' ||
      descriptorId === 'orificio-medidor'
    ) {
      return createInstrumentGeometry(opts);
    }
    return null;
  }, [
    descriptorId,
    fam,
    ancho,
    alto,
    profundidad,
    colorBase,
    seleccionado,
    abierta,
    bombeoActivo,
  ]);

  useEffect(() => {
    if (!grupo) return;
    const visor = grupo.getObjectByName('visorFluido');
    if (visor instanceof THREE.Mesh) {
      const nivelFrac = Math.max(0.04, Math.min(1, (nivel ?? 50) / 100));
      const { yBaseCuerpo = 0, altoVisor = 1 } = visor.userData as {
        yBaseCuerpo?: number;
        altoVisor?: number;
      };
      visor.scale.y = nivelFrac;
      visor.position.y =
        yBaseCuerpo - altoVisor / 2 + (altoVisor * nivelFrac) / 2;
    }
  }, [grupo, nivel, flujo]);

  useEffect(() => {
    return () => {
      if (grupo) disposeGroupResources(grupo);
    };
  }, [grupo]);

  if (!grupo) return null;
  return <primitive object={grupo} />;
}
