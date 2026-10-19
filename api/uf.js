// Función de Vercel: entrega el valor de la UF de hoy (fecha de Chile).
// Corre en el servidor, así que no depende de la red del usuario ni de
// CORS, y la respuesta queda en la caché de la CDN de Vercel (30 min):
// casi todas las aperturas de la app la reciben al instante.
function fechaChile() {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date()); // AAAA-MM-DD
  const [y, m, d] = p.split("-");
  return { y, m, d, iso: p };
}

export default async function handler(req, res) {
  const { y, m, d, iso } = fechaChile();
  try {
    const r = await fetch(`https://mindicador.cl/api/uf/${d}-${m}-${y}`, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`mindicador ${r.status}`);
    const data = await r.json();
    const valor = Number(data?.serie?.[0]?.valor);
    if (!Number.isFinite(valor) || valor <= 0) throw new Error("sin valor");
    res.setHeader("Cache-Control", "public, s-maxage=1800, stale-while-revalidate=86400");
    res.status(200).json({ valor, fecha: iso });
  } catch (e) {
    res.setHeader("Cache-Control", "no-store");
    res.status(502).json({ error: String(e.message || e) });
  }
}
