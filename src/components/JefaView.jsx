import { useState, useMemo, useEffect } from "react";
import { ALERT_PRIORITY, ALERT_STYLE, MESES_ES } from "../lib/constants";
import { computeAlert, todayISO, parseFechaCompleta, normalizarBusqueda, diasHabilesEntre, fmtDate } from "../lib/helpers";
import { getTareas } from "../lib/reminders";
import { Stat, AlertGroup, Panel } from "./Shared";
import ClientEditForm from "./ClientEditForm";
import NotificationBell from "./NotificationBell";
import CalendarioTareas from "./CalendarioTareas";
import { CalendarDays, X } from "lucide-react";
import { useAuthSession } from "../lib/useAuthSession";

// Semáforo de cada KPI, según los umbrales de la planilla de referencia.
// mejorEsMayor=true → un valor más alto es mejor (ej. % mismo día).
// mejorEsMayor=false → un valor más bajo es mejor (ej. días promedio,
// % de seguimientos vencidos).
function colorKpi(valor, { mejorEsMayor, verde, amarillo }) {
  if (valor == null) return "text-stone-400";
  if (mejorEsMayor) {
    if (valor >= verde) return "text-emerald-700";
    if (valor >= amarillo) return "text-amber-700";
    return "text-rose-700";
  }
  if (valor <= verde) return "text-emerald-700";
  if (valor <= amarillo) return "text-amber-700";
  return "text-rose-700";
}
const pct = (num, den) => (den > 0 ? Math.round((num / den) * 100) : null);
function mesLabel(key) {
  const [y, m] = key.split("-");
  return `${MESES_ES[Number(m) - 1]} ${y}`;
}

