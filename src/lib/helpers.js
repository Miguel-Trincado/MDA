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

const MESES_TEXTO = {
  ene: 1, enero: 1, jan: 1, january: 1,
  feb: 2, febrero: 2, february: 2,
  mar: 3, marzo: 3, march: 3,
  abr: 4, abril: 4, apr: 4, april: 4,
  may: 5, mayo: 5,
  jun: 6, junio: 6, june: 6,
  jul: 7, julio: 7, july: 7,
  ago: 8, agosto: 8, aug: 8, august: 8,
  sep: 9, sept: 9, septiembre: 9, september: 9,
  oct: 10, octubre: 10, october: 10,
  nov: 11, noviembre: 11, november: 11,
  dic: 12, diciembre: 12, dec: 12, december: 12,
};

// Parser único y permisivo: reconoce el mayor número de formatos de fecha
// razonables (ISO, DD-MM-AAAA, MM/DD/AA, número de serie de Excel, "23 Feb
// 2026", etc.) y siempre entrega el mismo resultado interno {year, month, day}.
// Cuando el día y el mes son ambiguos (ambos ≤ 12), asume convención chilena
// (día primero) salvo que eso dé una fecha imposible, en cuyo caso invierte.
export function parseAnyDate(str) {
  if (!str) return null;
  const full = String(str).trim();
  if (!full) return null;
  const raw = full.split(" ")[0]; // quita una hora pegada ("22-09-2025 10:09" -> "22-09-2025")

  function normalizar(year, month, day) {
    if (!year || !month || !day || month < 1 || month > 12 || day < 1 || day > 31) return null;
    return { year, month, day };
  }

  // 1) ISO: AAAA-MM-DD (sin ambigüedad)
  let m = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return normalizar(+m[1], +m[2], +m[3]);

  // 2) Con separador "/" o "-": dos números de día/mes + año de 2 o 4 dígitos
  m = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2}|\d{4})$/);
  if (m) {
    let a = +m[1];
    let b = +m[2];
    let y = +m[3];
    if (y < 100) y += 2000;
    if (a > 12 && b <= 12) return normalizar(y, b, a); // a=día, b=mes
    if (b > 12 && a <= 12) return normalizar(y, a, b); // a=mes, b=día (formato US)
    // Ambos ≤ 12: ambiguo. Asumimos convención chilena (día primero).
    return normalizar(y, b, a);
  }

  // 3) Texto tipo "23 Feb 2026" / "Feb 23, 2026" / "23-Feb-2026" (usa el
  // string completo, no el recortado por espacio, porque estos formatos
  // sí llevan espacios como parte de la fecha misma).
  const textoSinComa = full.replace(",", "");
  m = textoSinComa.match(/^(\d{1,2})[\s-]([a-zA-Záéíóúñ]+)[\s-](\d{2,4})$/i);
  if (m && MESES_TEXTO[m[2].toLowerCase()]) {
    let y = +m[3];
    if (y < 100) y += 2000;
    return normalizar(y, MESES_TEXTO[m[2].toLowerCase()], +m[1]);
  }
  m = textoSinComa.match(/^([a-zA-Záéíóúñ]+)[\s-](\d{1,2})[\s-](\d{2,4})$/i);
  if (m && MESES_TEXTO[m[1].toLowerCase()]) {
    let y = +m[3];
    if (y < 100) y += 2000;
    return normalizar(y, MESES_TEXTO[m[1].toLowerCase()], +m[2]);
  }

  // 4) Número de serie de fecha de Excel (días desde 1899-12-30)
  if (/^\d+(\.\d+)?$/.test(raw)) {
    const serial = parseFloat(raw);
    if (serial > 20000 && serial < 60000) {
      const epoch = Date.UTC(1899, 11, 30);
      const d = new Date(epoch + serial * 86400000);
      if (!isNaN(d.getTime())) return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
    }
  }

  // 5) Último recurso: que lo intente el motor de fechas nativo
  const d = new Date(full);
  if (!isNaN(d.getTime())) return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };

  return null;
}

// Una fecha de cotización nunca puede ser futura. Se aplica siempre, aquí
// mismo, para que ninguna vista (Dashboard, cartera de ejecutivo, etc.)
// pueda mostrar una fecha por venir, venga de donde venga (parseo ambiguo,
// dato mal ingresado en el Aval, etc.).
function esFecha(r) {
  if (!r) return null;
  const hoy = new Date();
  const hoyUTC = Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const valorUTC = Date.UTC(r.year, r.month - 1, r.day);
  if (valorUTC > hoyUTC) return null;
  return r;
}

export function parseFechaCompleta(str) {
  const r = esFecha(parseAnyDate(str));
  if (!r) return null;
  const d = new Date(Date.UTC(r.year, r.month - 1, r.day));
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
  if (g.flagSistema === "ESTADO" && g.ultimaRevisionFecha !== today) return "CAMBIO DE ESTADO OPP";
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
  const r = esFecha(parseAnyDate(str));
  if (!r) return null;
  return { year: r.year, month: r.month };
}

export function labelPeriodo(key, modo, MESES_ES) {
  if (modo === "año") return String(key);
  const [y, m] = key.split("-");
  return `${MESES_ES[Number(m) - 1]} ${y}`;
}
