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
  const [gestionRes, controlRes, cambiosRes, historialRes, cotizacionesRes, listaPreciosRes, metasRes, cambiosEstadoOppRes] = await Promise.all([
    supabase.from("gestion").select("*"),
    supabase.from("control_interno").select("*"),
    supabase.from("cambios_ejecutivo").select("*").order("fecha_deteccion", { ascending: false }),
    supabase.from("historial").select("*").order("fecha", { ascending: false }).limit(1500),
    supabase.from("cotizaciones").select("*"),
    supabase.from("lista_precios").select("*").order("unidad"),
    supabase.from("metas_mensuales").select("*"),
    supabase.from("cambios_estado_opp").select("*").order("fecha_deteccion", { ascending: false }),
  ]);

  for (const res of [gestionRes, controlRes, cambiosRes, historialRes, cotizacionesRes]) {
    if (res.error) throw res.error;
  }
  // lista_precios, metas_mensuales y cambios_estado_opp son opcionales: si
  // esas tablas todavía no existen (migración no corrida), no rompen la
  // carga del resto del sistema.
  if (listaPreciosRes.error) console.warn("No se pudo cargar lista_precios:", listaPreciosRes.error.message);
  if (metasRes.error) console.warn("No se pudo cargar metas_mensuales:", metasRes.error.message);
  if (cambiosEstadoOppRes.error) console.warn("No se pudo cargar cambios_estado_opp:", cambiosEstadoOppRes.error.message);

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

  const listaPrecios = {};
  (listaPreciosRes.data || []).forEach((row) => {
    listaPrecios[row.id] = rowToObj(row);
  });

  const metas = {};
  (metasRes.data || []).forEach((row) => {
    metas[row.mes] = row.valor;
  });

  const cambiosEstadoOpp = (cambiosEstadoOppRes.data || []).map(rowToObj);

  const cambios = (cambiosRes.data || []).map(rowToObj);
  const historial = (historialRes.data || []).map(rowToObj);

  return { gestion, control, cambios, historial, cotizaciones, metas, listaPrecios, cambiosEstadoOpp };
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
  merged.cambioEstadoDetalle = "";
  // fecha_proxima_accion es una columna "date" real: un string vacío no
  // es una fecha válida para Postgres, así que se normaliza a null aquí
  // también, sin importar por qué camino haya llegado el guardado.
  if (!merged.fechaProximaAccion) merged.fechaProximaAccion = null;

  const row = objToRow(merged, ["createdAt", "updatedAt", "_alerta"]);
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
  const updates = { ultimaRevisionFecha: todayISO(), flagSistema: "", cambioEstadoDetalle: "" };
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
        ejecutivo: rec.ejecutivo, flagSistema: "NUEVO", flagCambioEjecutivo: "", cambioEstadoDetalle: "",
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
      g.cambioEstadoDetalle = cambiosEstadoDeEsteRut
        .map((c) => `Opp ${c.opp}: ${c.estadoAnterior} → ${c.estadoNuevo}`)
        .join("; ");
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
  const { byRut, filas, clientes, filasDetalle, filasOtrosProyectos, filasSinOpp, oppsDuplicadosEnCarga } = parseMaestro(text);
  const estadoCambiosPorRut = detectarCambiosDeEstadoOpp(filasDetalle, currentCotizaciones || {});
  const { gestionOut, controlOut, cambiosNuevos, summary } = diffMaestro(byRut, currentGestion, currentControl, estadoCambiosPorRut);

  // Solo se escriben los registros que realmente cambiaron o son nuevos
  const rutsAfectados = Object.keys(byRut);
  const gestionRows = rutsAfectados.map((rut) => objToRow(gestionOut[rut], ["createdAt", "updatedAt"]));
  const controlRows = rutsAfectados.map((rut) => objToRow(controlOut[rut]));

  await upsertInChunks("gestion", gestionRows, "rut");
  await upsertInChunks("control_interno", controlRows, "rut");

  // Regla de negocio: una Opp, una vez creada, es inmutable salvo su Estado
  // (que sí puede avanzar de Cotización a Pre-Reserva, Reserva, Promesada,
  // etc.). Por eso una Opp nueva se inserta completa, pero una Opp que ya
  // existía SOLO recibe una actualización de su columna estado — nunca se
  // reescriben su fecha, tipología, región, RUT u otro dato, aunque el
  // Aval traiga algo distinto para esa fila.
  const cotizacionesNuevas = [];
  const cotizacionesEstadoActualizado = [];
  const cambiosEstadoLog = [];
  filasDetalle.forEach((r) => {
    const prev = (currentCotizaciones || {})[r.opp];
    if (!prev) {
      cotizacionesNuevas.push(r);
      return;
    }
    const estadoCambio = r.estado && prev.estado !== r.estado;
    const fechaPromesaNueva = r.fechaPromesa && r.fechaPromesa !== prev.fechaPromesa;
    if (estadoCambio) {
      cotizacionesEstadoActualizado.push({ opp: r.opp, estado: r.estado, fechaPromesa: r.fechaPromesa || prev.fechaPromesa || "" });
      cambiosEstadoLog.push({ opp: r.opp, rut: r.rut, estadoAnterior: prev.estado, estadoNuevo: r.estado, fechaPromesa: r.fechaPromesa || "" });
    } else if (r.estado === "Promesada" && fechaPromesaNueva) {
      // La Opp ya estaba en Promesada, pero recién ahora llega (o llega
      // distinta) su Fecha Promesa real — no es un cambio de Estado, pero
      // igual hay que registrarlo para que "Promesados del mes" pueda
      // contarla con la fecha correcta.
      cotizacionesEstadoActualizado.push({ opp: r.opp, estado: r.estado, fechaPromesa: r.fechaPromesa });
      cambiosEstadoLog.push({ opp: r.opp, rut: r.rut, estadoAnterior: prev.estado, estadoNuevo: r.estado, fechaPromesa: r.fechaPromesa });
    }
  });

  await upsertInChunks("cotizaciones", cotizacionesNuevas.map((r) => objToRow(r)), "opp");
  await upsertInChunks("cotizaciones", cotizacionesEstadoActualizado.map((r) => objToRow(r)), "opp");

  // Historial con fecha real de cada cambio de Estado de Opp — es la
  // única forma de saber después cuántas Opp pasaron a "Promesada"
  // durante un mes específico (el campo Estado de la ficha, que edita
  // el ejecutivo a mano, no tiene fecha ni viene del Aval).
  if (cambiosEstadoLog.length > 0) {
    const rows = cambiosEstadoLog.map((c) => objToRow(c));
    for (const part of chunk(rows, 400)) {
      if (part.length === 0) continue;
      const { error } = await supabase.from("cambios_estado_opp").insert(part);
      if (error) throw error;
    }
  }

  const cotizacionesOut = { ...currentCotizaciones };
  filasDetalle.forEach((r) => {
    const prev = cotizacionesOut[r.opp];
    cotizacionesOut[r.opp] = prev
      ? { ...prev, estado: r.estado !== prev.estado ? r.estado : prev.estado, fechaPromesa: r.fechaPromesa || prev.fechaPromesa }
      : r;
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
    summary: { ...summary, filas, clientes, filasOtrosProyectos, filasSinOpp, oppsDuplicadosEnCarga },
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
export async function fetchMetasMensuales() {
  const { data, error } = await supabase.from("metas_mensuales").select("*");
  if (error) throw error;
  const out = {};
  (data || []).forEach((row) => {
    out[row.mes] = row.valor;
  });
  return out;
}

// Solo funciona si hay una sesión de Supabase Auth activa (la política
// de la base exige "authenticated" para escribir metas_mensuales) — si
// no la hay, Supabase devuelve un error de RLS y la UI lo muestra.
export async function setMetaMensualRemote(mes, valor) {
  const { error } = await supabase
    .from("metas_mensuales")
    .upsert({ mes, valor, updated_at: nowISO() }, { onConflict: "mes" });
  if (error) throw error;
  return { mes, valor };
}

export async function fetchCambiosEstadoOpp() {
  const { data, error } = await supabase
    .from("cambios_estado_opp")
    .select("*")
    .order("fecha_deteccion", { ascending: false });
  if (error) throw error;
  return (data || []).map(rowToObj);
}

/* ---------------------------------------------------------------------
 * Cotizador: listado de precios y cotizaciones generadas
 * ------------------------------------------------------------------- */

export async function fetchListaPrecios() {
  const { data, error } = await supabase.from("lista_precios").select("*").order("unidad");
  if (error) throw error;
  const out = {};
  (data || []).forEach((row) => {
    out[row.id] = rowToObj(row);
  });
  return out;
}

// Reemplaza el listado de precios entero por el que se acaba de subir:
// a diferencia del Aval (que se acumula por Opp), el listado de precios
// es siempre "la foto actual" de lo disponible, así que si una unidad ya
// no aparece en el archivo nuevo (se vendió y se sacó de la lista, etc.)
// no debe quedar dando vueltas.
export async function uploadListaPreciosRemote(unidades) {
  const { error: delError } = await supabase.from("lista_precios").delete().neq("unidad", "");
  if (delError) throw delError;

  const rows = unidades.map((u) =>
    objToRow({
      tipo: u.tipo,
      modelo: u.modelo,
      unidad: u.unidad,
      tipologia: u.tipologia,
      orientacion: u.orientacion,
      area: u.area,
      precio: u.precio,
      descuentoMax: u.descuentoMax,
      estado: u.estado,
      rawData: u.raw,
      updatedAt: nowISO(),
    })
  );
  // No hay ninguna columna que sirva de llave única confiable (el listado
  // real trae números de unidad repetidos de verdad), así que se inserta
  // directo en vez de hacer upsert por unidad — la tabla ya quedó vacía
  // por el delete de arriba.
  for (const part of chunk(rows, 400)) {
    if (part.length === 0) continue;
    const { error } = await supabase.from("lista_precios").insert(part);
    if (error) throw error;
  }
  return fetchListaPrecios();
}

export async function fetchCotizacionesDeCliente(rut) {
  const { data, error } = await supabase
    .from("cotizaciones_generadas")
    .select("*")
    .eq("rut_cliente", rut)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(rowToObj);
}

// Guarda una cotización generada. Se llama una sola vez por sesión del
// Cotizador (si ya se guardó, se reutiliza la misma fila y su N°, en vez
// de crear una nueva cada vez que se descarga o previsualiza el PDF).
export async function guardarCotizacionGenerada(payload) {
  const row = objToRow(payload, ["displayId", "createdAt"]);
  const { data, error } = await supabase.from("cotizaciones_generadas").insert(row).select().single();
  if (error) throw error;
  return rowToObj(data);
}

