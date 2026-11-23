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
const F = "font-family:'Segoe UI',Arial,Helvetica,sans-serif;";
const col = (p) => (p >= 100 ? "#12B886" : p >= 60 ? "#F59F00" : "#E8590C");

function anillo(valor, color, size = 150) {
  const r = 58, c = 2 * Math.PI * r, v = Math.min(Math.max(valor, 0), 100);
  return `<svg width="${size}" height="${size}" viewBox="0 0 140 140"><circle cx="70" cy="70" r="${r}" fill="none" stroke="rgba(255,255,255,.14)" stroke-width="12"/><circle cx="70" cy="70" r="${r}" fill="none" stroke="${color}" stroke-width="12" stroke-linecap="round" stroke-dasharray="${(c * v) / 100} ${c}" transform="rotate(-90 70 70)"/></svg>`;
}
const tile = (v, l, c = "#0B1F4A") => `<div style="background:#fff;border:1px solid #E6ECF7;border-radius:14px;padding:14px 16px"><div style="font-size:22px;font-weight:700;color:${c};line-height:1;white-space:nowrap">${v}</div><div style="font-size:10.5px;letter-spacing:.06em;color:#6B7A99;margin-top:6px;font-weight:600;white-space:nowrap">${l}</div></div>`;
const seccion = (t) => `<div style="display:flex;align-items:center;gap:12px;margin:26px 0 12px"><div style="width:4px;height:18px;border-radius:2px;background:linear-gradient(#1E5AA8,#38BDF8)"></div><div style="font-size:13px;letter-spacing:.12em;font-weight:700;color:#0B1F4A">${t}</div></div>`;

