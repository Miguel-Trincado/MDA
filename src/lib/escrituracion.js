// Lógica del módulo Escrituración (procedimiento DS19, proyecto Sendero).
// Cada unidad es un "caso" (clave = Opp del Aval). Cada paso guarda su fecha de
// inicio y de término; el vencimiento (SLA) = inicio + días configurados.
import { stripAccents, normalizeRut } from "./helpers";

export const ETAPAS = [
  ["E1", "Resolución de Nominación"],
  ["E2", "CHIP y DPS"],
  ["E3", "Tasación y antecedentes"],
  ["E4", "Borrador de escritura"],
  ["E5", "Notaría y CBR"],
];

// [etapa, n°, nombre, responsable, SLA sugerido (días), condicional]
const BASE = [
  [0, 1, "Recepcionar Resolución de Nominación", "SERVIU", 2], [0, 2, "Revisar nómina de beneficiarios", "MDA", 1], [0, 3, "Verificar identificación de beneficiarios", "MDA", 2],
  [0, 4, "Validar proyecto, vivienda y tipología", "MDA", 1], [0, 5, "Resolver inconsistencias o pendientes", "MDA", 3], [0, 6, "Iniciar formalización de CHIP", "MDA", 1],
  [1, 7, "Gestionar formalización de CHIP", "Banco", 3], [1, 8, "Recopilación y revisión de antecedentes", "Cliente", 7], [1, 9, "Coordinar firma de formalización", "Cliente", 5],
  [1, 10, "Verificar formalización firmada", "MDA", 1], [1, 11, "Coordinar firma de DPS", "Cliente", 4], [1, 12, "Verificar DPS firmado y aceptado", "Banco", 5],
  [2, 13, "Solicitar tasación al banco", "MDA", 1], [2, 14, "Visita del tasador", "Tasador", 5], [2, 15, "Seguimiento del proceso de tasación", "Banco", 5],
  [2, 16, "Informe de tasación emitido y aceptado", "Banco", 5], [2, 17, "Verificar títulos de dominio y GP vigentes", "MDA", 3], [2, 18, "Verificar contribuciones al día", "MDA", 2],
  [2, 19, "Gestionar observaciones pendientes", "MDA", 5],
  [3, 20, "Solicitar borrador de escritura", "MDA", 1], [3, 21, "Recibir borrador (banco / fábrica)", "Banco", 7], [3, 22, "Verificar consistencia del borrador", "MDA", 2],
  [3, 23, "Identificar observaciones o inconsistencias", "MDA", 1], [3, 24, "Gestionar correcciones", "Banco", 4], [3, 25, "Validar y autorizar envío a notaría", "MDA", 1],
  [4, 1, "Envío del borrador a notaría", "Banco", 2], [4, 2, "Asignación de repertorio", "Notaría", 2], [4, 3, "Firma del cliente", "Cliente", 7],
  [4, 4, "Firma representantes inmobiliaria", "MDA", 5], [4, 5, "Envío al banco alzante", "MDA", 2], [4, 6, "V°B° Comercial del alzamiento", "Banco alzante", 5],
  [4, 7, "V°B° Legal del alzamiento", "Banco alzante", 5], [4, 8, "Confirmación de aprobación del alzamiento", "Banco alzante", 2], [4, 9, "Firma del banco alzante", "Banco alzante", 5],
  [4, 10, "Firma del banco del cliente", "Banco", 5], [4, 11, "Cierre de escritura y emisión de copias", "Notaría", 3], [4, 12, "Obtención de copia de escritura", "MDA", 2],
  [4, 13, "Ingreso al Conservador (CBR)", "Notaría", 3], [4, 14, "Asignación de carátula", "CBR", 2], [4, 15, "Seguimiento de reparos del CBR", "MDA", 10],
  [4, 16, "Gestión de reparos", "MDA", 7, 1], [4, 17, "Reingreso al CBR", "MDA", 3, 1], [4, 18, "Salida del CBR", "CBR", 15], [4, 19, "Copia de inscripción de dominio", "MDA", 3],
];
const PAR_DEFECTO = { 2: 1, 3: 1, 16: 12, 17: 12, 28: 27, 31: 30 };

export const RESP_TIPOS = [
  ["MDA", "MDA · ejecutivo asignado a la unidad"], ["Banco", "Banco con el que se aprobó el cliente"], ["Cliente", "Cliente"], ["SERVIU", "SERVIU"],
  ["Tasador", "Tasadora"], ["Notaría", "Notaría en convenio"], ["Banco alzante", "Banco alzante"], ["CBR", "Conservador de Bienes Raíces"],
];

