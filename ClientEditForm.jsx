import { useState, useEffect } from "react";
import {
  ESTADOS, NIVELES_INTERES, ETAPAS, EVAL_BANCARIA, ACCIONES,
  RESPUESTAS, OBJECIONES, MOTIVOS_PERDIDA, PROXIMAS_ACCIONES,
} from "../lib/constants";
import { todayISO } from "../lib/helpers";
import { Field } from "./Shared";

// Formulario de gestión de un cliente: los mismos campos que usa el
// ejecutivo en su cartera, extraídos a un componente aparte para poder
// reutilizarlos también en la ventana flotante de la Jefa de Ventas.
export default function ClientEditForm({ g, onSave, onRevisado, resetKey }) {
  const [form, setForm] = useState(g);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  useEffect(() => {
    setForm(g);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  // Si el cliente queda en un estado terminal, o responde que no le interesa,
  // ya no hay ninguna acción pendiente de verdad: se limpia la próxima acción
  // al guardar para que no siga apareciendo como recordatorio en la campana
  // ni en el calendario, aunque no se haya tocado ese campo.
  const seResuelveAlGuardar = form.estado === "Perdido" || form.estado === "Promesado" || form.respuesta === "No interesado";
  const faltaFechaAccion = !!form.proximaAccion && !form.fechaProximaAccion && !seResuelveAlGuardar;

  async function handleSave() {
    if (faltaFechaAccion) return;
    setSaving(true);
    setSaveError("");
    try {
      const payload = seResuelveAlGuardar ? { ...form, proximaAccion: "", fechaProximaAccion: "" } : form;
      // fecha_proxima_accion es una columna de tipo "date" en la base:
      // un texto vacío no es una fecha válida para Postgres, sea porque
      // se limpió automático (cliente resuelto) o porque se borró la
      // fecha a mano — en ambos casos se manda null, nunca "".
      const payloadSaneado = { ...payload, fechaProximaAccion: payload.fechaProximaAccion || null };
      const { _alerta, _ultimaFecha, ...formLimpio } = payloadSaneado; // campos solo de la UI, no existen en la base
      await onSave(formLimpio);
    } catch (e) {
      console.error(e);
      setSaveError(e.message || "No se pudo guardar. Intenta de nuevo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
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
        <Field label={form.proximaAccion ? "Fecha próxima acción *" : "Fecha próxima acción"}>
          <input
            type="date"
            value={form.fechaProximaAccion || ""}
            onChange={set("fechaProximaAccion")}
            className={`ipt ${faltaFechaAccion ? "border-rose-400" : ""}`}
          />
        </Field>
      </div>

      <Field label="Observaciones" className="mt-3">
        <textarea value={form.observaciones || ""} onChange={set("observaciones")} rows={2} className="ipt" />
      </Field>

      {faltaFechaAccion && (
        <p className="text-xs text-rose-600 mt-2">
          Elegiste una próxima acción: indica la fecha antes de guardar.
        </p>
      )}
      {seResuelveAlGuardar && form.proximaAccion && (
        <p className="text-xs text-sky-700 mt-2">
          Este cliente quedó resuelto (Perdido, Promesado o "No interesado"): al guardar se va a limpiar la
          próxima acción pendiente, para que ya no salga en la campana ni en el calendario.
        </p>
      )}
      {saveError && <p className="text-xs text-rose-600 mt-2">{saveError}</p>}

      <div className="flex items-center gap-3 mt-4">
        <button
          onClick={handleSave}
          disabled={saving || faltaFechaAccion}
          className="bg-[#0F3D66] hover:bg-[#1E5AA8] disabled:opacity-50 text-white text-sm rounded-full px-5 py-2 transition-colors"
        >
          {saving ? "Guardando…" : "Guardar cambios"}
        </button>
        {onRevisado && (
          <button onClick={onRevisado} className="border border-stone-300 hover:border-[#1E5AA8] text-sm rounded-full px-5 py-2 text-stone-700 transition-colors">
            Marcar revisado hoy (sin gestión)
          </button>
        )}
        {g.ultimaRevisionFecha === todayISO() && <span className="text-xs text-emerald-700">Revisado hoy</span>}
      </div>
    </div>
  );
}
