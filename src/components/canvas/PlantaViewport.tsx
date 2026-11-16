import React, { Component, type ErrorInfo, memo, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, type ThreeEvent, useFrame, useThree } from '@react-three/fiber';
import { Grid, Line, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { Download, Focus, Minus, Plus, RotateCcw } from 'lucide-react';
import {
  type ConexionEnEscena,
  type Descriptor,
  type EquipoEnEscena,
  familiaDe,
  getDescriptor,
} from '@/src/lib/catalogo';
import { GeometriaEquipo3D } from '@/src/lib/catalogo/geometria';
import { dimensionesRotadas, hayColision, snapRejilla } from '@/src/lib/colocacion';
import {
  calcularRutaOrtogonalSinColisiones,
  construirObstaculosPID,
  generarSimboloISA51,
} from '@/src/lib/pid/proyeccion';
import type { ModoEditor, VistaActiva } from '@/src/hooks/useEquipos';

interface PlantaViewportProps {
  vista: VistaActiva;
  modo: ModoEditor;
  equipos: EquipoEnEscena[];
  conexiones: ConexionEnEscena[];
  catalogo: Descriptor[];
  seleccionadoUuid: string | null;
  descriptorActivo: Descriptor | null;
  origenConexion: string | null;
  bombeoActivo: boolean;
  onColocarEquipo: (x: number, z: number) => void;
  onSeleccionarEquipo: (uuid: string) => void;
  onDeseleccionar?: () => void;
}

const ESCALA_BASE = 42;
const LOD_DISTANCE_THRESHOLD = 42;
const _tmpVec = new THREE.Vector3();
const _tmpCamPos = new THREE.Vector3();

class CanvasErrorBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Error en escena 3D WebGL:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

function WebGLDetector({ onError }: { onError: () => void }) {
  const { gl } = useThree();

  useEffect(() => {
    try {
      if (!gl || !gl.getContext()) {
        onError();
      }
    } catch {
      onError();
    }
  }, [gl, onError]);

  return null;
}

interface CameraRigProps {
  equipos: EquipoEnEscena[];
  fitTrigger: number;
}

function CameraRig({ equipos, fitTrigger }: CameraRigProps) {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const { camera } = useThree();
  const equiposRef = useRef<EquipoEnEscena[]>(equipos);
  equiposRef.current = equipos;
  const prevCountRef = useRef<number>(equipos.length);
  const lastFitTriggerRef = useRef<number>(0);

  const encuadrar = useCallback(() => {
    const lista = equiposRef.current;
    if (lista.length === 0) {
      camera.position.set(10, 7.5, 11);
      controlsRef.current?.target.set(0, 0, 0);
      controlsRef.current?.update();
      return;
    }

    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    let maxY = 2;

    for (const eq of lista) {
      minX = Math.min(minX, eq.posicion[0]);
      maxX = Math.max(maxX, eq.posicion[0]);
      minZ = Math.min(minZ, eq.posicion[2]);
      maxZ = Math.max(maxZ, eq.posicion[2]);
      maxY = Math.max(maxY, eq.posicion[1] * 2);
    }

    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;
    const span = Math.max(8, maxX - minX, maxZ - minZ, maxY);
    const dist = Math.min(30, Math.max(9.5, span * 0.92));

    camera.position.set(cx + dist * 0.65, Math.max(5.5, dist * 0.48), cz + dist * 0.72);
    if (controlsRef.current) {
      controlsRef.current.target.set(cx, Math.min(2.0, maxY * 0.22), cz);
      controlsRef.current.update();
    }
  }, [camera]);

  useEffect(() => {
    if (fitTrigger > 0 && fitTrigger !== lastFitTriggerRef.current) {
      lastFitTriggerRef.current = fitTrigger;
      encuadrar();
    }
  }, [fitTrigger, encuadrar]);

  useEffect(() => {
    if (Math.abs(equipos.length - prevCountRef.current) >= 8) {
      prevCountRef.current = equipos.length;
      encuadrar();
    } else {
      prevCountRef.current = equipos.length;
    }
  }, [equipos.length, encuadrar]);

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      maxPolarAngle={Math.PI * 0.485}
      minDistance={2.5}
      maxDistance={60}
      enableDamping
      dampingFactor={0.08}
      touches={{
        ONE: THREE.TOUCH.ROTATE,
        TWO: THREE.TOUCH.DOLLY_PAN,
      }}
    />
  );
}

function construirCurvaOrtogonal(
  posA: [number, number, number],
  posB: [number, number, number]
): { curva: THREE.CurvePath<THREE.Vector3>; puntos: [number, number, number][] } {
  const [ax, ay, az] = posA;
  const [bx, by, bz] = posB;
  const midX = (ax + bx) / 2;

  const crudos: THREE.Vector3[] = [
    new THREE.Vector3(ax, ay, az),
    new THREE.Vector3(midX, ay, az),
    new THREE.Vector3(midX, by, bz),
    new THREE.Vector3(bx, by, bz),
  ];

  // Eliminar vértices duplicados consecutivos para evitar segmentos de longitud cero en TubeGeometry
  const filtrados: THREE.Vector3[] = [];
  for (const p of crudos) {
    if (filtrados.length === 0 || filtrados[filtrados.length - 1].distanceToSquared(p) > 1e-4) {
      filtrados.push(p);
    }
  }
  if (filtrados.length < 2) {
    filtrados.push(new THREE.Vector3(ax + 0.05, ay, az));
  }

  const curva = new THREE.CurvePath<THREE.Vector3>();
  for (let i = 0; i < filtrados.length - 1; i++) {
    curva.add(new THREE.LineCurve3(filtrados[i], filtrados[i + 1]));
  }

  return {
    curva,
    puntos: filtrados.map((v) => [v.x, v.y, v.z]),
  };
}

interface Tuberia3DProps {
  posA: [number, number, number];
  posB: [number, number, number];
  activo: boolean;
  esSenal: boolean;
  isMobile: boolean;
  esPlantaGrande: boolean;
}

const OFFSETS_PARTICULAS_FULL = [0, 0.25, 0.5, 0.75];
const OFFSETS_PARTICULAS_ECO = [0.15, 0.65];

