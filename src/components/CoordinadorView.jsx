import { useState } from "react";
import { Stat } from "./Shared";

export default function CoordinadorView({ onUpload, totalClientes }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  async function handleUpload() {
    setError("");
    setResult(null);
    if (!text.trim()) {
      setError("Pega el Maestro Aval completo antes de actualizar.");
      return;
    }
    setBusy(true);
    try {
      const summary = await onUpload(text);
      setResult(summary);
      setText("");
    } catch (e) {
      setError(e.message || "No se pudo procesar el archivo pegado.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-5 py-8">
      <h2 className="font-display text-2xl text-teal-950 mb-1">Actualizar desde Maestro</h2>
      <p className="text-stone-500 text-sm mb-6">
        Copia el Maestro Aval completo desde Excel (con encabezado) y pégalo abajo, aunque traiga varios proyectos
        mezclados: el sistema se queda solo con las filas de <strong>Pilpilén</strong> y compara por RUT contra la
        base en Supabase. No filtres ni ordenes nada.
      </p>

      <div className="mb-3 text-xs text-stone-500">
        Clientes actualmente en el sistema: <span className="text-teal-900 font-medium">{totalClientes}</span>
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Pega aquí el Maestro Aval completo (Ctrl+V desde Excel, incluyendo el encabezado)…"
        className="w-full h-64 border border-stone-300 p-3 font-mono text-xs bg-white focus:outline-none focus:border-teal-700"
      />

      {error && <div className="mt-3 border border-rose-300 bg-rose-50 text-rose-800 text-sm px-3 py-2">{error}</div>}

      <button
        onClick={handleUpload}
        disabled={busy}
        className="mt-4 bg-teal-900 hover:bg-teal-800 disabled:opacity-50 text-white px-5 py-2.5 text-sm font-medium"
      >
        {busy ? "Actualizando…" : "Actualizar desde Maestro"}
      </button>

      {result && (
        <div className="mt-6 border border-stone-300 bg-white p-5">
          <div className="font-display text-lg text-teal-950 mb-3">Actualización completa</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <Stat label="Filas de Pilpilén" value={result.filas} />
            <Stat label="Clientes procesados" value={result.clientes} />
            <Stat label="Nuevos" value={result.nuevos} accent="text-emerald-700" />
            <Stat label="Cambios de ejecutivo" value={result.cambiosEjecutivo} accent="text-violet-700" />
          </div>
          {result.filasOtrosProyectos > 0 && (
            <p className="text-xs text-stone-400 mt-3">
              Se ignoraron {result.filasOtrosProyectos} filas de otros proyectos del Maestro Aval.
            </p>
          )}
          {result.cambiosEjecutivo > 0 && (
            <p className="text-xs text-stone-500 mt-4">
              La Jefa de Ventas tiene {result.cambiosEjecutivo} cambio(s) de ejecutivo pendiente(s) de resolver en su
              panel.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
