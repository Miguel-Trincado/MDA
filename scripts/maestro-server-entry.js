// Ingesta del Aval en el servidor: hace exactamente lo mismo que subir el archivo a mano en
// "Carga" (mismo código: parseMaestro + uploadMaestroRemote), pero desde la función de Vercel.
// No editar api/_maestro.mjs: se genera con `npm run build:api`.
import { fetchDatosBase, uploadMaestroRemote, registrarCargaRemote, guardarCuotasPagoTrozoRemote, cerrarCargaCuotasPagoRemote, uploadListaPreciosRemote, guardarTiposUnidadRemote } from "../src/lib/db.js";
import { parseCuotasPago } from "../src/lib/parseCuotas.js";
import { parseListaPrecios } from "../src/lib/parseListaPrecios.js";
import * as XLSX from "xlsx";

export async function ingestarMaestro(texto) {
  const base = await fetchDatosBase();
  const r = await uploadMaestroRemote(texto, base.gestion, base.control, base.cotizaciones);
  const s = r.summary || {};
  const resumen = `${s.clientes ?? 0} clientes · ${s.filas ?? 0} cotizaciones`;
  let cargaError = "";
  try {
    await registrarCargaRemote({ tipo: "aval", archivo: "Vivet (automático)", usuario: "Sincronización Vivet", resumen });
  } catch (e) {
    cargaError = String(e.message || e);
  }
  return { resumen, summary: s, cargaError };
}

// Encabezados que entiende parseCuotasPago (los mismos del Excel "reporte_detalle_cobranza").
const ENCABEZADO_COBRANZA = [
  "Opp", "Proyecto", "Cliente", "Rut Cliente", "Estado", "Fecha Promesa", "Precio Final", "Unidad",
  "Tipo Financiamiento", "Monto Total Financiamiento", "Cuotas Pactadas", "Fecha de Vencimiento",
  "Monto Cuota", "Monto Pagado (U.F.)", "Monto Pagado ($)",
];

// Cobranza enviada por trozos: {rows: [[...15 celdas]], carga, fin, proyectos, total}.
export async function ingestarCuotas({ rows, carga, fin, proyectos, total }) {
  if (!carga) throw new Error("Falta la marca de carga");
  const parsed = parseCuotasPago([ENCABEZADO_COBRANZA, ...(rows || [])]);
  if (!parsed.ok) throw new Error(parsed.error);
  const { guardadas } = await guardarCuotasPagoTrozoRemote(parsed.filas, carga);
  let borradas = 0;
  let cargaError = "";
  if (fin) {
    if (!(Number(total) > 0)) throw new Error("El reporte de cobranza no trae cuotas promesadas: no se borra nada");
    ({ borradas } = await cerrarCargaCuotasPagoRemote(proyectos || [], carga));
    try {
      await registrarCargaRemote({ tipo: "cuotas_pago", archivo: "Vivet (automático)", usuario: "Sincronización Vivet", resumen: `${Number(total)} cuotas` });
    } catch (e) {
      cargaError = String(e.message || e);
    }
  }
  return { guardadas, borradas, cargaError };
}

// Listado de precios: el Excel que descarga Vivet (en base64), leído igual que al subirlo a mano en "Carga".
export async function ingestarListaPrecios(b64) {
  const wb = XLSX.read(Buffer.from(String(b64 || ""), "base64"), { type: "buffer", cellDates: true, raw: true });
  const nombre = wb.SheetNames[0];
  if (!nombre) throw new Error("El listado de precios no tiene hojas legibles");
  const tsv = XLSX.utils.sheet_to_csv(wb.Sheets[nombre], { FS: "\t", blankrows: false });
  const { unidades, filasOtrosProyectos } = parseListaPrecios(tsv);
  if (unidades.length === 0) throw new Error("El listado de precios no trae unidades de Pilpilén: no se reemplaza nada");
  await uploadListaPreciosRemote(unidades);
  const tu = await guardarTiposUnidadRemote(tsv);
  const resumen = `${unidades.length} unidades`;
  let cargaError = "";
  try {
    await registrarCargaRemote({ tipo: "lista_precios", archivo: "Vivet (automático)", usuario: "Sincronización Vivet", resumen });
  } catch (e) {
    cargaError = String(e.message || e);
  }
  return { resumen, filasOtrosProyectos, tiposUnidad: tu.filas, tiposError: tu.error || "", cargaError };
}
