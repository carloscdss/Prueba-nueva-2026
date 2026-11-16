import { useState } from 'react';
import { ComputosMetricos } from '@/src/components/boq/ComputosMetricos';
import { PlantaViewport } from '@/src/components/canvas/PlantaViewport';
import { BarraSuperior } from '@/src/components/hud/BarraSuperior';
import { ImportadorModal } from '@/src/components/hud/ImportadorModal';
import { PanelHMI } from '@/src/components/hud/PanelHMI';
import { PanelPropiedades } from '@/src/components/hud/PanelPropiedades';
import { SidebarCatalogo } from '@/src/components/hud/SidebarCatalogo';
import { useEditor } from '@/src/hooks/useEditor';

export default function App() {
  const editor = useEditor();
  const [sidebarAbierto, setSidebarAbierto] = useState(false);

  return (
    <div className="flex h-[100dvh] w-screen flex-col overflow-hidden bg-[#090d16] text-slate-100">
      <BarraSuperior
        vista={editor.vista}
        onCambiarVista={editor.setVista}
        bombeoActivo={editor.bombeoActivo}
        onToggleBombeo={editor.toggleBombeo}
        puedeUndo={editor.puedeUndo}
        puedeRedo={editor.puedeRedo}
        onUndo={editor.ejecutarUndo}
        onRedo={editor.ejecutarRedo}
        sidebarAbierto={sidebarAbierto}
        onToggleSidebar={() => setSidebarAbierto((prev) => !prev)}
        equiposCount={editor.equipos.length}
        conexionesCount={editor.conexiones.length}
        alarmasActivasCount={editor.plc.alarmasActivasCount}
      />

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <SidebarCatalogo
          catalogo={editor.catalogo}
          cargando={editor.cargandoCatalogo}
          error={editor.errorCatalogo}
          descriptorActivoId={editor.descriptorActivo?.id ?? null}
          modo={editor.modo}
          vista={editor.vista}
          abierto={sidebarAbierto}
          onCerrar={() => setSidebarAbierto(false)}
          onSeleccionarDescriptor={editor.activarColocacion}
          onCambiarModo={editor.cambiarModo}
          onCambiarVista={editor.setVista}
          onAbrirImportador={editor.importador.abrirModal}
        />

        {editor.vista === 'hmi' ? (
          <PanelHMI
            lazos={editor.plc.lazos}
            reglas={editor.plc.reglas}
            alarmas={editor.plc.alarmas}
            historialesPV={editor.plc.historialesPV}
            bombeoActivo={editor.bombeoActivo}
            onCambiarModo={editor.plc.cambiarModoLazo}
            onCambiarSetpoint={editor.plc.cambiarSetpoint}
            onCambiarOutputManual={editor.plc.cambiarOutputManual}
            onToggleRegla={editor.plc.toggleRegla}
            onAgregarRegla={editor.plc.agregarRegla}
            onReconocerAlarma={editor.plc.reconocerAlarma}
            onInyectarNivelAlto={editor.inyectarNivelAlto}
            onRestablecerProceso={editor.restablecerProceso}
          />
        ) : editor.vista === 'boq' ? (
          <ComputosMetricos
            equipos={editor.equipos}
            conexiones={editor.conexiones}
            catalogo={editor.catalogo}
          />
        ) : (
          <PlantaViewport
            vista={editor.vista}
            modo={editor.modo}
            equipos={editor.equipos}
            conexiones={editor.conexiones}
            catalogo={editor.catalogo}
            seleccionadoUuid={editor.seleccionadoUuid}
            descriptorActivo={editor.descriptorActivo}
            origenConexion={editor.origenConexion}
            bombeoActivo={editor.bombeoActivo}
            onColocarEquipo={editor.colocarEquipo}
            onSeleccionarEquipo={editor.seleccionarOConectar}
            onDeseleccionar={() => editor.setSeleccionadoUuid(null)}
          />
        )}

        {editor.vista !== 'boq' && editor.vista !== 'hmi' && (
          <PanelPropiedades
            equipo={editor.equipoSeleccionado}
            catalogo={editor.catalogo}
            bombeoActivo={editor.bombeoActivo}
            onDeseleccionar={() => editor.setSeleccionadoUuid(null)}
            onMover={editor.moverEquipo}
            onRotar={editor.rotarEquipo}
            onToggleValvula={editor.toggleValvula}
            onEliminar={editor.eliminarEquipo}
          />
        )}

        <ImportadorModal
          abierto={editor.importador.modalAbierto}
          validarJson={editor.importador.validarJson}
          onAplicar={editor.importador.aplicarImportacion}
          onCerrar={editor.importador.cerrarModal}
        />

        {editor.aviso && (
          <div
            role="status"
            aria-live="polite"
            className={`pointer-events-auto fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-md border px-4 py-2 text-xs font-medium shadow-lg ${
              editor.aviso.tipo === 'error'
                ? 'border-rose-700/70 bg-rose-950/95 text-rose-100'
                : editor.aviso.tipo === 'exito'
                ? 'border-emerald-700/70 bg-emerald-950/95 text-emerald-100'
                : 'border-slate-700 bg-slate-900/95 text-slate-100'
            }`}
          >
            {editor.aviso.texto}
          </div>
        )}
      </div>
    </div>
  );
}
