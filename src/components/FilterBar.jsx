import { Bloque } from "../lib/layout";
import { Calendar, Building2, LayoutGrid, ChevronDown } from "lucide-react";

const TODO = "Todo";

// Tarjeta de filtro: ícono en burbuja azul, etiqueta chica y valor en
// negrita. Los <select> son nativos (se abren igual que siempre) con la
// flecha dibujada aparte.
function Tarjeta({ icon: Icon, label, bid, orden, span, children }) {
  return (
    <Bloque id={bid} grupo="dash-filtros" orden={orden} span={span} spanM={60} minH={60}>
    <div className="bg-white rounded-2xl shadow-card px-4 py-3 flex items-center gap-3">
      <span className="w-11 h-11 rounded-xl bg-[#EEF3FF] text-[#2563EB] flex items-center justify-center shrink-0">
        <Icon size={20} />
      </span>
      <div className="flex flex-col min-w-0 flex-1">
        <span className="text-xs text-stone-400 leading-none mb-1">{label}</span>
        {children}
      </div>
    </div>
    </Bloque>
  );
}

function Selector({ value, onChange, options }) {
  return (
    <span className="relative flex-1 min-w-0">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none w-full text-sm text-[#13234A] font-semibold bg-transparent border-none focus:outline-none p-0 pr-5 cursor-pointer"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <ChevronDown size={16} className="absolute right-0 top-1/2 -translate-y-1/2 text-stone-500 pointer-events-none" />
    </span>
  );
}

export default function FilterBar({ filtros, onChange, opciones }) {
  const set = (key) => (value) => onChange({ ...filtros, [key]: value });

  return (
    <div className="grid-60 gap-4 mb-5">
      <Tarjeta icon={Calendar} label="Período" bid="filtro-periodo" orden={0} span={24}>
        <div className="flex items-center gap-2">
          <Selector value={filtros.periodoDesde} onChange={set("periodoDesde")} options={opciones.periodos} />
          <span className="text-stone-300 shrink-0">–</span>
          <Selector value={filtros.periodoHasta} onChange={set("periodoHasta")} options={opciones.periodos} />
        </div>
      </Tarjeta>
      <Tarjeta icon={Building2} label="Proyecto" bid="filtro-proyecto" orden={1} span={18}>
        <Selector value={filtros.proyecto} onChange={set("proyecto")} options={opciones.proyectos} />
      </Tarjeta>
      <Tarjeta icon={LayoutGrid} label="Tipología" bid="filtro-tipologia" orden={2} span={18}>
        <Selector value={filtros.tipologia} onChange={set("tipologia")} options={opciones.tipologias} />
      </Tarjeta>
    </div>
  );
}
