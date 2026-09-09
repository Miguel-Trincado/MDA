import { Calendar, Building2, MapPin, LayoutGrid, Flag } from "lucide-react";

function FilterField({ icon: Icon, label, value, onChange, options }) {
  return (
    <div className="flex-1 min-w-[150px] border border-stone-200 bg-white px-3 py-2 flex items-center gap-2.5">
      <Icon size={18} className="text-[#0F3D66] shrink-0" />
      <div className="flex flex-col min-w-0 flex-1">
        <span className="text-[10px] text-stone-400 uppercase tracking-wide leading-none mb-1">{label}</span>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="text-sm text-stone-800 font-medium bg-transparent border-none focus:outline-none p-0 w-full"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

export default function FilterBar({ filtros, onChange, opciones }) {
  const set = (key) => (value) => onChange({ ...filtros, [key]: value });

  return (
    <div className="flex flex-wrap gap-3 mb-4">
      <FilterField icon={Calendar} label="Período" value={filtros.periodo} onChange={set("periodo")} options={opciones.periodos} />
      <FilterField icon={Building2} label="Proyecto" value={filtros.proyecto} onChange={set("proyecto")} options={opciones.proyectos} />
      <FilterField icon={MapPin} label="Región" value={filtros.region} onChange={set("region")} options={opciones.regiones} />
      <FilterField icon={LayoutGrid} label="Tipología" value={filtros.tipologia} onChange={set("tipologia")} options={opciones.tipologias} />
      <FilterField icon={Flag} label="Estado" value={filtros.estado} onChange={set("estado")} options={opciones.estados} />
    </div>
  );
}
