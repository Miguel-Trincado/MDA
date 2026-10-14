import { useEffect, useState } from "react";

// Valor oficial de la UF para HOY (fecha local del navegador, que para el
// equipo es la de Chile), consultando mindicador.cl por fecha exacta:
// /api/uf/DD-MM-AAAA devuelve una respuesta chica con un solo valor. Antes
// se usaba /api/uf (la serie completa del período) tomando serie[0], que
// depende del orden y de las fechas que venga incluyendo la serie — si el
// primer elemento no es el de hoy, el valor queda mal o la consulta falla
// y el validador se queda en "no disponible".
const pad2 = (n) => String(n).padStart(2, "0");

async function consultar(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`mindicador respondió ${res.status}`);
  return res.json();
}

export async function fetchValorUFHoy() {
  const hoy = new Date();
  const dd = pad2(hoy.getDate());
  const mm = pad2(hoy.getMonth() + 1);
  const yyyy = hoy.getFullYear();

  // 1) Fecha exacta de hoy.
  try {
    const data = await consultar(`https://mindicador.cl/api/uf/${dd}-${mm}-${yyyy}`);
    const v = Number(data?.serie?.[0]?.valor);
    if (Number.isFinite(v) && v > 0) return v;
  } catch (e) {
    console.warn("UF por fecha falló, se prueba la serie completa:", e);
  }

  // 2) Respaldo: serie completa, quedándose con el valor más reciente que
  // no sea posterior a hoy (la UF se publica por adelantado, así que
  // serie[0] puede ser una fecha futura).
  const data = await consultar("https://mindicador.cl/api/uf");
  const finHoy = new Date(yyyy, hoy.getMonth(), hoy.getDate(), 23, 59, 59).getTime();
  const candidatos = (data?.serie || [])
    .map((s) => ({ t: new Date(s.fecha).getTime(), v: Number(s.valor) }))
    .filter((s) => Number.isFinite(s.t) && Number.isFinite(s.v) && s.v > 0 && s.t <= finHoy)
    .sort((a, b) => b.t - a.t);
  if (candidatos.length === 0) throw new Error("mindicador no devolvió ningún valor de UF utilizable");
  return candidatos[0].v;
}

// Hook compartido por el Simulador y Comisiones. "error" permite mostrar
// un mensaje claro cuando la consulta falla, en vez de dejar el campo vacío
// sin explicación.
export function useValorUFHoy() {
  const [valorUF, setValorUF] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelado = false;
    fetchValorUFHoy()
      .then((v) => {
        if (!cancelado) setValorUF(v);
      })
      .catch((e) => {
        console.error("No se pudo obtener el valor de la UF", e);
        if (!cancelado) setError(e.message || "No se pudo obtener la UF");
      })
      .finally(() => {
        if (!cancelado) setLoading(false);
      });
    return () => {
      cancelado = true;
    };
  }, []);
  return { valorUF, loading, error };
}
