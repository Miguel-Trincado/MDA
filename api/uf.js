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
  const ayer = new Date(`${iso}T12:00:00Z`);
  ayer.setUTCDate(ayer.getUTCDate() - 1);
  const [ya, ma, da] = ayer.toISOString().slice(0, 10).split("-");
  const valorDe = async (dd, mm, yy) => {
    const r = await fetch(`https://mindicador.cl/api/uf/${dd}-${mm}-${yy}`, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`mindicador ${r.status}`);
    const v = Number((await r.json())?.serie?.[0]?.valor);
    if (!Number.isFinite(v) || v <= 0) throw new Error("sin valor");
    return v;
  };
  try {
    // Hoy y ayer en paralelo: ayer solo sirve para mostrar la variación.
    const [valor, anterior] = await Promise.all([valorDe(d, m, y), valorDe(da, ma, ya).catch(() => null)]);
    res.setHeader("Cache-Control", "public, s-maxage=1800, stale-while-revalidate=86400");
    res.status(200).json({ valor, anterior, fecha: iso });
  } catch (e) {
    res.setHeader("Cache-Control", "no-store");
    res.status(502).json({ error: String(e.message || e) });
  }
}
