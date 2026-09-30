import { useState } from "react";
import { FileUp, BarChart3, Users, Calculator, UserCog, Database, ChevronsLeft, ChevronsRight } from "lucide-react";

const ICONS = {
  carga: FileUp,
  dashboard: BarChart3,
  ejecutivo: Users,
  cotizador: Calculator,
  jefa: UserCog,
  comisiones: Database,
};

export default function Sidebar({ active, onChange, showComisiones }) {
  const [colapsado, setColapsado] = useState(false);
  const tabs = [
    { key: "carga", label: "Carga" },
    { key: "dashboard", label: "Dashboard" },
    { key: "ejecutivo", label: "Ejecutivo" },
    { key: "cotizador", label: "Simulador" },
    { key: "jefa", label: "Jefa de Ventas" },
    // Pestaña privada: solo aparece en el menú si hay una sesión de
    // administrador activa (misma sesión que habilita subir el Aval).
    ...(showComisiones ? [{ key: "comisiones", label: "Comisiones" }] : []),
  ];

  return (
    <div
      className={`shrink-0 bg-[#0B2547] text-white flex flex-col min-h-screen transition-[width] duration-150 ${
        colapsado ? "w-[68px]" : "w-[220px]"
      }`}
    >
      <div className="flex items-center justify-between px-4 h-16 border-b border-white/10">
        {!colapsado && <span className="font-display text-xl tracking-tight">Pilpilén</span>}
        <button
          onClick={() => setColapsado((v) => !v)}
          className="text-white/50 hover:text-white p-1 rounded-md hover:bg-white/10 transition-colors"
          title={colapsado ? "Expandir menú" : "Colapsar menú"}
        >
          {colapsado ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
        </button>
      </div>
      <nav className="flex-1 px-2.5 py-4 flex flex-col gap-1">
        {tabs.map((t) => {
          const Icon = ICONS[t.key];
          const isActive = active === t.key;
          return (
            <button
              key={t.key}
              onClick={() => onChange(t.key)}
              title={colapsado ? t.label : undefined}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                isActive ? "bg-[#1E5AA8] text-white font-medium" : "text-slate-300 hover:bg-white/10 hover:text-white"
              } ${colapsado ? "justify-center" : ""}`}
            >
              <Icon size={18} className="shrink-0" />
              {!colapsado && <span className="truncate">{t.label}</span>}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
