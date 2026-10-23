import { useState } from "react";
import {
  BarChart3, Users, Calculator, UserCog, Database,
  ChevronsLeft, ChevronsRight, Settings, X, FileUp, LogOut, LayoutDashboard, Wallet,
} from "lucide-react";
import { Avatar } from "./Shared";
import { useLayout } from "../lib/layout";

const ICONS = {
  dashboard: BarChart3,
  ejecutivo: Users,
  cotizador: Calculator,
  jefa: UserCog,
  comisiones: Database,
  miscomisiones: Database,
  cuotas: Wallet,
  usuarios: UserCog,
};

export default function Sidebar({ movilAbierto, onCerrarMovil, active, onChange, showComisiones, esEjecutiva, esAdmin, sinJefa, sinCarga, email, perfilLabel, cargas, onLogout }) {
  const diseno = useLayout();
  const [colapsado, setColapsado] = useState(false);
  const [cuentaAbierta, setCuentaAbierta] = useState(false);
  // "Carga" (subir Maestro Aval / listado de precios) ya no es una pestaña
  // más del menú: es una acción de administrador, así que vive dentro del
  // menú de Cuenta al final del sidebar, junto con la sesión.
  const tabs = [
    { key: "dashboard", label: "Dashboard" },
    { key: "ejecutivo", label: "Ejecutivo" },
    { key: "cotizador", label: "Simulador" },
    ...(sinJefa ? [] : [{ key: "jefa", label: "Jefa de Ventas" }]),
    ...(showComisiones ? [{ key: "cuotas", label: "Cuotas y Pagos" }] : []),
    ...(showComisiones ? [{ key: "comisiones", label: "Comisiones" }] : []),
    ...(esEjecutiva ? [{ key: "miscomisiones", label: "Mis comisiones" }] : []),
  ];

  return (
    <div
      className={`shrink-0 fixed lg:sticky top-0 left-0 z-50 lg:z-auto h-[100dvh] lg:h-screen overflow-y-auto bg-[#0B2547] text-white flex flex-col transition-[width,transform] duration-200 w-[270px] ${
        movilAbierto ? "translate-x-0" : "-translate-x-full"
      } lg:translate-x-0 ${colapsado ? "lg:w-[68px]" : "lg:w-[220px]"}`}
    >
      <div className="flex items-center justify-between px-4 h-16 border-b border-white/10">
        <span className={`font-display text-xl tracking-tight ${colapsado ? "lg:hidden" : ""}`}>MDA</span>
        <button onClick={onCerrarMovil} className="lg:hidden text-white/70 p-1 rounded-md hover:bg-white/10" aria-label="Cerrar menú"><X size={20} /></button>
        <button
          onClick={() => setColapsado((v) => !v)}
          className="hidden lg:block text-white/50 hover:text-white p-1 rounded-md hover:bg-white/10 transition-colors"
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
              } ${colapsado ? "lg:justify-center" : ""}`}
            >
              <Icon size={18} className="shrink-0" />
              <span className={`truncate ${colapsado ? "lg:hidden" : ""}`}>{t.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Cuenta: al final del menú, tipo engranaje — agrupa la sesión de
          administrador y, dentro de ella, la opción de cargar el Maestro
          Aval / listado de precios (antes era su propia pestaña arriba). */}
      {(!colapsado || movilAbierto) && cargas && (cargas.aval || cargas.aval_completo || cargas.lista_precios || cargas.cuotas_pago) && (
        <div className="px-4 py-3 border-t border-white/10 text-[11px] text-slate-400 leading-snug">
          <div className="uppercase tracking-wide text-[10px] text-slate-500 mb-1">Datos al día</div>
          {[["aval", "Aval"], ["aval_completo", "Aval Vivet"], ["lista_precios", "Precios"], ["cuotas_pago", "Cuotas"]].map(([k, label]) =>
            cargas[k] ? (
              <div key={k}>
                {label}: {new Date(cargas[k].createdAt).toLocaleString("es-CL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
              </div>
            ) : null
          )}
        </div>
      )}
      <div className="px-2.5 py-3 border-t border-white/10 relative">
        {cuentaAbierta && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setCuentaAbierta(false)} />
            <div className="absolute left-2.5 right-2.5 bottom-full mb-2 z-20 bg-white border border-stone-200 rounded-lg shadow-lg py-1 text-stone-700 overflow-hidden">
              {email && (
                <div className="px-3 py-2.5 border-b border-stone-100">
                  <div className="text-[10px] uppercase tracking-wide text-stone-400 mb-1.5">Mi cuenta</div>
                  <div className="flex items-center gap-2.5">
                    <Avatar name={email} />
                    <div className="min-w-0">
                      <div className="text-xs text-stone-700 truncate">{email}</div>
                      {perfilLabel && <div className="text-[11px] text-stone-400">{perfilLabel}</div>}
                    </div>
                  </div>
                </div>
              )}
              {esAdmin && (
                <button
                  onClick={() => {
                    setCuentaAbierta(false);
                    onChange("usuarios");
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-stone-50 transition-colors"
                >
                  <UserCog size={14} /> Usuarios
                </button>
              )}
              {esAdmin && (
                <button
                  onClick={() => {
                    setCuentaAbierta(false);
                    diseno.setEditando(!diseno.editando);
                  }}
                  className="hidden lg:flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-stone-50 transition-colors"
                >
                  <LayoutDashboard size={14} /> {diseno.editando ? "Terminar edición de diseño" : "Editar diseño"}
                </button>
              )}
              {!sinCarga && (
                <button
                  onClick={() => {
                    setCuentaAbierta(false);
                    onChange("carga");
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-stone-50 transition-colors"
                >
                  <FileUp size={14} /> Cargar archivo
                </button>
              )}
              <button
                onClick={() => {
                  setCuentaAbierta(false);
                  onLogout && onLogout();
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-rose-600 hover:bg-rose-50 transition-colors"
              >
                <LogOut size={14} /> Cerrar sesión
              </button>
            </div>
          </>
        )}
        <button
          onClick={() => setCuentaAbierta((v) => !v)}
          title={colapsado ? "Configuración" : undefined}
          className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-300 hover:bg-white/10 hover:text-white transition-colors ${
            colapsado ? "lg:justify-center" : ""
          }`}
        >
          <Settings size={18} className="shrink-0" />
          <span className={`truncate ${colapsado ? "lg:hidden" : ""}`}>Configuración</span>
        </button>
      </div>
    </div>
  );
}
