import { supabase } from "../supabaseClient";
import { parseMaestro } from "./parseMaestro";
import { todayISO, nowISO } from "./helpers";

/* ---------------------------------------------------------------------
 * Conversión genérica snake_case (Postgres) <-> camelCase (JS/React)
 * ------------------------------------------------------------------- */
const toCamel = (s) => s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
const toSnake = (s) => s.replace(/[A-Z]/g, (m) => "_" + m.toLowerCase());

function rowToObj(row) {
  if (!row) return row;
  const out = {};
  for (const k of Object.keys(row)) out[toCamel(k)] = row[k];
  return out;
}
function objToRow(obj, omit = []) {
  const out = {};
  for (const k of Object.keys(obj)) {
    if (omit.includes(k)) continue;
    out[toSnake(k)] = obj[k];
  }
  return out;
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function upsertInChunks(table, rows, onConflict, chunkSize = 400) {
  for (const part of chunk(rows, chunkSize)) {
    if (part.length === 0) continue;
    const { error } = await supabase.from(table).upsert(part, { onConflict });
    if (error) throw error;
  }
}

/* ---------------------------------------------------------------------
 * Carga inicial de todos los datos
 * ------------------------------------------------------------------- */
export async function fetchAllData() {
  const [gestionRes, controlRes, cambiosRes, historialRes, cotizacionesRes, configRes] = await Promise.all([
    supabase.from("gestion").select("*"),
    supabase.from("control_interno").select("*"),
    supabase.from("cambios_ejecutivo").select("*").order("fecha_deteccion", { ascending: false }),
    supabase.from("historial").select("*").order("fecha", { ascending: false }).limit(1500),
    supabase.from("cotizaciones").select("*"),
    supabase.from("config").select("*").eq("key", "meta_mensual").maybeSingle(),
  ]);

  for (const res of [gestionRes, controlRes, cambiosRes, historialRes, cotizacionesRes]) {
    if (res.error) throw res.error;
  }
  if (configRes.error && configRes.error.code !== "PGRST116") throw configRes.error;

  const gestion = {};
  (gestionRes.data || []).forEach((row) => {
    gestion[row.rut] = rowToObj(row);
  });

  const control = {};
  (controlRes.data || []).forEach((row) => {
    control[row.rut] = rowToObj(row);
  });

  const cotizaciones = {};
  (cotizacionesRes.data || []).forEach((row) => {
    cotizaciones[row.opp] = rowToObj(row);
  });

  const cambios = (cambiosRes.data || []).map(rowToObj);
  const historial = (historialRes.data || []).map(rowToObj);
  const meta = configRes.data?.value || { value: 5 };

  return { gestion, control, cambios, historial, cotizaciones, meta };
}

/* ---------------------------------------------------------------------
 * Guardar una gestión (ejecutivo edita la ficha de un cliente)
 * ------------------------------------------------------------------- */
export async function saveGestionRemote(prevGestion, rut, updates) {
  const today = todayISO();
  const merged = { ...prevGestion, ...updates, rut };
  merged.ultimaRevisionFecha = today;
  merged.ultimaActualizacionEjecutivo = nowISO();
  if (!merged.fechaPrimeraGestionEfectiva) merged.fechaPrimeraGestionEfectiva = today;
  merged.fechaUltimaAccionEfectiva = today;
  merged.flagSistema = "";

  const row = objToRow(merged, ["createdAt", "updatedAt"]);
  const { error } = await supabase.from("gestion").update(row).eq("rut", rut);
  if (error) throw error;

  const historialEntry = {
    fecha: nowISO(),
    ejecutivo: merged.ejecutivo,
    cliente: merged.cliente,
    rut,
    estado: merged.estado,
    nivelInteres: merged.nivelInteres,
    etapaComercial: merged.etapaComercial,
    accionRealizada: merged.accionRealizada,
    respuesta: merged.respuesta,
    observaciones: merged.observaciones,
  };
  const { data: histRow, error: histErr } = await supabase
    .from("historial")
    .insert(objToRow(historialEntry))
    .select()
    .single();
  if (histErr) throw histErr;

  return { gestion: merged, historialEntry: rowToObj(histRow) };
}

/* ---------------------------------------------------------------------
 * Marcar como revisado hoy, sin cambios de gestión
 * ------------------------------------------------------------------- */
export async function markRevisadoRemote(prevGestion, rut) {
  const updates = { ultimaRevisionFecha: todayISO(), flagSistema: "" };
  const { error } = await supabase
    .from("gestion")
    .update(objToRow(updates))
    .eq("rut", rut);
  if (error) throw error;

  const merged = { ...prevGestion, ...updates };
  const historialEntry = {
    fecha: nowISO(),
    ejecutivo: merged.ejecutivo,
    cliente: merged.cliente,
    rut,
    nota: "Revisado sin gestión",
  };
  const { data: histRow, error: histErr } = await supabase
    .from("historial")
    .insert(objToRow(historialEntry))
    .select()
    .single();
  if (histErr) throw histErr;

  return { gestion: merged, historialEntry: rowToObj(histRow) };
}

/* ---------------------------------------------------------------------
 * Detecta, por RUT, si alguna de sus Opp ya existentes cambió de Estado
 * en el Aval (ej. de "Cotización" a "Pre-Reservada", "Reservada",
 * "Promesada", etc.). La Opp es la identidad única: si ya existía, se
 * compara su Estado anterior contra el nuevo; si no existía, es una Opp
 * nueva y no aplica esta comparación.
 * ------------------------------------------------------------------- */
function detectarCambiosDeEstadoOpp(filasDetalle, currentCotizaciones) {
  const porRut = {};
  filasDetalle.forEach((r) => {
    const prev = currentCotizaciones[r.opp];
    if (prev && r.estado && prev.estado && prev.estado !== r.estado) {
      if (!porRut[r.rut]) porRut[r.rut] = [];
      porRut[r.rut].push({ opp: r.opp, estadoAnterior: prev.estado, estadoNuevo: r.estado });
    }
  });
  return porRut;
}

/* ---------------------------------------------------------------------
 * Subida del Maestro Aval: parsear + comparar contra el estado actual
 * + escribir en Supabase (upserts por lote)
 * ------------------------------------------------------------------- */
function diffMaestro(byRut, gestionDict, controlDict, estadoCambiosPorRut) {
  const gestionOut = { ...gestionDict };
  const controlOut = { ...controlDict };
  const cambiosNuevos = [];
  const summary = { nuevos: 0, nuevasCotizaciones: 0, cambiosEjecutivo: 0, cambiosEstado: 0, actualizados: 0 };
  const now = nowISO();

  Object.values(byRut).forEach((rec) => {
    const prevControl = controlDict[rec.rut];
    const prevGestion = gestionDict[rec.rut];

    if (!prevControl || !prevGestion) {
      gestionOut[rec.rut] = {
        rut: rec.rut, cliente: rec.cliente, telefono: rec.telefono, renta: rec.renta,
        fechaUltimaCotizacion: rec.fechaUltimaCotizacion, nCotizaciones: rec.nCotizaciones,
        estado: "Activo", nivelInteres: "", etapaComercial: "Cotizado", estadoEvaluacionBancaria: "No iniciada",
        accionRealizada: "", respuesta: "", objecionActual: "", motivoPerdida: "",
        proximaAccion: "", fechaProximaAccion: null, observaciones: "",
        ejecutivo: rec.ejecutivo, flagSistema: "NUEVO", flagCambioEjecutivo: "",
        ultimaRevisionFecha: null, ultimaActualizacionEjecutivo: null,
        fechaPrimeraGestionEfectiva: null, fechaUltimaAccionEfectiva: null,
        proyecto: rec.proyecto || "PILPILEN",
      };
      controlOut[rec.rut] = {
        rut: rec.rut, cotizaciones: rec.nCotizaciones, ejecutivo: rec.ejecutivo,
        fechaReserva: rec.fechaReserva, fechaPromesa: rec.fechaPromesa,
      };
      summary.nuevos++;
      return;
    }

    const g = { ...prevGestion };
    if (rec.cliente) g.cliente = rec.cliente;
    if (rec.telefono) g.telefono = rec.telefono;
    if (rec.renta) g.renta = rec.renta;
    if (rec.fechaUltimaCotizacion) g.fechaUltimaCotizacion = rec.fechaUltimaCotizacion;
    g.nCotizaciones = rec.nCotizaciones;

    const ejecutivoCambio = prevControl.ejecutivo && rec.ejecutivo && prevControl.ejecutivo !== rec.ejecutivo;
    const cotizacionesSubieron = rec.nCotizaciones > (prevControl.cotizaciones || 0);
    const cambiosEstadoDeEsteRut = estadoCambiosPorRut[rec.rut];

    if (ejecutivoCambio) {
      g.flagCambioEjecutivo = "CAMBIO";
      cambiosNuevos.push({
        fechaDeteccion: now, rut: rec.rut, cliente: g.cliente,
        ejecutivoAnterior: prevControl.ejecutivo, ejecutivoNuevo: rec.ejecutivo,
        estadoPrevio: g.estado, etapaPrevia: g.etapaComercial,
        resolucion: "PENDIENTE REVISIÓN", fechaResolucion: null, observacion: "",
      });
      summary.cambiosEjecutivo++;
    } else if (cambiosEstadoDeEsteRut && cambiosEstadoDeEsteRut.length > 0) {
      g.flagSistema = "ESTADO";
      summary.cambiosEstado++;
    } else if (cotizacionesSubieron) {
      g.flagSistema = "SI";
      summary.nuevasCotizaciones++;
    }

    gestionOut[rec.rut] = g;
    controlOut[rec.rut] = {
      rut: rec.rut, cotizaciones: rec.nCotizaciones, ejecutivo: rec.ejecutivo,
      fechaReserva: rec.fechaReserva, fechaPromesa: rec.fechaPromesa,
    };
    summary.actualizados++;
  });

  return { gestionOut, controlOut, cambiosNuevos, summary };
}

export async function uploadMaestroRemote(text, currentGestion, currentControl, currentCotizaciones) {
  const { byRut, filas, clientes, filasDetalle, filasOtrosProyectos } = parseMaestro(text);
  const estadoCambiosPorRut = detectarCambiosDeEstadoOpp(filasDetalle, currentCotizaciones || {});
  const { gestionOut, controlOut, cambiosNuevos, summary } = diffMaestro(byRut, currentGestion, currentControl, estadoCambiosPorRut);

  // Solo se escriben los registros que realmente cambiaron o son nuevos
  const rutsAfectados = Object.keys(byRut);
  const gestionRows = rutsAfectados.map((rut) => objToRow(gestionOut[rut], ["createdAt", "updatedAt"]));
  const controlRows = rutsAfectados.map((rut) => objToRow(controlOut[rut]));
  const cotizacionRows = filasDetalle.map((r) => objToRow(r));

  await upsertInChunks("gestion", gestionRows, "rut");
  await upsertInChunks("control_interno", controlRows, "rut");

  // La Opp es la identidad única de cada cotización: si ya existía, se
  // actualiza (por ejemplo su Estado, que puede pasar de Cotización a
  // Pre-Reserva, Reserva, Promesada, etc.); si no existía, se agrega.
  // Nunca se borra nada de esta tabla al cargar el Aval.
  await upsertInChunks("cotizaciones", cotizacionRows, "opp");

  const cotizacionesOut = { ...currentCotizaciones };
  filasDetalle.forEach((r) => {
    cotizacionesOut[r.opp] = r;
  });

  let cambiosInsertados = [];
  if (cambiosNuevos.length > 0) {
    const { data, error } = await supabase
      .from("cambios_ejecutivo")
      .insert(cambiosNuevos.map((c) => objToRow(c)))
      .select();
    if (error) throw error;
    cambiosInsertados = (data || []).map(rowToObj);
  }

  return {
    gestion: gestionOut,
    control: controlOut,
    cotizaciones: cotizacionesOut,
    cambiosNuevos: cambiosInsertados,
    summary: { ...summary, filas, clientes, filasOtrosProyectos },
  };
}

/* ---------------------------------------------------------------------
 * Resolver un cambio de ejecutivo pendiente
 * ------------------------------------------------------------------- */
export async function resolveCambioRemote(cambio, decision, prevGestion, prevControl) {
  const resolucion = decision === "aprobar" ? "APROBAR CAMBIO" : "SOLICITAR NUEVA COTIZACIÓN AL EJECUTIVO ANTERIOR";
  const fechaResolucion = nowISO();

  const { error: cambioErr } = await supabase
    .from("cambios_ejecutivo")
    .update({ resolucion, fecha_resolucion: fechaResolucion })
    .eq("id", cambio.id);
  if (cambioErr) throw cambioErr;

  const gestionUpdates = { flagCambioEjecutivo: "" };
  if (decision === "aprobar") gestionUpdates.ejecutivo = cambio.ejecutivoNuevo;

  const { error: gestionErr } = await supabase
    .from("gestion")
    .update(objToRow(gestionUpdates))
    .eq("rut", cambio.rut);
  if (gestionErr) throw gestionErr;

  let controlOut = prevControl;
  if (decision !== "aprobar" && prevControl) {
    const controlUpdates = { ejecutivo: prevGestion.ejecutivo };
    const { error: controlErr } = await supabase
      .from("control_interno")
      .update(objToRow(controlUpdates))
      .eq("rut", cambio.rut);
    if (controlErr) throw controlErr;
    controlOut = { ...prevControl, ...controlUpdates };
  }

  const gestionOut = { ...prevGestion, ...gestionUpdates };
  return { gestion: gestionOut, control: controlOut, resolucion, fechaResolucion };
}

/* ---------------------------------------------------------------------
 * Meta comercial mensual
 * ------------------------------------------------------------------- */
export async function setMetaRemote(value) {
  const { error } = await supabase
    .from("config")
    .upsert({ key: "meta_mensual", value: { value }, updated_at: nowISO() }, { onConflict: "key" });
  if (error) throw error;
  return { value };
}
