import { esProyectoPilpilen, normalizeName, normalizeRut } from "./helpers";

export function parseMaestro(text) {
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    throw new Error("Pega el encabezado completo del Maestro Aval más al menos una fila de datos.");
  }
  const headers = lines[0].split("\t").map((h) => h.trim());
  const idx = (name) => headers.indexOf(name);
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

    const opp = iOpp !== -1 ? (cols[iOpp] || "").trim() : "";
    if (opp) {
      if (oppVistosEnCarga.has(opp)) {
        oppsDuplicadosEnCarga.push({ opp, rut, filaAnterior: oppVistosEnCarga.get(opp) });
      } else {
        oppVistosEnCarga.set(opp, rut);
      }
    }
    // Si el Aval no trae número de Opp para esta fila, se arma un ID estable
    // a partir de contenido que no cambia entre cargas (RUT + fecha +
    // tipología + región). Nunca se usa la posición de la fila (i), porque
    // esa cambia de una carga a otra y generaría una fila nueva (duplicada)
    // para la misma cotización real cada vez que se sube el Aval.
    const fechaParaKey = iFechaCot !== -1 ? (cols[iFechaCot] || "").trim() : "";
    const tipParaKey = iTipologia !== -1 ? (cols[iTipologia] || "").trim() : "";
    const regParaKey = iRegion !== -1 ? (cols[iRegion] || "").trim() : "";
    const key = opp || `SIN_OPP__${rut}__${fechaParaKey}__${tipParaKey}__${regParaKey}`;
    filasDetalle.push({
      opp: key,
      rut,
      fecha: iFechaCot !== -1 ? (cols[iFechaCot] || "").trim() : "",
      fechaOpp: iFechaOpp !== -1 ? (cols[iFechaOpp] || "").trim() : "",
      tipologia: iTipologia !== -1 ? (cols[iTipologia] || "").trim() : "",
      region: iRegion !== -1 ? (cols[iRegion] || "").trim() : "",
      proyecto: iProyecto !== -1 ? (cols[iProyecto] || "").trim() : "",
      estado: iEstado !== -1 ? (cols[iEstado] || "").trim() : "",
    });
  }
  return { byRut, filas, filasOtrosProyectos, clientes: Object.keys(byRut).length, filasDetalle, oppsDuplicadosEnCarga };
}