// Documentos del control previo a notaría. dias = vigencia en días corridos (null = sin vencimiento).
export const DOCS_BASE = [
  { id: 0, nom: "Título de dominio vigente", paso: "Paso 17", dias: 30 },
  { id: 1, nom: "Certificado de Gravámenes y Prohibiciones (GP)", paso: "Paso 17", dias: 30 },
  { id: 2, nom: "Certificado de contribuciones", paso: "Paso 18", dias: 30 },
  { id: 3, nom: "Informe de tasación", paso: "Paso 16", dias: 90 },
  { id: 4, nom: "Aprobación bancaria", paso: "Paso 12", dias: 90 },
  { id: 5, nom: "Borrador de escritura", paso: "Paso 21", dias: null },
];
export const GATE = [
  ["Tasación realizada y aceptada por el banco", [3]], ["Títulos de dominio y GP vigentes", [0, 1]], ["Contribuciones al día", [2]],
  ["Borrador revisado y validado", [5]], ["Observaciones documentales y legales resueltas", null], ["Aprobación bancaria vigente", [4]],
];

export const CFG_DEFECTO = {
  habiles: true, aviso: 1, docAviso: 7,
  pasos: {}, docs: {},
  fechas: [
    { id: 1, nom: "Vencimiento crédito enlace", f: "", aviso: 30 },
    { id: 2, nom: "Cierre Ruka", f: "", aviso: 30 },
  ],
  catalogo: { Notaría: "", "Banco alzante": "", Tasador: "", CBR: "", SERVIU: "" },
  bancos: ["Banco Estado", "BCI", "Banco de Chile", "Scotiabank", "Itaú", "Santander"],
};

// Une lo guardado con los valores por defecto -> configuración lista para usar.
export function cfgEfectiva(saved) {
  const s = saved && typeof saved === "object" ? saved : {};
  const pasos = BASE.map((b, id) => {
    const o = (s.pasos || {})[id] || {};
    return { id, e: b[0], n: b[1], nom: b[2], resp: o.resp ?? b[3], sla: Number.isFinite(+o.sla) && o.sla !== undefined ? +o.sla : b[4], sug: b[4], cond: !!b[5], par: o.par ?? (PAR_DEFECTO[id] ?? "") };
  });
  const docs = DOCS_BASE.map((d) => {
    const o = (s.docs || {})[d.id];
    return { ...d, sug: d.dias, dias: d.dias === null ? null : Number.isFinite(+o) && o !== undefined ? +o : d.dias };
  });
  return {
    habiles: s.habiles ?? CFG_DEFECTO.habiles, aviso: s.aviso ?? CFG_DEFECTO.aviso, docAviso: s.docAviso ?? CFG_DEFECTO.docAviso,
    pasos, docs,
    fechas: Array.isArray(s.fechas) ? s.fechas : CFG_DEFECTO.fechas,
    catalogo: { ...CFG_DEFECTO.catalogo, ...(s.catalogo || {}) },
    bancos: Array.isArray(s.bancos) ? s.bancos : CFG_DEFECTO.bancos,
  };
}
// Lo mínimo a guardar (solo diferencias con lo sugerido).
export function cfgParaGuardar(cfg) {
  const pasos = {};
  cfg.pasos.forEach((p) => { pasos[p.id] = { sla: p.sla, resp: p.resp, par: p.par }; });
  const docs = {};
  cfg.docs.forEach((d) => { if (d.dias !== null) docs[d.id] = d.dias; });
  return { habiles: cfg.habiles, aviso: cfg.aviso, docAviso: cfg.docAviso, pasos, docs, fechas: cfg.fechas, catalogo: cfg.catalogo, bancos: cfg.bancos };
}