export function informeHtml(r, serie, modo = "cumplimiento") {
  const asig = modo === "asignacion";
  const g = r.general;
  const c = col(g.cumpl);
  const hero = asig
    ? `<div style="flex:0 0 190px;text-align:center"><div style="font-size:11px;letter-spacing:.14em;color:#7DD3FC;font-weight:700">META COMERCIAL</div><div style="font-size:72px;font-weight:800;color:#fff;line-height:1.05;margin-top:4px">${g.unidades}</div><div style="font-size:12px;color:rgba(255,255,255,.75)">unidades en el período</div></div>`
    : `<div style="flex:0 0 150px;position:relative;height:150px;width:150px;margin:0 10px"><div style="position:absolute;inset:0">${anillo(g.cumpl, c)}</div><div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center"><div style="font-size:34px;font-weight:800;color:#fff;line-height:1">${pct1(g.cumpl)}</div><div style="font-size:9px;letter-spacing:.06em;color:rgba(255,255,255,.7);margin-top:5px">CUMPLIDO</div></div></div>`;
  const stats = asig
    ? [[r.bloques.length, "PROYECTOS"], [r.principales, "UNID. PRINCIPALES"], [r.secundarias, "UNID. SECUNDARIAS"]]
    : [[g.vendidas, "VENDIDAS"], [g.unidades, "META (UNID.)"], [pesos(r.bonoEscala + r.bono100), "BONO GANADO"]];
  const proyectos = r.bloques.map((b, i) => {
    const filas = b.filas.filter((f) => f.unidades > 0 || f.peso > 0 || (!asig && f.vendidas > 0));
    const acc = ["#1E5AA8", "#0EA5A4", "#7C5CFC"][i % 3];
    return `<div style="background:#fff;border:1px solid #E6ECF7;border-radius:16px;overflow:hidden;margin-bottom:14px">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 18px;background:linear-gradient(90deg,#F4F7FE,#fff);border-bottom:1px solid #EEF2FA">
        <div style="display:flex;align-items:center;gap:10px"><div style="width:10px;height:10px;border-radius:50%;background:${acc}"></div><div style="font-size:14px;font-weight:700;color:#0B1F4A;letter-spacing:.03em">${esc(b.proyecto)}</div></div>
        <div style="font-size:12px;font-weight:700;color:${asig ? "#1E5AA8" : col(b.total.cumpl)};background:${asig ? "#E8F0FE" : "#F1F5FB"};border-radius:999px;padding:5px 12px">${asig ? `${b.total.unidades} unidades` : `${pct1(b.total.cumpl)} cumplido`}</div>
      </div>
      <div style="padding:6px 18px 10px">
        ${filas.map((f) => {
          const pc = f.unidades > 0 ? Math.min((f.vendidas / f.unidades) * 100, 100) : 0;
          return `<div style="display:flex;align-items:center;gap:14px;padding:11px 0;border-bottom:1px solid #F1F4FA">
            <div style="flex:1.2;font-size:13.5px;color:#25324F;font-weight:600">${esc(f.tipo)}</div>
            ${asig
              ? `<div style="width:90px;text-align:center"><div style="font-size:18px;font-weight:700;color:#0B1F4A">${f.unidades}</div><div style="font-size:9.5px;letter-spacing:.08em;color:#8A97B2">UNIDADES</div></div>
                 <div style="width:150px;text-align:right"><span style="white-space:nowrap;display:inline-block;font-size:12px;font-weight:700;border-radius:999px;padding:5px 12px;${f.peso > 0 ? "background:#E3F7EE;color:#0B8F63" : "background:#F1F4FA;color:#8A97B2"}">${pct1(f.peso)} ponderación</span></div>`
              : `<div style="flex:1.4"><div style="height:8px;border-radius:99px;background:#EDF1F9;overflow:hidden"><div style="height:8px;border-radius:99px;width:${pc}%;background:${f.peso > 0 ? col(pc) : "#B8C2D9"}"></div></div><div style="font-size:11px;color:#6B7A99;margin-top:5px">${f.vendidas} de ${f.unidades} vendidas · peso ${pct1(f.peso)}</div></div>
                 <div style="width:70px;text-align:right;font-size:17px;font-weight:800;color:${f.peso > 0 ? col(pc) : "#9AA6BE"}">${pct1(f.cumpl)}</div>`}
          </div>`;
        }).join("")}
      </div></div>`;
  }).join("");
  const tramos = r.escala.map((e) => {
    const ok = !asig && r.vendidasPrincipales >= e.unidades;
    return `<div style="flex:1;min-width:130px;border-radius:14px;padding:14px;text-align:center;${ok ? "background:#12B886;color:#fff" : "background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.18);color:#fff"}"><div style="font-size:11px;letter-spacing:.08em;opacity:.85">${e.unidades} UNIDADES</div><div style="font-size:20px;font-weight:800;margin-top:4px">${pesos(e.bono)}</div>${ok ? '<div style="font-size:10px;margin-top:3px">✓ ALCANZADO</div>' : ""}</div>`;
  }).join("");
  const evol = (serie || []).filter((x) => x.hayMeta);
  const grafico = !asig && evol.length > 1 ? `${seccion("EVOLUCIÓN MES A MES")}<div style="background:#fff;border:1px solid #E6ECF7;border-radius:16px;padding:18px"><div style="display:flex;align-items:flex-end;gap:10px;height:120px;border-bottom:1px solid #E6ECF7">${evol.map((x) => `<div style="flex:1;text-align:center"><div style="font-size:11px;font-weight:700;color:${col(x.general.cumpl)};margin-bottom:4px">${pct1(x.general.cumpl)}</div><div style="margin:0 auto;width:70%;height:${Math.max(4, Math.min(x.general.cumpl, 120) * 0.8)}px;border-radius:8px 8px 0 0;background:${x.mes === r.mes ? "linear-gradient(#1E5AA8,#38BDF8)" : col(x.general.cumpl)};opacity:${x.mes === r.mes ? 1 : 0.55}"></div></div>`).join("")}</div><div style="display:flex;gap:10px;margin-top:6px">${evol.map((x) => `<div style="flex:1;text-align:center;font-size:11px;color:#6B7A99">${x.etiqueta}</div>`).join("")}</div></div>` : "";
  return `<div style="${F}width:760px;background:#F6F8FD;color:#13234A">
  <div style="background:linear-gradient(120deg,#0A1633 0%,#0B2A66 60%,#1E5AA8 100%);padding:22px 30px;display:flex;align-items:center;justify-content:space-between">
    <div><div style="font-size:26px;font-weight:800;color:#fff;letter-spacing:.04em;line-height:1">MDA</div><div style="font-size:9.5px;letter-spacing:.42em;color:rgba(255,255,255,.7);margin-top:4px">INMOBILIARIA</div></div>
    <div style="font-size:12px;color:#fff;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.25);border-radius:999px;padding:7px 16px;font-weight:600">${esc(etiquetaMes(r.mes))}</div>
  </div>
  <div style="padding:30px 30px 26px">
    <div style="font-size:11px;letter-spacing:.2em;color:#1E5AA8;font-weight:700">REPORTE COMERCIAL</div>
    <div style="font-size:32px;font-weight:800;color:#0B1F4A;line-height:1.1;margin-top:6px">${asig ? "Asignación de metas" : "Cumplimiento de metas"}</div>
    <div style="font-size:13px;color:#5B6B8C;margin-top:8px">Período ${esc(periodoTexto(r.mes))}${r.jefe ? ` &nbsp;·&nbsp; Jefe de Ventas: <b style="color:#13234A">${esc(r.jefe)}</b>` : ""}</div>

    <div style="display:flex;align-items:center;gap:22px;margin-top:22px;padding:24px 26px;border-radius:20px;background:linear-gradient(135deg,#0A1633,#0B2A66 70%,#143F8C)">
      ${hero}
      <div style="flex:1;display:grid;grid-template-columns:repeat(3,1fr);gap:10px">${stats.map(([v, l]) => tile(v, l)).join("")}</div>
    </div>

    ${seccion("METAS POR PROYECTO")}
    ${proyectos}

    ${seccion("BONO DEL MES")}
    <div style="border-radius:18px;padding:20px;background:linear-gradient(135deg,#0A1633,#0B2A66)">
      <div style="display:flex;gap:10px;flex-wrap:wrap">${tramos}
        <div style="flex:1;min-width:130px;border-radius:14px;padding:14px;text-align:center;${!asig && r.logro100 ? "background:#12B886" : "background:linear-gradient(135deg,#F59F00,#FFD43B)"};color:${!asig && r.logro100 ? "#fff" : "#3B2A00"}"><div style="font-size:11px;letter-spacing:.08em;font-weight:700">BONO 100%</div><div style="font-size:20px;font-weight:800;margin-top:4px">${pesos(r.bono100Valor)}</div>${!asig && r.logro100 ? '<div style="font-size:10px;margin-top:3px">✓ LOGRADO</div>' : ""}</div>
      </div>
      ${asig ? "" : `<div style="font-size:12px;color:rgba(255,255,255,.75);margin-top:12px">Unidades principales vendidas: <b style="color:#fff">${r.vendidasPrincipales}</b> &nbsp;·&nbsp; Bono por escala: <b style="color:#fff">${pesos(r.bonoEscala)}</b></div>`}
    </div>
    ${grafico}
    <div style="margin-top:22px;border-radius:14px;background:#EAF1FF;border:1px solid #D5E3FA;padding:14px 18px;font-size:12px;line-height:1.5;color:#44506B"><b style="color:#0B2A66">IMPORTANTE</b><br>${asig ? "Las metas y ponderaciones indicadas rigen para el período señalado. El cumplimiento se informará al cierre del período." : "Cumplimiento = vendidas ÷ unidades × ponderación. Vendidas = promesas del mes (estado Promesada o Escriturada, por fecha de promesa)."} Para dudas o consultas, contactar a Gerencia Comercial.</div>
  </div>
  <div style="background:#0A1633;text-align:center;padding:14px;font-size:12px;color:rgba(255,255,255,.8)"><b style="color:#fff">MDA INMOBILIARIA</b> &nbsp;·&nbsp; www.mdai.cl</div>
</div>`;
}

export function informeTexto(r, serie, modo = "cumplimiento") {
  if (modo === "asignacion") {
    const L = [`ASIGNACION DE METAS - ${etiquetaMes(r.mes).toUpperCase()}`, `Periodo: ${periodoTexto(r.mes)}`, ""];
    if (r.jefe) L.push(`Jefe de Ventas: ${r.jefe}`);
    r.bloques.forEach((b) => { L.push(b.proyecto); b.filas.filter((f) => f.unidades > 0 || f.peso > 0).forEach((f) => L.push(`  ${f.tipo}: ${f.unidades} unidades (ponderacion ${pct1(f.peso)})`)); L.push(`  Total: ${b.total.unidades} unidades`); });
    if (r.escala.length) L.push("", "Escala de bonos: " + r.escala.map((e) => `${e.unidades} unidades ${pesos(e.bono)}`).join(" · "));
    if (r.bono100Valor) L.push(`Bono por el 100% del cumplimiento: ${pesos(r.bono100Valor)}`);
    return L.join("\n");
  }
  const L = [];
  L.push(`CUMPLIMIENTO DE METAS - ${etiquetaMes(r.mes).toUpperCase()}`);
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
