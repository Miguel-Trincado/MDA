import { parseFechaCompleta, normalizeRut, stripAccents } from "./helpers";

// Lee el "reporte detalle de cobranza" de Vivet (una fila por cuota) y deja
// solo las cuotas de los clientes PROMESADOS, listas para guardar.
//
// Entrada: matriz de celdas (filas de arreglos), tal como la entrega
// XLSX.utils.sheet_to_json(hoja, { header: 1, cellDates: true }). Los números
// pueden venir como número o como texto ("633.42"), las fechas como Date,
// número de Excel o texto.

const clave = (s) => stripAccents(String(s ?? "")).toLowerCase().replace(/[^a-z0-9]+/g, "");

const COLUMNAS = {
  opp: ["opp"],
  proyecto: ["proyecto"],
  cliente: ["cliente"],
  rut: ["rutcliente", "rut"],
  estado: ["estado"],
  fechaPromesa: ["fechapromesa"],
  precioFinal: ["preciofinal"],
  unidad: ["unidad"],
  tipo: ["tipofinanciamiento"],
  montoTotal: ["montototalfinanciamiento"],
  cuotasPactadas: ["cuotaspactadas"],
  vencimiento: ["fechadevencimiento", "vencimiento"],
  montoCuota: ["montocuota"],
  pagadoUf: ["montopagadouf"],
  pagadoClp: ["montopagado"], // "Monto Pagado ($)"
};

export function numeroDe(v) {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  let s = String(v).trim().replace(/\s/g, "").replace(/[$%]/g, "");
  if (!s) return 0;
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", "."); // 1.234,56
  else if (s.includes(",")) s = s.replace(",", "."); // 633,42
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

// Fecha (Date, número de Excel o texto) → "AAAA-MM-DD" o "".
export function fechaIsoDe(v) {
  if (v === null || v === undefined || v === "") return "";
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return "";
    // +12 h: absorbe el desfase de segundos que deja la lectura de Excel y
    // hace que den lo mismo los getters locales y los UTC.
    const t = new Date(v.getTime() + 12 * 3600 * 1000);
    return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
  }
  if (typeof v === "number") {
    if (v < 20000 || v > 80000) return "";
    return new Date(Math.round((v - 25569) * 86400 * 1000)).toISOString().slice(0, 10);
  }
  const iso = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const d = parseFechaCompleta(String(v));
  return d ? d.toISOString().slice(0, 10) : "";
}

// Proyectos que no se manejan en Cuotas y Pagos (se ignoran al leer el archivo).
export const esProyectoExcluido = (p) => /\b(salf|sendero)/i.test(stripAccents(String(p || "")));

const esPromesada = (estado) => {
  const e = stripAccents(String(estado || "")).toLowerCase();
  return e.includes("promes") && !e.includes("desist");
};

const redondea = (n) => Math.round(n * 1000) / 1000;

export function parseCuotasPago(matriz) {
  const filasMatriz = Array.isArray(matriz) ? matriz : [];
  // Fila de encabezados: la primera (de las 15 primeras) que trae Opp y Tipo Financiamiento.
  let hIdx = -1;
  for (let i = 0; i < Math.min(15, filasMatriz.length); i++) {
    const cs = (filasMatriz[i] || []).map(clave);
    if (cs.includes("opp") && cs.includes("tipofinanciamiento")) {
      hIdx = i;
      break;
    }
  }
  if (hIdx === -1) return { ok: false, filas: [], proyectosEnArchivo: [], error: "No encontré las columnas del reporte de cobranza (Opp, Tipo Financiamiento, Fecha de Vencimiento…)." };

  const claves = (filasMatriz[hIdx] || []).map(clave);
  const idx = {};
  for (const [campo, opciones] of Object.entries(COLUMNAS)) {
    idx[campo] = -1;
    for (const o of opciones) {
      const i = claves.indexOf(o);
      if (i !== -1) {
        idx[campo] = i;
        break;
      }
    }
  }
  const faltan = ["opp", "proyecto", "cliente", "estado", "tipo", "vencimiento", "montoCuota", "pagadoUf"].filter((c) => idx[c] === -1);
  if (faltan.length) return { ok: false, filas: [], proyectosEnArchivo: [], error: `Faltan columnas en el archivo: ${faltan.join(", ")}.` };

  const get = (fila, campo) => (idx[campo] === -1 ? "" : fila[idx[campo]]);
  const proyectos = new Set();
  const grupos = new Map(); // opp|tipo → cuotas
  let totalFilasArchivo = 0;

  for (let r = hIdx + 1; r < filasMatriz.length; r++) {
    const fila = filasMatriz[r];
    if (!fila || fila.length === 0) continue;
    const opp = String(get(fila, "opp") ?? "").trim().replace(/\.0+$/, "");
    if (!opp || !/^\d+$/.test(opp)) continue;
    totalFilasArchivo++;
    const proyecto = String(get(fila, "proyecto") ?? "").replace(/\s+/g, " ").trim();
    if (esProyectoExcluido(proyecto)) continue;
    if (proyecto) proyectos.add(proyecto);
    if (!esPromesada(get(fila, "estado"))) continue;

    const montoCuota = numeroDe(get(fila, "montoCuota"));
    const pagadoUf = numeroDe(get(fila, "pagadoUf"));
    if (montoCuota === 0 && pagadoUf === 0) continue; // cuota sin monto: no aporta
    const tipo = String(get(fila, "tipo") ?? "").replace(/\s+/g, " ").trim();
    if (!tipo) continue;

    const k = `${opp}|${tipo}`;
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push({
      opp,
      tipoFinanciamiento: tipo,
      proyecto,
      cliente: String(get(fila, "cliente") ?? "").replace(/\s+/g, " ").trim(),
      rut: normalizeRut(String(get(fila, "rut") ?? "")),
      estado: String(get(fila, "estado") ?? "").trim(),
      fechaPromesa: fechaIsoDe(get(fila, "fechaPromesa")),
      precioFinal: redondea(numeroDe(get(fila, "precioFinal"))),
      unidad: String(get(fila, "unidad") ?? "").trim(),
      montoTotal: redondea(numeroDe(get(fila, "montoTotal"))),
      cuotasPactadas: Math.round(numeroDe(get(fila, "cuotasPactadas"))),
      fechaVencimiento: fechaIsoDe(get(fila, "vencimiento")),
      montoCuota: redondea(montoCuota),
      montoPagadoUf: redondea(pagadoUf),
      montoPagadoClp: Math.round(numeroDe(get(fila, "pagadoClp"))),
      _orden: r,
    });
  }

  // N° de cuota: orden por vencimiento dentro de cada Opp + tipo de financiamiento.
  const filas = [];
  for (const cuotas of grupos.values()) {
    cuotas.sort((a, b) => (a.fechaVencimiento || "9999").localeCompare(b.fechaVencimiento || "9999") || a._orden - b._orden);
    cuotas.forEach((c, i) => {
      const { _orden, ...limpia } = c;
      filas.push({ ...limpia, nroCuota: i + 1 });
    });
  }
  return {
    ok: true,
    filas,
    proyectosEnArchivo: [...proyectos],
    totalFilasArchivo,
    clientes: new Set(filas.map((f) => f.opp)).size,
    error: "",
  };
}