/* ------------------------------ Fechas ------------------------------ */
export const isoDe = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const parseISO = (s) => (s ? new Date(`${String(s).slice(0, 10)}T00:00:00`) : null);
export const hoyLocal = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };
const esHabil = (d) => d.getDay() !== 0 && d.getDay() !== 6;
export function sumar(d, n, habiles) {
  const x = new Date(d);
  while (n > 0) { x.setDate(x.getDate() + 1); if (!habiles || esHabil(x)) n--; }
  return x;
}
export function diasEntre(a, b, habiles) {
  let n = 0;
  const x = new Date(a);
  while (x < b) { x.setDate(x.getDate() + 1); if (!habiles || esHabil(x)) n++; }
  return n;
}
export const diasCorridos = (a, b) => Math.round((b - a) / 864e5);
export const fmtCorta = (d) => (d ? d.toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit" }) : "—");
export const fmtLarga = (d) => (d ? d.toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—");

/* ------------------------------ Cálculo de un caso ------------------------------ */
// datos = { inicio, rep, pasos:{id:{ini,fin}}, docs:{id:{emision,path,name}} }
export function calcularCaso(datos, cfg, hoy) {
  const d = datos || {};
  const P = d.pasos || {};
  const ap = cfg.pasos.filter((s) => !s.cond || d.rep);
  let idx = ap.findIndex((s) => !P[s.id]?.fin);
  const terminado = idx === -1;
  if (terminado) idx = ap.length - 1;
  let maxFin = parseISO(d.inicio) || hoy;
  const out = [];
  ap.forEach((s, i) => {
    const rec = P[s.id] || {};
    const pj = s.par !== "" && s.par != null ? ap.findIndex((x) => x.id === +s.par) : -1;
    const ini = rec.ini ? parseISO(rec.ini) : pj >= 0 && pj < i ? out[pj].ini : maxFin;
    const venc = sumar(ini, s.sla, cfg.habiles);
    const par = pj >= 0 && pj < i ? ap[pj] : null;
    if (rec.fin) {
      const fin = parseISO(rec.fin);
      const dur = Math.max(0, diasEntre(ini, fin, cfg.habiles));
      if (fin > maxFin) maxFin = fin;
      out.push({ s, ini, venc, fin, dur, est: dur > s.sla ? "late" : "ok", par });
    } else if (i === idx) {
      const dur = ini > hoy ? 0 : diasEntre(ini, hoy, cfg.habiles);
      const est = dur > s.sla ? "bad" : "cur";
      const fv = venc > hoy ? venc : hoy;
      if (fv > maxFin) maxFin = fv;
      out.push({ s, ini, venc, dur, est, par, riesgo: dur > s.sla ? "bad" : s.sla - dur <= cfg.aviso ? "warn" : "ok" });
    } else {
      if (venc > maxFin) maxFin = venc;
      out.push({ s, ini, venc, est: "pend", par });
    }
  });
  const act = out[idx];
  const estado = terminado ? "done" : act.riesgo;
  const hechos = out.filter((p) => p.est === "ok" || p.est === "late").length;
  return {
    ap, pasos: out, idx, actual: act.s, act, dias: terminado ? 0 : act.dur, sla: act.s.sla, estado,
    ini: act.ini, venc: act.venc, fin: out[out.length - 1].fin || out[out.length - 1].venc, hechos, total: out.length, etapa: act.s.e,
  };
}

// Estado de un documento con vigencia (días corridos).
export function estadoDoc(doc, rec, cfg, hoy) {
  const em = rec?.emision ? parseISO(rec.emision) : null;
  if (!em) return { ...doc, em: null, est: "pend", file: rec?.path ? rec : null };
  if (!doc.dias) return { ...doc, em, est: rec?.path ? "ok" : "pend", file: rec?.path ? rec : null };
  const venc = new Date(em.getTime() + doc.dias * 864e5);
  const rest = diasCorridos(hoy, venc);
  return { ...doc, em, venc, rest, est: rest < 0 ? "bad" : rest <= cfg.docAviso ? "warn" : "ok", file: rec?.path ? rec : null };
}
export const estadoFecha = (f, hoy) => {
  const d = parseISO(f.f);
  if (!d) return { d: null, rest: null, est: "pend" };
  const rest = diasCorridos(hoy, d);
  return { d, rest, est: rest < 0 ? "bad" : rest <= f.aviso ? "warn" : "ok" };
};

// Quién es el responsable de un paso en un caso concreto -> [rol, nombre]
export function quien(paso, caso, cfg) {
  const r = paso.resp;
  if (r === "MDA") return ["Ejecutivo", caso.ejecutivo || "Sin asignar"];
  if (r === "Banco") return ["Banco aprobado", caso.banco || "Por definir"];
  if (r === "Cliente") return ["Cliente", caso.cliente || "—"];
  return [(RESP_TIPOS.find((x) => x[0] === r) || [r, r])[1], cfg.catalogo[r] || r];
}

/* ------------------------------ Aval -> casos ------------------------------ */
export const esSendero = (proyecto) => stripAccents(proyecto || "").toUpperCase().includes("SENDERO");
const esPromesa = (estado) => { const s = stripAccents(estado || "").toLowerCase(); return s.includes("promes") || s.includes("escritur"); };
export const rutClave = (r) => { const t = normalizeRut(String(r || "")); return t.length > 1 ? `${t.slice(0, -1)}-${t.slice(-1)}` : t; };

// Unidades de Sendero promesadas/escrituradas del Aval (una por Opp).
export function unidadesSendero(avalCompleto) {
  const vistos = new Set();
  const out = [];
  (avalCompleto || []).forEach((r) => {
    if (!esSendero(r.proyecto) || !esPromesa(r.estado)) return;
    const clave = String(r.opp || "").trim();
    if (!clave || vistos.has(clave)) return;
    vistos.add(clave);
    out.push({ clave, proyecto: r.proyecto, rut: rutClave(r.rut), cliente: r.cliente, unidad: r.lote, ejecutivo: r.ejecutivo, estadoAval: r.estado });
  });
  return out;
}
