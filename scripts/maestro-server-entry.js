// Ingesta del Aval en el servidor: hace exactamente lo mismo que subir el archivo a mano en
// "Carga" (mismo código: parseMaestro + uploadMaestroRemote), pero desde la función de Vercel.
// No editar api/_maestro.mjs: se genera con `npm run build:api`.
import { fetchDatosBase, uploadMaestroRemote, registrarCargaRemote } from "../src/lib/db.js";

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
