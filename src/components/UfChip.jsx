import { Loader2, RefreshCw } from "lucide-react";
import { useValorUFHoy } from "../lib/uf";

const fmt = (n) => new Intl.NumberFormat("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

// Indicador fijo arriba a la derecha con la UF del día.
export default function UfChip() {
  const { valorUF, loading, error, recargar } = useValorUFHoy();
  return (
    <div className="flex justify-end px-5 pt-3 -mb-1">
      <div
        className="flex items-center gap-2 bg-white border border-stone-200 rounded-full shadow-sm px-3.5 py-1 text-xs text-stone-500"
        title="Valor oficial de la UF para hoy"
      >
        <span className="font-semibold text-[#0F3D66]">UF</span>
        {loading && (
          <span className="flex items-center gap-1.5">
            <Loader2 size={12} className="animate-spin" /> consultando…
          </span>
        )}
        {!loading && valorUF != null && <span className="font-medium text-stone-700">${fmt(valorUF)}</span>}
        {!loading && valorUF == null && (
          <button onClick={recargar} className="flex items-center gap-1 text-rose-600 hover:underline" title={error}>
            <RefreshCw size={12} /> no disponible, reintentar
          </button>
        )}
      </div>
    </div>
  );
}
