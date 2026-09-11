import { useState, useRef, useEffect } from "react";
import { Bell } from "lucide-react";
import { fmtDate } from "../lib/helpers";
import { contarPendientes } from "../lib/reminders";

const ESTILO_TAREA = {
  vencida: "bg-rose-100 text-rose-900 border-rose-300",
  hoy: "bg-amber-100 text-amber-900 border-amber-300",
  proxima: "bg-sky-100 text-sky-900 border-sky-300",
};
const LABEL_TAREA = { vencida: "Vencida", hoy: "Hoy", proxima: "Próxima" };

export default function NotificationBell({ tareas, mostrarEjecutivo }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const pendientes = contarPendientes(tareas);

  useEffect(() => {
    function onClickFuera(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickFuera);
    return () => document.removeEventListener("mousedown", onClickFuera);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative w-9 h-9 flex items-center justify-center rounded-full border border-stone-300 hover:bg-stone-100 transition-colors"
        title="Recordatorios"
      >
        <Bell size={18} className="text-[#0F3D66]" />
        {pendientes > 0 && (
          <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[10px] leading-none rounded-full min-w-[18px] px-1 py-0.5 flex items-center justify-center font-semibold">
            {pendientes}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto bg-white border border-stone-200 rounded-xl shadow-lg z-50 text-stone-800">
          <div className="px-4 py-3 border-b border-stone-100 font-display text-sm text-[#0F3D66] sticky top-0 bg-white rounded-t-xl">
            Recordatorios {pendientes > 0 ? `(${pendientes} pendientes)` : ""}
          </div>
          {tareas.length === 0 ? (
            <div className="px-4 py-6 text-center text-stone-400 text-sm">Sin próximas acciones programadas.</div>
          ) : (
            <div className="divide-y divide-stone-100">
              {tareas.map((t, i) => (
                <div key={i} className="px-4 py-2.5 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium truncate">{t.cliente}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border shrink-0 ${ESTILO_TAREA[t.estadoTarea]}`}>
                      {LABEL_TAREA[t.estadoTarea]}
                    </span>
                  </div>
                  <div className="text-xs text-stone-500 mt-0.5">
                    {t.accion} · {fmtDate(t.fecha)}
                    {mostrarEjecutivo && t.ejecutivo && <span> · {t.ejecutivo}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
