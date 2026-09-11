import { todayISO } from "./helpers";

// Construye la lista de "tareas" (próximas acciones con fecha) a partir de
// una lista de fichas de gestión. Cada tarea queda clasificada como
// "vencida" (fecha ya pasó), "hoy", o "proxima" (fecha futura).
export function getTareas(listaGestion) {
  const hoy = todayISO();
  return listaGestion
    .filter((g) => g.proximaAccion && g.fechaProximaAccion)
    .map((g) => {
      let estadoTarea = "proxima";
      if (g.fechaProximaAccion < hoy) estadoTarea = "vencida";
      else if (g.fechaProximaAccion === hoy) estadoTarea = "hoy";
      return {
        rut: g.rut,
        cliente: g.cliente || "(sin nombre)",
        ejecutivo: g.ejecutivo || "",
        accion: g.proximaAccion,
        fecha: g.fechaProximaAccion,
        estadoTarea,
      };
    })
    .sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));
}

export function contarPendientes(tareas) {
  return tareas.filter((t) => t.estadoTarea === "vencida" || t.estadoTarea === "hoy").length;
}
