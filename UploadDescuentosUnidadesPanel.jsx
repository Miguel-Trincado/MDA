import { useState } from "react";
import { parseDescuentosUnidades } from "../lib/helpers";

// Referencia fija de "% de descuento" por unidad (ej. 101 → 10%, 201 →
// 9%…), aparte del listado de precios: ese se reemplaza entero con cada
// carga y muchas veces viene sin la columna de descuento, así que esta
// tabla es la que no se pierde — el Simulador la usa sola para rellenar
// el descuento de cada unidad cuando el listado subido no trae uno.
export default function UploadDescuentosUnidadesPanel({ onUpload }) {
  const [texto, setTexto] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  async function guardar() {
    setError("");
    setResult(null);
    try {
      const { filas, omitidas } = parseDescuentosUnidades(texto);
      setBusy(true);
      await onUpload(filas);
      setResult({ total: filas.length, omitidas });
      setTexto("");
    } catch (err) {
      setError(err.message || "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border border-stone-300 bg-white p-5">
      <h3 className="font-display text-lg text-[#0F3D66] mb-2">Descuentos por unidad (Simulador)</h3>
      <p className="text-stone-500 text-sm mb-4">
        Pega la tabla de Unidad + % de descuento (dos columnas, una fila por unidad; el encabezado se ignora solo).
        Queda guardada aparte del listado de precios, así que no se pierde aunque subas un listado sin esa columna —
        el Simulador la usa automáticamente para rellenar el descuento de cada unidad.
      </p>

      <textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        rows={6}
        placeholder={"101\t10,0%\n102\t10,0%\n..."}
        className="w-full border border-stone-300 rounded-sm px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#1E5AA8] mb-3"
      />

      <button
        onClick={guardar}
        disabled={busy || !texto.trim()}
        className="bg-[#0F3D66] hover:bg-[#1E5AA8] disabled:opacity-50 text-white px-5 py-2.5 text-sm font-medium"
      >
        {busy ? "Guardando…" : "Guardar descuentos"}
      </button>

      {error && <div className="mt-4 border border-rose-300 bg-rose-50 text-rose-800 text-sm px-3 py-2">{error}</div>}

      {result && (
        <div className="mt-4 text-sm text-emerald-700">
          Se guardaron {result.total} unidad(es).
          {result.omitidas > 0 && <span className="text-stone-400"> Se ignoraron {result.omitidas} fila(s) sin reconocer.</span>}
        </div>
      )}
    </div>
  );
}
