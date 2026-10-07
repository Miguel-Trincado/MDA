import { esProyectoPilpilen, normalizeName, normalizeRut } from "./helpers";

// Para columnas cuyo nombre puede venir con variantes de mayúsculas, tildes,
// puntos (ej. "Uni." vs "Unidad") o palabras de más (ej. "Precio Lista" vs
// "Precio Lista Opp"), en vez de exigir el nombre exacto como el resto de
// las columnas del Aval — nunca hay que adivinar el nombre real, pero sí
// hay que aceptar varias formas razonables de escribirlo.
const normalizeHeaderFlexible = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");

// El Aval a veces trae los números con formato chileno ("3.957,25") y a
// veces ya vienen simples ("3957.25") según cómo se copió desde Excel —
// se detecta cuál separador es cuál en vez de asumir uno solo.
function parseNumeroCL(raw) {
  if (raw == null) return null;
  let s = String(raw).trim().replace(/[^0-9.,-]/g, "");
  if (!s) return null;
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (hasComma) {
    s = s.replace(",", ".");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// El descuento puede venir como fracción (0.06 = 6%), como texto con "%"
// (ej. "6%"), o directamente como el número de porcentaje (6) — mismo
// criterio que ya se usa para el listado de precios (parseListaPrecios.js).
function parseDescuentoPct(raw) {
  const txt = String(raw || "").trim();
  if (!txt) return null;
  const tienePorcentaje = txt.includes("%");
  const n = parseNumeroCL(txt.replace("%", ""));
  if (n == null) return null;
  if (tienePorcentaje) return n;
  return n > 0 && n <= 1 ? n * 100 : n;
}

export function parseMaestro(text) {
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    throw new Error("Pega el encabezado completo del Maestro Aval más al menos una fila de datos.");
  }
  const headers = lines[0].split("\t").map((h) => h.trim());
  const idx = (name) => headers.indexOf(name);
  const idxFlexible = (...names) => {
    const wanted = names.map(normalizeHeaderFlexible);
    // 1) coincidencia exacta con alguna de las variantes aceptadas
    let found = headers.findIndex((h) => wanted.includes(normalizeHeaderFlexible(h)));
    if (found !== -1) return found;
    // 2) el encabezado real trae palabras de más (ej. "Precio Lista Opp"
    // cuando se buscaba "Precio Lista") — alcanza con que empiece igual o
    // contenga la variante completa, sin exigir el nombre exacto.
    return headers.findIndex((h) => {
      const nh = normalizeHeaderFlexible(h);
      return wanted.some((w) => w && (nh.startsWith(w) || nh.includes(w)));
    });
  };
  const iRut = idx("RUT Cliente");
  const iNombre = idx("Nombre Cliente");
  const iSegundo = idx("Segundo Nombre");
  const iApPat = idx("Apellido Paterno");
  const iApMat = idx("Apellido Materno");
  const iTel = idx("Teléfonos");
  const iRenta = idx("Renta Cliente");
  const iEjec = idx("Ejecutivo");
  const iFechaCot = idx("Fecha Cotización");
  const iFechaOpp = idx("Fecha Opp");
  const iFechaRes = idx("Fecha Reserva");
  const iFechaProm = idx("Fecha Promesa");
  const iProyecto = idx("Proyecto");
  const iOpp = idx("Opp");
  const iTipologia = idx("Tipología");
  const iRegion = idx("Región Cliente");
  const iEstado = idx("Estado");
  // El código de "Lote" es lo que permite, en la pestaña Comisiones,
  // cruzar automáticamente cada Opp con su unidad real en el listado de
  // precios (columna "Codigo" allá) para traer precio y descuento sin
  // tener que asignarlos a mano.
  const iLote = idx("Lote");
  // El "Precio Lista Opp" del Aval es el precio REAL de venta de esa Opp —
  // viene sumado con otras unidades del mismo cliente (depto +
  // estacionamiento + bodega, etc.), por eso puede no coincidir con el
  // precio de una sola unidad en el listado de precios. Se acepta
  // cualquier variante razonable del nombre de esta columna, nunca un
  // nombre único y exacto.
  const iPrecioLista = idxFlexible("Precio Lista Opp", "Precio Lista", "Precio de Lista");
  // "Descuento Uni. Principal" tal como viene del Aval, guardado tal cual
  // (histórico; ya no se usa para calcular la comisión — ver
  // descuentoUfAval más abajo, que es la fuente real desde v104).
  const iDescuentoUniPrincipal = idxFlexible(
    "Descuento Uni Principal", "Descuento Unidad Principal", "Descuento Principal", "Descuento Uni"
  );
  // Descuento real de la Opp para el cálculo de Comisiones, en UF (no en
  // %): la suma de todas las columnas del Aval donde puede venir un
  // descuento o cupón aplicado a esa venta. Antes Comisiones usaba el %
  // de descuento del listado de precios (genérico, por unidad); ahora usa
  // el monto real que el Aval trae para esa Opp específica. Columnas
  // ausentes o vacías cuentan como 0 — no todas las Opp traen las siete.
  const iCuponUniPrincipal = idx("Cupon Uni. Principal");
  const iCuponEstacionamiento = idx("Cupon Estacionamiento");
  const iCuponBodega = idx("Cupon Bodega");
  const iCuponAhorroPrevio = idx("Cupon Ahorro Previo");
  const iCuponPagoContraEscritura = idx("Cupon Pago Contra Escritura");
  const iDescuentoUniPrincipalUf = idx("Descuento Uni. Principal");
  const iDescuentoEstacionamiento = idx("Descuento Estacionamiento");
  const iColsDescuentoUf = [
    iCuponUniPrincipal, iCuponEstacionamiento, iCuponBodega, iCuponAhorroPrevio,
    iCuponPagoContraEscritura, iDescuentoUniPrincipalUf, iDescuentoEstacionamiento,
  ];

  if (iRut === -1 || iEjec === -1) {
    throw new Error(
      "No se encontraron las columnas 'RUT Cliente' y/o 'Ejecutivo'. Verifica que copiaste el encabezado completo del Maestro Aval, tal como está en Excel."
    );
  }

  const byRut = {};
  const filasDetalle = [];
  const oppVistosEnCarga = new Map(); // opp real -> primera fila que lo usó
  const oppsDuplicadosEnCarga = [];
  let filas = 0;
  let filasOtrosProyectos = 0;
  let filasSinOpp = 0;

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split("\t");
    const rutRaw = (cols[iRut] || "").trim();
    if (!rutRaw) continue;

    if (iProyecto !== -1 && !esProyectoPilpilen(cols[iProyecto])) {
      filasOtrosProyectos++;
      continue;
    }

    const rut = normalizeRut(rutRaw);
    if (!rut) continue;

    // El Opp es el identificador único de cada cotización y siempre debe
    // venir informado por el Aval. Si por algún motivo llega vacío, es un
    // error de origen: la fila se descarta y se cuenta, en vez de
    // inventarle un ID de respaldo en silencio.
    const opp = iOpp !== -1 ? (cols[iOpp] || "").trim() : "";
    if (!opp) {
      filasSinOpp++;
      continue;
    }
    if (oppVistosEnCarga.has(opp)) {
      oppsDuplicadosEnCarga.push({ opp, rut, filaAnterior: oppVistosEnCarga.get(opp) });
    } else {
      oppVistosEnCarga.set(opp, rut);
    }

    filas++;
    const nombreCompleto = [cols[iNombre], cols[iSegundo], cols[iApPat], cols[iApMat]]
      .filter(Boolean)
      .map((s) => s.trim())
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    if (!byRut[rut]) {
      byRut[rut] = {
        rut, cliente: "", telefono: "", renta: "", ejecutivo: "",
        fechaUltimaCotizacion: "", nCotizaciones: 0, fechaReserva: "", fechaPromesa: "", proyecto: "",
      };
    }
    const rec = byRut[rut];
    rec.nCotizaciones += 1;
    if (nombreCompleto) rec.cliente = nombreCompleto;
    if (iTel !== -1 && cols[iTel] && cols[iTel].trim()) rec.telefono = cols[iTel].trim();
    if (iRenta !== -1 && cols[iRenta] && cols[iRenta].trim()) rec.renta = cols[iRenta].trim();
    if (iProyecto !== -1 && cols[iProyecto] && cols[iProyecto].trim()) rec.proyecto = cols[iProyecto].trim();
    if (iEjec !== -1 && cols[iEjec] && cols[iEjec].trim()) rec.ejecutivo = normalizeName(cols[iEjec]);
    if (iFechaCot !== -1 && cols[iFechaCot]) rec.fechaUltimaCotizacion = cols[iFechaCot].trim();
    if (iFechaRes !== -1 && cols[iFechaRes] && cols[iFechaRes].trim()) rec.fechaReserva = cols[iFechaRes].trim();
    if (iFechaProm !== -1 && cols[iFechaProm] && cols[iFechaProm].trim()) rec.fechaPromesa = cols[iFechaProm].trim();

    let descuentoUfAval = 0;
    let algunaColDescuentoUf = false;
    iColsDescuentoUf.forEach((i) => {
      if (i === -1) return;
      algunaColDescuentoUf = true;
      descuentoUfAval += parseNumeroCL(cols[i]) || 0;
    });

    filasDetalle.push({
      opp,
      rut,
      fecha: iFechaCot !== -1 ? (cols[iFechaCot] || "").trim() : "",
      fechaOpp: iFechaOpp !== -1 ? (cols[iFechaOpp] || "").trim() : "",
      fechaPromesa: iFechaProm !== -1 ? (cols[iFechaProm] || "").trim() : "",
      tipologia: iTipologia !== -1 ? (cols[iTipologia] || "").trim() : "",
      region: iRegion !== -1 ? (cols[iRegion] || "").trim() : "",
      proyecto: iProyecto !== -1 ? (cols[iProyecto] || "").trim() : "",
      estado: iEstado !== -1 ? (cols[iEstado] || "").trim() : "",
      lote: iLote !== -1 ? (cols[iLote] || "").trim() : "",
      precioLista: iPrecioLista !== -1 ? parseNumeroCL(cols[iPrecioLista]) : null,
      descuentoUniPrincipal: iDescuentoUniPrincipal !== -1 ? parseDescuentoPct(cols[iDescuentoUniPrincipal]) : null,
      descuentoUfAval: algunaColDescuentoUf ? descuentoUfAval : null,
    });
  }
  return { byRut, filas, filasOtrosProyectos, filasSinOpp, clientes: Object.keys(byRut).length, filasDetalle, oppsDuplicadosEnCarga };
}
