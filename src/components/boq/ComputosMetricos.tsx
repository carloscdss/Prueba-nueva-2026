import { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  Calculator,
  Check,
  Copy,
  Download,
  FileSpreadsheet,
  Plus,
  Printer,
  RotateCcw,
  Settings2,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  ESPESOR_SCH40_MM,
  FORMULAS,
  PARTIDAS_MANUALES_FCC,
  PESO_PERFIL_POR_METRO,
  PRECIO_ACERO_KG,
  PRECIO_CABLE_POR_METRO,
  PRECIO_CONCRETO_M3,
  PRECIO_TUBERIA_POR_METRO,
  PRECIOS_UNITARIOS_BASE,
  type PartidaManualBOQ,
  type PrecioUnitarioItem,
  type UnidadMedida,
} from '@/src/lib/boq/formulas';
import plantaAguaM7451Json from '@/src/lib/boq/planta-agua-m7451.json';
import {
  getDescriptor,
  type ConexionEnEscena,
  type Descriptor,
  type EquipoEnEscena,
} from '@/src/lib/catalogo';

const PARTIDAS_MANUALES_M7451: PartidaManualBOQ[] = plantaAguaM7451Json.map((item) => ({
  id: `m7451-${item.id}`,
  partida: `[Sec. ${item.id}] ${item.descripcion}`,
  categoria: item.categoria,
  unidad: (item.unidad as UnidadMedida) || 'unidad',
  cantidad: item.cantidad,
  precio_unitario: item.precio_unitario,
  fuente: item.fuente,
}));

interface ComputosMetricosProps {
  equipos: EquipoEnEscena[];
  conexiones: ConexionEnEscena[];
  catalogo: Descriptor[];
}

interface ConfigTuberiaLinea {
  diametroPulg: number;
  longitudOverride?: number;
}

const STORAGE_PRECIOS = 'planta-viva-precios-v1';
const STORAGE_OVERRIDES = 'planta-viva-overrides-v1';
const STORAGE_MANUALES = 'planta-viva-manuales-v1';
const STORAGE_TUBERIA = 'planta-viva-tuberia-cfg-v1';

const DISCIPLINAS = [
  'Proceso',
  'Mecanica',
  'Instrumentacion',
  'Tuberia',
  'Civil',
  'Electrica',
  'Arquitectura',
] as const;

const UNIDADES: UnidadMedida[] = ['unidad', 'm', 'm2', 'm3', 'kg'];

const DIAMETROS_DISPONIBLES = Object.keys(PRECIO_TUBERIA_POR_METRO)
  .map(Number)
  .sort((a, b) => a - b);

function formatUSD(valor: number): string {
  return valor.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatNum(valor: number, decimales = 2): string {
  return valor.toLocaleString('en-US', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  });
}

