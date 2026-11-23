import { createContext, createElement, useCallback, useContext, useEffect, useState } from "react";

// Valor de la UF de HOY, cargado una sola vez al abrir la app y compartido
// por todas las pantallas (Simulador, Comisiones y el indicador de arriba).
// Para que sea rápido:
//  1. Si ya se consultó hoy en este navegador, se muestra al instante desde
//     la caché local y se confirma en segundo plano.
//  2. Se consultan varias fuentes EN PARALELO y gana la primera que responde:
//     la función propia /api/uf (servidor + caché de la CDN de Vercel) y,
//     de respaldo directo desde el navegador, mindicador.cl y boostr.cl.
//  3. Cada consulta tiene un tiempo máximo de 6 s.
const CACHE_KEY = "pilpilen_uf_cache";

function hoyChileISO() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

function leerCacheCompleta() {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
    if (c && c.fecha === hoyChileISO() && Number(c.valor) > 0) return { valor: Number(c.valor), anterior: Number(c.anterior) > 0 ? Number(c.anterior) : null };
  } catch {
    // sin caché: no es grave
  }
  return null;
}
const leerCache = () => leerCacheCompleta()?.valor ?? null;

// Variación porcentual de hoy contra el día anterior (null si no se conoce).
const variacionPct = (valor, anterior) => (valor > 0 && anterior > 0 ? ((valor - anterior) / anterior) * 100 : null);

function guardarCache(valor, anterior) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ fecha: hoyChileISO(), valor, anterior: anterior ?? null }));
  } catch {
    // sin caché: no es grave
  }
}

async function getJSON(url, ms = 6000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`${url} respondió ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

const valido = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) throw new Error("valor de UF no válido");
  return n;
};

export async function fetchValorUFHoy() {
  const [y, m, d] = hoyChileISO().split("-");
  const fuentes = [
    async () => {
      const j = await getJSON("/api/uf");
      return { valor: valido(j.valor), anterior: Number(j.anterior) > 0 ? Number(j.anterior) : null };
    },
    async () => ({ valor: valido((await getJSON(`https://mindicador.cl/api/uf/${d}-${m}-${y}`)).serie?.[0]?.valor), anterior: null }),
    async () => {
      const data = await getJSON("https://api.boostr.cl/economy/indicator/uf.json");
      return { valor: valido(data?.data?.value ?? data?.data?.[0]?.value ?? data?.value), anterior: null };
    },
  ];
  try {
    return await Promise.any(fuentes.map((f) => f()));
  } catch (e) {
    // Último respaldo: la serie completa, quedándose con el valor más
    // reciente que no sea posterior a hoy.
    const data = await getJSON("https://mindicador.cl/api/uf", 10000);
    const fin = new Date(`${y}-${m}-${d}T23:59:59`).getTime();
    const cand = (data?.serie || [])
      .map((s) => ({ t: new Date(s.fecha).getTime(), v: Number(s.valor) }))
      .filter((s) => Number.isFinite(s.t) && s.v > 0 && s.t <= fin)
      .sort((a, b) => b.t - a.t);
    if (cand.length === 0) throw new Error("No se pudo obtener la UF de hoy");
    return { valor: cand[0].v, anterior: cand[1]?.v > 0 ? cand[1].v : null };
  }
}

// Valor de la UF de ayer (solo para mostrar la variación diaria). Se pide
// aparte, sin bloquear, cuando la fuente más rápida no lo trajo.
async function fetchUFAyer() {
  const [y, m, d] = hoyChileISO().split("-").map(Number);
  const a = new Date(Date.UTC(y, m - 1, d - 1));
  const dd = String(a.getUTCDate()).padStart(2, "0");
  const mm = String(a.getUTCMonth() + 1).padStart(2, "0");
  const data = await getJSON(`https://mindicador.cl/api/uf/${dd}-${mm}-${a.getUTCFullYear()}`);
  return valido(data?.serie?.[0]?.valor);
}

const UfContext = createContext({ valorUF: null, loading: false, error: "sin proveedor", recargar: () => {} });

export function UfProvider({ children }) {
  const [estado, setEstado] = useState(() => {
    const c = leerCacheCompleta();
    return { valorUF: c?.valor ?? null, variacion: c ? variacionPct(c.valor, c.anterior) : null, loading: c == null, error: "" };
  });

  const cargar = useCallback(() => {
    setEstado((s) => ({ ...s, loading: s.valorUF == null, error: "" }));
    fetchValorUFHoy()
      .then(({ valor, anterior }) => {
        guardarCache(valor, anterior);
        setEstado({ valorUF: valor, variacion: variacionPct(valor, anterior), loading: false, error: "" });
        if (!(anterior > 0)) {
          fetchUFAyer()
            .then((ayer) => {
              guardarCache(valor, ayer);
              setEstado((s) => ({ ...s, variacion: variacionPct(valor, ayer) }));
            })
            .catch(() => {});
        }
      })
      .catch((e) => {
        console.error("No se pudo obtener el valor de la UF", e);
        setEstado((s) => ({ ...s, loading: false, error: s.valorUF == null ? e.message || "No se pudo obtener la UF" : "" }));
      });
  }, []);

  useEffect(() => {
    cargar();
    // Si la pestaña queda abierta de un día para otro, al volver se
    // actualiza a la UF del día nuevo.
    function alVolver() {
      if (document.visibilityState === "visible" && leerCache() == null) cargar();
    }
    document.addEventListener("visibilitychange", alVolver);
    return () => document.removeEventListener("visibilitychange", alVolver);
  }, [cargar]);

  return createElement(UfContext.Provider, { value: { ...estado, recargar: cargar } }, children);
}

// Mismo nombre y forma que antes ({ valorUF, loading, error }), así el
// Simulador y Comisiones no cambian.
export function useValorUFHoy() {
  return useContext(UfContext);
}
