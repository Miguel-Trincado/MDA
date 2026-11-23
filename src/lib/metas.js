// Cálculo del cumplimiento de metas (panel "Metas").
//
// Una meta se asigna por mes, proyecto y tipo de unidad: unidades a vender y
// peso (%) dentro del cumplimiento. "Vendidas" = Opp promesadas (estado
// Promesada o Escriturada) ubicadas en el mes de su fecha de promesa.
//   cumplimiento de una fila = vendidas / unidades × peso
//   cumplimiento del mes     = suma de las filas (los pesos deben sumar 100%)
import { parseFechaAMes, normalizarCodigo, stripAccents, esProyectoExcluidoDashboard } from "./helpers";
import { MESES_ES_LARGO } from "./constants";

export const TIPOS_META = ["Departamentos", "Estacionamientos", "Bodega", "Local Comercial"];

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const pesos = (n) => `$${Math.round(n || 0).toLocaleString("es-CL")}`;
export const pct1 = (n) => `${(Math.round((n || 0) * 10) / 10).toLocaleString("es-CL")}%`;

export function claveMes(fecha) {
  const f = parseFechaAMes(fecha);
  return f ? `${f.year}-${String(f.month).padStart(2, "0")}` : null;
}
export function mesActual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
export function mesMas(clave, delta) {
  const [y, m] = clave.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
export function etiquetaMes(clave) {
  const [y, m] = clave.split("-").map(Number);
  const n = MESES_ES_LARGO?.[m - 1] || String(m);
  return `${n.charAt(0).toUpperCase()}${n.slice(1)} ${y}`;
}
export function etiquetaMesCorta(clave) {
  const [y, m] = clave.split("-").map(Number);
  const n = (MESES_ES_LARGO?.[m - 1] || String(m)).slice(0, 3);
  return `${n.charAt(0).toUpperCase()}${n.slice(1)} ${String(y).slice(2)}`;
}
export function periodoTexto(clave) {
  const [y, m] = clave.split("-").map(Number);
  const ult = new Date(y, m, 0).getDate();
  const p = (n) => String(n).padStart(2, "0");
  return `01-${p(m)}-${y} al ${p(ult)}-${p(m)}-${y}`;
}

export function tipoCanon(tipoUnidad) {
  const s = stripAccents(tipoUnidad || "").toLowerCase();
  if (s.includes("depart")) return "Departamentos";
  if (s.includes("estacion")) return "Estacionamientos";
  if (s.includes("bodega")) return "Bodega";
  if (s.includes("local")) return "Local Comercial";
  return null;
}

export const normProyecto = (p) => String(p || "").replace(/\s+/g, " ").trim();

const esPromesa = (estado) => {
  const s = stripAccents(estado || "").toLowerCase();
  return s.includes("promes") || s.includes("escritur");
};

// Promesadas por mes -> { "2026-10": { vendidas: { "PROYECTO|Tipo": n }, sinTipo: n, total: n } }
export function promesasPorMes(avalCompleto, tiposUnidad) {
  const out = {};
  const vistos = new Set();
  (avalCompleto || []).forEach((r) => {
    if (esProyectoExcluidoDashboard(r.proyecto) || !esPromesa(r.estado)) return;
    const mes = claveMes(r.fechaPromesa);
    if (!mes) return;
    const key = r.opp != null && String(r.opp).trim() ? String(r.opp).trim() : null;
    if (key) { if (vistos.has(key)) return; vistos.add(key); }
    const m = (out[mes] ||= { vendidas: {}, sinTipo: 0, total: 0 });
    m.total += 1;
    const tipo = tipoCanon(tiposUnidad?.[normalizarCodigo(r.lote)]?.tipoUnidad);
    if (!tipo) { m.sinTipo += 1; return; }
    const k = `${normProyecto(r.proyecto)}|${tipo}`;
    m.vendidas[k] = (m.vendidas[k] || 0) + 1;
  });
  return out;
}

export function proyectosDelAval(avalCompleto) {
  const set = new Set();
  (avalCompleto || []).forEach((r) => { if (!esProyectoExcluidoDashboard(r.proyecto) && normProyecto(r.proyecto)) set.add(normProyecto(r.proyecto)); });
  return [...set].sort();
}

// Calcula el mes: filas por proyecto/tipo, totales, bonos y cumplimiento del jefe de ventas.
export function calcularMes({ mes, asignaciones, config, ventasMes }) {
  const asig = (asignaciones || []).filter((a) => a.mes === mes);
  const ventas = ventasMes?.vendidas || {};
  const proyectos = [...new Set(asig.map((a) => a.proyecto))].sort();
  const bloques = proyectos.map((proyecto) => {
    const filas = TIPOS_META.map((tipo) => {
      const a = asig.find((x) => x.proyecto === proyecto && x.tipo === tipo);
      const unidades = a?.unidades || 0;
      const peso = a?.peso || 0;
      const vendidas = ventas[`${proyecto}|${tipo}`] || 0;
      const cumpl = unidades > 0 ? (vendidas / unidades) * peso : 0;
      return { tipo, unidades, peso, vendidas, cumpl };
    });
    const total = filas.reduce((t, f) => ({ unidades: t.unidades + f.unidades, peso: t.peso + f.peso, vendidas: t.vendidas + f.vendidas, cumpl: t.cumpl + f.cumpl }), { unidades: 0, peso: 0, vendidas: 0, cumpl: 0 });
    return { proyecto, filas, total };
  });
  const general = bloques.reduce((t, b) => ({ unidades: t.unidades + b.total.unidades, peso: t.peso + b.total.peso, vendidas: t.vendidas + b.total.vendidas, cumpl: t.cumpl + b.total.cumpl }), { unidades: 0, peso: 0, vendidas: 0, cumpl: 0 });
  const todas = bloques.flatMap((b) => b.filas);
  const principales = todas.filter((f) => f.peso > 0).reduce((s, f) => s + f.unidades, 0);
  const secundarias = todas.filter((f) => f.peso === 0).reduce((s, f) => s + f.unidades, 0);
  const vendidasPrincipales = todas.filter((f) => f.peso > 0).reduce((s, f) => s + f.vendidas, 0);

  const cfg = config?.[mes] || { jefe: "", bono100: 0, escala: [] };
  const escala = [...(cfg.escala || [])].map((e) => ({ unidades: Number(e.unidades) || 0, bono: Number(e.bono) || 0 })).filter((e) => e.unidades > 0).sort((a, b) => a.unidades - b.unidades);
  const nivel = [...escala].reverse().find((e) => vendidasPrincipales >= e.unidades) || null;
  const logro100 = general.peso > 0 && general.cumpl >= 99.995;
  const bonoEscala = nivel ? nivel.bono : 0;
  const bono100 = logro100 ? cfg.bono100 || 0 : 0;
  return {
    mes, hayMeta: asig.length > 0, bloques, general, principales, secundarias, vendidasPrincipales,
    jefe: cfg.jefe || "", escala, nivel, bonoEscala, bono100Valor: cfg.bono100 || 0, logro100, bono100,
    sinTipo: ventasMes?.sinTipo || 0, totalPromesas: ventasMes?.total || 0,
    pesoOk: Math.abs(general.peso - 100) < 0.01,
  };
}

// Serie mes a mes (para la tabla y el gráfico de evolución).
export function serieMeses({ meses, asignaciones, config, promesas }) {
  return meses.map((mes) => {
    const r = calcularMes({ mes, asignaciones, config, ventasMes: promesas[mes] });
    return { mes, etiqueta: etiquetaMesCorta(mes), ...r };
  });
}

/* ---------------------------- Informe para correo ---------------------------- */
const TD = "padding:7px 10px;border-bottom:1px solid #e6eaf2;font-size:13px;";
const TH = "padding:8px 10px;background:#0A3A8C;color:#fff;font-size:11px;text-align:center;font-weight:bold;";

export function informeHtml(r, serie) {
  const color = r.general.cumpl >= 100 ? "#7CE3B5" : r.general.cumpl >= 60 ? "#FFD27A" : "#FF9DB8";
  const bloque = (b, i) => {
    const ok = b.total.cumpl >= 99.995;
    return `
    <table style="width:100%;border-collapse:collapse;margin-bottom:14px;border:1px solid #E3E9F5">
      <tr><td colspan="5" style="padding:10px 12px;background:${i % 2 ? "#0A3A8C" : "#0B2A66"};color:#fff;font-weight:bold;font-size:13px;text-transform:uppercase">${esc(b.proyecto)}</td></tr>
      <tr><td style="${TH}text-align:left">PRODUCTO</td><td style="${TH}">UNIDADES</td><td style="${TH}">PONDER.</td><td style="${TH}">VENDIDAS</td><td style="${TH}">CUMPLIMIENTO</td></tr>
      ${b.filas.filter((f) => f.unidades > 0 || f.vendidas > 0 || f.peso > 0).map((f) => `
      <tr><td style="${TD}">${esc(f.tipo)}</td><td style="${TD}text-align:center">${f.unidades}</td><td style="${TD}text-align:center;${f.peso > 0 ? "color:#0f7a52;font-weight:bold" : "color:#9aa3b5"}">${pct1(f.peso)}</td><td style="${TD}text-align:center">${f.vendidas}</td><td style="${TD}text-align:center;font-weight:bold">${pct1(f.cumpl)}</td></tr>`).join("")}
      <tr style="background:${ok ? "#E3F6EC" : "#EAF1FF"};color:${ok ? "#0f7a52" : "#0A3A8C"};font-weight:bold"><td style="padding:9px 10px;font-size:12px;text-transform:uppercase">Total ${esc(b.proyecto)}</td><td style="padding:9px 10px;text-align:center">${b.total.unidades}</td><td style="padding:9px 10px;text-align:center">${pct1(b.total.peso)}</td><td style="padding:9px 10px;text-align:center">${b.total.vendidas}</td><td style="padding:9px 10px;text-align:center">${pct1(b.total.cumpl)}</td></tr>
    </table>`;
  };
  const kpi = (v, l) => `<td style="width:25%;padding:6px"><div style="border:1px solid #E3E9F5;border-radius:10px;padding:10px;text-align:center"><div style="font-size:24px;font-weight:bold;color:#0B2A66">${v}</div><div style="font-size:10px;color:#5b6b8c;font-weight:bold">${l}</div></div></td>`;
  const filaBono = (txt, val, ok) => `<tr style="background:${ok ? "#E3F6EC" : "#fff"}"><td style="${TD}">${ok ? "&#10003; " : ""}${txt}</td><td style="${TD}font-weight:bold;color:#1E5AA8;width:110px">${val}</td></tr>`;
  const evol = (serie || []).filter((x) => x.hayMeta || x.totalPromesas > 0);
  return `
<div style="font-family:Arial,Helvetica,sans-serif;color:#13234A;max-width:700px;border:1px solid #e6eaf2">
  <div style="background:#16171B;color:#fff;padding:18px 22px;border-bottom:4px solid #0A3A8C">
    <div style="font-size:24px;font-weight:bold;letter-spacing:1px">MDA</div>
    <div style="font-size:10px;letter-spacing:4px;opacity:.75">INMOBILIARIA</div>
  </div>
  <div style="padding:20px 22px">
    <table style="width:100%;border-collapse:collapse"><tr>
      <td style="vertical-align:top">
        <div style="font-size:24px;font-weight:bold;color:#0B1F4A;text-transform:uppercase;line-height:1.15">Asignación y cumplimiento de metas</div>
        <div style="font-size:13px;font-weight:bold;color:#1E5AA8;margin-top:6px;text-transform:uppercase">Período: ${esc(periodoTexto(r.mes))}</div>
        ${r.jefe ? `<div style="font-size:13px;margin-top:8px">Jefe de Ventas: <b>${esc(r.jefe)}</b></div>` : ""}
      </td>
      <td style="width:230px;vertical-align:top"><div style="background:#0B2A66;color:#fff;border-radius:12px;padding:14px 16px">
        <div style="font-size:11px;font-weight:bold;color:#7DD3FC">CUMPLIMIENTO DEL JEFE DE VENTAS</div>
        <div style="font-size:38px;font-weight:bold;color:${color};line-height:1.1">${pct1(r.general.cumpl)}</div>
        <div style="font-size:11px;opacity:.85">${r.general.vendidas} vendidas de ${r.general.unidades} unidades de meta</div></div></td>
    </tr></table>

    <div style="text-align:center;font-size:13px;font-weight:bold;letter-spacing:1px;margin:20px 0 6px;text-transform:uppercase;color:#0B1F4A">Resumen ejecutivo</div>
    <table style="width:100%;border-collapse:collapse"><tr>${kpi(r.bloques.length, "PROYECTOS CONSIDERADOS")}${kpi(r.principales, "UNIDADES PRINCIPALES")}${kpi(r.secundarias, "UNIDADES SECUNDARIAS")}${kpi(pct1(r.general.cumpl), "CUMPLIMIENTO GLOBAL")}</tr></table>

    <div style="text-align:center;font-size:13px;font-weight:bold;letter-spacing:1px;margin:20px 0 10px;text-transform:uppercase;color:#0B1F4A">Metas por proyecto</div>
    ${r.bloques.map(bloque).join("")}

    <table style="width:100%;border-collapse:collapse;border:1px solid #E3E9F5;margin-top:6px"><tr>
      <td style="width:150px;background:#0B2547;color:#fff;padding:14px;font-weight:bold;font-size:16px;vertical-align:middle">BONO<br>DEL MES<div style="font-size:11px;font-weight:normal;margin-top:6px;opacity:.85">Ganado: ${pesos(r.bonoEscala + r.bono100)}</div></td>
      <td style="padding:0;vertical-align:top"><table style="width:100%;border-collapse:collapse">
        <tr><td style="${TH}text-align:left;background:#0B2547">CUMPLIMIENTO</td><td style="${TH}background:#0B2547">BONO</td></tr>
        ${r.escala.map((e) => filaBono(`${e.unidades} unidades vendidas`, pesos(e.bono), r.vendidasPrincipales >= e.unidades)).join("")}
        ${filaBono("100% del cumplimiento de la meta", pesos(r.bono100Valor), r.logro100)}
      </table></td></tr></table>
    <div style="font-size:11px;color:#5b6b8c;margin-top:4px">Unidades principales vendidas: ${r.vendidasPrincipales} · Bono por escala: ${pesos(r.bonoEscala)}</div>

    ${evol.length > 1 ? `
    <div style="text-align:center;font-size:13px;font-weight:bold;letter-spacing:1px;margin:22px 0 8px;text-transform:uppercase;color:#0B1F4A">Cumplimiento mes a mes</div>
    <table style="width:100%;border-collapse:collapse">
      <tr><td style="${TH}text-align:left">MES</td><td style="${TH}">META (UNID.)</td><td style="${TH}">VENDIDAS</td><td style="${TH}">CUMPLIMIENTO</td><td style="${TH}">BONO</td></tr>
      ${evol.map((x) => `<tr><td style="${TD}">${esc(etiquetaMes(x.mes))}</td><td style="${TD}text-align:center">${x.hayMeta ? x.general.unidades : "—"}</td><td style="${TD}text-align:center">${x.hayMeta ? x.general.vendidas : x.totalPromesas}</td><td style="${TD}text-align:center;font-weight:bold">${x.hayMeta ? pct1(x.general.cumpl) : "sin meta"}</td><td style="${TD}text-align:center">${x.hayMeta ? pesos(x.bonoEscala + x.bono100) : "—"}</td></tr>`).join("")}
    </table>` : ""}

    <div style="background:#F4F8FF;border:1px solid #DCE6F7;border-radius:10px;padding:12px 14px;margin-top:18px;font-size:12px;color:#44506b"><b style="color:#0B2547">IMPORTANTE</b><br>El cumplimiento de metas será evaluado al cierre del período indicado. Vendidas = promesas del mes (estado Promesada o Escriturada, por fecha de promesa). Para dudas o consultas, contactar a Gerencia Comercial.</div>
  </div>
  <div style="border-top:3px solid #0A3A8C;text-align:center;padding:12px;font-size:12px;color:#1E5AA8"><b>MDA INMOBILIARIA</b><br><span style="color:#6b7690">www.mdai.cl</span></div>
</div>`;
}

export function informeTexto(r, serie) {
  const L = [];
  L.push(`ASIGNACION Y CUMPLIMIENTO DE METAS - ${etiquetaMes(r.mes).toUpperCase()}`);
  L.push(`Periodo: ${periodoTexto(r.mes)}`);
  L.push("");
  L.push(`Cumplimiento del Jefe de Ventas${r.jefe ? ` (${r.jefe})` : ""}: ${pct1(r.general.cumpl)}`);
  L.push(`Vendidas: ${r.general.vendidas} de ${r.general.unidades} unidades de meta`);
  L.push(`Bono del mes: ${pesos(r.bonoEscala + r.bono100)} (escala: ${r.nivel ? `${r.nivel.unidades} unidades = ${pesos(r.nivel.bono)}` : "sin alcanzar"}; bono 100%: ${r.logro100 ? "logrado" : "no alcanzado"})`);
  L.push("");
  r.bloques.forEach((b) => {
    L.push(b.proyecto);
    b.filas.filter((f) => f.unidades > 0 || f.vendidas > 0).forEach((f) => L.push(`  ${f.tipo}: ${f.vendidas}/${f.unidades} (peso ${pct1(f.peso)}) -> ${pct1(f.cumpl)}`));
    L.push(`  Total: ${b.total.vendidas}/${b.total.unidades} -> ${pct1(b.total.cumpl)}`);
  });
  const evol = (serie || []).filter((x) => x.hayMeta);
  if (evol.length > 1) {
    L.push("");
    L.push("Mes a mes:");
    evol.forEach((x) => L.push(`  ${etiquetaMes(x.mes)}: ${x.general.vendidas}/${x.general.unidades} -> ${pct1(x.general.cumpl)}`));
  }
  return L.join("\n");
}