function leerStorage<T>(clave: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(clave);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function guardarStorage<T>(clave: string, valor: T): void {
  try {
    window.localStorage.setItem(clave, JSON.stringify(valor));
  } catch {
    // Ignorar errores de cuota o modo privado
  }
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function construirListaPreciosInicial(catalogo: Descriptor[]): PrecioUnitarioItem[] {
  const mapa = new Map<string, PrecioUnitarioItem>();
  for (const desc of catalogo) {
    mapa.set(desc.id, {
      id: desc.id,
      nombre: desc.nombre,
      categoria: desc.categoria,
      unidad: desc.unidad ?? 'unidad',
      precio_unitario: desc.precio_base ?? desc.precio ?? 0,
      formula: desc.formula_calculo ?? 'cantidad',
    });
  }
  for (const base of PRECIOS_UNITARIOS_BASE) {
    const prev = mapa.get(base.id);
    mapa.set(base.id, {
      ...base,
      nombre: prev?.nombre ?? base.nombre,
      categoria: prev?.categoria ?? base.categoria,
    });
  }
  return Array.from(mapa.values());
}

function calcularPosicionPuertoMundo(
  eq: EquipoEnEscena,
  puertoId: string,
  desc?: Descriptor
): [number, number, number] {
  const puerto = desc?.puertos.find((p) => p.id === puertoId);
  if (!puerto) {
    return [eq.posicion[0], Math.max(0.35, eq.posicion[1] * 0.65), eq.posicion[2]];
  }
  const cos = Math.cos(eq.rotacionY);
  const sin = Math.sin(eq.rotacionY);
  const rx = puerto.pos[0] * cos + puerto.pos[2] * sin;
  const rz = -puerto.pos[0] * sin + puerto.pos[2] * cos;
  return [
    eq.posicion[0] + rx,
    eq.posicion[1] + puerto.pos[1],
    eq.posicion[2] + rz,
  ];
}

function calcularLongitudOrtogonal(
  posA: [number, number, number],
  posB: [number, number, number]
): number {
  const dx = Math.abs(posB[0] - posA[0]);
  const dy = Math.abs(posB[1] - posA[1]);
  const dz = Math.abs(posB[2] - posA[2]);
  return Number(Math.max(0.5, dx + Math.hypot(dy, dz)).toFixed(2));
}

export function ComputosMetricos({
  equipos,
  conexiones,
  catalogo,
}: ComputosMetricosProps) {
  const archivoInputRef = useRef<HTMLInputElement | null>(null);

  const [preciosGuardados, setPreciosGuardados] = useState<Record<string, PrecioUnitarioItem>>(() =>
    leerStorage<Record<string, PrecioUnitarioItem>>(STORAGE_PRECIOS, {})
  );
  const [overridesCantidad, setOverridesCantidad] = useState<Record<string, number>>(() =>
    leerStorage<Record<string, number>>(STORAGE_OVERRIDES, {})
  );
  const [partidasManuales, setPartidasManuales] = useState<PartidaManualBOQ[]>(() =>
    leerStorage<PartidaManualBOQ[]>(STORAGE_MANUALES, [])
  );
  const [configTuberias, setConfigTuberias] = useState<Record<string, ConfigTuberiaLinea>>(() =>
    leerStorage<Record<string, ConfigTuberiaLinea>>(STORAGE_TUBERIA, {})
  );

  const [mostrarConfigPrecios, setMostrarConfigPrecios] = useState(false);
  const [mostrarCalculadora, setMostrarCalculadora] = useState(false);
  const [textoImportarPrecios, setTextoImportarPrecios] = useState('');
  const [filtroPrecios, setFiltroPrecios] = useState('');
  const [mensajeEstado, setMensajeEstado] = useState<string | null>(null);

  // Estado de calculadora de fórmulas de ingeniería
  const [formulaTab, setFormulaTab] = useState<'tuberia' | 'concreto' | 'acero' | 'cable'>('tuberia');
  const [calcTubLongitud, setCalcTubLongitud] = useState(25);
  const [calcTubDiametro, setCalcTubDiametro] = useState(8);
  const [calcConcLargo, setCalcConcLargo] = useState(4);
  const [calcConcAncho, setCalcConcAncho] = useState(3);
  const [calcConcEspesor, setCalcConcEspesor] = useState(0.45);
  const [calcAceroPerfil, setCalcAceroPerfil] = useState('IPE-200');
  const [calcAceroLongitud, setCalcAceroLongitud] = useState(36);
  const [calcCableCalibre, setCalcCableCalibre] = useState('4AWG');
  const [calcCableLongitud, setCalcCableLongitud] = useState(120);

  useEffect(() => {
    guardarStorage(STORAGE_PRECIOS, preciosGuardados);
  }, [preciosGuardados]);

  useEffect(() => {
    guardarStorage(STORAGE_OVERRIDES, overridesCantidad);
  }, [overridesCantidad]);

  useEffect(() => {
    guardarStorage(STORAGE_MANUALES, partidasManuales);
  }, [partidasManuales]);

  const autoCargadoM7451Ref = useRef(false);

  useEffect(() => {
    const esM7451 = equipos.some((e) => e.tag.startsWith('M-7451') || e.tag === 'PLC-1756');
    if (esM7451 && !autoCargadoM7451Ref.current) {
      autoCargadoM7451Ref.current = true;
      setPartidasManuales((prev) => {
        const yaTiene = prev.some((p) => p.id.startsWith('m7451-'));
        if (yaTiene) return prev;
        return [...prev, ...PARTIDAS_MANUALES_M7451];
      });
    }
  }, [equipos]);

  useEffect(() => {
    guardarStorage(STORAGE_TUBERIA, configTuberias);
  }, [configTuberias]);

  const notificar = (texto: string) => {
    setMensajeEstado(texto);
    window.setTimeout(() => {
      setMensajeEstado((actual) => (actual === texto ? null : actual));
    }, 3500);
  };

  // Lista maestra combinada (catálogo + base Venezuela 2024 + overrides del usuario)
  const listaPrecios = useMemo(() => {
    const base = construirListaPreciosInicial(catalogo);
    const mapa = new Map<string, PrecioUnitarioItem>();
    for (const item of base) {
      mapa.set(item.id, item);
    }
    for (const [id, custom] of Object.entries(preciosGuardados)) {
      mapa.set(id, custom);
    }
    return Array.from(mapa.values());
  }, [catalogo, preciosGuardados]);

  const mapaPrecios = useMemo(() => {
    const mapa = new Map<string, PrecioUnitarioItem>();
    for (const item of listaPrecios) {
      mapa.set(item.id, item);
    }
    return mapa;
  }, [listaPrecios]);

  // 1) Filas de Equipos 3D agrupados por familia/descriptorId
  const filasEquipos3D = useMemo(() => {
    const grupos = new Map<
      string,
      {
        descriptorId: string;
        nombre: string;
        categoria: string;
        unidad: string;
        cantidad3D: number;
        tags: string[];
      }
    >();

    for (const eq of equipos) {
      const desc = getDescriptor(eq.descriptorId, catalogo);
      const precioItem = mapaPrecios.get(eq.descriptorId);
      const actual = grupos.get(eq.descriptorId);
      if (actual) {
        actual.cantidad3D += 1;
        actual.tags.push(eq.tag);
      } else {
        grupos.set(eq.descriptorId, {
          descriptorId: eq.descriptorId,
          nombre: precioItem?.nombre ?? desc?.nombre ?? eq.descriptorId,
          categoria: precioItem?.categoria ?? desc?.categoria ?? 'Proceso',
          unidad: precioItem?.unidad ?? desc?.unidad ?? 'unidad',
          cantidad3D: 1,
          tags: [eq.tag],
        });
      }
    }

    return Array.from(grupos.values()).map((g) => {
      const override = overridesCantidad[g.descriptorId];
      const cantidadBOQ = override !== undefined ? override : g.cantidad3D;
      const precioUnitario =
        mapaPrecios.get(g.descriptorId)?.precio_unitario ??
        getDescriptor(g.descriptorId, catalogo)?.precio_base ??
        getDescriptor(g.descriptorId, catalogo)?.precio ??
        0;

      return {
        ...g,
        cantidadBOQ,
        tieneOverride: override !== undefined && override !== g.cantidad3D,
        precioUnitario,
        total: cantidadBOQ * precioUnitario,
      };
    });
  }, [equipos, catalogo, mapaPrecios, overridesCantidad]);

  // Sub-desglose de instrumentos por tipo
  const desgloseInstrumentos = useMemo(() => {
    return filasEquipos3D.filter((f) => f.categoria === 'Instrumentacion');
  }, [filasEquipos3D]);

  // 2) Filas de Tuberías y Líneas desde conexiones 3D
  const filasTuberias3D = useMemo(() => {
    const eqPorUuid = new Map(equipos.map((e) => [e.uuid, e]));
    return conexiones
      .map((conn) => {
        const eqA = eqPorUuid.get(conn.equipoA);
        const eqB = eqPorUuid.get(conn.equipoB);
        if (!eqA || !eqB) return null;

        const descA = getDescriptor(eqA.descriptorId, catalogo);
        const descB = getDescriptor(eqB.descriptorId, catalogo);
        const posA = calcularPosicionPuertoMundo(eqA, conn.puertoA, descA);
        const posB = calcularPosicionPuertoMundo(eqB, conn.puertoB, descB);
        const longitud3D = calcularLongitudOrtogonal(posA, posB);

        const esSenal =
          conn.puertoA.includes('senal') ||
          conn.puertoB.includes('senal') ||
          conn.puertoA.includes('aire') ||
          conn.puertoB.includes('aire');

        const cfg = configTuberias[conn.id];
        const diametroPulg = cfg?.diametroPulg ?? (esSenal ? 0.5 : 8);
        const longitudBOQ =
          cfg?.longitudOverride !== undefined ? cfg.longitudOverride : longitud3D;

        if (esSenal) {
          const esAire = conn.puertoA.includes('aire') || conn.puertoB.includes('aire');
          const precioMetro = esAire
            ? 45
            : mapaPrecios.get('cable-4awg')?.precio_unitario ?? PRECIO_CABLE_POR_METRO['Instrumentacion-Par'];
          return {
            id: conn.id,
            etiqueta: `${eqA.tag} → ${eqB.tag}`,
            tipo: esAire ? 'Aire Instrumentos (1/2" SS316)' : 'Señal Instrumentación (4-20mA)',
            disciplina: esAire ? 'Tuberia' : 'Electrica',
            esSenal: true,
            diametroPulg,
            longitud3D,
            longitudBOQ,
            pesoKg: esAire ? FORMULAS.tuberia(longitudBOQ, 0.5).peso_kg : 0,
            precioMetro,
            total: Number((longitudBOQ * precioMetro).toFixed(2)),
          };
        }

        const calc = FORMULAS.tuberia(longitudBOQ, diametroPulg);
        const precioCatalogoKey = `tuberia-cs-${diametroPulg}-sch40`;
        const precioMetro =
          mapaPrecios.get(precioCatalogoKey)?.precio_unitario ??
          PRECIO_TUBERIA_POR_METRO[diametroPulg] ??
          125;

        return {
          id: conn.id,
          etiqueta: `${eqA.tag} → ${eqB.tag}`,
          tipo: `Tubería Proceso CS ${diametroPulg}" Sch40`,
          disciplina: 'Tuberia',
          esSenal: false,
          diametroPulg,
          longitud3D,
          longitudBOQ,
          pesoKg: calc.peso_kg,
          precioMetro,
          total: Number((longitudBOQ * precioMetro).toFixed(2)),
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [conexiones, equipos, catalogo, configTuberias, mapaPrecios]);

  // 3) Resumen consolidado por disciplina
  const resumenDisciplinas = useMemo(() => {
    const mapa = new Map<string, { disciplina: string; items: number; total: number }>();
    for (const d of DISCIPLINAS) {
      mapa.set(d, { disciplina: d, items: 0, total: 0 });
    }

    const acumular = (disciplina: string, total: number, items = 1) => {
      const clave = DISCIPLINAS.includes(disciplina as (typeof DISCIPLINAS)[number])
        ? disciplina
        : 'Proceso';
      const entry = mapa.get(clave)!;
      entry.items += items;
      entry.total += total;
    };

    for (const eq of filasEquipos3D) {
      acumular(eq.categoria, eq.total, eq.cantidadBOQ);
    }
    for (const tub of filasTuberias3D) {
      acumular(tub.disciplina, tub.total, 1);
    }
    for (const man of partidasManuales) {
      acumular(man.categoria, man.cantidad * man.precio_unitario, 1);
    }

    return Array.from(mapa.values());
  }, [filasEquipos3D, filasTuberias3D, partidasManuales]);

  const subtotalEquipos = useMemo(
    () => filasEquipos3D.reduce((acc, f) => acc + f.total, 0),
    [filasEquipos3D]
  );
  const subtotalTuberias = useMemo(
    () => filasTuberias3D.reduce((acc, t) => acc + t.total, 0),
    [filasTuberias3D]
  );
  const totalMetrosTuberia = useMemo(
    () => filasTuberias3D.reduce((acc, t) => acc + t.longitudBOQ, 0),
    [filasTuberias3D]
  );
  const totalPesoAceroTuberias = useMemo(
    () => filasTuberias3D.reduce((acc, t) => acc + t.pesoKg, 0),
    [filasTuberias3D]
  );
  const subtotalManuales = useMemo(
    () => partidasManuales.reduce((acc, p) => acc + p.cantidad * p.precio_unitario, 0),
    [partidasManuales]
  );
  const granTotalBOQ = subtotalEquipos + subtotalTuberias + subtotalManuales;

  // Manejadores de edición de precios unitarios
  const actualizarPrecioUnitario = (id: string, nuevoPrecio: number) => {
    const base = mapaPrecios.get(id);
    if (!base) return;
    setPreciosGuardados((prev) => ({
      ...prev,
      [id]: {
        ...base,
        precio_unitario: Number.isFinite(nuevoPrecio) && nuevoPrecio >= 0 ? nuevoPrecio : 0,
      },
    }));
  };

  const restablecerPreciosBase = () => {
    setPreciosGuardados({});
    notificar('Lista de precios restablecida a Base Venezuela 2024');
  };

  const aplicarTextoPrecios = (contenido: string) => {
    const limpio = contenido.trim();
    if (!limpio) {
      notificar('El contenido de lista de precios está vacío');
      return;
    }

    const nuevos: Record<string, PrecioUnitarioItem> = { ...preciosGuardados };
    let importados = 0;

    if (limpio.startsWith('[') || limpio.startsWith('{')) {
      try {
        const parsed = JSON.parse(limpio) as unknown;
        const arr = Array.isArray(parsed)
          ? parsed
          : (parsed as { precios?: unknown[] }).precios ?? [];
        for (const row of arr) {
          const r = row as Partial<PrecioUnitarioItem>;
          if (!r.id || typeof r.precio_unitario !== 'number') continue;
          const prev = mapaPrecios.get(r.id);
          nuevos[r.id] = {
            id: r.id,
            nombre: r.nombre ?? prev?.nombre ?? r.id,
            categoria: r.categoria ?? prev?.categoria ?? 'Proceso',
            unidad: r.unidad ?? prev?.unidad ?? 'unidad',
            precio_unitario: Math.max(0, Number(r.precio_unitario)),
            formula: r.formula ?? prev?.formula ?? 'cantidad',
          };
          importados++;
        }
      } catch {
        notificar('JSON inválido en lista de precios');
        return;
      }
    } else {
      const lineas = limpio.split(/\r?\n/).filter((l) => l.trim().length > 0);
      for (let i = 0; i < lineas.length; i++) {
        const cols = parseCsvLine(lineas[i]);
        if (i === 0 && cols[0]?.toLowerCase() === 'id') continue;
        const [id, nombre, categoria, unidad, precioStr, formula] = cols;
        const precio = Number.parseFloat(precioStr);
        if (!id || Number.isNaN(precio)) continue;
        const prev = mapaPrecios.get(id);
        nuevos[id] = {
          id,
          nombre: nombre || prev?.nombre || id,
          categoria: categoria || prev?.categoria || 'Proceso',
          unidad: unidad || prev?.unidad || 'unidad',
          precio_unitario: Math.max(0, precio),
          formula: formula || prev?.formula || 'cantidad',
        };
        importados++;
      }
    }

    if (importados === 0) {
      notificar('No se encontraron filas válidas (usa CSV: id,nombre,categoria,unidad,precio_unitario,formula)');
      return;
    }

    setPreciosGuardados(nuevos);
    setTextoImportarPrecios('');
    notificar(`Se actualizaron ${importados} precios unitarios`);
  };

  const manejarArchivoPrecios = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        aplicarTextoPrecios(reader.result);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const exportarListaPreciosCSV = () => {
    const encabezado = ['id', 'nombre', 'categoria', 'unidad', 'precio_unitario', 'formula'];
    const filas = listaPrecios.map((p) => [
      p.id,
      `"${p.nombre.replace(/"/g, '""')}"`,
      p.categoria,
      p.unidad,
      String(p.precio_unitario),
      `"${p.formula.replace(/"/g, '""')}"`,
    ]);
    const csv = [encabezado.join(','), ...filas.map((f) => f.join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'planta-viva-lista-precios.csv';
    a.click();
    URL.revokeObjectURL(url);
    notificar('Lista de precios exportada (CSV)');
  };

  // Manejadores de partidas manuales
  const agregarPartidaManual = (preset?: Partial<PartidaManualBOQ>) => {
    const nueva: PartidaManualBOQ = {
      id: `man-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      partida: preset?.partida ?? 'Nueva partida de ingeniería',
      categoria: preset?.categoria ?? 'Civil',
      unidad: preset?.unidad ?? 'm3',
      cantidad: preset?.cantidad ?? 1,
      precio_unitario: preset?.precio_unitario ?? 185,
      fuente: preset?.fuente ?? 'Levantamiento manual',
    };
    setPartidasManuales((prev) => [...prev, nueva]);
  };

  const actualizarPartidaManual = (
    id: string,
    campo: keyof PartidaManualBOQ,
    valor: string | number
  ) => {
    setPartidasManuales((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        if (campo === 'cantidad' || campo === 'precio_unitario') {
          const n = Number(valor);
          return { ...p, [campo]: Number.isFinite(n) && n >= 0 ? n : 0 };
        }
        return { ...p, [campo]: valor };
      })
    );
  };

  const eliminarPartidaManual = (id: string) => {
    setPartidasManuales((prev) => prev.filter((p) => p.id !== id));
  };

  const cargarPartidasFCC = () => {
    setPartidasManuales((prev) => {
      const idsExistentes = new Set(prev.map((p) => p.id));
      const faltantes = PARTIDAS_MANUALES_FCC.filter((p) => !idsExistentes.has(p.id));
      if (faltantes.length === 0) return prev;
      return [...prev, ...faltantes];
    });
    notificar('Partidas de levantamiento FCC D-6210 cargadas');
  };

  const cargarPartidasM7451 = () => {
    setPartidasManuales((prev) => {
      const idsExistentes = new Set(prev.map((p) => p.id));
      const faltantes = PARTIDAS_MANUALES_M7451.filter((p) => !idsExistentes.has(p.id));
      if (faltantes.length === 0) return prev;
      return [...prev, ...faltantes];
    });
    notificar('Partidas Excel Planta de Agua M-7451 cargadas');
  };

  // Resultados en vivo de la calculadora
  const resTuberia = useMemo(
    () => FORMULAS.tuberia(calcTubLongitud, calcTubDiametro),
    [calcTubLongitud, calcTubDiametro]
  );
  const resConcreto = useMemo(
    () =>
      FORMULAS.concreto(
        calcConcLargo,
        calcConcAncho,
        calcConcEspesor,
        mapaPrecios.get('fundacion-equipo')?.precio_unitario ?? PRECIO_CONCRETO_M3
      ),
    [calcConcLargo, calcConcAncho, calcConcEspesor, mapaPrecios]
  );
  const resAcero = useMemo(
    () =>
      FORMULAS.acero_estructural(
        calcAceroPerfil,
        calcAceroLongitud,
        mapaPrecios.get('acero-estructural')?.precio_unitario ?? PRECIO_ACERO_KG
      ),
    [calcAceroPerfil, calcAceroLongitud, mapaPrecios]
  );
  const resCable = useMemo(
    () => FORMULAS.cable_electrico(calcCableLongitud, calcCableCalibre),
    [calcCableLongitud, calcCableCalibre]
  );

  // Exportación Excel multi-hoja
  const exportarExcelBOQ = () => {
    const wb = XLSX.utils.book_new();

    const hojaResumen = resumenDisciplinas.map((d) => ({
      Disciplina: d.disciplina,
      'Ítems / Equipos': d.items,
      'Subtotal (USD)': Number(d.total.toFixed(2)),
      '% del Total':
        granTotalBOQ > 0 ? `${((d.total / granTotalBOQ) * 100).toFixed(1)}%` : '0.0%',
    }));
    hojaResumen.push({
      Disciplina: 'TOTAL GENERAL',
      'Ítems / Equipos':
        filasEquipos3D.reduce((a, b) => a + b.cantidadBOQ, 0) +
        filasTuberias3D.length +
        partidasManuales.length,
      'Subtotal (USD)': Number(granTotalBOQ.toFixed(2)),
      '% del Total': '100.0%',
    });

    const hojaDesglose = [
      ...filasEquipos3D.map((f) => ({
        Origen: 'Modelo 3D (Equipos)',
        Disciplina: f.categoria,
        Partida: `${f.nombre} [${f.tags.join(', ')}]`,
        Unidad: f.unidad,
        Cantidad: f.cantidadBOQ,
        'Precio Unitario (USD)': Number(f.precioUnitario.toFixed(2)),
        'Total (USD)': Number(f.total.toFixed(2)),
        Fuente: f.tieneOverride ? 'Modelo 3D (ajuste manual)' : 'Modelo 3D automático',
      })),
      ...filasTuberias3D.map((t) => ({
        Origen: 'Modelo 3D (Líneas)',
        Disciplina: t.disciplina,
        Partida: `${t.tipo} (${t.etiqueta}) · Peso: ${t.pesoKg} kg`,
        Unidad: 'm',
        Cantidad: t.longitudBOQ,
        'Precio Unitario (USD)': Number(t.precioMetro.toFixed(2)),
        'Total (USD)': Number(t.total.toFixed(2)),
        Fuente: 'Medición ortogonal conexiones 3D',
      })),
      ...partidasManuales.map((m) => ({
        Origen: 'Manual',
        Disciplina: m.categoria,
        Partida: m.partida,
        Unidad: m.unidad,
        Cantidad: m.cantidad,
        'Precio Unitario (USD)': Number(m.precio_unitario.toFixed(2)),
        'Total (USD)': Number((m.cantidad * m.precio_unitario).toFixed(2)),
        Fuente: m.fuente,
      })),
    ];

    const hojaPrecios = listaPrecios.map((p) => ({
      ID: p.id,
      Nombre: p.nombre,
      Categoría: p.categoria,
      Unidad: p.unidad,
      'Precio Unitario (USD)': p.precio_unitario,
      Fórmula: p.formula,
    }));

    const hojaFormulas = [
      {
        Concepto: 'Tubería Acero al Carbono Sch40',
        Fórmula: 'W (kg) = L * 0.02466 * (OD_mm - t_mm) * t_mm',
        Referencia: 'ASME B36.10M / Sch40',
      },
      {
        Concepto: 'Concreto Armado en Fundaciones',
        Fórmula: 'V (m³) = Largo * Ancho * Espesor; Acero ref. est. = V * 80 kg/m³',
        Referencia: 'COVENIN 1753 / ACI 318',
      },
      {
        Concepto: 'Acero Estructural Perfiles',
        Fórmula: 'W (kg) = Longitud (m) * Peso lineal perfil (kg/m)',
        Referencia: 'AISC / ASTM A36',
      },
      {
        Concepto: 'Cableado Eléctrico e Instrumentación',
        Fórmula: 'Costo = Longitud (m) * $/m según calibre AWG',
        Referencia: 'NEC / ISA-5.1',
      },
    ];

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(hojaResumen), 'Resumen por disciplina');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(hojaDesglose), 'Desglose completo');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(hojaPrecios), 'Lista de precios unitarios');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(hojaFormulas), 'Fórmulas y fuentes');

    XLSX.writeFile(wb, 'planta-viva-boq.xlsx');
    notificar('Libro Excel BOQ generado (4 hojas)');
  };

  const copiarMarkdownPortapapeles = async () => {
    const lineas: string[] = [
      '# Planta Viva v3.0 — Cómputos Métricos (BOQ)',
      '',
      '## Resumen por Disciplina',
      '| Disciplina | Ítems | Subtotal (USD) |',
      '|---|---:|---:|',
      ...resumenDisciplinas
        .filter((d) => d.items > 0 || d.total > 0)
        .map((d) => `| ${d.disciplina} | ${d.items} | $${formatUSD(d.total)} |`),
      `| **TOTAL GENERAL** | **${filasEquipos3D.length + filasTuberias3D.length + partidasManuales.length}** | **$${formatUSD(granTotalBOQ)}** |`,
      '',
      '## Desglose Completo',
      '| Origen | Disciplina | Partida | Unidad | Cant. | P.U. (USD) | Total (USD) |',
      '|---|---|---|---|---:|---:|---:|',
      ...filasEquipos3D.map(
        (f) =>
          `| Modelo 3D | ${f.categoria} | ${f.nombre} | ${f.unidad} | ${f.cantidadBOQ} | $${formatUSD(f.precioUnitario)} | $${formatUSD(f.total)} |`
      ),
      ...filasTuberias3D.map(
        (t) =>
          `| Tubería 3D | ${t.disciplina} | ${t.tipo} (${t.etiqueta}) | m | ${t.longitudBOQ} | $${formatUSD(t.precioMetro)} | $${formatUSD(t.total)} |`
      ),
      ...partidasManuales.map(
        (m) =>
          `| Manual | ${m.categoria} | ${m.partida} | ${m.unidad} | ${m.cantidad} | $${formatUSD(m.precio_unitario)} | $${formatUSD(m.cantidad * m.precio_unitario)} |`
      ),
    ];

    try {
      await navigator.clipboard.writeText(lineas.join('\n'));
      notificar('Tabla Markdown copiada al portapapeles');
    } catch {
      notificar('No se pudo acceder al portapapeles del navegador');
    }
  };

  const preciosFiltrados = useMemo(() => {
    const q = filtroPrecios.trim().toLowerCase();
    if (!q) return listaPrecios;
    return listaPrecios.filter(
      (p) =>
        p.id.toLowerCase().includes(q) ||
        p.nombre.toLowerCase().includes(q) ||
        p.categoria.toLowerCase().includes(q)
    );
  }, [listaPrecios, filtroPrecios]);

  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-[#090d16] p-3 text-slate-100 sm:p-5 print:bg-white print:text-black">
      <div className="mx-auto flex max-w-7xl flex-col gap-5">
        {/* Encabezado y Acciones Principales */}
        <section className="rounded-lg border border-slate-800 bg-[#0f1626] p-4 sm:p-5 print:border-slate-300 print:bg-white">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-slate-100 print:text-black">
                Cómputos Métricos y Presupuesto (BOQ)
              </h1>
              <p className="mt-0.5 text-xs text-slate-400 print:text-slate-600">
                Consolidado automático desde modelo 3D, rutas ortogonales de tubería y partidas manuales configurables.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 print:hidden">
              <button
                type="button"
                onClick={() => setMostrarConfigPrecios((v) => !v)}
                className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium transition-colors ${
                  mostrarConfigPrecios
                    ? 'border-sky-500/60 bg-sky-950/50 text-sky-200'
                    : 'border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800'
                }`}
              >
                <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Configurar precios</span>
              </button>

              <button
                type="button"
                onClick={() => setMostrarCalculadora((v) => !v)}
                className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium transition-colors ${
                  mostrarCalculadora
                    ? 'border-sky-500/60 bg-sky-950/50 text-sky-200'
                    : 'border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800'
                }`}
              >
                <Calculator className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Fórmulas</span>
              </button>

              <button
                type="button"
                onClick={() => agregarPartidaManual()}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Agregar partida manual</span>
              </button>

              <button
                type="button"
                onClick={exportarExcelBOQ}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-md bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-500"
              >
                <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Exportar BOQ Excel</span>
              </button>

              <button
                type="button"
                onClick={copiarMarkdownPortapapeles}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800"
              >
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Copiar al portapapeles</span>
              </button>

              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800"
              >
                <Printer className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Imprimir</span>
              </button>
            </div>
          </div>

          {mensajeEstado && (
            <div
              role="status"
              className="mt-3 flex items-center gap-2 rounded-md border border-emerald-700/60 bg-emerald-950/60 px-3 py-2 text-xs text-emerald-200 print:hidden"
            >
              <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{mensajeEstado}</span>
            </div>
          )}

          {/* KPIs Generales */}
          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-800 pt-4 sm:grid-cols-4">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-slate-400">
                Equipos Modelo 3D
              </div>
              <div className="mt-1 font-mono text-lg font-semibold text-slate-100 tabular-nums print:text-black">
                ${formatUSD(subtotalEquipos)}
              </div>
              <div className="text-[11px] text-slate-500 tabular-nums">
                {filasEquipos3D.reduce((a, b) => a + b.cantidadBOQ, 0)} unidades
              </div>
            </div>

            <div>
              <div className="text-[11px] uppercase tracking-wider text-slate-400">
                Tuberías / Líneas 3D
              </div>
              <div className="mt-1 font-mono text-lg font-semibold text-slate-100 tabular-nums print:text-black">
                ${formatUSD(subtotalTuberias)}
              </div>
              <div className="text-[11px] text-slate-500 tabular-nums">
                {formatNum(totalMetrosTuberia)} m · {formatNum(totalPesoAceroTuberias, 1)} kg
              </div>
            </div>

            <div>
              <div className="text-[11px] uppercase tracking-wider text-slate-400">
                Partidas Manuales
              </div>
              <div className="mt-1 font-mono text-lg font-semibold text-slate-100 tabular-nums print:text-black">
                ${formatUSD(subtotalManuales)}
              </div>
              <div className="text-[11px] text-slate-500 tabular-nums">
                {partidasManuales.length} partidas activas
              </div>
            </div>

            <div>
              <div className="text-[11px] uppercase tracking-wider text-sky-400 print:text-black">
                Total BOQ Estimado
              </div>
              <div className="mt-1 font-mono text-xl font-bold text-emerald-400 tabular-nums print:text-black">
                ${formatUSD(granTotalBOQ)}
              </div>
              <div className="text-[11px] text-slate-500">Base USD editable</div>
            </div>
          </div>

          {/* Tira de Resumen por Disciplina */}
          <div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-800/80 pt-3 sm:grid-cols-4 lg:grid-cols-7">
            {resumenDisciplinas.map((d) => (
              <div
                key={d.disciplina}
                className="rounded-md border border-slate-800/90 bg-[#090d16] px-2.5 py-2"
              >
                <div className="truncate text-[11px] font-medium text-slate-400">
                  {d.disciplina}
                </div>
                <div className="mt-0.5 font-mono text-xs font-semibold text-slate-100 tabular-nums">
                  ${formatUSD(d.total)}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Panel Configurable de Lista de Precios Unitarios */}
        {mostrarConfigPrecios && (
          <section className="rounded-lg border border-slate-800 bg-[#0f1626] p-4 sm:p-5 print:hidden">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-100">
                  Lista de Precios Unitarios Configurables
                </h2>
                <p className="text-xs text-slate-400">
                  Importa CSV (<code className="font-mono text-slate-300">id,nombre,categoria,unidad,precio_unitario,formula</code>) o JSON, o edita precios en línea. Guardado automático en este navegador.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={archivoInputRef}
                  type="file"
                  accept=".csv,.json,text/csv,application/json"
                  onChange={manejarArchivoPrecios}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => archivoInputRef.current?.click()}
                  className="inline-flex min-h-[38px] items-center gap-1.5 rounded-md bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500"
                >
                  <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Cargar Lista de Precios</span>
                </button>
                <button
                  type="button"
                  onClick={exportarListaPreciosCSV}
                  className="inline-flex min-h-[38px] items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
                >
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Exportar lista de precios</span>
                </button>
                <button
                  type="button"
                  onClick={restablecerPreciosBase}
                  className="inline-flex min-h-[38px] items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800"
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Base Venezuela 2024</span>
                </button>
              </div>
            </div>

            <div className="mt-3 grid gap-3 lg:grid-cols-3">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-medium text-slate-300">
                  Pegar CSV o JSON de precios
                </label>
                <textarea
                  value={textoImportarPrecios}
                  onChange={(e) => setTextoImportarPrecios(e.target.value)}
                  rows={4}
                  placeholder={'id,nombre,categoria,unidad,precio_unitario,formula\nbomba-centrifuga,Bomba 50HP,Mecanica,unidad,6800,cantidad'}
                  className="w-full rounded-md border border-slate-700 bg-[#090d16] p-2.5 font-mono text-xs text-slate-200 placeholder:text-slate-600 focus:border-sky-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => aplicarTextoPrecios(textoImportarPrecios)}
                  className="inline-flex min-h-[38px] items-center justify-center rounded-md border border-sky-700/70 bg-sky-950/60 px-3 py-1.5 text-xs font-medium text-sky-200 hover:bg-sky-900/60"
                >
                  Aplicar precios pegados
                </button>
              </div>

              <div className="lg:col-span-2">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <input
                    type="search"
                    value={filtroPrecios}
                    onChange={(e) => setFiltroPrecios(e.target.value)}
                    placeholder="Filtrar por ID, nombre o disciplina..."
                    className="w-full max-w-xs rounded-md border border-slate-700 bg-[#090d16] px-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
                  />
                  <span className="text-[11px] text-slate-400 tabular-nums">
                    {preciosFiltrados.length} ítems
                  </span>
                </div>
                <div className="max-h-64 overflow-y-auto overflow-x-auto rounded-md border border-slate-800">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-slate-900 text-[11px] text-slate-400">
                      <tr>
                        <th className="px-3 py-2">ID / Partida</th>
                        <th className="px-3 py-2">Disciplina</th>
                        <th className="px-3 py-2">Unidad</th>
                        <th className="px-3 py-2 text-right">Precio Unit. (USD)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80 bg-[#090d16]">
                      {preciosFiltrados.slice(0, 60).map((item) => (
                        <tr key={item.id} className="hover:bg-slate-900/40">
                          <td className="px-3 py-1.5">
                            <div className="font-medium text-slate-200">{item.nombre}</div>
                            <div className="font-mono text-[10px] text-slate-500">{item.id}</div>
                          </td>
                          <td className="px-3 py-1.5 text-slate-400">{item.categoria}</td>
                          <td className="px-3 py-1.5 font-mono text-slate-400">{item.unidad}</td>
                          <td className="px-3 py-1.5 text-right">
                            <input
                              type="number"
                              min={0}
                              step="any"
                              aria-label={`Precio unitario de ${item.nombre}`}
                              value={item.precio_unitario}
                              onChange={(e) =>
                                actualizarPrecioUnitario(item.id, Number.parseFloat(e.target.value))
                              }
                              className="w-28 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-right font-mono text-xs text-slate-100 tabular-nums focus:border-sky-500 focus:outline-none"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Calculadora de Fórmulas de Ingeniería */}
        {mostrarCalculadora && (
          <section className="rounded-lg border border-slate-800 bg-[#0f1626] p-4 sm:p-5 print:hidden">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-100">
                  Calculadora Rápida de Ingeniería (Normas Sch40 / ACI / AISC)
                </h2>
                <p className="text-xs text-slate-400">
                  Calcula volúmenes, pesos teóricos y costos para insertarlos directamente como partidas manuales.
                </p>
              </div>
              <div className="flex flex-wrap gap-1 rounded-md border border-slate-800 bg-[#090d16] p-1">
                {(
                  [
                    ['tuberia', 'Tubería Sch40'],
                    ['concreto', 'Concreto'],
                    ['acero', 'Acero Estructural'],
                    ['cable', 'Cable Eléctrico'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setFormulaTab(id)}
                    className={`rounded px-2.5 py-1.5 text-xs font-medium transition-colors ${
                      formulaTab === id
                        ? 'bg-slate-800 text-slate-100'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {formulaTab === 'tuberia' && (
              <div className="mt-4 grid gap-3 sm:grid-cols-4 sm:items-end">
                <div>
                  <label className="mb-1 block text-xs text-slate-400">Longitud (m)</label>
                  <input
                    type="number"
                    min={0}
                    step="0.5"
                    value={calcTubLongitud}
                    onChange={(e) => setCalcTubLongitud(Math.max(0, Number(e.target.value)))}
                    className="w-full rounded-md border border-slate-700 bg-[#090d16] px-3 py-2 font-mono text-xs text-slate-100"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-slate-400">Diámetro Nominal (pulg)</label>
                  <select
                    value={calcTubDiametro}
                    onChange={(e) => setCalcTubDiametro(Number(e.target.value))}
                    className="w-full rounded-md border border-slate-700 bg-[#090d16] px-3 py-2 font-mono text-xs text-slate-100"
                  >
                    {DIAMETROS_DISPONIBLES.map((d) => (
                      <option key={d} value={d}>
                        {d}&quot; Sch40 (t={ESPESOR_SCH40_MM[d]} mm)
                      </option>
                    ))}
                  </select>
                </div>
                <div className="rounded-md border border-slate-800 bg-[#090d16] px-3 py-2">
                  <div className="text-[11px] text-slate-400">Peso / Costo Estimado</div>
                  <div className="font-mono text-xs font-semibold text-emerald-400 tabular-nums">
                    {formatNum(resTuberia.peso_kg)} kg · ${formatUSD(resTuberia.costo)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    agregarPartidaManual({
                      partida: `Tubería CS ${calcTubDiametro}" Sch40 (${resTuberia.peso_kg} kg)`,
                      categoria: 'Tuberia',
                      unidad: 'm',
                      cantidad: calcTubLongitud,
                      precio_unitario: PRECIO_TUBERIA_POR_METRO[calcTubDiametro] ?? 125,
                      fuente: 'Fórmula Sch40 ASME B36.10M',
                    });
                    notificar('Tubería agregada a partidas manuales');
                  }}
                  className="inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-md bg-sky-600 px-3 py-2 text-xs font-medium text-white hover:bg-sky-500"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Agregar a manuales</span>
                </button>
              </div>
            )}

            {formulaTab === 'concreto' && (
              <div className="mt-4 grid gap-3 sm:grid-cols-5 sm:items-end">
                <div>
                  <label className="mb-1 block text-xs text-slate-400">Largo (m)</label>
                  <input
                    type="number"
                    min={0}
                    step="0.1"
                    value={calcConcLargo}
                    onChange={(e) => setCalcConcLargo(Math.max(0, Number(e.target.value)))}
                    className="w-full rounded-md border border-slate-700 bg-[#090d16] px-3 py-2 font-mono text-xs text-slate-100"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-slate-400">Ancho (m)</label>
                  <input
                    type="number"
                    min={0}
                    step="0.1"
                    value={calcConcAncho}
                    onChange={(e) => setCalcConcAncho(Math.max(0, Number(e.target.value)))}
                    className="w-full rounded-md border border-slate-700 bg-[#090d16] px-3 py-2 font-mono text-xs text-slate-100"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-slate-400">Espesor (m)</label>
                  <input
                    type="number"
                    min={0}
                    step="0.05"
                    value={calcConcEspesor}
                    onChange={(e) => setCalcConcEspesor(Math.max(0, Number(e.target.value)))}
                    className="w-full rounded-md border border-slate-700 bg-[#090d16] px-3 py-2 font-mono text-xs text-slate-100"
                  />
                </div>
                <div className="rounded-md border border-slate-800 bg-[#090d16] px-3 py-2">
                  <div className="text-[11px] text-slate-400">Volumen / Refuerzo / Costo</div>
                  <div className="font-mono text-xs font-semibold text-emerald-400 tabular-nums">
                    {resConcreto.volumen_m3} m³ · {resConcreto.acero_kg} kg · ${formatUSD(resConcreto.costo)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    agregarPartidaManual({
                      partida: `Fundación concreto ${calcConcLargo}x${calcConcAncho}x${calcConcEspesor}m (Acero est. ${resConcreto.acero_kg} kg)`,
                      categoria: 'Civil',
                      unidad: 'm3',
                      cantidad: resConcreto.volumen_m3,
                      precio_unitario: mapaPrecios.get('fundacion-equipo')?.precio_unitario ?? PRECIO_CONCRETO_M3,
                      fuente: 'Fórmula Concreto ACI 318',
                    });
                    notificar('Partida de concreto agregada a manuales');
                  }}
                  className="inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-md bg-sky-600 px-3 py-2 text-xs font-medium text-white hover:bg-sky-500"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Agregar a manuales</span>
                </button>
              </div>
            )}

            {formulaTab === 'acero' && (
              <div className="mt-4 grid gap-3 sm:grid-cols-4 sm:items-end">
                <div>
                  <label className="mb-1 block text-xs text-slate-400">Perfil Estructural</label>
                  <select
                    value={calcAceroPerfil}
                    onChange={(e) => setCalcAceroPerfil(e.target.value)}
                    className="w-full rounded-md border border-slate-700 bg-[#090d16] px-3 py-2 font-mono text-xs text-slate-100"
                  >
                    {Object.entries(PESO_PERFIL_POR_METRO).map(([perfil, kgM]) => (
                      <option key={perfil} value={perfil}>
                        {perfil} ({kgM} kg/m)
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-slate-400">Longitud Total (m)</label>
                  <input
                    type="number"
                    min={0}
                    step="1"
                    value={calcAceroLongitud}
                    onChange={(e) => setCalcAceroLongitud(Math.max(0, Number(e.target.value)))}
                    className="w-full rounded-md border border-slate-700 bg-[#090d16] px-3 py-2 font-mono text-xs text-slate-100"
                  />
                </div>
                <div className="rounded-md border border-slate-800 bg-[#090d16] px-3 py-2">
                  <div className="text-[11px] text-slate-400">Peso / Costo A36</div>
                  <div className="font-mono text-xs font-semibold text-emerald-400 tabular-nums">
                    {formatNum(resAcero.peso_kg)} kg · ${formatUSD(resAcero.costo)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    agregarPartidaManual({
                      partida: `Acero estructural ${calcAceroPerfil} (${calcAceroLongitud} m)`,
                      categoria: 'Civil',
                      unidad: 'kg',
                      cantidad: resAcero.peso_kg,
                      precio_unitario: mapaPrecios.get('acero-estructural')?.precio_unitario ?? PRECIO_ACERO_KG,
                      fuente: 'Fórmula Perfiles AISC A36',
                    });
                    notificar('Partida de acero agregada a manuales');
                  }}
                  className="inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-md bg-sky-600 px-3 py-2 text-xs font-medium text-white hover:bg-sky-500"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Agregar a manuales</span>
                </button>
              </div>
            )}

            {formulaTab === 'cable' && (
              <div className="mt-4 grid gap-3 sm:grid-cols-4 sm:items-end">
                <div>
                  <label className="mb-1 block text-xs text-slate-400">Calibre / Tipo</label>
                  <select
                    value={calcCableCalibre}
                    onChange={(e) => setCalcCableCalibre(e.target.value)}
                    className="w-full rounded-md border border-slate-700 bg-[#090d16] px-3 py-2 font-mono text-xs text-slate-100"
                  >
                    {Object.entries(PRECIO_CABLE_POR_METRO).map(([cal, p]) => (
                      <option key={cal} value={cal}>
                        {cal} (${p}/m)
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-slate-400">Longitud (m)</label>
                  <input
                    type="number"
                    min={0}
                    step="5"
                    value={calcCableLongitud}
                    onChange={(e) => setCalcCableLongitud(Math.max(0, Number(e.target.value)))}
                    className="w-full rounded-md border border-slate-700 bg-[#090d16] px-3 py-2 font-mono text-xs text-slate-100"
                  />
                </div>
                <div className="rounded-md border border-slate-800 bg-[#090d16] px-3 py-2">
                  <div className="text-[11px] text-slate-400">Costo Tendido</div>
                  <div className="font-mono text-xs font-semibold text-emerald-400 tabular-nums">
                    ${formatUSD(resCable.costo)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    agregarPartidaManual({
                      partida: `Tendido cable eléctrico ${calcCableCalibre}`,
                      categoria: 'Electrica',
                      unidad: 'm',
                      cantidad: calcCableLongitud,
                      precio_unitario: PRECIO_CABLE_POR_METRO[calcCableCalibre] ?? 3.5,
                      fuente: 'Fórmula Tendido NEC',
                    });
                    notificar('Tendido eléctrico agregado a manuales');
                  }}
                  className="inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-md bg-sky-600 px-3 py-2 text-xs font-medium text-white hover:bg-sky-500"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Agregar a manuales</span>
                </button>
              </div>
            )}
          </section>
        )}

        {/* Tabla 1: Cómputos Automáticos desde Modelo 3D (Equipos) */}
        <section className="rounded-lg border border-slate-800 bg-[#0f1626] p-4 sm:p-5 print:border-slate-300 print:bg-white">
          <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-100 print:text-black">
                1. Cómputos desde Modelo 3D — Equipos e Instrumentación
              </h2>
              <p className="text-xs text-slate-400 print:text-slate-600">
                Conteo automático de objetos en escena. Permite ajustar cantidad BOQ o precio unitario manualmente.
              </p>
            </div>
            <span className="font-mono text-xs font-semibold text-slate-200 tabular-nums print:text-black">
              Subtotal: ${formatUSD(subtotalEquipos)}
            </span>
          </div>

          {filasEquipos3D.length === 0 ? (
            <div className="rounded-md border border-dashed border-slate-800 p-6 text-center text-xs text-slate-400">
              No hay equipos colocados en el modelo 3D. Agrega equipos desde el catálogo o importa un levantamiento JSON.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-md border border-slate-800">
              <table className="w-full min-w-[720px] text-left text-xs">
                <thead className="bg-slate-900/90 text-[11px] text-slate-400">
                  <tr>
                    <th className="px-3 py-2.5">Partida / Tags</th>
                    <th className="px-3 py-2.5">Disciplina</th>
                    <th className="px-3 py-2.5">Unidad</th>
                    <th className="px-3 py-2.5 text-right">Cant. 3D</th>
                    <th className="px-3 py-2.5 text-right">Cant. BOQ</th>
                    <th className="px-3 py-2.5 text-right">Precio Unit. (USD)</th>
                    <th className="px-3 py-2.5 text-right">Total (USD)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80 bg-[#090d16]">
                  {filasEquipos3D.map((fila) => (
                    <tr key={fila.descriptorId} className="hover:bg-slate-900/40">
                      <td className="px-3 py-2">
                        <div className="font-medium text-slate-100 print:text-black">{fila.nombre}</div>
                        <div className="mt-0.5 font-mono text-[10px] text-slate-400">
                          {fila.tags.join(', ')}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-slate-300 print:text-black">{fila.categoria}</td>
                      <td className="px-3 py-2 font-mono text-slate-400">{fila.unidad}</td>
                      <td className="px-3 py-2 text-right font-mono text-slate-400 tabular-nums">
                        {fila.cantidad3D}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="inline-flex items-center justify-end gap-1">
                          <input
                            type="number"
                            min={0}
                            step="any"
                            aria-label={`Cantidad BOQ de ${fila.nombre}`}
                            value={fila.cantidadBOQ}
                            onChange={(e) => {
                              const val = Number.parseFloat(e.target.value);
                              setOverridesCantidad((prev) => ({
                                ...prev,
                                [fila.descriptorId]: Number.isFinite(val) && val >= 0 ? val : 0,
                              }));
                            }}
                            className="w-20 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-right font-mono text-xs text-slate-100 tabular-nums focus:border-sky-500 focus:outline-none print:border-none print:bg-transparent print:text-black"
                          />
                          {fila.tieneOverride && (
                            <button
                              type="button"
                              title="Restablecer a conteo 3D"
                              onClick={() =>
                                setOverridesCantidad((prev) => {
                                  const copia = { ...prev };
                                  delete copia[fila.descriptorId];
                                  return copia;
                                })
                              }
                              className="p-1 text-amber-400 hover:text-amber-300 print:hidden"
                            >
                              <RotateCcw className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          min={0}
                          step="any"
                          aria-label={`Precio de ${fila.nombre}`}
                          value={fila.precioUnitario}
                          onChange={(e) =>
                            actualizarPrecioUnitario(
                              fila.descriptorId,
                              Number.parseFloat(e.target.value)
                            )
                          }
                          className="w-24 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-right font-mono text-xs text-slate-100 tabular-nums focus:border-sky-500 focus:outline-none print:border-none print:bg-transparent print:text-black"
                        />
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-semibold text-emerald-400 tabular-nums print:text-black">
                        ${formatUSD(fila.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {desgloseInstrumentos.length > 0 && (
            <div className="mt-3 rounded-md border border-slate-800/80 bg-[#090d16] p-3">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Resumen de Instrumentos por Tipo
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {desgloseInstrumentos.map((inst) => (
                  <div
                    key={inst.descriptorId}
                    className="flex items-center justify-between gap-2 border-b border-slate-800/60 pb-1.5 text-xs last:border-b-0"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium text-slate-200">{inst.nombre}</div>
                      <div className="truncate font-mono text-[10px] text-slate-500">
                        {inst.tags.join(', ')}
                      </div>
                    </div>
                    <div className="shrink-0 text-right font-mono tabular-nums">
                      <span className="text-slate-300">{inst.cantidadBOQ} u</span>
                      <span className="ml-2 text-emerald-400">${formatUSD(inst.total)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Tabla 2: Medición Automática de Tuberías y Señales desde Conexiones 3D */}
        <section className="rounded-lg border border-slate-800 bg-[#0f1626] p-4 sm:p-5 print:border-slate-300 print:bg-white">
          <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-100 print:text-black">
                2. Tuberías y Líneas desde Conexiones 3D
              </h2>
              <p className="text-xs text-slate-400 print:text-slate-600">
                Longitud ortogonal real medida entre puertos 3D (1 unidad escena = 1 metro). Peso calculado con fórmula Sch40.
              </p>
            </div>
            <span className="font-mono text-xs font-semibold text-slate-200 tabular-nums print:text-black">
              {formatNum(totalMetrosTuberia)} m · {formatNum(totalPesoAceroTuberias, 1)} kg · ${formatUSD(subtotalTuberias)}
            </span>
          </div>

          {filasTuberias3D.length === 0 ? (
            <div className="rounded-md border border-dashed border-slate-800 p-6 text-center text-xs text-slate-400">
              No hay conexiones trazadas en el modelo 3D.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-md border border-slate-800">
              <table className="w-full min-w-[760px] text-left text-xs">
                <thead className="bg-slate-900/90 text-[11px] text-slate-400">
                  <tr>
                    <th className="px-3 py-2.5">Tramo / Conexión</th>
                    <th className="px-3 py-2.5">Especificación</th>
                    <th className="px-3 py-2.5">Diámetro</th>
                    <th className="px-3 py-2.5 text-right">Long. 3D (m)</th>
                    <th className="px-3 py-2.5 text-right">Long. BOQ (m)</th>
                    <th className="px-3 py-2.5 text-right">Peso (kg)</th>
                    <th className="px-3 py-2.5 text-right">P.U. ($/m)</th>
                    <th className="px-3 py-2.5 text-right">Total (USD)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80 bg-[#090d16]">
                  {filasTuberias3D.map((tub) => (
                    <tr key={tub.id} className="hover:bg-slate-900/40">
                      <td className="px-3 py-2 font-mono text-slate-200 print:text-black">
                        {tub.etiqueta}
                      </td>
                      <td className="px-3 py-2 text-slate-300 print:text-black">{tub.tipo}</td>
                      <td className="px-3 py-2">
                        {tub.esSenal ? (
                          <span className="font-mono text-slate-400">1/2&quot; / Par</span>
                        ) : (
                          <select
                            aria-label={`Diámetro para ${tub.etiqueta}`}
                            value={tub.diametroPulg}
                            onChange={(e) => {
                              const d = Number(e.target.value);
                              setConfigTuberias((prev) => ({
                                ...prev,
                                [tub.id]: { ...prev[tub.id], diametroPulg: d },
                              }));
                            }}
                            className="rounded border border-slate-700 bg-slate-900 px-2 py-1 font-mono text-xs text-slate-100 focus:border-sky-500 focus:outline-none print:border-none print:bg-transparent print:text-black"
                          >
                            {DIAMETROS_DISPONIBLES.map((d) => (
                              <option key={d} value={d}>
                                {d}&quot;
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-slate-400 tabular-nums">
                        {formatNum(tub.longitud3D)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          min={0}
                          step="0.5"
                          aria-label={`Longitud BOQ para ${tub.etiqueta}`}
                          value={tub.longitudBOQ}
                          onChange={(e) => {
                            const val = Number.parseFloat(e.target.value);
                            setConfigTuberias((prev) => ({
                              ...prev,
                              [tub.id]: {
                                diametroPulg: prev[tub.id]?.diametroPulg ?? tub.diametroPulg,
                                longitudOverride: Number.isFinite(val) && val >= 0 ? val : 0,
                              },
                            }));
                          }}
                          className="w-20 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-right font-mono text-xs text-slate-100 tabular-nums focus:border-sky-500 focus:outline-none print:border-none print:bg-transparent print:text-black"
                        />
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-slate-300 tabular-nums">
                        {formatNum(tub.pesoKg, 1)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-slate-300 tabular-nums">
                        ${formatUSD(tub.precioMetro)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-semibold text-emerald-400 tabular-nums print:text-black">
                        ${formatUSD(tub.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Tabla 3: Cómputos Manuales (Partidas Editables) */}
        <section className="rounded-lg border border-slate-800 bg-[#0f1626] p-4 sm:p-5 print:border-slate-300 print:bg-white">
          <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-100 print:text-black">
                3. Cómputos Manuales — Civil, Estructuras, Eléctrica y Acabados
              </h2>
              <p className="text-xs text-slate-400 print:text-slate-600">
                Ingresa metrajes de planos civiles, kg de acero, m² de pintura o tendidos eléctricos para defender el presupuesto completo.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 print:hidden">
              <button
                type="button"
                onClick={cargarPartidasM7451}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-md border border-emerald-700/70 bg-emerald-950/50 px-3 py-1.5 text-xs font-medium text-emerald-200 hover:bg-emerald-900/50"
              >
                <span>Cargar partidas M-7451 (El Palito)</span>
              </button>
              <button
                type="button"
                onClick={cargarPartidasFCC}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
              >
                <span>Cargar partidas FCC D-6210</span>
              </button>
              <button
                type="button"
                onClick={() => agregarPartidaManual()}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-md bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Agregar partida</span>
              </button>
            </div>
          </div>

          {partidasManuales.length === 0 ? (
            <div className="rounded-md border border-dashed border-slate-800 p-6 text-center text-xs text-slate-400">
              No hay partidas manuales registradas. Usa &quot;Agregar partida&quot;, la calculadora de fórmulas o &quot;Cargar partidas FCC D-6210&quot;.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-md border border-slate-800">
              <table className="w-full min-w-[820px] text-left text-xs">
                <thead className="bg-slate-900/90 text-[11px] text-slate-400">
                  <tr>
                    <th className="px-3 py-2.5">Partida</th>
                    <th className="px-3 py-2.5">Disciplina</th>
                    <th className="px-3 py-2.5">Unidad</th>
                    <th className="px-3 py-2.5 text-right">Cantidad</th>
                    <th className="px-3 py-2.5 text-right">P.U. (USD)</th>
                    <th className="px-3 py-2.5 text-right">Total (USD)</th>
                    <th className="px-3 py-2.5">Fuente / Plano</th>
                    <th className="px-3 py-2.5 text-center print:hidden">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80 bg-[#090d16]">
                  {partidasManuales.map((p) => {
                    const totalFila = p.cantidad * p.precio_unitario;
                    return (
                      <tr key={p.id} className="hover:bg-slate-900/40">
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            aria-label="Nombre de partida"
                            value={p.partida}
                            onChange={(e) =>
                              actualizarPartidaManual(p.id, 'partida', e.target.value)
                            }
                            className="w-full min-w-[200px] rounded border border-slate-800 bg-slate-900/80 px-2 py-1 text-xs text-slate-100 focus:border-sky-500 focus:outline-none print:border-none print:bg-transparent print:text-black"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <select
                            aria-label="Disciplina"
                            value={p.categoria}
                            onChange={(e) =>
                              actualizarPartidaManual(p.id, 'categoria', e.target.value)
                            }
                            className="rounded border border-slate-800 bg-slate-900/80 px-2 py-1 text-xs text-slate-200 focus:border-sky-500 focus:outline-none print:border-none print:bg-transparent print:text-black"
                          >
                            {DISCIPLINAS.map((d) => (
                              <option key={d} value={d}>
                                {d}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <select
                            aria-label="Unidad"
                            value={p.unidad}
                            onChange={(e) =>
                              actualizarPartidaManual(
                                p.id,
                                'unidad',
                                e.target.value as UnidadMedida
                              )
                            }
                            className="rounded border border-slate-800 bg-slate-900/80 px-2 py-1 font-mono text-xs text-slate-200 focus:border-sky-500 focus:outline-none print:border-none print:bg-transparent print:text-black"
                          >
                            {UNIDADES.map((u) => (
                              <option key={u} value={u}>
                                {u}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            min={0}
                            step="any"
                            aria-label="Cantidad"
                            value={p.cantidad}
                            onChange={(e) =>
                              actualizarPartidaManual(p.id, 'cantidad', e.target.value)
                            }
                            className="w-24 rounded border border-slate-800 bg-slate-900/80 px-2 py-1 text-right font-mono text-xs text-slate-100 tabular-nums focus:border-sky-500 focus:outline-none print:border-none print:bg-transparent print:text-black"
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            min={0}
                            step="any"
                            aria-label="Precio unitario"
                            value={p.precio_unitario}
                            onChange={(e) =>
                              actualizarPartidaManual(p.id, 'precio_unitario', e.target.value)
                            }
                            className="w-24 rounded border border-slate-800 bg-slate-900/80 px-2 py-1 text-right font-mono text-xs text-slate-100 tabular-nums focus:border-sky-500 focus:outline-none print:border-none print:bg-transparent print:text-black"
                          />
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-semibold text-emerald-400 tabular-nums print:text-black">
                          ${formatUSD(totalFila)}
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            aria-label="Fuente"
                            value={p.fuente}
                            onChange={(e) =>
                              actualizarPartidaManual(p.id, 'fuente', e.target.value)
                            }
                            className="w-full min-w-[150px] rounded border border-slate-800 bg-slate-900/80 px-2 py-1 text-xs text-slate-300 focus:border-sky-500 focus:outline-none print:border-none print:bg-transparent print:text-black"
                          />
                        </td>
                        <td className="px-3 py-2 text-center print:hidden">
                          <button
                            type="button"
                            onClick={() => eliminarPartidaManual(p.id)}
                            aria-label={`Eliminar ${p.partida}`}
                            className="inline-flex min-h-[34px] min-w-[34px] items-center justify-center rounded border border-rose-900/60 bg-rose-950/40 text-rose-300 hover:bg-rose-900/60"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
