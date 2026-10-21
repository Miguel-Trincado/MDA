import { ArrowDown, ArrowUp, Database, Loader2, RefreshCw } from "lucide-react";
import { useValorUFHoy } from "../lib/uf";

const fmt = (n) => new Intl.NumberFormat("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

// Tarjeta de la UF del día, arriba a la derecha de cada pantalla: valor y
// variación contra el día anterior.
export default function UfChip({ className = "" }) {
  const { valorUF, variacion, loading, error, recargar } = useValorUFHoy();
  const sube = variacion != null && variacion >= 0;
  return (
    <div
      className={`bg-white rounded-2xl shadow-card px-5 py-3 flex items-center gap-3 text-sm ${className}`}
      title="Valor oficial de la UF para hoy"
    >
      <Database size={22} className="text-[#13234A] shrink-0" />
      {loading && (
        <span className="flex items-center gap-1.5 text-stone-500">
          <Loader2 size={14} className="animate-spin" /> UF consultando…
        </span>
      )}
      {!loading && valorUF != null && (
        <>
          <span className="font-semibold text-[#13234A] whitespace-nowrap">UF $ {fmt(valorUF)}</span>
          {variacion != null && (
            <span
              className={`flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                sube ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
              }`}
              title="Variación contra el día anterior"
            >
              {sube ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
              {sube ? "+" : "−"}
              {fmt(Math.abs(variacion))}%
            </span>
          )}
        </>
      )}
      {!loading && valorUF == null && (
        <button onClick={recargar} className="flex items-center gap-1 text-rose-600 hover:underline" title={error}>
          <RefreshCw size={13} /> UF no disponible, reintentar
        </button>
      )}
    </div>
  );
}
