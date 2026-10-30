import { useEffect, useMemo, useState } from "react";
import { X, Search, Download, ArrowUp, ArrowDown } from "lucide-react";

// Ventana flotante con el detalle de una tarjeta KPI: tabla con buscador, orden por columna y
// descarga a Excel. En el celular ocupa toda la pantalla.
//   columnas: [{ key, label, align?: "right", num?: boolean }]   filas: [{ [key]: valor, _tono?: "rose"|"green"|"amber" }]
//   pie: fila opcional de totales (mismas claves)
export default function KpiDetalle({ titulo, subtitulo, resumen, columnas, filas, pie, vacio, archivo, onClose }) {
  const [q, setQ] = useState("");
  const [orden, setOrden] = useState(null); // { key, dir }

  useEffect(() => {
    const f = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", f);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", f); document.body.style.overflow = prev; };
  }, [onClose]);

  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase();
    let r = t ? filas.filter((f) => columnas.some((c) => String(f[c.key] ?? "").toLowerCase().includes(t))) : filas.slice();
    if (orden) {
      const col = columnas.find((c) => c.key === orden.key);
      const val = (f) => (col && col.sort ? col.sort(f) : f[orden.key]);
      r.sort((a, b) => {
        const x = val(a), y = val(b);
        const n = typeof x === "number" && typeof y === "number" ? x - y : String(x ?? "").localeCompare(String(y ?? ""), "es", { numeric: true });
        return orden.dir === "asc" ? n : -n;
      });
    }
    return r;
  }, [filas, columnas, q, orden]);

  const alternar = (key) => setOrden((o) => (o && o.key === key ? (o.dir === "asc" ? { key, dir: "desc" } : null) : { key, dir: "asc" }));

  async function descargar() {
    const XLSX = await import("xlsx");
    const datos = visibles.map((f) => Object.fromEntries(columnas.map((c) => [c.label, f[c.key] ?? ""])));
    if (pie) datos.push(Object.fromEntries(columnas.map((c) => [c.label, pie[c.key] ?? ""])));
    const ws = XLSX.utils.json_to_sheet(datos);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Detalle");
    XLSX.writeFile(wb, `${archivo || "detalle"}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  const TONO = { rose: "bg-rose-50", green: "bg-emerald-50", amber: "bg-amber-50" };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/45 sm:p-6" onClick={onClose} role="dialog" aria-modal="true" aria-label={titulo}>
      <div
        className="bg-white w-full sm:max-w-5xl h-[92dvh] sm:h-auto sm:max-h-[86vh] rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 border-b border-stone-100">
          <div className="min-w-0">
            <div className="font-display text-lg text-[#13234A] leading-snug">{titulo}</div>
            {subtitulo && <div className="text-xs text-stone-500 mt-0.5">{subtitulo}</div>}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 shrink-0" aria-label="Cerrar"><X size={20} /></button>
        </div>

        {resumen && resumen.length > 0 && (
          <div className="flex flex-wrap gap-2 px-5 pt-3">
            {resumen.map((r) => (
              <span key={r.label} className="rounded-full bg-[#EEF3FF] text-[#13234A] text-xs px-3 py-1">
                <span className="text-stone-500">{r.label}: </span><b>{r.valor}</b>
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 px-5 py-3 flex-wrap">
          <div className="relative flex-1 min-w-[180px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar…" className="w-full pl-9 pr-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:border-[#2563EB]" />
          </div>
          <span className="text-xs text-stone-400">{visibles.length} de {filas.length}</span>
          <button onClick={descargar} disabled={visibles.length === 0} className="flex items-center gap-1.5 text-xs border border-stone-200 rounded-lg px-3 py-2 text-stone-600 hover:text-[#0F3D66] hover:border-[#0F3D66] disabled:opacity-40">
            <Download size={14} /> Excel
          </button>
        </div>

        <div className="flex-1 overflow-auto px-5 pb-5 min-h-0">
          {filas.length === 0 ? (
            <div className="text-sm text-stone-400 text-center py-10">{vacio || "No hay datos para mostrar con los filtros actuales."}</div>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead className="sticky top-0 bg-white z-10">
                <tr>
                  {columnas.map((c) => (
                    <th
                      key={c.key}
                      onClick={() => alternar(c.key)}
                      className={`text-xs font-semibold text-stone-500 py-2 px-2 border-b border-stone-200 cursor-pointer select-none whitespace-nowrap ${c.align === "right" ? "text-right" : "text-left"}`}
                    >
                      {c.label}
                      {orden && orden.key === c.key && (orden.dir === "asc" ? <ArrowUp size={11} className="inline ml-1" /> : <ArrowDown size={11} className="inline ml-1" />)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibles.map((f, i) => (
                  <tr key={i} className={`border-b border-stone-100 ${f._tono ? TONO[f._tono] : ""}`}>
                    {columnas.map((c) => (
                      <td key={c.key} className={`py-1.5 px-2 whitespace-nowrap ${c.align === "right" ? "text-right tabular-nums" : ""}`}>{f[c.key] ?? "—"}</td>
                    ))}
                  </tr>
                ))}
                {pie && !q && (
                  <tr className="font-semibold bg-stone-50">
                    {columnas.map((c) => (
                      <td key={c.key} className={`py-2 px-2 whitespace-nowrap ${c.align === "right" ? "text-right tabular-nums" : ""}`}>{pie[c.key] ?? ""}</td>
                    ))}
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
