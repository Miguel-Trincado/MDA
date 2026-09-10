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

export function parseFechaCompleta(str) {
  if (!str) return null;
  const raw = str.trim().split(" ")[0];
  let day, month, year;
  let m = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    year = +m[1]; month = +m[2]; day = +m[3];
  } else {
    m = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (m) {
      day = +m[1]; month = +m[2]; year = +m[3];
    }
  }
  if (!year || !month || !day || month < 1 || month > 12) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  return isNaN(d.getTime()) ? null : d;
}

export function formatFechaCorta(d) {
  if (!d) return "—";
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getUTCDate())}-${pad(d.getUTCMonth() + 1)}-${d.getUTCFullYear()}`;
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
  let year, month;
  let m = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    year = +m[1];
    month = +m[2];
  } else {
    m = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (m) {
      year = +m[3];
      month = +m[2];
    } else if (/^\d+(\.\d+)?$/.test(raw)) {
      const serial = parseFloat(raw);
      if (serial > 20000 && serial < 60000) {
        const epoch = Date.UTC(1899, 11, 30);
        const d = new Date(epoch + serial * 86400000);
        year = d.getUTCFullYear();
        month = d.getUTCMonth() + 1;
      }
    } else {
      const d = new Date(raw);
      if (!isNaN(d.getTime())) {
        year = d.getFullYear();
        month = d.getMonth() + 1;
      }
    }
  }

  if (!year || !month || month < 1 || month > 12) return null;

  // Una fecha de cotización nunca puede ser futura. Si el parseo (o un dato
  // mal ingresado / en formato MM/DD en vez de DD/MM) arroja un mes por
  // venir, se descarta como fecha inválida en vez de graficarla.
  const hoy = new Date();
  const esFutura = year > hoy.getFullYear() || (year === hoy.getFullYear() && month > hoy.getMonth() + 1);
  if (esFutura) return null;

  return { year, month };
}

export function labelPeriodo(key, modo, MESES_ES) {
  if (modo === "año") return String(key);
  const [y, m] = key.split("-");
  return `${MESES_ES[Number(m) - 1]} ${y}`;
}
