import { useState, useEffect, useMemo } from "react";
import {
  EJECUTIVOS, ESTADOS, NIVELES_INTERES, ETAPAS, EVAL_BANCARIA, ACCIONES,
  RESPUESTAS, OBJECIONES, MOTIVOS_PERDIDA, PROXIMAS_ACCIONES, ALERT_PRIORITY, ALERT_STYLE,
} from "../lib/constants";
import { computeAlert, todayISO, parseFechaCompleta, formatFechaCorta } from "../lib/helpers";
import { Field, Panel } from "./Shared";

const PRIORIDAD = EJECUTIVOS.slice(0, 5);
const OTROS = EJECUTIVOS.slice(5);

function mesKey(d) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default function EjecutivoView({ db, onSave, onRevisado, embedded }) {
  const [nombre, setNombre] = useState("");
  const [filtro, setFiltro] = useState("Activo");
  const [busqueda, setBusqueda] = useState("");
  const [expandido, setExpandido] = useState(null);
  const [periodo, setPeriodo] = useState(""); // "" = Todo, o "YYYY-MM"

  const wrapperClass = embedded ? "" : "max-w-4xl mx-auto px-5 py-6";

  const fechasPorRut = useMemo(() => {
    const map = {};
    const mapOpp = {};
    Object.values(db.cotizaciones || {}).forEach((c) => {
      if (!map[c.rut]) map[c.rut] = [];
      const d = parseFechaCompleta(c.fecha);
      if (d) map[c.rut].push(d);

      if (!mapOpp[c.rut]) mapOpp[c.rut] = [];
      const dOpp = parseFechaCompleta(c.fechaOpp);
      if (dOpp) mapOpp[c.rut].push(dOpp);
    });
    Object.values(map).forEach((arr) => arr.sort((a, b) => a - b));
    Object.values(mapOpp).forEach((arr) => arr.sort((a, b) => a - b));
    return { map, mapOpp };
  }, [db.cotizaciones]);

  if (!nombre) {
    return (
      <div className={embedded ? "" : "max-w-2xl mx-auto px-5 py-16"}>
        <Panel>
          <div className="text-xs text-stone-400 uppercase tracking-wide mb-1">Gestión de cartera</div>
          <h2 className="font-display text-xl text-[#0F3D66] mb-4">¿Quién eres?</h2>
          <div className="flex flex-wrap items-center gap-2">
            {PRIORIDAD.map((e) => (
              <button
                key={e}
                onClick={() => setNombre(e)}
                className="rounded-full border border-stone-300 bg-white hover:bg-[#0F3D66] hover:border-[#0F3D66] hover:text-white px-4 py-2 text-sm font-medium transition-colors"
              >
                {e}
              </button>
            ))}
            <select
              defaultValue=""
              onChange={(e) => e.target.value && setNombre(e.target.value)}
              className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm text-stone-600 focus:outline-none focus:border-[#0F3D66]"
            >
              <option value="" disabled>Otros ejecutivos…</option>
              {OTROS.map((e) => (
                <option key={e} value={e}>{e}</option>
              ))}
            </select>
          </div>
        </Panel>
      </div>
    );
  }

  const clientes = Object.values(db.gestion).filter((g) => g.ejecutivo === nombre);

  const filtrados = clientes
    .filter((g) => (filtro === "Todos" ? true : g.estado === filtro))
    .filter((g) => !busqueda || (g.cliente || "").toLowerCase().includes(busqueda.toLowerCase()) || (g.rut || "").includes(busqueda))
    .filter((g) => {
      if (!periodo) return true;
      const fechas = fechasPorRut.map[g.rut] || [];
      return fechas.some((d) => mesKey(d) === periodo);
    })
    .map((g) => ({ ...g, _alerta: computeAlert(g) }))
    .sort((a, b) => ALERT_PRIORITY[a._alerta] - ALERT_PRIORITY[b._alerta] || (a.cliente || "").localeCompare(b.cliente || ""));

  return (
    <div className={wrapperClass}>
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h2 className="font-display text-2xl text-[#0F3D66]">Cartera de {nombre}</h2>
          <p className="text-stone-500 text-sm">{clientes.length} clientes en total</p>
        </div>
        <button onClick={() => setNombre("")} className="text-xs text-stone-500 hover:text-[#0F3D66] underline">
          No soy {nombre}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        {["Activo", "En espera", "Perdido", "Promesado", "Todos"].map((f) => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            className={`text-xs px-3 py-1.5 rounded-sm border transition-colors ${
              filtro === f ? "bg-[#0F3D66] text-white border-[#0F3D66]" : "border-stone-300 text-stone-600 hover:border-[#1E5AA8]"
            }`}
          >
            {f}
          </button>
        ))}

        <div className="flex items-center gap-1.5 border border-stone-300 rounded-sm px-2 py-1.5">
          <span className="text-[10px] text-stone-400 uppercase">Período</span>
          <input
            type="month"
            value={periodo}
            onChange={(e) => setPeriodo(e.target.value)}
            className="text-xs bg-transparent focus:outline-none"
          />
          {periodo && (
            <button onClick={() => setPeriodo("")} className="text-stone-400 hover:text-stone-700 text-xs">
              ✕
            </button>
          )}
        </div>

        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre o RUT…"
          className="ml-auto text-xs border border-stone-300 rounded-sm px-3 py-1.5 focus:outline-none focus:border-[#1E5AA8] w-52"
        />
      </div>

      {filtrados.length > 0 && (
        <div className="hidden md:grid grid-cols-[1.6fr_1fr_0.8fr_1fr_1.1fr_1.3fr] gap-2 px-4 py-2 text-[10px] text-stone-500 uppercase tracking-wide font-medium bg-stone-100 border border-b-0 border-stone-200 rounded-t-sm">
          <span>Cliente</span>
          <span>RUT</span>
          <span>Estado</span>
          <span>F. cotización</span>
          <span>Fecha Opp</span>
          <span>Alerta</span>
        </div>
      )}

      {filtrados.length === 0 ? (
        <div className="border border-stone-200 rounded-sm bg-white p-8 text-center text-stone-400 text-sm">
          No hay clientes en este filtro.
        </div>
      ) : (
        <div className="border border-stone-200 rounded-b-sm divide-y divide-stone-200 overflow-hidden bg-white shadow-sm">
          {filtrados.map((g, i) => (
            <ClientRow
              key={g.rut}
              g={g}
              i={i}
              fechas={fechasPorRut.map[g.rut] || []}
              fechasOpp={fechasPorRut.mapOpp[g.rut] || []}
              expanded={expandido === g.rut}
              onToggle={() => setExpandido(expandido === g.rut ? null : g.rut)}
              onSave={async (updates) => {
                await onSave(g.rut, updates);
                setExpandido(null);
              }}
              onRevisado={() => onRevisado(g.rut)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ClientRow({ g, i, fechas, fechasOpp, expanded, onToggle, onSave, onRevisado }) {
  const [form, setForm] = useState(g);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (expanded) setForm(g);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  const alerta = g._alerta;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const ultimaFecha = fechas.length ? fechas[fechas.length - 1] : null;
  const ultimaFechaOpp = fechasOpp.length ? fechasOpp[fechasOpp.length - 1] : null;

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(form);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={i % 2 === 1 ? "bg-stone-50/50" : "bg-white"}>
      <button onClick={onToggle} className="w-full text-left hover:bg-sky-50/60 transition-colors px-4 py-2.5">
        <div className="grid grid-cols-1 md:grid-cols-[1.6fr_1fr_0.8fr_1fr_1.1fr_1.3fr] gap-x-2 gap-y-1 items-center">
          <span className="font-medium text-stone-900 truncate">{g.cliente || "(sin nombre)"}</span>
          <span className="text-xs text-stone-500">RUT {g.rut}</span>
          <span className="text-xs text-stone-500">{g.estado}</span>
          <span className="text-xs text-stone-500">{formatFechaCorta(ultimaFecha)}</span>
          <span className="text-xs text-stone-500">{formatFechaCorta(ultimaFechaOpp)}</span>
          <span className={`text-xs px-2 py-1 rounded-sm border justify-self-start md:justify-self-end ${ALERT_STYLE[alerta]}`}>{alerta || "Sin alertas"}</span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-stone-200 px-4 py-4 bg-stone-50/60">
          <div className="grid sm:grid-cols-2 gap-3 mb-3 text-sm">
            <div><span className="text-stone-400">Teléfono:</span> {g.telefono || "—"}</div>
            <div><span className="text-stone-400">Renta:</span> {g.renta || "—"}</div>
            <div className="sm:col-span-2">
              <span className="text-stone-400">Historial de cotizaciones ({fechas.length}):</span>{" "}
              {fechas.length === 0 ? (
                "—"
              ) : (
                <span className="flex flex-wrap gap-1.5 mt-1.5">
                  {fechas.map((d, i) => (
                    <span key={i} className="text-xs bg-white border border-stone-200 rounded-sm px-2 py-0.5">
                      {formatFechaCorta(d)}
                    </span>
                  ))}
                </span>
              )}
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Estado">
              <select value={form.estado} onChange={set("estado")} className="ipt">
                {ESTADOS.map((o) => <option key={o}>{o}</option>)}
              </select>
            </Field>
            <Field label="Nivel de interés">
              <select value={form.nivelInteres || ""} onChange={set("nivelInteres")} className="ipt">
                <option value="">—</option>
                {NIVELES_INTERES.map((o) => <option key={o}>{o}</option>)}
              </select>
            </Field>
            <Field label="Etapa comercial">
              <select value={form.etapaComercial} onChange={set("etapaComercial")} className="ipt">
                {ETAPAS.map((o) => <option key={o}>{o}</option>)}
              </select>
            </Field>
            <Field label="Estado evaluación bancaria">
              <select value={form.estadoEvaluacionBancaria} onChange={set("estadoEvaluacionBancaria")} className="ipt">
                {EVAL_BANCARIA.map((o) => <option key={o}>{o}</option>)}
              </select>
            </Field>
            <Field label="Acción realizada">
              <select value={form.accionRealizada || ""} onChange={set("accionRealizada")} className="ipt">
                <option value="">—</option>
                {ACCIONES.map((o) => <option key={o}>{o}</option>)}
              </select>
            </Field>
            <Field label="Respuesta del cliente">
              <select value={form.respuesta || ""} onChange={set("respuesta")} className="ipt">
                <option value="">—</option>
                {RESPUESTAS.map((o) => <option key={o}>{o}</option>)}
              </select>
            </Field>
            <Field label="Objeción actual">
              <select value={form.objecionActual || ""} onChange={set("objecionActual")} className="ipt">
                <option value="">—</option>
                {OBJECIONES.map((o) => <option key={o}>{o}</option>)}
              </select>
            </Field>
            {form.estado === "Perdido" && (
              <Field label="Motivo de pérdida *">
                <select value={form.motivoPerdida || ""} onChange={set("motivoPerdida")} className="ipt border-rose-300">
                  <option value="">—</option>
                  {MOTIVOS_PERDIDA.map((o) => <option key={o}>{o}</option>)}
                </select>
              </Field>
            )}
            <Field label="Próxima acción">
              <select value={form.proximaAccion || ""} onChange={set("proximaAccion")} className="ipt">
                <option value="">—</option>
                {PROXIMAS_ACCIONES.map((o) => <option key={o}>{o}</option>)}
              </select>
            </Field>
            <Field label="Fecha próxima acción">
              <input type="date" value={form.fechaProximaAccion || ""} onChange={set("fechaProximaAccion")} className="ipt" />
            </Field>
          </div>

          <Field label="Observaciones" className="mt-3">
            <textarea value={form.observaciones || ""} onChange={set("observaciones")} rows={2} className="ipt" />
          </Field>

          <div className="flex items-center gap-3 mt-4">
            <button
              onClick={handleSave}
              disabled={saving}
              className="bg-[#0F3D66] hover:bg-[#1E5AA8] disabled:opacity-50 text-white text-sm rounded-sm px-4 py-2 transition-colors"
            >
              {saving ? "Guardando…" : "Guardar cambios"}
            </button>
            <button onClick={onRevisado} className="border border-stone-300 hover:border-[#1E5AA8] text-sm rounded-sm px-4 py-2 text-stone-700 transition-colors">
              Marcar revisado hoy (sin gestión)
            </button>
            {g.ultimaRevisionFecha === todayISO() && <span className="text-xs text-emerald-700">Revisado hoy</span>}
          </div>
        </div>
      )}
    </div>
  );
}
