// Función de Vercel: recibe el Aval completo desde Vivet (lo envía el script del
// navegador, ver scripts/vivet-aval-sync.user.js) y lo guarda en Supabase.
//
// Variables de entorno (Vercel → Settings → Environment Variables):
//   AVAL_SYNC_KEY             clave larga inventada por ti; el script la manda en x-sync-key
//   SUPABASE_URL              (o VITE_SUPABASE_URL) dirección del proyecto Supabase
//   SUPABASE_SERVICE_ROLE_KEY clave "service_role" de Supabase (solo vive en el servidor)
import { timingSafeEqual } from "node:crypto";

// Copias de las funciones de src/lib/helpers.js (esa carpeta se importa sin
// extensión, válido en Vite pero no en las funciones de Vercel). Si cambias una
// allá, cámbiala aquí también.
const stripAccents = (s) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const normalizeName = (s) =>
  !s ? "" : s.trim().toLowerCase().split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
const normalizeRut = (s) => (!s ? "" : s.trim().replace(/\./g, "").replace(/-/g, "").toUpperCase());
function esProyectoExcluidoDashboard(proyecto) {
  const p = stripAccents(proyecto || "").toUpperCase();
  return (/ACAC/.test(p) && p.includes("SAN PEDRO")) || (p.includes("OLIVO") && p.includes("VALLE"));
}

const TROZO = 400;

// La ingesta del Aval completa puede tardar más que el límite por defecto.
export const config = { maxDuration: 60 };

function claveOk(recibida, esperada) {
  const a = Buffer.from(String(recibida || ""));
  const b = Buffer.from(String(esperada || ""));
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

const txt = (v) => (v === null || v === undefined ? "" : String(v).trim());

function numCupon(v) {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  let s = String(v).trim().replace(/\s/g, "");
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// Una fila del reporte de Vivet → una fila de la tabla aval_completo.
export function filaDeVivet(r) {
  const opp = txt(r.Id_Oportunidad);
  if (!opp) return null;
  const proyecto = txt(r.Nombre_Proyecto).replace(/\s+/g, " ");
  if (esProyectoExcluidoDashboard(proyecto)) return null;
  const cliente = [r.Nombre_cliente, r.cliente_segundo_nombre, r.Apellido_Cliente, r.Apellido_Materno]
    .map(txt).filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  return {
    opp,
    rut: normalizeRut(txt(r.Rut_cliente)),
    cliente,
    ejecutivo: normalizeName(txt(r.Ejecutivo)),
    proyecto,
    estado: txt(r.Estado),
    tipologia: txt(r.Tipologiareporte),
    region: txt(r.region),
    lote: txt(r.lote_uni),
    fecha: txt(r.fechacotizacion),
    fecha_opp: txt(r.FechaOportunidad),
    fecha_reserva: txt(r.fechareserva),
    fecha_cierre: txt(r.fechacierre),
    fecha_promesa: txt(r.fechapromesa),
    fecha_escritura: txt(r.fechaescritura),
    fecha_desistimiento: txt(r.Fechadesistimiento),
    cupon_contra_escritura: numCupon(r.CuponPagoContraEscritura),
  };
}

async function sb(base, key, path, init) {
  const r = await fetch(`${base}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${(await r.text()).slice(0, 300)}`);
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type, x-sync-key");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Usa POST" });

  const base = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key || !process.env.AVAL_SYNC_KEY) {
    return res.status(500).json({ error: "Faltan variables de entorno en Vercel (AVAL_SYNC_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)" });
  }
  if (!claveOk(req.headers["x-sync-key"], process.env.AVAL_SYNC_KEY)) {
    return res.status(401).json({ error: "Clave incorrecta" });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};

    // Aval en formato "Maestro" (solo Pilpilén): alimenta Ejecutivo, Comisiones, Jefa, etc., igual que
    // subir el archivo a mano en Carga. El código es el mismo de la app (api/_maestro.mjs).
    if (typeof body.maestro === "string") {
      const { ingestarMaestro } = await import("./_maestro.mjs");
      const r = await ingestarMaestro(body.maestro);
      return res.status(200).json({ ok: true, maestro: true, resumen: r.resumen, ...(r.cargaError ? { cargaError: r.cargaError } : {}) });
    }

    const rows = Array.isArray(body.rows) ? body.rows : [];
    const porOpp = new Map();
    for (const r of rows) {
      const f = filaDeVivet(r);
      if (f) porOpp.set(f.opp, f);
    }
    const filas = [...porOpp.values()];
    // Si Vivet no entregó el cupón en este envío, no se toca la columna (no pisa lo cargado desde el CSV).
    if (!filas.some((f) => f.cupon_contra_escritura !== null)) filas.forEach((f) => { delete f.cupon_contra_escritura; });
    if (rows.length > 0 && filas.length === 0) {
      return res.status(422).json({
        error: "Ninguna fila válida: no se reconocieron los campos de Vivet (o todas eran de proyectos excluidos)",
        camposRecibidos: Object.keys(rows[0] || {}).slice(0, 30),
      });
    }
    const enviar = (lote) => sb(base, key, "aval_completo?on_conflict=opp", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(lote),
    });
    for (let i = 0; i < filas.length; i += TROZO) {
      const lote = filas.slice(i, i + TROZO);
      try {
        await enviar(lote);
      } catch (e) {
        // Sin la migración v175 (columna del cupón): se guarda igual, sin el cupón.
        if (!/cupon_contra_escritura/i.test(String(e.message || e))) throw e;
        await enviar(lote.map((f) => { const { cupon_contra_escritura, ...resto } = f; return resto; })); // eslint-disable-line no-unused-vars
      }
    }
    // Registro visible en "Datos al día". Si falla, no se pierde el Aval ya
    // guardado, pero el motivo se devuelve para que el script lo muestre.
    let cargaError = "";
    if (body.fin) {
      try {
        await sb(base, key, "cargas_archivos", {
          method: "POST",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({
            tipo: "aval_completo",
            archivo: "Vivet (automático)",
            usuario: "Sincronización Vivet",
            resumen: `${Number(body.total) || filas.length} filas`,
          }),
        });
      } catch (e) {
        cargaError = String(e.message || e);
      }
    }
    return res.status(200).json({ ok: true, recibidas: rows.length, guardadas: filas.length, ...(cargaError ? { cargaError } : {}) });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