const Tuberia3D = memo(function Tuberia3D({
  posA,
  posB,
  activo,
  esSenal,
  isMobile,
  esPlantaGrande,
}: Tuberia3DProps) {
  const { curva, puntos } = useMemo(
    () => construirCurvaOrtogonal(posA, posB),
    [posA[0], posA[1], posA[2], posB[0], posB[1], posB[2]]
  );

  const offsets = isMobile || esPlantaGrande ? OFFSETS_PARTICULAS_ECO : OFFSETS_PARTICULAS_FULL;
  const particulasRef = useRef<Array<THREE.Mesh | null>>([]);

  useFrame(({ clock }) => {
    if (!activo || esSenal) return;
    const baseT = clock.getElapsedTime() * 0.4;
    for (let i = 0; i < offsets.length; i++) {
      const mesh = particulasRef.current[i];
      if (!mesh) continue;
      const t = (baseT + offsets[i]) % 1;
      curva.getPointAt(t, _tmpVec);
      mesh.position.copy(_tmpVec);
    }
  });

  if (esSenal) {
    return (
      <Line
        points={puntos}
        color="#0891b2"
        lineWidth={1.2}
        dashed
        dashSize={0.28}
        gapSize={0.22}
      />
    );
  }

  return (
    <group>
      <mesh castShadow={!isMobile} receiveShadow={!isMobile}>
        <tubeGeometry args={[curva, isMobile ? 12 : 28, 0.065, isMobile ? 6 : 8, false]} />
        <meshStandardMaterial
          color={activo ? '#3b82f6' : '#52665f'}
          emissive={activo ? '#3b82f6' : '#000000'}
          emissiveIntensity={activo ? 0.35 : 0}
          metalness={0.6}
          roughness={0.35}
        />
      </mesh>
      {activo &&
        offsets.map((_, idx) => (
          <mesh
            key={idx}
            ref={(el) => {
              particulasRef.current[idx] = el;
            }}
          >
            <sphereGeometry args={[0.1, isMobile ? 6 : 10, isMobile ? 6 : 10]} />
            <meshStandardMaterial
              color="#7dd3fc"
              emissive="#38bdf8"
              emissiveIntensity={0.85}
              metalness={0.2}
              roughness={0.2}
            />
          </mesh>
        ))}
    </group>
  );
});

interface EtiquetaSpriteProps {
  texto: string;
  posicion: [number, number, number];
  color?: string;
  fondo?: string;
  compacta?: boolean;
  depthTest?: boolean;
}

