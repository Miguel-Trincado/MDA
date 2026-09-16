const ESTADO_MAP = {
  DISPONIBLE: "Disponible",
  RESERVADO: "Reservada",
  RESERVADA: "Reservada",
  "PRE-RESERVADO": "Pre-reservada",
  "PRE-RESERVADA": "Pre-reservada",
  VENDIDO: "Vendida",
  VENDIDA: "Vendida",
  PROMESADO: "Promesada",
  PROMESADA: "Promesada",
};

const normalizeHeader = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u00b2\u00b3]/g, (c) => (c === "\u00b2" ? "2" : "3"))
    .trim()
    .toUpperCase();

// El descuento máximo puede venir como fracción (0.1 = 10%) o como el
// texto "Sin Descuento" (esta última se trata como 0%, no como "sin dato").
function normalizeDescuento(raw) {
  const txt = String(raw || "").trim();
  if (!txt) return null;
  if (normalizeHeader(txt) === "SIN DESCUENTO") return 0;
  const tienePorcentaje = txt.includes("%");
  const n = Number(txt.replace("%", "").replace(",", ".").trim());
  if (!Number.isFinite(n)) return null;
  if (tienePorcentaje) return n; // "10%" -> 10, ya viene como porcentaje directo
  return n > 0 && n <= 1 ? n * 100 : n; // 0.1 (sin signo %) -> 10
}

function parseNumero(raw) {
  if (raw == null || raw === "") return null;
  const n = Number(String(raw).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

// Recibe el TSV ya convertido desde el Excel (mismo patrón que
// parseMaestro.js) y devuelve la lista de unidades lista para guardar.
// No se asume ninguna columna como llave única: el listado real trae
// números de unidad repetidos (ej. estacionamientos con el mismo N°
// listados más de una vez con precios distintos), así que cada fila se
// guarda tal cual viene, sin intentar deduplicar por número.
export function parseListaPrecios(text) {
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    throw new Error("Sube el listado completo, con encabezado y al menos una fila de datos.");
  }
  const originalHeaders = lines[0].split("\t").map((h) => h.trim());
  const headers = originalHeaders.map(normalizeHeader);
  const col = (...names) => {
    for (const n of names) {
      const idx = headers.indexOf(normalizeHeader(n));
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const idx = {
    tipo: col("TIPO UNIDAD", "TIPO"),
    modelo: col("MODELO"),
    unidad: col("DIRECCION NUMERO", "UNIDAD", "N°", "N", "NUMERO", "LOTE"),
    precio: col("PRECIO LISTA", "VALOR (UF)", "VALOR", "PRECIO", "VALOR FINAL (UF)", "VALOR FINAL"),
    tipologia: col("TIPOLOGIA", "TIPOLOGÍA"),
    orientacion: col("ORIENTACION", "ORIENTACIÓN"),
    area: col("SUPERFICIE TOTAL", "SUP TOTAL (M2)", "SUP TOTAL", "M2", "M²"),
    descuentoMax: col("DECUENTO", "DESCUENTO", "DSCTO (MAX)", "DSCTO MAX", "DESCUENTO MAX", "DSCTO"),
    estado: col("ESTADO"),
  };

  const required = [
    ["DIRECCIÓN NÚMERO / UNIDAD / N° / LOTE", idx.unidad],
    ["PRECIO LISTA / VALOR / PRECIO", idx.precio],
  ];
  const missing = required.filter(([, i]) => i === -1).map(([name]) => name);
  if (missing.length) {
    throw new Error(`Al listado le faltan estas columnas obligatorias: ${missing.join(", ")}.`);
  }

  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split("\t");
    const unidad = idx.unidad !== -1 ? (cols[idx.unidad] || "").trim() : "";
    if (!unidad) continue;
    const rawRow = originalHeaders.map((h, colIdx) => ({ h: h || `Col ${colIdx + 1}`, v: cols[colIdx] == null ? "" : String(cols[colIdx]) }));
    out.push({
      tipo: idx.tipo !== -1 ? (cols[idx.tipo] || "").trim() || "Departamento" : "Departamento",
      modelo: idx.modelo !== -1 ? (cols[idx.modelo] || "").trim() : "",
      unidad,
      tipologia: idx.tipologia !== -1 ? (cols[idx.tipologia] || "").trim() : "",
      orientacion: idx.orientacion !== -1 ? (cols[idx.orientacion] || "").trim() : "",
      area: idx.area !== -1 ? parseNumero(cols[idx.area]) : null,
      precio: idx.precio !== -1 ? parseNumero(cols[idx.precio]) : null,
      descuentoMax: idx.descuentoMax !== -1 ? normalizeDescuento(cols[idx.descuentoMax]) : null,
      estado: ESTADO_MAP[normalizeHeader(idx.estado !== -1 ? cols[idx.estado] : "")] || (idx.estado !== -1 ? (cols[idx.estado] || "").trim() : "") || "Disponible",
      raw: rawRow,
    });
  }
  return out;
}
