import { useState } from "react";
import {
  BarChart3, Users, Calculator, UserCog, Percent, BadgeDollarSign, Wallet,
  ChevronsLeft, ChevronsRight, ChevronDown, Settings, X, FileUp, LogOut, LayoutDashboard, Database,
} from "lucide-react";
import { Avatar } from "./Shared";
import { useLayout } from "../lib/layout";

const ICONS = {
  dashboard: BarChart3,
  ejecutivo: Users,
  cotizador: Calculator,
  jefa: UserCog,
  cuotas: Wallet,
  comisiones: Percent,
  miscomisiones: BadgeDollarSign,
};

const CARGAS = [["aval", "Aval"], ["aval_completo", "Aval Vivet"], ["lista_precios", "Precios"], ["cuotas_pago", "Cuotas"]];
const fmtCarga = (iso) => new Date(iso).toLocaleString("es-CL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const reciente = (iso) => Date.now() - new Date(iso).getTime() < 36 * 3600 * 1000;

// Fila de menú (principal o submenú). `activo` pinta la barra lateral de acento.
function Item({ icon: Icon, label, activo, onClick, colapsado, sub, tono, title }) {
  return (
    <button
      onClick={onClick}
      title={colapsado ? label : title}
      className={`group relative w-full flex items-center gap-3 rounded-xl text-[13px] transition-colors ${sub ? "pl-3 pr-3 py-2" : "px-3 py-2.5"} ${
        activo ? "bg-white/[0.09] text-white font-medium" : tono === "rose" ? "text-rose-300 hover:bg-rose-500/10" : "text-slate-300/80 hover:bg-white/[0.06] hover:text-white"
      } ${colapsado ? "lg:justify-center lg:px-0" : ""}`}
    >
      {activo && <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-sky-400" />}
      <Icon size={sub ? 15 : 17} className={`shrink-0 ${activo ? "text-sky-300" : tono === "rose" ? "" : "text-slate-400 group-hover:text-slate-200"}`} />
      <span className={`truncate ${colapsado ? "lg:hidden" : ""}`}>{label}</span>
    </button>
  );
}

export default function Sidebar({ movilAbierto, onCerrarMovil, active, onChange, menus = {}, esAdmin, email, perfilLabel, cargas, onLogout }) {
  const diseno = useLayout();
  const [colapsado, setColapsado] = useState(false);
  const [configAbierta, setConfigAbierta] = useState(active === "usuarios" || active === "carga");
  const tabs = [
    { key: "dashboard", label: "Dashboard" },
    { key: "ejecutivo", label: "Ejecutivo" },
    { key: "cotizador", label: "Simulador" },
    { key: "jefa", label: "Jefa de Ventas" },
    { key: "cuotas", label: "Cuotas y Pagos" },
    { key: "comisiones", label: "Comisiones" },
    { key: "miscomisiones", label: "Mis comisiones" },
  ].filter((t) => menus[t.key]);
  const datosCarga = cargas ? CARGAS.filter(([k]) => cargas[k]) : [];

  function alternarConfig() {
    if (colapsado) { setColapsado(false); setConfigAbierta(true); return; }
    setConfigAbierta((v) => !v);
  }

  return (
    <div
      className={`shrink-0 fixed lg:sticky top-0 left-0 z-50 lg:z-auto h-[100dvh] lg:h-screen overflow-y-auto text-white flex flex-col transition-[width,transform] duration-200 w-[270px] bg-gradient-to-b from-[#0C2A52] via-[#0B2547] to-[#081C38] ${
        movilAbierto ? "translate-x-0" : "-translate-x-full"
      } lg:translate-x-0 ${colapsado ? "lg:w-[68px]" : "lg:w-[236px]"}`}
    >
      <div className="flex items-center justify-between px-4 h-16">
        <span className={`font-display text-xl tracking-tight ${colapsado ? "lg:hidden" : ""}`}>MDA</span>
        <button onClick={onCerrarMovil} className="lg:hidden text-white/70 p-1 rounded-md hover:bg-white/10" aria-label="Cerrar menú"><X size={20} /></button>
        <button
          onClick={() => setColapsado((v) => !v)}
          className={`hidden lg:block text-white/40 hover:text-white p-1 rounded-md hover:bg-white/10 transition-colors ${colapsado ? "mx-auto" : ""}`}
          title={colapsado ? "Expandir menú" : "Colapsar menú"}
        >
          {colapsado ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
        </button>
      </div>

      <nav className="px-3 pt-2 flex flex-col gap-0.5">
        <div className={`px-3 pb-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-slate-500 ${colapsado ? "lg:hidden" : ""}`}>Menú</div>
        {tabs.map((t) => (
          <Item key={t.key} icon={ICONS[t.key]} label={t.label} activo={active === t.key} onClick={() => onChange(t.key)} colapsado={colapsado} />
        ))}
      </nav>

      {/* Configuración: se despliega aquí mismo con todos sus submenús. */}
      <div className="mt-auto px-3 pt-4 pb-3">
        <div className="border-t border-white/10 pt-3">
          <button
            onClick={alternarConfig}
            title={colapsado ? "Configuración" : undefined}
            aria-expanded={configAbierta}
            className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] transition-colors ${
              configAbierta ? "text-white" : "text-slate-300/80 hover:bg-white/[0.06] hover:text-white"
            } ${colapsado ? "lg:justify-center lg:px-0" : ""}`}
          >
            <Settings size={17} className="shrink-0 text-slate-400" />
            <span className={`truncate flex-1 text-left ${colapsado ? "lg:hidden" : ""}`}>Configuración</span>
            <ChevronDown size={14} className={`shrink-0 text-slate-500 transition-transform ${configAbierta ? "rotate-180" : ""} ${colapsado ? "lg:hidden" : ""}`} />
          </button>

          {configAbierta && !colapsado && (
            <div className="mt-1 ml-3 pl-2 border-l border-white/10 flex flex-col gap-0.5">
              {esAdmin && <Item sub icon={UserCog} label="Usuarios" activo={active === "usuarios"} onClick={() => { onChange("usuarios"); }} />}
              {esAdmin && (
                <div className="hidden lg:block">
                  <Item sub icon={LayoutDashboard} label={diseno.editando ? "Terminar edición de diseño" : "Editar diseño"} activo={diseno.editando} onClick={() => diseno.setEditando(!diseno.editando)} />
                </div>
              )}
              {menus.carga && <Item sub icon={FileUp} label="Cargar archivo" activo={active === "carga"} onClick={() => onChange("carga")} />}

              {datosCarga.length > 0 && (
                <div className="mt-1.5 mb-0.5 rounded-xl bg-white/[0.04] px-3 py-2.5">
                  <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.14em] text-slate-500 mb-1.5">
                    <Database size={12} /> Datos al día
                  </div>
                  <div className="flex flex-col gap-1">
                    {datosCarga.map(([k, label]) => (
                      <div key={k} className="flex items-center gap-2 text-[11px] text-slate-300/90">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${reciente(cargas[k].createdAt) ? "bg-emerald-400" : "bg-amber-400"}`} />
                        <span className="flex-1">{label}</span>
                        <span className="tabular-nums text-slate-400">{fmtCarga(cargas[k].createdAt)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <Item sub icon={LogOut} label="Cerrar sesión" tono="rose" onClick={() => onLogout && onLogout()} />
            </div>
          )}
        </div>

        {email && (
          <div className={`mt-3 flex items-center gap-2.5 rounded-xl bg-white/[0.04] px-3 py-2.5 ${colapsado ? "lg:justify-center lg:px-0 lg:bg-transparent" : ""}`} title={email}>
            <Avatar name={email} />
            <div className={`min-w-0 ${colapsado ? "lg:hidden" : ""}`}>
              <div className="text-[12px] text-slate-100 truncate">{email}</div>
              {perfilLabel && <div className="text-[10px] text-slate-400">{perfilLabel}</div>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
