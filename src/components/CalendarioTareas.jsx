import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { MESES_ES } from "../lib/constants";
import { todayISO } from "../lib/helpers";

const DIAS_SEMANA = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export default function CalendarioTareas({ tareas, mostrarEjecutivo }) {
  const hoy = todayISO();
  const [cursor, setCursor] = useState(() => {
    const [y, m] = hoy.split("-");
    return { year: +y, month: +m }; // month: 1-12
  });

  const tareasPorDia = useMemo(() => {
    const map = {};
    tareas.forEach((t) => {
      if (!map[t.fecha]) map[t.fecha] = [];
      map[t.fecha].push(t);
    });
    return map;
  }, [tareas]);

  const celdas = useMemo(() => {
    const primerDia = new Date(Date.UTC(cursor.year, cursor.month - 1, 1));
    const ultimoDia = new Date(Date.UTC(cursor.year, cursor.month, 0));
    const totalDias = ultimoDia.getUTCDate();
    // getUTCDay(): 0=domingo..6=sábado. Convertimos a que la semana empiece en lunes.
    const primerDiaSemana = (primerDia.getUTCDay() + 6) % 7;

    const out = [];
    for (let i = 0; i < primerDiaSemana; i++) out.push(null);
    for (let d = 1; d <= totalDias; d++) {
      const key = `${cursor.year}-${String(cursor.month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      out.push({ dia: d, key });
    }
    return out;
  }, [cursor]);

  function cambiarMes(delta) {
    setCursor((c) => {
      let month = c.month + delta;
      let year = c.year;
      if (month > 12) { month = 1; year++; }
      if (month < 1) { month = 12; year--; }
      return { year, month };
    });
  }

  return (
    <div className="bg-white border border-stone-200 rounded-xl shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => cambiarMes(-1)} className="w-8 h-8 flex items-center justify-center rounded-full border border-stone-300 hover:border-[#1E5AA8] transition-colors">
          <ChevronLeft size={16} />
        </button>
        <div className="font-display text-lg text-[#0F3D66]">
          {MESES_ES[cursor.month - 1]} {cursor.year}
        </div>
        <button onClick={() => cambiarMes(1)} className="w-8 h-8 flex items-center justify-center rounded-full border border-stone-300 hover:border-[#1E5AA8] transition-colors">
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] text-stone-400 uppercase mb-1.5">
        {DIAS_SEMANA.map((d) => <span key={d}>{d}</span>)}
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {celdas.map((c, i) => {
          if (!c) return <div key={`vacio-${i}`} />;
          const tareasDelDia = tareasPorDia[c.key] || [];
          const esHoy = c.key === hoy;
          return (
            <div
              key={c.key}
              className={`min-h-[72px] border rounded-lg p-1.5 text-left ${esHoy ? "border-[#1E5AA8] bg-sky-50/60" : "border-stone-200"}`}
            >
              <div className={`text-xs mb-1 ${esHoy ? "font-bold text-[#0F3D66]" : "text-stone-500"}`}>{c.dia}</div>
              <div className="flex flex-col gap-0.5">
                {tareasDelDia.slice(0, 3).map((t, idx) => (
                  <div key={idx} title={`${t.cliente} · ${t.accion}${mostrarEjecutivo ? " · " + t.ejecutivo : ""}`} className="text-[10px] bg-amber-100 text-amber-900 rounded px-1 py-0.5 truncate">
                    {mostrarEjecutivo ? `${t.ejecutivo.split(" ")[0]}: ` : ""}{t.cliente}
                  </div>
                ))}
                {tareasDelDia.length > 3 && (
                  <div className="text-[10px] text-stone-400">+{tareasDelDia.length - 3} más</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
