import { useState } from "react";
import { ALERT_STYLE } from "../lib/constants";

export function Stat({ label, value, accent = "text-[#0F3D66]" }) {
  return (
    <div>
      <div className={`font-display text-2xl ${accent}`}>{value}</div>
      <div className="text-xs text-stone-500">{label}</div>
    </div>
  );
}

export function Field({ label, children, className = "" }) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      <span className="text-xs text-stone-500">{label}</span>
      {children}
    </label>
  );
}

export function KpiCard({ label, value, sub, small }) {
  return (
    <div className="bg-white border border-stone-200 border-t-2 border-t-[#1E5AA8] rounded-sm shadow-sm hover:shadow-md transition-shadow p-4 flex flex-col gap-1">
      <div className="text-[11px] text-stone-400 uppercase tracking-wide">{label}</div>
      <div className={`font-display font-bold text-[#0F3D66] ${small ? "text-lg leading-snug" : "text-3xl"}`}>{value}</div>
      <div className="text-xs text-stone-500">{sub}</div>
    </div>
  );
}

export function Panel({ title, children, className = "" }) {
  return (
    <div className={`bg-white border border-stone-200 rounded-sm shadow-sm p-5 ${className}`}>
      {title && <div className="font-display text-lg text-[#0F3D66] mb-3">{title}</div>}
      {children}
    </div>
  );
}

export function SectionDivider({ label }) {
  return (
    <div className="flex items-center gap-3 my-8">
      <span className="w-1.5 h-6 bg-[#1E5AA8] rounded-sm shrink-0" />
      <span className="font-display text-xl text-[#0F3D66]">{label}</span>
      <span className="flex-1 h-px bg-stone-200" />
    </div>
  );
}

export function AlertGroup({ tipo, lista }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-stone-200 rounded-sm overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-stone-50 transition-colors">
        <span className={`text-xs px-2 py-1 rounded-sm border ${ALERT_STYLE[tipo]}`}>{tipo}</span>
        <span className="text-sm text-stone-500">{lista.length} cliente(s)</span>
      </button>
      {open && (
        <div className="border-t border-stone-100 px-4 py-2">
          {lista.map((g) => (
            <div key={g.rut} className="text-sm flex items-center justify-between py-1.5 border-b border-stone-50 last:border-0">
              <span>
                {g.cliente} <span className="text-xs text-stone-400">RUT {g.rut}</span>
              </span>
              <span className="text-xs text-stone-400">{g.ejecutivo}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