export default function JefaView({ db, onResolveCambio, onSetMeta, onSaveGestion, onRevisado }) {
  const [buscar, setBuscar] = useState("");
  const [mesKpi, setMesKpi] = useState(todayISO().slice(0, 7));
  const [verCalendario, setVerCalendario] = useState(false);
  const [clienteModal, setClienteModal] = useState(null);
  const [metaInput, setMetaInput] = useState("");
  const [guardandoMeta, setGuardandoMeta] = useState(false);
  const [errorMeta, setErrorMeta] = useState("");
  const { session, email, setEmail, password, setPassword, loginError, loggingIn, handleLogin, handleLogout } = useAuthSession();

  // Última fecha de cotización real (ya parseada, no el texto crudo) por
  // RUT — para saber quién no tiene gestión desde antes de la fecha de
  // corte, sin depender del formato de fecha que traiga el Aval.
  const ultimaFechaPorRut = useMemo(() => {
    const out = {};
    Object.values(db.cotizaciones || {}).forEach((c) => {
      const d = parseFechaCompleta(c.fecha);
      if (!d) return;
      const iso = d.toISOString().slice(0, 10);
      if (!out[c.rut] || iso > out[c.rut]) out[c.rut] = iso;
    });
    return out;
  }, [db.cotizaciones]);

  // Respaldo para alertas de "CAMBIO DE ESTADO OPP" antiguas, detectadas
  // antes de que existiera cambio_estado_detalle: si no hay detalle
  // guardado, al menos se muestra el estado actual de sus Opp.
  const estadoActualPorRut = useMemo(() => {
    const out = {};
    Object.values(db.cotizaciones || {}).forEach((c) => {
      if (!c.estado) return;
      if (!out[c.rut]) out[c.rut] = new Set();
      out[c.rut].add(c.estado);
    });
    const salida = {};
    Object.entries(out).forEach(([rut, set]) => {
      salida[rut] = [...set].join(" / ");
    });
    return salida;
  }, [db.cotizaciones]);

  const clientes = useMemo(
    () =>
      Object.values(db.gestion).map((g) => ({
        ...g,
        _alerta: computeAlert(g),
        _ultimaFecha: ultimaFechaPorRut[g.rut] || null,
        cambioEstadoDetalle:
          g.cambioEstadoDetalle || (g.flagSistema === "ESTADO" && estadoActualPorRut[g.rut] ? `Estado actual: ${estadoActualPorRut[g.rut]}` : ""),
      })),
    [db.gestion, ultimaFechaPorRut, estadoActualPorRut]
  );
  const tareas = useMemo(() => getTareas(clientes), [clientes]);

  const activos = clientes.filter((g) => g.estado === "Activo");
  // "Promesados del mes" sale del Aval (Opp que pasaron a Estado
  // "Promesada" durante el mes elegido), no del campo Estado que el
  // ejecutivo edita a mano en la ficha — ese campo no tiene fecha y
  // puede no estar actualizado aunque la Opp ya haya sido promesada.
  const promesados = useMemo(() => {
    const oppsVistos = new Set();
    (db.cambiosEstadoOpp || []).forEach((c) => {
      if (c.estadoNuevo !== "Promesada") return;
      // Solo cuenta si hay una fecha real de "Fecha Promesa" en el Aval.
      // Si no viene informada, esa Opp no se le atribuye a ningún mes —
      // nunca se usa la fecha de carga como reemplazo, porque eso
      // atribuiría promesas viejas al mes en que se subió el Aval.
      const fechaReal = parseFechaCompleta(c.fechaPromesa);
      if (!fechaReal) return;
      if (fechaReal.toISOString().slice(0, 7) !== mesKpi) return;
      oppsVistos.add(c.opp);
    });
    return oppsVistos.size;
  }, [db.cambiosEstadoOpp, mesKpi]);
  const pipeline = clientes.filter((g) =>
    ["Negociación", "Pre-reserva", "Pre-reservado", "Reservado"].includes(g.etapaComercial)
  ).length;
  const interesAlto = activos.filter((g) => g.nivelInteres === "Alto").length;
  const revisadosHoy = activos.filter((g) => g.ultimaRevisionFecha === todayISO()).length;
  const pctRevisados = activos.length ? Math.round((revisadosHoy / activos.length) * 100) : 0;
  const meta = db.metas?.[mesKpi] || 0;
  const faltan = Math.max(meta - promesados, 0);
  const cumplimiento = meta ? Math.round((promesados / meta) * 100) : 0;
  useEffect(() => {
    setMetaInput(String(meta));
    setErrorMeta("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mesKpi, meta]);

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

  // Primera fecha de cotización real por RUT (la más antigua, no la más
  // reciente) — es contra esta fecha que se mide qué tan rápido gestionó
  // el ejecutivo, para el KPI "% mismo día" / "% hasta 1 día hábil".
  const primeraFechaPorRut = useMemo(() => {
    const out = {};
    Object.values(db.cotizaciones || {}).forEach((c) => {
      const d = parseFechaCompleta(c.fecha);
      if (!d) return;
      const iso = d.toISOString().slice(0, 10);
      if (!out[c.rut] || iso < out[c.rut]) out[c.rut] = iso;
    });
    return out;
  }, [db.cotizaciones]);

  // KPI de gestión por ejecutivo — misma definición que la planilla de
  // referencia: gestionados el mismo día / hasta 1 día hábil (fecha de
  // cotización vs. fecha de primera gestión efectiva), días promedio a
  // primera gestión, % de seguimientos vencidos, y % de activos sin una
  // gestión efectiva hace más de 3 días hábiles.
  const opcionesMesKpi = useMemo(() => {
    const set = new Set(Object.values(primeraFechaPorRut).map((iso) => iso.slice(0, 7)));
    (db.cambiosEstadoOpp || []).forEach((c) => {
      const fechaReal = parseFechaCompleta(c.fechaPromesa);
      if (fechaReal) set.add(fechaReal.toISOString().slice(0, 7));
    });
    set.add(todayISO().slice(0, 7));
    return [...set].sort((a, b) => (a < b ? 1 : -1));
  }, [primeraFechaPorRut, db.cambiosEstadoOpp]);

  const kpiPorEjecutivo = useMemo(() => {
    const hoy = todayISO();
    const out = {};
    clientes
      .filter((g) => (primeraFechaPorRut[g.rut] || "").startsWith(mesKpi))
      .forEach((g) => {
      if (!g.ejecutivo) return;
      if (!out[g.ejecutivo]) {
        out[g.ejecutivo] = {
          conGestion: 0, mismoDia: 0, hasta1DiaHabil: 0, sumaDiasHabiles: 0,
          conProximaAccion: 0, proximaVencida: 0,
          activos: 0, activosSinGestionReciente: 0,
        };
      }
      const e = out[g.ejecutivo];

      const fechaCot = primeraFechaPorRut[g.rut];
      if (fechaCot && g.fechaPrimeraGestionEfectiva) {
        const dias = diasHabilesEntre(fechaCot, g.fechaPrimeraGestionEfectiva);
        if (dias != null) {
          e.conGestion++;
          e.sumaDiasHabiles += dias;
          if (dias === 0) e.mismoDia++;
          if (dias <= 1) e.hasta1DiaHabil++;
        }
      }

      if (g.fechaProximaAccion) {
        e.conProximaAccion++;
        if (g.fechaProximaAccion < hoy) e.proximaVencida++;
      }

      if (g.estado === "Activo") {
        e.activos++;
        const diasSinGestion = diasHabilesEntre(g.fechaUltimaAccionEfectiva, hoy);
        if (diasSinGestion != null && diasSinGestion > 3) e.activosSinGestionReciente++;
      }
    });
    return out;
  }, [clientes, primeraFechaPorRut, mesKpi]);

  async function guardarMeta() {
    setGuardandoMeta(true);
    setErrorMeta("");
    try {
      await onSetMeta(mesKpi, Number(metaInput) || 0);
    } catch (e) {
      setErrorMeta(e.message || "No se pudo guardar la meta.");
    } finally {
      setGuardandoMeta(false);
    }
  }

  const resultadoBusqueda = buscar
    ? clientes.filter((g) => normalizarBusqueda(g.cliente).includes(normalizarBusqueda(buscar)) || (g.rut || "").includes(buscar)).slice(0, 15)
    : [];

  return (
    <div className="max-w-6xl mx-auto px-5 py-6">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <h2 className="font-display text-2xl text-[#0F3D66]">Panel Jefa de Ventas</h2>
        <div className="flex items-center gap-3">
          <NotificationBell
            tareas={tareas}
            mostrarEjecutivo
            onClickTarea={(t) => setClienteModal(db.gestion[t.rut])}
          />
          <button
            onClick={() => setVerCalendario((v) => !v)}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-colors ${
              verCalendario ? "bg-[#0F3D66] text-white border-[#0F3D66]" : "border-stone-300 text-stone-600 hover:border-[#1E5AA8]"
            }`}
          >
            <CalendarDays size={14} /> Calendario de todos
          </button>
        </div>
      </div>

      {verCalendario && (
        <div className="mb-5">
          <CalendarioTareas tareas={tareas} mostrarEjecutivo />
        </div>
      )}

      <Panel className="mb-5">
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <span className="text-xs text-stone-500">Mes</span>
          <select
            value={mesKpi}
            onChange={(e) => setMesKpi(e.target.value)}
            className="border border-stone-300 rounded-sm px-2 py-1.5 text-xs"
          >
            {opcionesMesKpi.map((key) => (
              <option key={key} value={key}>{mesLabel(key)}</option>
            ))}
          </select>

          <span className="text-xs text-stone-500 ml-3">Meta comercial de {mesLabel(mesKpi)}</span>
          {session ? (
            <>
              <input
                type="number"
                value={metaInput}
                onChange={(e) => setMetaInput(e.target.value)}
                className="border border-stone-300 rounded-sm px-2 py-1 w-20 text-sm focus:outline-none focus:border-[#1E5AA8]"
              />
              <button
                onClick={guardarMeta}
                disabled={guardandoMeta}
                className="bg-[#0F3D66] hover:bg-[#1E5AA8] disabled:opacity-50 text-white text-xs rounded-full px-4 py-1.5"
              >
                {guardandoMeta ? "Guardando…" : "Guardar meta"}
              </button>
              <button onClick={handleLogout} className="text-xs text-stone-400 underline">Cerrar sesión</button>
            </>
          ) : (
            <>
              <span className="text-lg font-semibold text-[#0F3D66]">{meta}</span>
              <form onSubmit={handleLogin} className="flex items-center gap-2 ml-2">
                <input
                  type="email"
                  placeholder="Correo del administrador"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="border border-stone-300 rounded-sm px-2 py-1 text-xs w-44"
                />
                <input
                  type="password"
                  placeholder="Contraseña"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="border border-stone-300 rounded-sm px-2 py-1 text-xs w-32"
                />
                <button type="submit" disabled={loggingIn} className="text-xs px-3 py-1.5 border border-stone-300 rounded-sm hover:border-[#1E5AA8]">
                  {loggingIn ? "…" : "Modificar meta"}
                </button>
              </form>
            </>
          )}
        </div>
        {!session && (
          <p className="text-xs text-stone-400 -mt-2 mb-3">Solo el administrador puede asignar o modificar la meta comercial.</p>
        )}
        {loginError && <p className="text-xs text-rose-600 -mt-2 mb-3">{loginError}</p>}
        {errorMeta && <p className="text-xs text-rose-600 -mt-2 mb-3">{errorMeta}</p>}
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

      <Panel title="Buscar cliente" className="mb-5">
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

      <Panel title="Panel de alertas" className="mb-5">
        {Object.keys(alertasPorTipo).length === 0 ? (
          <div className="text-sm text-stone-400">No hay alertas activas.</div>
        ) : (
          <div className="flex flex-col gap-2">
            {Object.entries(alertasPorTipo)
              .sort((a, b) => ALERT_PRIORITY[a[0]] - ALERT_PRIORITY[b[0]])
              .map(([tipo, lista]) => (
                <AlertGroup key={tipo} tipo={tipo} lista={lista} onClickCliente={setClienteModal} />
              ))}
          </div>
        )}
      </Panel>

      <Panel title="KPI de gestión por ejecutivo" className="mb-5 overflow-x-auto">
        <p className="text-xs text-stone-400 mb-3">Mes: {mesLabel(mesKpi)} (mismo selector de arriba)</p>
        {Object.keys(kpiPorEjecutivo).length === 0 ? (
          <p className="text-sm text-stone-400">No hay cotizaciones registradas en {mesLabel(mesKpi)}.</p>
        ) : (
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="text-left text-xs text-stone-400 border-b border-stone-200">
                <th className="py-2 pr-3">Ejecutivo</th>
                <th className="py-2 pr-3">% mismo día</th>
                <th className="py-2 pr-3">% hasta 1 día hábil</th>
                <th className="py-2 pr-3">Días prom. 1ra gestión</th>
                <th className="py-2 pr-3">% seguimientos vencidos</th>
                <th className="py-2 pr-3">% activos sin gestión reciente</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(kpiPorEjecutivo)
                .sort((a, b) => a[0].localeCompare(b[0]))
                .map(([nombre, k]) => {
                  const pctMismoDia = pct(k.mismoDia, k.conGestion);
                  const pctHasta1Dia = pct(k.hasta1DiaHabil, k.conGestion);
                  const diasProm = k.conGestion > 0 ? Math.round((k.sumaDiasHabiles / k.conGestion) * 10) / 10 : null;
                  const pctVencidos = pct(k.proximaVencida, k.conProximaAccion);
                  const pctSinGestion = pct(k.activosSinGestionReciente, k.activos);
                  return (
                    <tr key={nombre} className="border-b border-stone-100 hover:bg-stone-50/60 transition-colors">
                      <td className="py-2 pr-3 font-medium">{nombre}</td>
                      <td className={`py-2 pr-3 font-medium ${colorKpi(pctMismoDia, { mejorEsMayor: true, verde: 90, amarillo: 75 })}`}>
                        {pctMismoDia == null ? "—" : `${pctMismoDia}%`}
                      </td>
                      <td className={`py-2 pr-3 font-medium ${colorKpi(pctHasta1Dia, { mejorEsMayor: true, verde: 95, amarillo: 85 })}`}>
                        {pctHasta1Dia == null ? "—" : `${pctHasta1Dia}%`}
                      </td>
                      <td className={`py-2 pr-3 font-medium ${colorKpi(diasProm, { mejorEsMayor: false, verde: 1, amarillo: 2 })}`}>
                        {diasProm == null ? "—" : diasProm}
                      </td>
                      <td className={`py-2 pr-3 font-medium ${colorKpi(pctVencidos, { mejorEsMayor: false, verde: 10, amarillo: 20 })}`}>
                        {pctVencidos == null ? "—" : `${pctVencidos}%`}
                      </td>
                      <td className={`py-2 pr-3 font-medium ${colorKpi(pctSinGestion, { mejorEsMayor: false, verde: 10, amarillo: 20 })}`}>
                        {pctSinGestion == null ? "—" : `${pctSinGestion}%`}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        )}
        <p className="text-xs text-stone-400 mt-3">
          Los 5 indicadores se calculan sobre los clientes que cotizaron por primera vez en {mesLabel(mesKpi)}.
          "Mismo día" y "1 día hábil" comparan esa fecha de cotización con la fecha de la primera gestión efectiva.
          "Seguimientos vencidos" es sobre los de ese mes que tienen una próxima acción programada. "Sin gestión
          reciente" es sobre los que están Activos hoy, contando días hábiles desde su última gestión efectiva.
        </p>
      </Panel>

      <Panel title="Resumen por ejecutivo" className="overflow-x-auto">
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

      {clienteModal && (
        <div className="fixed inset-0 bg-black/40 flex items-start sm:items-center justify-center p-4 z-50 overflow-y-auto" onClick={() => setClienteModal(null)}>
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-2xl my-8 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="font-display text-xl text-[#0F3D66]">{clienteModal.cliente || "(sin nombre)"}</h3>
                <p className="text-xs text-stone-400">
                  RUT {clienteModal.rut} · {clienteModal.ejecutivo || "sin ejecutivo"} · Teléfono {clienteModal.telefono || "—"}
                  {clienteModal.createdAt && ` · Ingresó el ${fmtDate(String(clienteModal.createdAt).slice(0, 10))}`}
                </p>
              </div>
              <button onClick={() => setClienteModal(null)} className="text-stone-400 hover:text-stone-700">
                <X size={18} />
              </button>
            </div>
            <ClientEditForm
              g={clienteModal}
              resetKey={clienteModal.rut}
              onSave={async (updates) => {
                await onSaveGestion(clienteModal.rut, updates);
                setClienteModal(null);
              }}
              onRevisado={async () => {
                await onRevisado(clienteModal.rut);
                setClienteModal(null);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
