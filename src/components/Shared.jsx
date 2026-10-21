import { useState } from "react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import UfChip from "./UfChip";
import { T, Bloque } from "../lib/layout";
import { ALERT_STYLE } from "../lib/constants";

// Círculo con las iniciales de un nombre o correo — usado en el header de
// usuario y en las tarjetas de ejecutivo, para darle a cada persona una
// identidad visual rápida de reconocer sin depender de una foto real.
export function Avatar({ name, size = "md" }) {
  const initials = String(name || "?")
    .trim()
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const sizeClass = size === "lg" ? "w-11 h-11 text-base" : "w-9 h-9 text-sm";
  return (
    <span className={`inline-flex items-center justify-center rounded-full bg-sky-100 text-[#0F3D66] font-semibold shrink-0 ${sizeClass}`}>
      {initials || "?"}
    </span>
  );
}

// Un ícono + etiqueta + valor, en línea — usado para las cifras destacadas
// de cada tarjeta de ejecutivo (unidades, comisión, bruto, neto) en vez de
// simples números sueltos, para que se lean de un vistazo.
export function IconStat({ icon: Icon, label, value, accent = "text-[#0F3D66]" }) {
  return (
    <div className="flex items-center gap-2">
      <Icon size={18} className="text-stone-400 shrink-0" />
      <div className="leading-tight">
        <div className="text-[11px] text-stone-400">{label}</div>
        <div className={`text-sm font-semibold ${accent}`}>{value}</div>
      </div>
    </div>
  );
}

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
    <label className={`flex flex-col gap-1.5 ${className}`}>
      <span className="text-xs font-medium text-stone-500">{label}</span>
      {children}
    </label>
  );
}

// Colores pastel de las tarjetas de indicadores (mismo juego del Dashboard).
const TONOS = {
  blue: { bg: "#EAF1FF", fg: "#2563EB", ico: "#DCE8FF" },
  purple: { bg: "#F1EAFF", fg: "#7C3AED", ico: "#E7DCFF" },
  pink: { bg: "#FFEAF4", fg: "#EC4899", ico: "#FFDCEC" },
  green: { bg: "#E3F8F0", fg: "#14B8A6", ico: "#CFF1E5" },
  amber: { bg: "#FFF3DD", fg: "#F59E0B", ico: "#FFE6BB" },
};

function Spark({ data, color, id }) {
  return (
    <div className="absolute bottom-0 right-0 w-1/2 h-9 opacity-60 pointer-events-none">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} fill={`url(#${id})`} dot={false} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// Tarjeta de indicador: ícono en burbuja, valor grande y, si hay datos,
// una mini-curva de fondo y una variación (delta, en %).
export function KpiCard({ label, value, sub, small, tone = "blue", icon: Icon, delta, serie, bid, orden }) {
  const t = TONOS[tone] || TONOS.blue;
  const idGrad = `spark-${tone}-${String(label).replace(/\W/g, "")}`;
  const card = (
    <div
      className="relative overflow-hidden rounded-2xl shadow-card border border-white p-4 flex flex-col gap-1"
      style={{ background: `linear-gradient(180deg, #ffffff 0%, ${t.bg} 100%)` }}
    >
      <div className="relative z-10 flex items-start justify-between mb-1">
        {Icon ? (
          <span className="w-11 h-11 min-w-[32px] min-h-[32px] rounded-full flex items-center justify-center" style={{ background: t.ico, color: t.fg }}>
            <Icon size={20} />
          </span>
        ) : (
          <span />
        )}
        {delta != null && (
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${delta >= 0 ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"}`}
          >
            {delta >= 0 ? "↑" : "↓"} {Math.abs(delta)}%
          </span>
        )}
      </div>
      <div className="relative z-10 text-sm text-stone-600">{label}</div>
      <div className={`relative z-10 font-display text-[#13234A] ${small ? "text-xl leading-snug" : "text-3xl"}`}>{value}</div>
      <div className="relative z-10 text-xs text-stone-500 pb-9 max-w-[60%]">{sub}</div>
      {serie && serie.length > 1 && <Spark data={serie} color={t.fg} id={idGrad} />}
    </div>
  );
  return bid ? (
    <Bloque id={bid} grupo="dash-kpi" orden={orden} span={12} spanM={30}>{card}</Bloque>
  ) : card;
}

export function Panel({ title, children, className = "", bid, grupo, orden, span = 30 }) {
  const panel = (
    <div className={`bg-white border border-[#EEF1F8] rounded-2xl shadow-card p-5 ${bid ? "overflow-hidden" : ""} ${className}`}>
      {title && <div className="font-display text-lg text-[#13234A] mb-3">{typeof title === "string" ? <T>{title}</T> : title}</div>}
      {children}
    </div>
  );
  return bid ? (
    <Bloque id={bid} grupo={grupo} orden={orden} span={span}>{panel}</Bloque>
  ) : panel;
}

// Título de tarjeta con ícono azul y, a la derecha, un control opcional.
export function CardTitle({ icon: Icon, children, right }) {
  return (
    <div className="flex items-center justify-between gap-3 mb-4 pb-3 border-b border-stone-100 flex-wrap">
      <div className="flex items-center gap-2.5">
        {Icon && <Icon size={22} className="text-[#2563EB] shrink-0" />}
        <span className="font-display text-lg text-[#13234A]">{typeof children === "string" ? <T>{children}</T> : children}</span>
      </div>
      {right}
    </div>
  );
}

// Contenedor estándar de toda pantalla de menú: mismo ancho y mismos márgenes
// para que el título quede siempre en el mismo lugar.
export const PAGE_CLASS = "w-full max-w-6xl mx-auto px-5 pt-4 pb-6";

// Encabezado de página estándar: título grande + subtítulo, con espacio a
// la derecha para un control propio de la vista (ej. el selector de Mes en
// Comisiones), para que todas las pantallas compartan la misma jerarquía.
export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="flex items-start justify-between flex-wrap gap-4 mb-6">
      <div className="flex-1 min-w-[200px]">
        <h1 className="font-display text-3xl text-[#13234A]">{typeof title === "string" ? <T>{title}</T> : title}</h1>
        {subtitle && <p className="text-sm text-stone-500 mt-1">{subtitle}</p>}
      </div>
      {children}
      <UfChip />
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

export function AlertGroup({ tipo, lista, onClickCliente }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-stone-200 rounded-xl overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-stone-50 transition-colors">
        <span className={`text-xs px-2 py-1 rounded-sm border ${ALERT_STYLE[tipo]}`}>{tipo}</span>
        <span className="text-sm text-stone-500">{lista.length} cliente(s)</span>
      </button>
      {open && (
        <div className="border-t border-stone-100 px-4 py-2">
          {lista.map((g) => (
            <button
              key={g.rut}
              onClick={() => onClickCliente && onClickCliente(g)}
              className="w-full text-left grid grid-cols-[1fr_100px_140px] items-center gap-3 py-1.5 border-b border-stone-50 last:border-0 hover:bg-sky-50/60 transition-colors -mx-1 px-1 rounded-sm"
            >
              <span className="truncate">
                <span className="text-sm">{g.cliente}</span> <span className="text-xs text-stone-400">RUT {g.rut}</span>
                {g.cambioEstadoDetalle && (
                  <span className="block text-xs text-indigo-700">{g.cambioEstadoDetalle}</span>
                )}
              </span>
              <span className="text-xs text-stone-400 text-right">{g._ultimaFecha || "Sin fecha"}</span>
              <span className="text-xs text-stone-400 truncate">{g.ejecutivo}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
