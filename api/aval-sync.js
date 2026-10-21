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

function claveOk(recibida, esperada) {
  const a = Buffer.from(String(recibida || ""));
  const b = Buffer.from(String(esperada || ""));
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

const txt = (v) => (v === null || v === undefined ? "" : String(v).trim());

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
    const rows = Array.isArray(body.rows) ? body.rows : [];
    const porOpp = new Map();
    for (const r of rows) {
      const f = filaDeVivet(r);
      if (f) porOpp.set(f.opp, f);
    }
    const filas = [...porOpp.values()];
    for (let i = 0; i < filas.length; i += TROZO) {
      await sb(base, key, "aval_completo?on_conflict=opp", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(filas.slice(i, i + TROZO)),
      });
    }
    if (body.fin) {
      await sb(base, key, "cargas_archivos", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          tipo: "aval_completo",
          archivo: "Vivet (automático)",
          usuario: "Sincronización Vivet",
          resumen: `${Number(body.total) || filas.length} filas`,
        }),
      }).catch(() => {});
    }
    return res.status(200).json({ ok: true, recibidas: rows.length, guardadas: filas.length });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