const EtiquetaSprite = memo(function EtiquetaSprite({
  texto,
  posicion,
  color = '#cbd5e1',
  fondo = 'rgba(9, 13, 22, 0.78)',
  compacta = false,
  depthTest = false,
}: EtiquetaSpriteProps) {
  const { texture, aspect } = useMemo(() => {
    const canvas = document.createElement('canvas');
    const fontPx = 26;
    const padX = 14;
    const padY = 9;
    const ctx = canvas.getContext('2d');
    const font = `600 ${fontPx}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    let textWidth = Math.max(24, texto.length * 16);
    if (ctx) {
      ctx.font = font;
      textWidth = Math.ceil(ctx.measureText(texto).width);
    }
    canvas.width = Math.max(64, textWidth + padX * 2);
    canvas.height = fontPx + padY * 2;
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = fondo;
      if (typeof ctx.roundRect === 'function') {
        ctx.beginPath();
        ctx.roundRect(0, 0, canvas.width, canvas.height, 8);
        ctx.fill();
      } else {
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      ctx.font = font;
      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(texto, canvas.width / 2, canvas.height / 2 + 1);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    return { texture: tex, aspect: canvas.width / canvas.height };
  }, [texto, color, fondo]);

  useEffect(() => {
    return () => {
      texture.dispose();
    };
  }, [texture]);

  const spriteHeight = compacta ? 0.34 : 0.4;
  const spriteWidth = spriteHeight * aspect;

  return (
    <sprite position={posicion} scale={[spriteWidth, spriteHeight, 1]} renderOrder={12}>
      <spriteMaterial
        map={texture}
        transparent
        depthTest={depthTest}
        depthWrite={false}
        sizeAttenuation
      />
    </sprite>
  );
});

function esEquipoPrincipalEtiquetable(descriptorId: string, tag: string): boolean {
  const fam = familiaDe(descriptorId);
  if (
    fam === 'tanque' ||
    fam === 'torre' ||
    fam === 'absorbedor' ||
    fam === 'bomba' ||
    fam === 'compresor' ||
    fam === 'soplador' ||
    fam === 'intercambiador' ||
    fam === 'gabinete' ||
    fam === 'ups'
  ) {
    return true;
  }
  if (descriptorId === 'filtro-estrainer' && (tag === 'D-951' || tag === 'D-957')) {
    return true;
  }
  return false;
}

interface EquipoMeshProps {
  descriptorId: string;
  tag: string;
  colorBase?: string;
  dimension?: { ancho: number; alto: number; profundidad: number };
  posicion: [number, number, number];
  rotacionY: number;
  seleccionado: boolean;
  abierta: boolean;
  nivel: number;
  flujo: number;
  bombeoActivo: boolean;
  isMobile: boolean;
  totalEquipos: number;
  onSelect: () => void;
}

const EquipoMesh = memo(function EquipoMesh({
  descriptorId,
  tag,
  colorBase = '#94a3b8',
  dimension,
  posicion,
  rotacionY,
  seleccionado,
  abierta,
  nivel,
  flujo,
  bombeoActivo,
  isMobile,
  totalEquipos,
  onSelect,
}: EquipoMeshProps) {
  const { camera } = useThree();
  const highDetailRef = useRef<THREE.Group | null>(null);
  const lowDetailRef = useRef<THREE.Mesh | null>(null);
  const lodActivoRef = useRef(false);

  const w = dimension?.ancho ?? 1.2;
  const h = dimension?.alto ?? 1.4;
  const d = dimension?.profundidad ?? 1.2;
  const alturaCajaLod =
    descriptorId === 'torre-fraccionadora' || descriptorId === 'absorbedor'
      ? Math.max(h, 8)
      : h;
  const fam = familiaDe(descriptorId);
  const esCilindricoLod =
    fam === 'tanque' ||
    fam === 'torre' ||
    fam === 'absorbedor' ||
    fam === 'filtro' ||
    fam === 'intercambiador' ||
    fam === 'columna' ||
    fam === 'separador' ||
    fam === 'acumulador';

  // Sincroniza estado LOD inicial: únicamente en móvil a > 20 unidades para mantener fidelidad en escritorio
  useEffect(() => {
    const highGroup = highDetailRef.current;
    const lowMesh = lowDetailRef.current;
    if (!highGroup || !lowMesh) return;

    _tmpCamPos.set(posicion[0], posicion[1], posicion[2]);
    const dist = camera.position.distanceTo(_tmpCamPos);
    const usarCajaSimple = isMobile && dist > LOD_DISTANCE_THRESHOLD;
    lodActivoRef.current = usarCajaSimple;
    highGroup.visible = !usarCajaSimple;
    lowMesh.visible = usarCajaSimple;
  }, [camera, isMobile, posicion[0], posicion[1], posicion[2]]);

  // Sistema LOD con useThree: reemplaza mallas complejas en móvil a >20 unidades
  useFrame(() => {
    const highGroup = highDetailRef.current;
    const lowMesh = lowDetailRef.current;
    if (!highGroup || !lowMesh) return;

    if (!isMobile) {
      if (lodActivoRef.current) {
        lodActivoRef.current = false;
        highGroup.visible = true;
        lowMesh.visible = false;
      }
      return;
    }

    _tmpCamPos.set(posicion[0], posicion[1], posicion[2]);
    const dist = camera.position.distanceTo(_tmpCamPos);

    const siguienteLod = lodActivoRef.current
      ? dist >= LOD_DISTANCE_THRESHOLD - 0.5
      : dist > LOD_DISTANCE_THRESHOLD;

    if (siguienteLod !== lodActivoRef.current) {
      lodActivoRef.current = siguienteLod;
      highGroup.visible = !siguienteLod;
      lowMesh.visible = siguienteLod;
    }
  });

  const emissiveSel = seleccionado ? '#38bdf8' : '#000000';
  const emissiveInt = seleccionado ? 0.4 : 0;

  const renderGeometria = () => {
    if (
      descriptorId === 'tanque-vertical' ||
      descriptorId === 'columna-resina' ||
      descriptorId === 'separador-vertical' ||
      descriptorId === 'separador-horizontal' ||
      descriptorId === 'acumulador-proceso' ||
      descriptorId === 'torre-fraccionadora' ||
      descriptorId === 'absorbedor' ||
      descriptorId === 'bomba-centrifuga' ||
      descriptorId === 'soplador-centrifugo' ||
      descriptorId === 'compresor-centrifugo' ||
      fam === 'valvula' ||
      descriptorId === 'intercambiador-tubular' ||
      descriptorId === 'gabinete-base' ||
      descriptorId === 'ups-industrial' ||
      descriptorId === 'filtro-estrainer' ||
      fam === 'filtro' ||
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
      return (
        <GeometriaEquipo3D
          descriptorId={descriptorId}
          ancho={w}
          alto={h}
          profundidad={d}
          colorBase={colorBase}
          seleccionado={seleccionado}
          abierta={abierta}
          nivel={nivel}
          flujo={flujo}
          bombeoActivo={bombeoActivo}
        />
      );
    }

    switch (descriptorId) {
      case 'tanque-vertical':
      case 'columna-resina':
      case 'separador-vertical': {
        const r = Math.min(w, d) * 0.45;
        const cuerpoH = h * 0.65;
        const nivelFrac = Math.max(0, Math.min(100, nivel)) / 100;
        return (
          <group>
            <mesh position={[0, 0.05, 0]} castShadow receiveShadow>
              <cylinderGeometry args={[r, r, cuerpoH, 24]} />
              <meshStandardMaterial
                color={colorBase}
                metalness={0.6}
                roughness={0.35}
                emissive={emissiveSel}
                emissiveIntensity={emissiveInt}
              />
            </mesh>
            <mesh position={[0, cuerpoH / 2 + 0.05, 0]} castShadow>
              <sphereGeometry args={[r, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
              <meshStandardMaterial
                color={colorBase}
                metalness={0.6}
                roughness={0.35}
                emissive={emissiveSel}
                emissiveIntensity={emissiveInt}
              />
            </mesh>
            {[-1, 1].map((sx) =>
              [-1, 1].map((sz) => (
                <mesh
                  key={`${sx}-${sz}`}
                  position={[sx * r * 0.62, -h * 0.36, sz * r * 0.62]}
                  castShadow
                >
                  <cylinderGeometry args={[0.06, 0.06, h * 0.28, 10]} />
                  <meshStandardMaterial color="#334155" metalness={0.6} roughness={0.35} />
                </mesh>
              ))
            )}
            {nivel > 0 && (
              <mesh
                position={[
                  r + 0.05,
                  -cuerpoH / 2 + (cuerpoH * nivelFrac) / 2 + 0.05,
                  0,
                ]}
              >
                <boxGeometry args={[0.06, Math.max(0.08, cuerpoH * nivelFrac), 0.08]} />
                <meshStandardMaterial
                  color="#38bdf8"
                  emissive="#0284c7"
                  emissiveIntensity={0.7}
                  metalness={0.2}
                  roughness={0.25}
                />
              </mesh>
            )}
          </group>
        );
      }

      case 'torre-fraccionadora':
      case 'absorbedor': {
        const alturaTorre = Math.max(h, 8);
        const r = Math.min(w, d) * 0.42;
        const cuerpoH = alturaTorre * 0.84;
        const bandejas: number[] = [];
        for (let y = -cuerpoH / 2 + 1.2; y <= cuerpoH / 2 - 0.8; y += 1.5) {
          bandejas.push(y);
        }
        return (
          <group>
            <mesh position={[0, 0.15, 0]} castShadow receiveShadow>
              <cylinderGeometry args={[r, r, cuerpoH, 28]} />
              <meshStandardMaterial
                color={colorBase}
                metalness={0.6}
                roughness={0.35}
                emissive={emissiveSel}
                emissiveIntensity={emissiveInt}
              />
            </mesh>
            <mesh position={[0, cuerpoH / 2 + 0.15, 0]} castShadow>
              <sphereGeometry args={[r, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2]} />
              <meshStandardMaterial
                color={colorBase}
                metalness={0.6}
                roughness={0.35}
                emissive={emissiveSel}
                emissiveIntensity={emissiveInt}
              />
            </mesh>
            <mesh position={[0, -alturaTorre / 2 + alturaTorre * 0.08, 0]} castShadow>
              <cylinderGeometry args={[r * 1.05, r * 1.22, alturaTorre * 0.16, 24]} />
              <meshStandardMaterial color="#475569" metalness={0.6} roughness={0.35} />
            </mesh>
            {bandejas.map((y, idx) => (
              <mesh key={idx} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
                <torusGeometry args={[r + 0.04, 0.035, 8, 28]} />
                <meshStandardMaterial color="#64748b" metalness={0.6} roughness={0.35} />
              </mesh>
            ))}
          </group>
        );
      }

      case 'separador-horizontal':
      case 'acumulador-proceso': {
        const r = h * 0.36;
        const largo = w * 0.72;
        return (
          <group>
            <mesh rotation={[0, 0, Math.PI / 2]} position={[0, 0.08, 0]} castShadow receiveShadow>
              <cylinderGeometry args={[r, r, largo, 24]} />
              <meshStandardMaterial
                color={colorBase}
                metalness={0.6}
                roughness={0.35}
                emissive={emissiveSel}
                emissiveIntensity={emissiveInt}
              />
            </mesh>
            {[-1, 1].map((s) => (
              <mesh
                key={s}
                position={[s * (largo / 2), 0.08, 0]}
                rotation={[0, 0, s > 0 ? -Math.PI / 2 : Math.PI / 2]}
                castShadow
              >
                <sphereGeometry args={[r, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
                <meshStandardMaterial
                  color={colorBase}
                  metalness={0.6}
                  roughness={0.35}
                  emissive={emissiveSel}
                  emissiveIntensity={emissiveInt}
                />
              </mesh>
            ))}
            {[-largo * 0.28, largo * 0.28].map((sx, idx) => (
              <mesh key={idx} position={[sx, -h * 0.32, 0]} castShadow>
                <boxGeometry args={[0.18, h * 0.3, r * 1.5]} />
                <meshStandardMaterial color="#334155" metalness={0.6} roughness={0.35} />
              </mesh>
            ))}
          </group>
        );
      }

      case 'bomba-centrifuga':
      case 'soplador-centrifugo':
      case 'compresor-centrifugo': {
        const motorActivo = (abierta && bombeoActivo) || flujo > 0;
        return (
          <group>
            <mesh position={[0, -h * 0.42, 0]} castShadow receiveShadow>
              <boxGeometry args={[w * 0.9, 0.16, d * 0.85]} />
              <meshStandardMaterial color="#1e293b" metalness={0.6} roughness={0.35} />
            </mesh>
            <mesh position={[-w * 0.22, 0, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
              <cylinderGeometry args={[0.34, 0.34, 0.32, 20]} />
              <meshStandardMaterial
                color={colorBase}
                metalness={0.6}
                roughness={0.35}
                emissive={emissiveSel}
                emissiveIntensity={emissiveInt}
              />
            </mesh>
            <mesh position={[-w * 0.22, 0.38, 0]} castShadow>
              <cylinderGeometry args={[0.13, 0.15, 0.36, 14]} />
              <meshStandardMaterial
                color={colorBase}
                metalness={0.6}
                roughness={0.35}
                emissive={emissiveSel}
                emissiveIntensity={emissiveInt}
              />
            </mesh>
            <mesh position={[w * 0.2, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
              <cylinderGeometry args={[0.25, 0.25, 0.62, 18]} />
              <meshStandardMaterial
                color="#334155"
                metalness={0.6}
                roughness={0.35}
                emissive={seleccionado ? '#38bdf8' : motorActivo ? '#06b6d4' : '#000000'}
                emissiveIntensity={seleccionado ? 0.4 : motorActivo ? 0.35 : 0}
              />
            </mesh>
          </group>
        );
      }

      case 'valvula-manual':
        return (
          <group>
            <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
              <cylinderGeometry args={[0.13, 0.13, 0.72, 16]} />
              <meshStandardMaterial color="#64748b" metalness={0.6} roughness={0.35} />
            </mesh>
            <mesh castShadow>
              <sphereGeometry args={[0.19, 16, 16]} />
              <meshStandardMaterial
                color={colorBase}
                metalness={0.6}
                roughness={0.35}
                emissive={emissiveSel}
                emissiveIntensity={emissiveInt}
              />
            </mesh>
            <mesh position={[0, 0.2, 0]}>
              <cylinderGeometry args={[0.04, 0.04, 0.28, 10]} />
              <meshStandardMaterial color="#94a3b8" metalness={0.6} roughness={0.35} />
            </mesh>
            <mesh position={[0, 0.36, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.18, 0.03, 10, 20]} />
              <meshStandardMaterial
                color={colorBase}
                metalness={0.6}
                roughness={0.35}
                emissive={emissiveSel}
                emissiveIntensity={emissiveInt}
              />
            </mesh>
          </group>
        );

      case 'valvula-neumatica':
      case 'valvula-control':
      case 'valvula-solenoid': {
        const colorActuador = abierta ? '#10b981' : '#ef4444';
        return (
          <group>
            <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
              <cylinderGeometry args={[0.13, 0.13, 0.72, 16]} />
              <meshStandardMaterial color="#64748b" metalness={0.6} roughness={0.35} />
            </mesh>
            <mesh castShadow>
              <sphereGeometry args={[0.18, 16, 16]} />
              <meshStandardMaterial
                color={colorBase}
                metalness={0.6}
                roughness={0.35}
                emissive={emissiveSel}
                emissiveIntensity={emissiveInt}
              />
            </mesh>
            <mesh position={[0, 0.2, 0]}>
              <cylinderGeometry args={[0.04, 0.04, 0.28, 10]} />
              <meshStandardMaterial color="#94a3b8" metalness={0.6} roughness={0.35} />
            </mesh>
            {descriptorId === 'valvula-solenoid' ? (
              <mesh position={[0, 0.38, 0]} castShadow>
                <boxGeometry args={[0.18, 0.16, 0.16]} />
                <meshStandardMaterial
                  color={colorActuador}
                  metalness={0.6}
                  roughness={0.35}
                  emissive={seleccionado ? '#38bdf8' : colorActuador}
                  emissiveIntensity={seleccionado ? 0.45 : 0.25}
                />
              </mesh>
            ) : (
              <mesh position={[0, 0.38, 0]} castShadow>
                <cylinderGeometry args={[0.2, 0.18, 0.16, 18]} />
                <meshStandardMaterial
                  color={colorActuador}
                  metalness={0.6}
                  roughness={0.35}
                  emissive={seleccionado ? '#38bdf8' : colorActuador}
                  emissiveIntensity={seleccionado ? 0.45 : 0.25}
                />
              </mesh>
            )}
            {descriptorId === 'valvula-control' && (
              <mesh position={[0.18, 0.22, 0]} castShadow>
                <boxGeometry args={[0.14, 0.16, 0.14]} />
                <meshStandardMaterial
                  color="#0ea5e9"
                  metalness={0.6}
                  roughness={0.35}
                  emissive={emissiveSel}
                  emissiveIntensity={emissiveInt}
                />
              </mesh>
            )}
          </group>
        );
      }

      case 'valvula-seguridad':
        return (
          <group>
            <mesh castShadow>
              <sphereGeometry args={[0.18, 16, 16]} />
              <meshStandardMaterial
                color={colorBase}
                metalness={0.6}
                roughness={0.35}
                emissive={emissiveSel}
                emissiveIntensity={emissiveInt}
              />
            </mesh>
            <mesh position={[0, 0.22, 0]} castShadow>
              <cylinderGeometry args={[0.09, 0.09, 0.3, 14]} />
              <meshStandardMaterial
                color="#ef4444"
                metalness={0.6}
                roughness={0.35}
                emissive={emissiveSel}
                emissiveIntensity={emissiveInt}
              />
            </mesh>
            <mesh position={[0.2, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.08, 0.08, 0.28, 12]} />
              <meshStandardMaterial color="#94a3b8" metalness={0.6} roughness={0.35} />
            </mesh>
          </group>
        );

      case 'intercambiador-tubular':
        return (
          <group>
            <mesh rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
              <cylinderGeometry args={[0.36, 0.36, w * 0.78, 24]} />
              <meshStandardMaterial
                color={colorBase}
                metalness={0.6}
                roughness={0.35}
                emissive={emissiveSel}
                emissiveIntensity={emissiveInt}
              />
            </mesh>
            {[-w * 0.43, w * 0.43].map((bx, idx) => (
              <mesh key={idx} position={[bx, 0, 0]} castShadow>
                <boxGeometry args={[0.22, 0.82, 0.82]} />
                <meshStandardMaterial
                  color="#475569"
                  metalness={0.6}
                  roughness={0.35}
                  emissive={emissiveSel}
                  emissiveIntensity={emissiveInt}
                />
              </mesh>
            ))}
          </group>
        );

      case 'orificio-medidor':
      case 'filtro-estrainer':
        return (
          <group>
            <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
              <cylinderGeometry args={[0.24, 0.24, 0.14, 22]} />
              <meshStandardMaterial
                color={colorBase}
                metalness={0.6}
                roughness={0.35}
                emissive={emissiveSel}
                emissiveIntensity={emissiveInt}
              />
            </mesh>
            {descriptorId === 'filtro-estrainer' && (
              <mesh position={[0, -0.18, 0]} rotation={[0.4, 0, 0]}>
                <cylinderGeometry args={[0.1, 0.12, 0.26, 12]} />
                <meshStandardMaterial color="#475569" metalness={0.6} roughness={0.35} />
              </mesh>
            )}
          </group>
        );

      case 'gabinete-base':
        return (
          <group>
            <mesh castShadow receiveShadow>
              <boxGeometry args={[w, h, d]} />
              <meshStandardMaterial
                color={colorBase}
                metalness={0.6}
                roughness={0.35}
                emissive={emissiveSel}
                emissiveIntensity={emissiveInt}
              />
            </mesh>
            <mesh position={[0, h * 0.2, d / 2 + 0.02]}>
              <boxGeometry args={[w * 0.72, h * 0.34, 0.03]} />
              <meshStandardMaterial
                color="#0f172a"
                emissive="#0ea5e9"
                emissiveIntensity={0.45}
                metalness={0.6}
                roughness={0.35}
              />
            </mesh>
          </group>
        );

      case 'motor-electrico':
        return (
          <group>
            <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
              <cylinderGeometry args={[0.3, 0.3, w * 0.8, 18]} />
              <meshStandardMaterial
                color={colorBase}
                metalness={0.6}
                roughness={0.35}
                emissive={emissiveSel}
                emissiveIntensity={emissiveInt}
              />
            </mesh>
            <mesh position={[0, 0.34, 0]}>
              <boxGeometry args={[0.25, 0.16, 0.25]} />
              <meshStandardMaterial color="#1e293b" metalness={0.6} roughness={0.35} />
            </mesh>
          </group>
        );

      case 'tuberia':
        return (
          <group>
            <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
              <cylinderGeometry args={[0.1, 0.1, w, 16]} />
              <meshStandardMaterial
                color={colorBase}
                metalness={0.6}
                roughness={0.35}
                emissive={emissiveSel}
                emissiveIntensity={emissiveInt}
              />
            </mesh>
          </group>
        );

      case 'plc-controllogix':
        return (
          <group>
            <mesh castShadow>
              <boxGeometry args={[Math.max(0.32, w), Math.max(0.22, h), Math.max(0.16, d)]} />
              <meshStandardMaterial
                color="#1e293b"
                metalness={0.65}
                roughness={0.3}
                emissive={emissiveSel}
                emissiveIntensity={emissiveInt}
              />
            </mesh>
            {[-0.1, -0.04, 0.02, 0.08].map((px, idx) => (
              <mesh key={idx} position={[px, 0, Math.max(0.16, d) / 2 + 0.01]}>
                <boxGeometry args={[0.045, Math.max(0.18, h * 0.8), 0.02]} />
                <meshStandardMaterial
                  color={idx === 0 ? '#0284c7' : '#334155'}
                  emissive={idx === 0 ? '#10b981' : '#0ea5e9'}
                  emissiveIntensity={0.45}
                />
              </mesh>
            ))}
          </group>
        );

      case 'hmi-panel':
        return (
          <group>
            <mesh castShadow>
              <boxGeometry args={[Math.max(0.38, w), Math.max(0.3, h), Math.max(0.08, d)]} />
              <meshStandardMaterial
                color="#334155"
                metalness={0.55}
                roughness={0.35}
                emissive={emissiveSel}
                emissiveIntensity={emissiveInt}
              />
            </mesh>
            <mesh position={[0, 0, Math.max(0.08, d) / 2 + 0.01]}>
              <boxGeometry args={[Math.max(0.3, w * 0.8), Math.max(0.22, h * 0.72), 0.015]} />
              <meshStandardMaterial
                color="#0f172a"
                emissive="#38bdf8"
                emissiveIntensity={0.55}
              />
            </mesh>
          </group>
        );

      default:
        // Fallback seguro ante cualquier descriptorId desconocido
        return (
          <group>
            <mesh>
              <boxGeometry args={[w, h, d]} />
              <meshStandardMaterial
                color="#eab308"
                wireframe
                metalness={0.6}
                roughness={0.35}
              />
            </mesh>
            <EtiquetaSprite
              texto="sin geometría"
              posicion={[0, h / 2 + 0.75, 0]}
              color="#fcd34d"
              fondo="rgba(69, 26, 3, 0.88)"
            />
          </group>
        );
    }
  };

  const altoEtiqueta =
    descriptorId === 'torre-fraccionadora' || descriptorId === 'absorbedor'
      ? Math.max(h, 8) / 2 + 0.75
      : h / 2 + 0.5;

  const mostrarEtiqueta =
    seleccionado ||
    totalEquipos <= 20 ||
    esEquipoPrincipalEtiquetable(descriptorId, tag);

  return (
    <group
      position={posicion}
      rotation={[0, rotacionY, 0]}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
    >
      <group ref={highDetailRef}>{renderGeometria()}</group>
      <mesh
        ref={lowDetailRef}
        visible={false}
        rotation={
          descriptorId === 'intercambiador-tubular' ? [0, 0, Math.PI / 2] : [0, 0, 0]
        }
        castShadow={false}
        receiveShadow={false}
      >
        {esCilindricoLod ? (
          <cylinderGeometry
            args={[
              Math.min(w, d) * 0.42,
              Math.min(w, d) * 0.42,
              descriptorId === 'intercambiador-tubular' ? w * 0.85 : alturaCajaLod * 0.9,
              8,
            ]}
          />
        ) : (
          <boxGeometry args={[w * 0.88, alturaCajaLod * 0.88, d * 0.88]} />
        )}
        <meshStandardMaterial
          color={colorBase}
          metalness={0.55}
          roughness={0.4}
          emissive={emissiveSel}
          emissiveIntensity={emissiveInt}
        />
      </mesh>
      {mostrarEtiqueta && (
        <EtiquetaSprite
          texto={tag}
          posicion={[0, altoEtiqueta, 0]}
          color={seleccionado ? '#38bdf8' : '#e2e8f0'}
          compacta={totalEquipos > 20}
          depthTest={totalEquipos > 20 && !seleccionado}
        />
      )}
    </group>
  );
});

function detectarDispositivoMovil(): boolean {
  if (typeof window === 'undefined') return false;
  return window.innerWidth < 768;
}

export function PlantaViewport({
  vista,
  modo,
  equipos,
  conexiones,
  catalogo,
  seleccionadoUuid,
  descriptorActivo,
  origenConexion,
  bombeoActivo,
  onColocarEquipo,
  onSeleccionarEquipo,
  onDeseleccionar,
}: PlantaViewportProps) {
  const [zoom, setZoom] = useState(1);
  const [cursorPlano, setCursorPlano] = useState<{ x: number; z: number } | null>(null);
  const [isMobile, setIsMobile] = useState<boolean>(() => detectarDispositivoMovil());
  const [sombrasActivas, setSombrasActivas] = useState<boolean>(() =>
    typeof window !== 'undefined' ? !detectarDispositivoMovil() && window.devicePixelRatio < 2 : true
  );
  const [webglError, setWebglError] = useState<boolean>(false);
  const [canvasKey, setCanvasKey] = useState<number>(0);
  const [fitTrigger, setFitTrigger] = useState(0);
  const pidSvgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    const onResize = () => {
      const movil = detectarDispositivoMovil();
      setIsMobile(movil);
      if (movil) setSombrasActivas(false);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const equiposPorUuid = useMemo(
    () => new Map(equipos.map((e) => [e.uuid, e])),
    [equipos]
  );

  const obstaculosPID = useMemo(
    () => construirObstaculosPID(equipos, catalogo, ESCALA_BASE, 8),
    [equipos, catalogo]
  );

  const boqFilas = useMemo(() => {
    const mapa = new Map<
      string,
      { descriptorId: string; nombre: string; categoria: string; cantidad: number; unitario: number }
    >();
    for (const eq of equipos) {
      const desc = getDescriptor(eq.descriptorId, catalogo);
      const previo = mapa.get(eq.descriptorId);
      if (previo) {
        previo.cantidad += 1;
      } else {
        mapa.set(eq.descriptorId, {
          descriptorId: eq.descriptorId,
          nombre: desc?.nombre ?? eq.descriptorId,
          categoria: desc?.categoria ?? 'General',
          cantidad: 1,
          unitario: desc?.precio ?? 0,
        });
      }
    }
    return Array.from(mapa.values());
  }, [equipos, catalogo]);

  const totalBoq = useMemo(
    () => boqFilas.reduce((acc, f) => acc + f.cantidad * f.unitario, 0),
    [boqFilas]
  );

  const fantasmaColisiona = useMemo(() => {
    if (modo !== 'colocar' || !descriptorActivo || !cursorPlano) return false;
    return hayColision(cursorPlano.x, cursorPlano.z, descriptorActivo, 0, equipos, catalogo);
  }, [modo, descriptorActivo, cursorPlano, equipos, catalogo]);

  const exportarBoqCsv = useCallback(() => {
    const encabezados = ['Equipo', 'Descriptor', 'Disciplina', 'Cantidad', 'Unitario USD', 'Subtotal USD'];
    const filas = boqFilas.map((f) => [
      `"${f.nombre.replace(/"/g, '""')}"`,
      f.descriptorId,
      `"${f.categoria.replace(/"/g, '""')}"`,
      String(f.cantidad),
      String(f.unitario),
      String(f.cantidad * f.unitario),
    ]);
    filas.push(['"TOTAL ESTIMADO"', '', '', '', '', String(totalBoq)]);
    const csv = '\uFEFF' + [encabezados.join(','), ...filas.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'planta-viva-boq.csv';
    a.click();
    URL.revokeObjectURL(url);
  }, [boqFilas, totalBoq]);

  const descargarPidSvg = useCallback(() => {
    const svgEl = pidSvgRef.current;
    if (!svgEl) return;
    const clon = svgEl.cloneNode(true) as SVGSVGElement;
    clon.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bgRect.setAttribute('x', '-560');
    bgRect.setAttribute('y', '-220');
    bgRect.setAttribute('width', '1120');
    bgRect.setAttribute('height', '680');
    bgRect.setAttribute('fill', '#090d16');
    clon.insertBefore(bgRect, clon.firstChild);
    const serializer = new XMLSerializer();
    const contenido = serializer.serializeToString(clon);
    const blob = new Blob([contenido], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'planta-viva-pid.svg';
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  if (vista === 'boq') {
    return (
      <main className="min-h-0 flex-1 overflow-auto bg-[#090d16] p-4 sm:p-6">
        <div className="mx-auto max-w-4xl">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div>
              <h1 className="text-base font-semibold text-slate-100">
                Cómputos Métricos (BOQ)
              </h1>
              <p className="text-xs text-slate-400">
                Desglose automático sincronizado con el grafo de planta
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <span className="text-xs text-slate-400">Total estimado</span>
                <div className="font-mono text-lg font-semibold text-sky-400 tabular-nums">
                  ${totalBoq.toLocaleString('en-US')}
                </div>
              </div>
              <button
                type="button"
                onClick={exportarBoqCsv}
                className="inline-flex min-h-[42px] items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900 px-3 text-xs font-medium text-slate-200 hover:bg-slate-800"
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Exportar CSV</span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-800 bg-[#0f1626]">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-800 text-slate-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Equipo</th>
                  <th className="px-4 py-3 font-medium">Disciplina</th>
                  <th className="px-4 py-3 text-right font-medium">Cantidad</th>
                  <th className="px-4 py-3 text-right font-medium">Unitario</th>
                  <th className="px-4 py-3 text-right font-medium">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {boqFilas.map((fila) => (
                  <tr key={fila.descriptorId} className="hover:bg-slate-900/50">
                    <td className="px-4 py-3 font-medium text-slate-100">{fila.nombre}</td>
                    <td className="px-4 py-3 text-slate-400">{fila.categoria}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-200">
                      {fila.cantidad}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-400">
                      ${fila.unitario.toLocaleString('en-US')}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums text-slate-100">
                      ${(fila.cantidad * fila.unitario).toLocaleString('en-US')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    );
  }

  // Vista P&ID (ISA-5.1) 2D preservada intacta con simbología ISA-5.1
  if (vista === 'pid') {
    return (
      <main className="relative min-h-0 flex-1 overflow-hidden bg-[#090d16]">
        <div className="pointer-events-none absolute top-3 right-3 left-3 z-10 flex flex-wrap items-center justify-between gap-2">
          <div className="pointer-events-auto rounded-md border border-slate-800 bg-[#0f1626]/95 px-3 py-1.5 text-xs text-slate-300">
            <span>
              P&amp;ID (ISA-5.1) ·{' '}
              <span className="font-mono tabular-nums text-slate-400">
                {equipos.length} equipos · {conexiones.length} líneas
              </span>
            </span>
          </div>

          <div className="pointer-events-auto flex items-center gap-1 rounded-md border border-slate-800 bg-[#0f1626]/95 p-1">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.6, Number((z - 0.15).toFixed(2))))}
              aria-label="Alejar"
              className="inline-flex min-h-[38px] min-w-[38px] items-center justify-center rounded text-slate-300 hover:bg-slate-800"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <span className="px-1.5 font-mono text-xs text-slate-300 tabular-nums">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(1.8, Number((z + 0.15).toFixed(2))))}
              aria-label="Acercar"
              className="inline-flex min-h-[38px] min-w-[38px] items-center justify-center rounded text-slate-300 hover:bg-slate-800"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setZoom(1)}
              aria-label="Restablecer zoom"
              className="inline-flex min-h-[38px] min-w-[38px] items-center justify-center rounded text-slate-300 hover:bg-slate-800"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={descargarPidSvg}
              aria-label="Descargar SVG"
              title="Descargar plano P&ID en SVG"
              className="inline-flex min-h-[38px] items-center gap-1 rounded px-2 text-xs font-medium text-slate-200 hover:bg-slate-800"
            >
              <Download className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">SVG</span>
            </button>
          </div>
        </div>

        <svg ref={pidSvgRef} viewBox="-560 -220 1120 680" className="h-full w-full select-none">
          <defs>
            <pattern
              id="grid-planta"
              width={ESCALA_BASE}
              height={ESCALA_BASE}
              patternUnits="userSpaceOnUse"
            >
              <path
                d={`M ${ESCALA_BASE} 0 L 0 0 0 ${ESCALA_BASE}`}
                fill="none"
                stroke="#172033"
                strokeWidth="1"
              />
            </pattern>
          </defs>

          <g transform={`scale(${zoom})`}>
            <rect x="-1200" y="-800" width="2400" height="1600" fill="url(#grid-planta)" />
            <line x1="-1200" y1="0" x2="1200" y2="0" stroke="#1e293b" strokeWidth="1" strokeDasharray="4 4" />
            <line x1="0" y1="-800" x2="0" y2="800" stroke="#1e293b" strokeWidth="1" strokeDasharray="4 4" />

            {conexiones.map((conn) => {
              const a = equiposPorUuid.get(conn.equipoA);
              const b = equiposPorUuid.get(conn.equipoB);
              if (!a || !b) return null;
              const ax = a.posicion[0] * ESCALA_BASE;
              const az = a.posicion[2] * ESCALA_BASE;
              const bx = b.posicion[0] * ESCALA_BASE;
              const bz = b.posicion[2] * ESCALA_BASE;
              const ruta = calcularRutaOrtogonalSinColisiones(
                { x: ax, y: az },
                { x: bx, y: bz },
                obstaculosPID,
                a.uuid,
                b.uuid
              );
              const path = ruta.pathSvg;
              const esSenal =
                conn.puertoA.includes('senal') ||
                conn.puertoB.includes('senal') ||
                conn.puertoA.includes('aire') ||
                conn.puertoB.includes('aire');
              const flujoActivo = bombeoActivo && conn.activo;

              return (
                <g key={conn.id}>
                  <path
                    d={path}
                    fill="none"
                    stroke={esSenal ? '#64748b' : flujoActivo ? '#0ea5e9' : '#334155'}
                    strokeWidth={esSenal ? 1.5 : flujoActivo ? 3.5 : 2.2}
                    strokeDasharray={esSenal ? '4 4' : undefined}
                    strokeLinejoin="round"
                  />
                  {flujoActivo && !esSenal && (
                    <path
                      d={path}
                      fill="none"
                      stroke="#bae6fd"
                      strokeWidth="2"
                      strokeDasharray="8 10"
                      className="animate-[dash_1s_linear_infinite]"
                    />
                  )}
                </g>
              );
            })}

            {equipos.map((eq) => {
              const desc = getDescriptor(eq.descriptorId, catalogo);
              const dim = dimensionesRotadas(desc, eq.rotacionY);
              const w = Math.max(24, dim.ancho * ESCALA_BASE);
              const h = Math.max(24, dim.profundidad * ESCALA_BASE);
              const x = eq.posicion[0] * ESCALA_BASE;
              const z = eq.posicion[2] * ESCALA_BASE;
              const seleccionado = eq.uuid === seleccionadoUuid;
              const esOrigen = eq.uuid === origenConexion;
              const color = desc?.color ?? '#94a3b8';
              const simbolo = generarSimboloISA51(
                eq.descriptorId,
                eq.tag,
                w,
                h,
                esOrigen ? '#38bdf8' : color,
                eq.abierta
              );

              return (
                <g
                  key={eq.uuid}
                  transform={`translate(${x}, ${z})`}
                  className="cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSeleccionarEquipo(eq.uuid);
                  }}
                >
                  {seleccionado && (
                    <rect
                      x={-w / 2 - 5}
                      y={-h / 2 - 5}
                      width={w + 10}
                      height={h + 10}
                      rx="8"
                      fill="none"
                      stroke="#38bdf8"
                      strokeWidth="2"
                    />
                  )}

                  {simbolo.primitivas.map((prim, idx) => {
                    if (prim.tipo === 'circle') {
                      return <circle key={idx} {...(prim.props as React.SVGProps<SVGCircleElement>)} />;
                    }
                    if (prim.tipo === 'rect') {
                      return <rect key={idx} {...(prim.props as React.SVGProps<SVGRectElement>)} />;
                    }
                    if (prim.tipo === 'polygon') {
                      return <polygon key={idx} {...(prim.props as React.SVGProps<SVGPolygonElement>)} />;
                    }
                    if (prim.tipo === 'path') {
                      return <path key={idx} {...(prim.props as React.SVGProps<SVGPathElement>)} />;
                    }
                    return <line key={idx} {...(prim.props as React.SVGProps<SVGLineElement>)} />;
                  })}

                  {simbolo.etiquetaInterna && (
                    <text
                      x="0"
                      y="3"
                      textAnchor="middle"
                      fontSize="8.5"
                      fontFamily="JetBrains Mono, monospace"
                      fontWeight="700"
                      fill="#38bdf8"
                    >
                      {simbolo.etiquetaInterna}
                    </text>
                  )}

                  <text
                    x="0"
                    y={h / 2 + 14}
                    textAnchor="middle"
                    fontSize="10"
                    fontFamily="JetBrains Mono, monospace"
                    fontWeight="600"
                    fill="#e2e8f0"
                  >
                    {eq.tag}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </main>
    );
  }

  // Vista "planta": Escena 3D REAL con React Three Fiber
  const sombrasEfectivas = !isMobile && sombrasActivas;

  const fallbackWebGL = (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-center text-sm text-slate-300">
      <p className="font-semibold text-slate-100">WebGL 3D no disponible temporalmente</p>
      <p className="max-w-sm text-xs text-slate-400">
        El contexto gráfico 3D fue suspendido por el navegador móvil. Puedes reintentar o usar P&amp;ID (ISA-5.1).
      </p>
      <button
        type="button"
        onClick={() => {
          setWebglError(false);
          setCanvasKey((k) => k + 1);
        }}
        className="inline-flex min-h-[40px] items-center gap-1.5 rounded-md border border-sky-500/40 bg-sky-500/15 px-4 text-xs font-medium text-sky-300 hover:bg-sky-500/25"
      >
        <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
        <span>Reintentar vista 3D</span>
      </button>
    </div>
  );

  return (
    <main className="relative min-h-0 min-w-0 flex-1 overflow-hidden bg-[#101820]">
      {/* HUD compacto sobre el canvas 3D (sin backdrop-blur sobre WebGL) */}
      <div className="pointer-events-none absolute top-3 right-3 left-3 z-10 flex flex-wrap items-center justify-between gap-2">
        <div className="pointer-events-auto rounded-md border border-slate-800 bg-[#0f1626]/95 px-3 py-1.5 text-xs text-slate-300">
          {modo === 'colocar' && descriptorActivo ? (
            <span>
              Colocando <strong className="text-sky-300">{descriptorActivo.nombre}</strong> — toca el piso 3D
            </span>
          ) : modo === 'conectar' ? (
            <span>
              {origenConexion
                ? 'Toca el equipo destino para conectar tubería 3D'
                : 'Toca el equipo origen para conectar'}
            </span>
          ) : (
            <span>
              Escena 3D ·{' '}
              <span className="font-mono tabular-nums text-slate-400">
                {equipos.length} eq · {conexiones.length} lín
              </span>
            </span>
          )}
        </div>

        <div className="pointer-events-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setFitTrigger((c) => c + 1)}
            title="Encuadrar todos los equipos en cámara"
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-md border border-slate-800 bg-[#0f1626]/95 px-2.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
          >
            <Focus className="h-3.5 w-3.5 text-sky-400" aria-hidden="true" />
            <span>Encuadrar</span>
          </button>

          {!isMobile && (
            <button
              type="button"
              onClick={() => setSombrasActivas((s) => !s)}
              className="min-h-[38px] rounded-md border border-slate-800 bg-[#0f1626]/95 px-3 text-xs font-medium text-slate-200 hover:bg-slate-800"
            >
              Sombras: {sombrasActivas ? 'Alta' : 'Eco'}
            </button>
          )}
        </div>
      </div>

      <div className="absolute inset-0 h-full w-full">
        {webglError ? (
          fallbackWebGL
        ) : (
          <CanvasErrorBoundary key={canvasKey} fallback={fallbackWebGL}>
            <Canvas
              camera={{ position: [10, 7.5, 11], fov: 50 }}
              dpr={isMobile ? [1, 1] : [1, 1.5]}
              shadows={sombrasEfectivas}
              gl={{
                antialias: !isMobile,
                powerPreference: isMobile ? 'low-power' : 'high-performance',
              }}
              onCreated={({ gl }) => {
                gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1 : 1.5));
                gl.domElement.addEventListener('webglcontextlost', (e) => {
                  e.preventDefault();
                  setWebglError(true);
                });
                gl.domElement.addEventListener('webglcontextrestored', () => {
                  setWebglError(false);
                });
              }}
            >
              <WebGLDetector onError={() => setWebglError(true)} />
              <color attach="background" args={['#101820']} />
              <fog attach="fog" args={['#101820', 34, 82]} />

              {isMobile ? (
                <>
                  <ambientLight intensity={0.95} />
                  <directionalLight position={[14, 18, 12]} intensity={0.9} />
                </>
              ) : (
                <>
                  <hemisphereLight args={['#cbd5e1', '#1e293b', 0.85]} />
                  <directionalLight
                    position={[16, 22, 14]}
                    intensity={1.35}
                    castShadow={sombrasEfectivas}
                    shadow-mapSize-width={1024}
                    shadow-mapSize-height={1024}
                    shadow-camera-near={1}
                    shadow-camera-far={60}
                    shadow-camera-left={-18}
                    shadow-camera-right={18}
                    shadow-camera-top={18}
                    shadow-camera-bottom={-18}
                    shadow-bias={-0.0005}
                    shadow-normalBias={0.02}
                  />
                  <directionalLight position={[-12, 8, -10]} intensity={0.45} color="#7dd3fc" />
                </>
              )}

              {/* Piso industrial 80x80 y rejilla */}
              <mesh
                rotation-x={-Math.PI / 2}
                receiveShadow={sombrasEfectivas}
                onPointerMove={(e: ThreeEvent<PointerEvent>) => {
                  if (modo !== 'colocar') return;
                  setCursorPlano({
                    x: snapRejilla(Math.max(-24, Math.min(24, e.point.x))),
                    z: snapRejilla(Math.max(-24, Math.min(24, e.point.z))),
                  });
                }}
                onClick={(e: ThreeEvent<MouseEvent>) => {
                  if (e.delta > 6) return; // Ignorar fin de arrastre OrbitControls
                  if (modo === 'colocar' && descriptorActivo) {
                    onColocarEquipo(
                      snapRejilla(Math.max(-24, Math.min(24, e.point.x))),
                      snapRejilla(Math.max(-24, Math.min(24, e.point.z)))
                    );
                  } else if (onDeseleccionar) {
                    onDeseleccionar();
                  }
                }}
              >
                <planeGeometry args={[80, 80]} />
                <meshStandardMaterial color="#20272a" roughness={0.85} metalness={0.15} />
              </mesh>

              <Grid
                position={[0, 0.01, 0]}
                args={[80, 80]}
                cellSize={1}
                cellThickness={0.7}
                cellColor="#2d3b3d"
                sectionSize={5}
                sectionThickness={1.2}
                sectionColor="#52665f"
                fadeDistance={isMobile ? 42 : 58}
                fadeStrength={1}
              />

              <CameraRig equipos={equipos} fitTrigger={fitTrigger} />

              {/* Fantasma de colocación 3D */}
              {modo === 'colocar' && descriptorActivo && cursorPlano && (
                <mesh
                  position={[cursorPlano.x, descriptorActivo.dimensiones.alto / 2, cursorPlano.z]}
                >
                  <boxGeometry
                    args={[
                      descriptorActivo.dimensiones.ancho,
                      descriptorActivo.dimensiones.alto,
                      descriptorActivo.dimensiones.profundidad,
                    ]}
                  />
                  <meshStandardMaterial
                    color={fantasmaColisiona ? '#ef4444' : '#22c55e'}
                    transparent
                    opacity={0.45}
                  />
                </mesh>
              )}

              {/* Equipos 3D */}
              {equipos.map((eq) => {
                const desc = getDescriptor(eq.descriptorId, catalogo);
                return (
                  <EquipoMesh
                    key={eq.uuid}
                    descriptorId={eq.descriptorId}
                    tag={eq.tag}
                    colorBase={desc?.color}
                    dimension={desc?.dimensiones}
                    posicion={eq.posicion}
                    rotacionY={eq.rotacionY}
                    seleccionado={eq.uuid === seleccionadoUuid}
                    abierta={eq.abierta}
                    nivel={eq.nivel}
                    flujo={eq.flujo}
                    bombeoActivo={bombeoActivo}
                    isMobile={isMobile}
                    totalEquipos={equipos.length}
                    onSelect={() => onSeleccionarEquipo(eq.uuid)}
                  />
                );
              })}

              {/* Conexiones / Tuberías 3D */}
              {conexiones.map((conn) => {
                const eqA = equiposPorUuid.get(conn.equipoA);
                const eqB = equiposPorUuid.get(conn.equipoB);
                if (!eqA || !eqB) return null;

                const esSenal =
                  conn.puertoA.includes('senal') ||
                  conn.puertoB.includes('senal') ||
                  conn.puertoA.includes('aire') ||
                  conn.puertoB.includes('aire') ||
                  conn.puertoA.includes('ethernet') ||
                  conn.puertoB.includes('ethernet');

                const yElev = esSenal ? 0.08 : 0.42;
                const posA: [number, number, number] = [
                  eqA.posicion[0],
                  esSenal ? yElev : Math.max(0.32, Math.min(1.0, eqA.posicion[1] * 0.55)),
                  eqA.posicion[2],
                ];
                const posB: [number, number, number] = [
                  eqB.posicion[0],
                  esSenal ? yElev : Math.max(0.32, Math.min(1.0, eqB.posicion[1] * 0.55)),
                  eqB.posicion[2],
                ];

                return (
                  <Tuberia3D
                    key={conn.id}
                    posA={posA}
                    posB={posB}
                    activo={bombeoActivo && conn.activo}
                    esSenal={esSenal}
                    isMobile={isMobile}
                    esPlantaGrande={equipos.length > 24}
                  />
                );
              })}
            </Canvas>
          </CanvasErrorBoundary>
        )}
      </div>
    </main>
  );
}
