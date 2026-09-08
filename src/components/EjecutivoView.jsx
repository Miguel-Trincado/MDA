import { useState, useEffect } from "react";
import {
  EJECUTIVOS, ESTADOS, NIVELES_INTERES, ETAPAS, EVAL_BANCARIA, ACCIONES,
  RESPUESTAS, OBJECIONES, MOTIVOS_PERDIDA, PROXIMAS_ACCIONES, ALERT_PRIORITY, ALERT_STYLE,
} from "../lib/constants";
import { computeAlert, todayISO } from "../lib/helpers";
import { Field } from "./Shared";

export default function EjecutivoView({ db, onSave, onRevisado }) {
  const [nombre, setNombre] = useState("");
  const [filtro, setFiltro] = useState("Activo");
  const [busqueda, setBusqueda] = useState("");
  const [expandido, setExpandido] = useState(null);

  if (!nombre) {
    return (
      <div className="max-w-md mx-auto px-5 py-16">
        <h2 className="font-display text-2xl text-teal-950 mb-4">¿Quién eres?</h2>
        <div className="flex flex-col gap-2">
          {EJECUTIVOS.map((e) => (
            <button
              key={e}
              onClick={() => setNombre(e)}
              className="text-left border border-stone-300 bg-white hover:border-teal-800 px-4 py-2.5 text-sm"
            >
              {e}
            </button>
          ))}
        </div>
      </div>
    );
  }

  const clientes = Object.values(db.gestion).filter((g) => g.ejecutivo === nombre);
  const filtrados = clientes
    .filter((g) => (filtro === "Todos" ? true : g.estado === filtro))
    .filter((g) => !busqueda || g.cliente.toLowerCase().includes(busqueda.toLowerCase()) || g.rut.includes(busqueda))
    .map((g) => ({ ...g, _alerta: computeAlert(g) }))
    .sort((a, b) => ALERT_PRIORITY[a._alerta] - ALERT_PRIORITY[b._alerta] || a.cliente.localeCompare(b.cliente));

  return (
    <div className="max-w-4xl mx-auto px-5 py-6">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h2 className="font-display text-2xl text-teal-950">Cartera de {nombre}</h2>
          <p className="text-stone-500 text-sm">{clientes.length} clientes en total</p>
        </div>
        <button onClick={() => setNombre("")} className="text-xs text-stone-500 hover:text-teal-900 underline">
          No soy {nombre}
        </button>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {["Activo", "En espera", "Perdido", "Promesado", "Todos"].map((f) => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            className={`text-xs px-3 py-1.5 border ${
              filtro === f ? "bg-teal-900 text-white border-teal-900" : "border-stone-300 text-stone-600 hover:border-teal-700"
            }`}
          >
            {f}
          </button>
        ))}
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre o RUT…"
          className="ml-auto text-xs border border-stone-300 px-3 py-1.5 focus:outline-none focus:border-teal-700 w-52"
        />
      </div>

      {filtrados.length === 0 ? (
        <div className="border border-stone-200 bg-white p-8 text-center text-stone-400 text-sm">
          No hay clientes en este filtro.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtrados.map((g) => (
            <ClientRow
              key={g.rut}
              g={g}
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

function ClientRow({ g, expanded, onToggle, onSave, onRevisado }) {
  const [form, setForm] = useState(g);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (expanded) setForm(g);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  const alerta = g._alerta;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(form);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border border-stone-300 bg-white">
      <button onClick={onToggle} className="w-full flex items-center justify-between px-4 py-3 text-left">
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-medium text-stone-900 truncate">{g.cliente || "(sin nombre)"}</span>
          <span className="text-xs text-stone-400 shrink-0">RUT {g.rut}</span>
          <span className="text-xs text-stone-400 shrink-0">{g.estado}</span>
        </div>
        <span className={`text-xs px-2 py-1 border shrink-0 ml-3 ${ALERT_STYLE[alerta]}`}>{alerta || "Sin alertas"}</span>
      </button>

      {expanded && (
        <div className="border-t border-stone-200 px-4 py-4 bg-stone-50/60">
          <div className="grid sm:grid-cols-2 gap-3 mb-3 text-sm">
            <div><span className="text-stone-400">Teléfono:</span> {g.telefono || "—"}</div>
            <div><span className="text-stone-400">Renta:</span> {g.renta || "—"}</div>
            <div><span className="text-stone-400">N° cotizaciones:</span> {g.nCotizaciones}</div>
            <div><span className="text-stone-400">Última cotización:</span> {g.fechaUltimaCotizacion || "—"}</div>
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
              className="bg-teal-900 hover:bg-teal-800 disabled:opacity-50 text-white text-sm px-4 py-2"
            >
              {saving ? "Guardando…" : "Guardar cambios"}
            </button>
            <button onClick={onRevisado} className="border border-stone-300 hover:border-teal-700 text-sm px-4 py-2 text-stone-700">
              Marcar revisado hoy (sin gestión)
            </button>
            {g.ultimaRevisionFecha === todayISO() && <span className="text-xs text-emerald-700">Revisado hoy</span>}
          </div>
        </div>
      )}
    </div>
  );
}
