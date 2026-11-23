// Período de comisiones: no es el mes calendario sino un rango que el administrador puede
// ajustar mes a mes. Por defecto va del 25 del mes anterior al 24 del mes. El período se llama
// por el mes en que TERMINA (25-sep a 24-oct = octubre).
export const DIA_INICIO_DEFECTO = 25;
export const DIA_FIN_DEFECTO = 24;

const p2 = (n) => String(n).padStart(2, "0");

export function periodoPorDefecto(mes) {
  const [y, m] = String(mes).split("-").map(Number);
  if (!y || !m) return { desde: "", hasta: "" };
  const py = m === 1 ? y - 1 : y;
  const pm = m === 1 ? 12 : m - 1;
  return { desde: `${py}-${p2(pm)}-${p2(DIA_INICIO_DEFECTO)}`, hasta: `${y}-${p2(m)}-${p2(DIA_FIN_DEFECTO)}` };
}

// periodos: { "2026-10": { desde, hasta } } (lo guardado); si el mes no está, usa el 25→24.
export function periodoDe(mes, periodos) {
  const g = periodos && periodos[mes];
  if (g && g.desde && g.hasta) return { desde: String(g.desde).slice(0, 10), hasta: String(g.hasta).slice(0, 10), personalizado: true };
  return { ...periodoPorDefecto(mes), personalizado: false };
}

export const fechaEnPeriodo = (iso, p) => !!iso && !!p.desde && !!p.hasta && iso >= p.desde && iso <= p.hasta;

const fmt = (iso) => (iso ? `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}` : "—");
export const rangoTexto = (p) => `${fmt(p.desde)} al ${fmt(p.hasta)}`;

// Tramo automático según el TOTAL de unidades del período de la ejecutiva (igual para todas sus unidades).
export function tramoPctPorTotal(totalUnidades) {
  if (totalUnidades <= 1) return 0.5;
  if (totalUnidades === 2) return 0.6;
  return 0.75;
}
