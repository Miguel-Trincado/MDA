import { PROYECTO_OBJETIVO } from "./constants";

export const todayISO = () => new Date().toISOString().slice(0, 10);
export const nowISO = () => new Date().toISOString();
export const isWeekdayToday = () => {
  const d = new Date().getDay();
  return d >= 1 && d <= 5;
};

export function stripAccents(s) {
  return (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function normalizeName(s) {
  if (!s) return "";
  return s
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function normalizeRut(s) {
  if (!s) return "";
  return s.trim().replace(/\./g, "").replace(/-/g, "").toUpperCase();
}

export function esProyectoPilpilen(proyecto) {
  return stripAccents(proyecto || "").toUpperCase().includes(PROYECTO_OBJETIVO);
}

export function fmtDate(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}-${m}-${y}`;
}

export function fmtDateTime(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString("es-CL", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function computeAlert(g) {
  if (!g || !g.cliente) return "";
  const today = todayISO();
  if (g.flagCambioEjecutivo === "CAMBIO") return "CAMBIO DE EJECUTIVO";
  if (g.estado === "Perdido" && !g.motivoPerdida) return "COMPLETAR MOTIVO DE PÉRDIDA";
  if (g.estado === "Promesado" && g.etapaComercial !== "Promesado") return "REVISAR ETAPA";
  if (g.estado === "En espera" && !g.fechaProximaAccion) return "COMPLETAR PRÓXIMA ACCIÓN";
  if (g.flagSistema === "NUEVO" && g.ultimaRevisionFecha !== today) return "NUEVO - COMPLETAR GESTIÓN";
  if (g.flagSistema === "SI" && g.ultimaRevisionFecha !== today) return "NUEVA COTIZACIÓN";
  if ((g.estado === "Activo" || g.estado === "En espera") && g.fechaProximaAccion && g.fechaProximaAccion < today)
    return "ACCIÓN VENCIDA";
  if (g.estado === "Activo" && isWeekdayToday() && g.ultimaRevisionFecha !== today) return "SIN REVISAR HOY";
  if (g.estado === "Activo" && !g.fechaProximaAccion) return "COMPLETAR PRÓXIMA ACCIÓN";
  return "";
}

export function parseFechaAMes(str) {
  if (!str) return null;
  const raw = str.trim().split(" ")[0];
  let m = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return { year: +m[1], month: +m[2] };
  m = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) return { year: +m[3], month: +m[2] };
  if (/^\d+(\.\d+)?$/.test(raw)) {
    const serial = parseFloat(raw);
    if (serial > 20000 && serial < 60000) {
      const epoch = Date.UTC(1899, 11, 30);
      const d = new Date(epoch + serial * 86400000);
      return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
    }
  }
  const d = new Date(raw);
  if (!isNaN(d.getTime())) return { year: d.getFullYear(), month: d.getMonth() + 1 };
  return null;
}

export function labelPeriodo(key, modo, MESES_ES) {
  if (modo === "año") return String(key);
  const [y, m] = key.split("-");
  return `${MESES_ES[Number(m) - 1]} ${y}`;
}
