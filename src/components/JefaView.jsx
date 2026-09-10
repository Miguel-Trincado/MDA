import { useState, useMemo } from "react";
import { ALERT_PRIORITY, ALERT_STYLE } from "../lib/constants";
import { computeAlert, todayISO } from "../lib/helpers";
import { Stat, AlertGroup, Panel, SectionDivider } from "./Shared";
import EjecutivoView from "./EjecutivoView";

export default function JefaView({ db, onResolveCambio, onSetMeta, onSave, onRevisado }) {
  const [buscar, setBuscar] = useState("");

  const clientes = useMemo(
    () => Object.values(db.gestion).map((g) => ({ ...g, _alerta: computeAlert(g) })),
    [db.gestion]
  );

  const activos = clientes.filter((g) => g.estado === "Activo");
  const promesados = clientes.filter((g) => g.estado === "Promesado").length;
  const pipeline = clientes.filter((g) =>
    ["Negociación", "Pre-reserva", "Pre-reservado", "Reservado"].includes(g.etapaComercial)
  ).length;
  const interesAlto = activos.filter((g) => g.nivelInteres === "Alto").length;
  const revisadosHoy = activos.filter((g) => g.ultimaRevisionFecha === todayISO()).length;
  const pctRevisados = activos.length ? Math.round((revisadosHoy / activos.length) * 100) : 0;
  const meta = db.meta?.value || 0;
  const faltan = Math.max(meta - promesados, 0);
  const cumplimiento = meta ? Math.round((promesados / meta) * 100) : 0;

  const alertasPorTipo = {};
  clientes.forEach((g) => {
    if (!g._alerta) return;
    if (!alertasPorTipo[g._alerta]) alertasPorTipo[g._alerta] = [];
    alertasPorTipo[g._alerta].push(g);
  });

  const porEjecutivo = {};
  clientes.forEach((g) => {
    if (!g.ejecutivo) return;
    if (!porEjecutivo[g.ejecutivo]) {
      porEjecutivo[g.ejecutivo] = { cotizantes: 0, activos: 0, enEspera: 0, interesAlto: 0, perdidos: 0 };
    }
    const e = porEjecutivo[g.ejecutivo];
    e.cotizantes++;
    if (g.estado === "Activo") e.activos++;
    if (g.estado === "En espera") e.enEspera++;
    if (g.estado === "Activo" && g.nivelInteres === "Alto") e.interesAlto++;
    if (g.estado === "Perdido") e.perdidos++;
  });

  const cambiosPendientes = db.cambios.filter((c) => c.resolucion === "PENDIENTE REVISIÓN");

  const resultadoBusqueda = buscar
    ? clientes.filter((g) => g.cliente.toLowerCase().includes(buscar.toLowerCase()) || g.rut.includes(buscar)).slice(0, 15)
    : [];

  return (
    <div className="max-w-6xl mx-auto px-5 py-6">
      <h2 className="font-display text-2xl text-[#0F3D66] mb-5">Panel Jefa de Ventas</h2>

      <Panel className="mb-5">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-xs text-stone-500">Meta comercial del mes</span>
          <input
            type="number"
            value={meta}
            onChange={(e) => onSetMeta(Number(e.target.value) || 0)}
            className="border border-stone-300 rounded-sm px-2 py-1 w-20 text-sm focus:outline-none focus:border-[#1E5AA8]"
          />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Stat label="Promesados del mes" value={promesados} />
          <Stat label="Faltan para meta" value={faltan} accent="text-amber-700" />
          <Stat label="Cumplimiento" value={`${cumplimiento}%`} accent={cumplimiento >= 100 ? "text-emerald-700" : "text-[#0F3D66]"} />
          <Stat label="Pipeline avanzado" value={pipeline} />
          <Stat label="Interés alto (activos)" value={interesAlto} />
          <Stat label="Activos" value={activos.length} />
          <Stat
            label="% revisados hoy"
            value={`${pctRevisados}%`}
            accent={pctRevisados >= 90 ? "text-emerald-700" : pctRevisados >= 75 ? "text-amber-700" : "text-rose-700"}
          />
          <Stat label="Cambios de ejecutivo pendientes" value={cambiosPendientes.length} accent="text-violet-700" />
        </div>
      </Panel>

      {cambiosPendientes.length > 0 && (
        <div className="border border-violet-300 bg-violet-50 rounded-sm shadow-sm p-5 mb-5">
          <div className="font-display text-lg text-violet-950 mb-3">Cambios de ejecutivo por resolver</div>
          <div className="flex flex-col gap-2">
            {cambiosPendientes.map((c) => (
              <div key={c.id} className="bg-white border border-violet-200 rounded-sm px-4 py-3 flex items-center justify-between flex-wrap gap-2">
                <div className="text-sm">
                  <span className="font-medium">{c.cliente}</span>
                  <span className="text-stone-400 text-xs ml-2">RUT {c.rut}</span>
                  <div className="text-xs text-stone-500 mt-0.5">
                    {c.ejecutivoAnterior} → {c.ejecutivoNuevo}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => onResolveCambio(c, "aprobar")} className="text-xs bg-[#0F3D66] hover:bg-[#1E5AA8] text-white rounded-sm px-3 py-1.5 transition-colors">
                    Aprobar cambio
                  </button>
                  <button onClick={() => onResolveCambio(c, "mantener")} className="text-xs border border-stone-300 rounded-sm px-3 py-1.5 hover:border-[#1E5AA8] transition-colors">
                    Mantener anterior
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <Panel title="Panel de alertas" className="mb-5">
        {Object.keys(alertasPorTipo).length === 0 ? (
          <div className="text-sm text-stone-400">No hay alertas activas.</div>
        ) : (
          <div className="flex flex-col gap-2">
            {Object.entries(alertasPorTipo)
              .sort((a, b) => ALERT_PRIORITY[a[0]] - ALERT_PRIORITY[b[0]])
              .map(([tipo, lista]) => (
                <AlertGroup key={tipo} tipo={tipo} lista={lista} />
              ))}
          </div>
        )}
      </Panel>

      <Panel title="Resumen por ejecutivo" className="mb-5 overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead>
            <tr className="text-left text-xs text-stone-400 border-b border-stone-200">
              <th className="py-2 pr-3">Ejecutivo</th>
              <th className="py-2 pr-3">Cotizantes</th>
              <th className="py-2 pr-3">Activos</th>
              <th className="py-2 pr-3">En espera</th>
              <th className="py-2 pr-3">Interés alto</th>
              <th className="py-2 pr-3">Perdidos</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(porEjecutivo)
              .sort((a, b) => b[1].activos - a[1].activos)
              .map(([nombre, e]) => (
                <tr key={nombre} className="border-b border-stone-100 hover:bg-stone-50/60 transition-colors">
                  <td className="py-2 pr-3 font-medium">{nombre}</td>
                  <td className="py-2 pr-3">{e.cotizantes}</td>
                  <td className="py-2 pr-3">{e.activos}</td>
                  <td className="py-2 pr-3">{e.enEspera}</td>
                  <td className="py-2 pr-3">{e.interesAlto}</td>
                  <td className="py-2 pr-3">{e.perdidos}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </Panel>

      <Panel title="Buscar cliente">
        <input
          value={buscar}
          onChange={(e) => setBuscar(e.target.value)}
          placeholder="Nombre o RUT…"
          className="border border-stone-300 rounded-sm px-3 py-2 text-sm w-full sm:w-80 focus:outline-none focus:border-[#1E5AA8]"
        />
        {resultadoBusqueda.length > 0 && (
          <div className="mt-3 flex flex-col gap-1">
            {resultadoBusqueda.map((g) => (
              <div key={g.rut} className="flex items-center justify-between text-sm border-b border-stone-100 py-2 flex-wrap gap-2">
                <div>
                  <span className="font-medium">{g.cliente}</span>
                  <span className="text-xs text-stone-400 ml-2">
                    RUT {g.rut} · {g.ejecutivo} · {g.estado}
                  </span>
                </div>
                {g._alerta && <span className={`text-xs px-2 py-0.5 rounded-sm border ${ALERT_STYLE[g._alerta]}`}>{g._alerta}</span>}
              </div>
            ))}
          </div>
        )}
      </Panel>

      <SectionDivider label="Gestión por ejecutivo" />
      <EjecutivoView db={db} onSave={onSave} onRevisado={onRevisado} embedded />
    </div>
  );
}
