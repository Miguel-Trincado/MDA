import { useState } from "react";
import {
  BarChart3, Users, Calculator, UserCog, Database,
  ChevronsLeft, ChevronsRight, Settings, FileUp, LogOut,
} from "lucide-react";
import { Avatar } from "./Shared";

const ICONS = {
  dashboard: BarChart3,
  ejecutivo: Users,
  cotizador: Calculator,
  jefa: UserCog,
  comisiones: Database,
};

export default function Sidebar({ active, onChange, showComisiones, email, onLogout }) {
  const [colapsado, setColapsado] = useState(false);
  const [cuentaAbierta, setCuentaAbierta] = useState(false);
  // "Carga" (subir Maestro Aval / listado de precios) ya no es una pestaña
  // más del menú: es una acción de administrador, así que vive dentro del
  // menú de Cuenta al final del sidebar, junto con la sesión.
  const tabs = [
    { key: "dashboard", label: "Dashboard" },
    { key: "ejecutivo", label: "Ejecutivo" },
    { key: "cotizador", label: "Simulador" },
    { key: "jefa", label: "Jefa de Ventas" },
    ...(showComisiones ? [{ key: "comisiones", label: "Comisiones" }] : []),
  ];

  return (
    <div
      className={`shrink-0 sticky top-0 h-screen overflow-y-auto bg-[#0B2547] text-white flex flex-col transition-[width] duration-150 ${
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

      {/* Cuenta: al final del menú, tipo engranaje — agrupa la sesión de
          administrador y, dentro de ella, la opción de cargar el Maestro
          Aval / listado de precios (antes era su propia pestaña arriba). */}
      <div className="px-2.5 py-3 border-t border-white/10 relative">
        {cuentaAbierta && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setCuentaAbierta(false)} />
            <div className="absolute left-2.5 right-2.5 bottom-full mb-2 z-20 bg-white border border-stone-200 rounded-lg shadow-lg py-1 text-stone-700 overflow-hidden">
              {email && (
                <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-stone-100">
                  <Avatar name={email} />
                  <span className="text-xs text-stone-600 truncate">{email}</span>
                </div>
              )}
              <button
                onClick={() => {
                  setCuentaAbierta(false);
                  onChange("carga");
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-stone-50 transition-colors"
              >
                <FileUp size={14} /> Cargar archivo
              </button>
              {email && (
                <button
                  onClick={() => {
                    setCuentaAbierta(false);
                    onLogout && onLogout();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-rose-600 hover:bg-rose-50 transition-colors"
                >
                  <LogOut size={14} /> Cerrar sesión
                </button>
              )}
            </div>
          </>
        )}
        <button
          onClick={() => setCuentaAbierta((v) => !v)}
          title={colapsado ? "Cuenta" : undefined}
          className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-300 hover:bg-white/10 hover:text-white transition-colors ${
            colapsado ? "justify-center" : ""
          }`}
        >
          {email ? <Avatar name={email} /> : <Settings size={18} className="shrink-0" />}
          {!colapsado && <span className="truncate">{email || "Cuenta"}</span>}
        </button>
      </div>
    </div>
  );
}
