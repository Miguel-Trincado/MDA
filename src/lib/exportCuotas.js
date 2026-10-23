// Descargas de Cuotas y Pagos: Excel y PDF con totales por mes y por cliente.
import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import { fmtDate } from "./helpers";
import { TIPOS_ORDEN, resumenPorMes, resumenPorTipo, totalesGenerales } from "./cuotas";

const ESTADO = { bono: "Bono pie", pagada: "Pagada", parcial: "Parcial", vencida: "Vencida", porVencer: "Por vencer" };
const SITUACION = { pagado: "Pagado", aldia: "Al día", mora: "Con mora" };
const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const mesTxt = (m) => { const [y, mm] = String(m).split("-"); return `${MESES[Number(mm) - 1] || mm} ${y}`; };
const nf2 = new Intl.NumberFormat("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf0 = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 });
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const slugArchivo = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "");
const fechaArchivo = (hoy) => hoy;
const parcial = (c, tipo) => { const t = c.tipos.find((x) => x.tipo === tipo); return t ? `${t.nPagadas}/${t.nCuotas}` : "—"; };

function filasMes(meses, valorUF) {
  return meses.map((m) => ({
    mes: mesTxt(m.mes), nCuotas: m.nCuotas, nPagadas: m.nPagadas, monto: r2(m.monto), pagado: r2(m.pagado),
    pendiente: r2(m.pendiente), vencido: r2(m.vencido), clp: valorUF ? Math.round(m.pendiente * valorUF) : "",
  }));
}

/* ------------------------------- Excel ------------------------------- */
export function exportarExcel({ clientes, proyecto, hoy, valorUF }) {
  const wb = XLSX.utils.book_new();
  const add = (nombre, filas, anchos) => {
    const ws = XLSX.utils.json_to_sheet(filas);
    ws["!cols"] = anchos.map((w) => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, nombre);
  };

  const meses = resumenPorMes(clientes);
  const hdrMes = (f) => ({
    Mes: f.mes, Cuotas: f.nCuotas, Pagadas: f.nPagadas, "Cuota UF": f.monto, "Pagado UF": f.pagado,
    "Por percibir UF": f.pendiente, "Vencido UF": f.vencido, [`Por percibir $ (UF ${valorUF ? nf2.format(valorUF) : "s/d"})`]: f.clp,
  });
  const tot = (arr, k) => r2(arr.reduce((a, m) => a + m[k], 0));
  const fm = filasMes(meses, valorUF).map(hdrMes);
  fm.push({ Mes: "TOTAL", Cuotas: tot(meses, "nCuotas"), Pagadas: tot(meses, "nPagadas"), "Cuota UF": tot(meses, "monto"), "Pagado UF": tot(meses, "pagado"), "Por percibir UF": tot(meses, "pendiente"), "Vencido UF": tot(meses, "vencido") });
  add("Por mes", fm, [14, 9, 9, 13, 13, 15, 13, 24]);

  const tipos = [...new Set(clientes.flatMap((c) => c.tipos.map((t) => t.tipo)))];
  const fmt = [];
  for (const tipo of tipos) {
    for (const m of resumenPorMes(clientes, tipo)) {
      fmt.push({ Mes: mesTxt(m.mes), Tipo: tipo, Cuotas: m.nCuotas, Pagadas: m.nPagadas, "Cuota UF": r2(m.monto), "Pagado UF": r2(m.pagado), "Por percibir UF": r2(m.pendiente), "Vencido UF": r2(m.vencido) });
    }
  }
  add("Por mes y tipo", fmt, [14, 28, 9, 9, 13, 13, 15, 13]);

  add("Por tipo", resumenPorTipo(clientes).map((t) => ({
    Tipo: t.tipo + (t.informativo ? " (informativo, no se suma)" : ""), Clientes: t.clientes, Cuotas: t.nCuotas, Pagadas: t.nPagadas, Vencidas: t.nVencidas, "Por vencer": t.nPorVencer,
    "Total UF": r2(t.total), "Pagado UF": r2(t.pagado), "Falta UF": r2(t.saldo), "Vencido UF": r2(t.vencido),
  })), [28, 10, 9, 9, 10, 11, 13, 13, 13, 13]);

  add("Por cliente", clientes.map((c) => ({
    Cliente: c.cliente, RUT: c.rut, Opp: c.opp, Proyecto: c.proyecto, Unidad: c.unidad,
    "Cuotas Pie": parcial(c, TIPOS_ORDEN[0]), "Cuotas Abono Gastos": parcial(c, TIPOS_ORDEN[1]), "Cuotas Pago c/escritura": parcial(c, TIPOS_ORDEN[2]),
    "Total UF": r2(c.total), "Pagado UF": r2(c.pagado), "Falta UF": r2(c.saldo), "Vencido UF": r2(c.vencido),
    "Avance %": Math.round(c.avance * 100), Situación: SITUACION[c.situacion],
  })), [34, 13, 8, 22, 10, 11, 18, 22, 12, 12, 12, 12, 9, 11]);

  const det = [];
  for (const c of clientes) {
    for (const t of c.tipos) {
      for (const q of t.cuotas) {
        det.push({
          Proyecto: c.proyecto, Opp: c.opp, Cliente: c.cliente, RUT: c.rut, Unidad: c.unidad, Tipo: t.tipo, "N° cuota": q.nroCuota,
          Vencimiento: fmtDate(q.fechaVencimiento), "Cuota UF": r2(q.monto), "Pagado UF": r2(q.pagado), "Pagado $": Number(q.montoPagadoClp) || 0,
          "Pendiente UF": r2(q.pendiente), Estado: q.escritura ? "A escritura (no se suma)" : ESTADO[q.estado],
        });
      }
    }
  }
  add("Detalle cuotas", det, [22, 8, 34, 13, 10, 28, 9, 13, 11, 11, 13, 12, 11]);

  XLSX.writeFile(wb, `Cuotas_y_Pagos_${slugArchivo(proyecto)}_${fechaArchivo(hoy)}.xlsx`);
}

/* -------------------------------- PDF -------------------------------- */
const AZUL = [37, 99, 235], OSCURO = [19, 35, 74], GRIS = [120, 128, 150];

export function exportarPdf({ clientes, proyecto, hoy, valorUF }) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  const M = 12, RH = 5.6;
  let y = M;

  const clip = (txt, w) => {
    let s = String(txt ?? "");
    if (doc.getTextWidth(s) <= w - 2) return s;
    while (s.length > 1 && doc.getTextWidth(s + "…") > w - 2) s = s.slice(0, -1);
    return s + "…";
  };
  const titulo = (txt) => {
    if (y > H - M - 30) { doc.addPage(); y = M; }
    doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(...OSCURO);
    doc.text(txt, M, y); y += 5;
  };
  const tabla = (cols, filas, { totales } = {}) => {
    const cabecera = () => {
      doc.setFillColor(...AZUL); doc.rect(M, y, cols.reduce((a, c) => a + c.w, 0), RH, "F");
      doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(255, 255, 255);
      let x = M;
      for (const c of cols) { c.right ? doc.text(c.h, x + c.w - 1.5, y + 3.9, { align: "right" }) : doc.text(c.h, x + 1.5, y + 3.9); x += c.w; }
      y += RH;
    };
    cabecera();
    const todas = totales ? [...filas, { ...totales, _tot: true }] : filas;
    todas.forEach((f, i) => {
      if (y > H - M - RH) { doc.addPage(); y = M; cabecera(); }
      if (f._tot) { doc.setFillColor(231, 236, 248); doc.rect(M, y, cols.reduce((a, c) => a + c.w, 0), RH, "F"); }
      else if (i % 2) { doc.setFillColor(247, 249, 253); doc.rect(M, y, cols.reduce((a, c) => a + c.w, 0), RH, "F"); }
      doc.setFont("helvetica", f._tot ? "bold" : "normal"); doc.setFontSize(7.5);
      let x = M;
      for (const c of cols) {
        const v = f[c.k] ?? "";
        const col = c.color ? c.color(f) : OSCURO;
        doc.setTextColor(...col);
        c.right ? doc.text(String(v), x + c.w - 1.5, y + 3.9, { align: "right" }) : doc.text(clip(v, c.w), x + 1.5, y + 3.9);
        x += c.w;
      }
      y += RH;
    });
    y += 5;
  };

  // Encabezado
  doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.setTextColor(...OSCURO);
  doc.text("Cuotas y Pagos", M, y + 4); 
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...GRIS);
  doc.text(`${proyecto} · Clientes promesados · Al ${fmtDate(hoy)}${valorUF ? ` · UF $${nf2.format(valorUF)}` : ""}`, M, y + 9.5);
  y += 15;

  const g = totalesGenerales(clientes);
  const kpis = [
    ["Clientes", String(g.clientes)], ["Total a cobrar", `${nf0.format(g.total)} UF`], ["Pagado", `${nf0.format(g.pagado)} UF`],
    ["Falta por pagar", `${nf0.format(g.saldo)} UF`], ["Vencido (mora)", `${nf0.format(g.vencido)} UF`], ["Clientes con mora", String(g.conMora)],
  ];
  const kw = (W - 2 * M) / kpis.length;
  kpis.forEach(([l, v], i) => {
    const x = M + i * kw;
    doc.setFillColor(243, 246, 253); doc.roundedRect(x, y, kw - 3, 14, 2, 2, "F");
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...GRIS); doc.text(l, x + 3, y + 5);
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...OSCURO); doc.text(v, x + 3, y + 11);
  });
  y += 20;

  // Por tipo
  titulo("Resumen por tipo de financiamiento");
  const porTipo = resumenPorTipo(clientes).map((t) => ({
    tipo: t.tipo + (t.informativo ? " (informativo)" : ""), cli: String(t.clientes), cuo: String(t.nCuotas), pag: String(t.nPagadas), ven: String(t.nVencidas), pv: String(t.nPorVencer),
    tot: nf2.format(t.total), pgd: nf2.format(t.pagado), fal: nf2.format(t.saldo), mor: nf2.format(t.vencido),
  }));
  tabla([
    { h: "Tipo", k: "tipo", w: 60 }, { h: "Clientes", k: "cli", w: 22, right: true }, { h: "Cuotas", k: "cuo", w: 22, right: true },
    { h: "Pagadas", k: "pag", w: 22, right: true }, { h: "Vencidas", k: "ven", w: 22, right: true }, { h: "Por vencer", k: "pv", w: 24, right: true },
    { h: "Total UF", k: "tot", w: 27, right: true }, { h: "Pagado UF", k: "pgd", w: 27, right: true }, { h: "Falta UF", k: "fal", w: 27, right: true }, { h: "Vencido UF", k: "mor", w: 27, right: true },
  ], porTipo);

  // Por mes
  titulo("Cuánto se debe percibir por mes");
  const meses = resumenPorMes(clientes);
  const sum = (k) => meses.reduce((a, m) => a + m[k], 0);
  const colsMes = [
    { h: "Mes", k: "mes", w: 34 }, { h: "Cuotas", k: "n", w: 24, right: true }, { h: "Pagadas", k: "p", w: 24, right: true },
    { h: "Cuota UF", k: "m", w: 32, right: true }, { h: "Pagado UF", k: "pg", w: 32, right: true }, { h: "Por percibir UF", k: "pe", w: 36, right: true },
    { h: "Vencido UF", k: "v", w: 32, right: true, color: (f) => (f.v && f.v !== "—" && f.v !== "0,00" ? [200, 40, 60] : OSCURO) },
    { h: "Por percibir $ aprox.", k: "clp", w: 40, right: true },
  ];
  const f$ = (n) => (valorUF ? `$ ${nf0.format(Math.round(n * valorUF))}` : "—");
  tabla(colsMes, meses.map((m) => ({ mes: mesTxt(m.mes), n: String(m.nCuotas), p: String(m.nPagadas), m: nf2.format(m.monto), pg: nf2.format(m.pagado), pe: nf2.format(m.pendiente), v: m.vencido > 0.05 ? nf2.format(m.vencido) : "—", clp: f$(m.pendiente) })),
    { totales: { mes: "TOTAL", n: String(sum("nCuotas")), p: String(sum("nPagadas")), m: nf2.format(sum("monto")), pg: nf2.format(sum("pagado")), pe: nf2.format(sum("pendiente")), v: nf2.format(sum("vencido")), clp: f$(sum("pendiente")) } });

  // Por cliente
  doc.addPage(); y = M;
  titulo("Totales por cliente");
  const tot = (k) => clientes.reduce((a, c) => a + c[k], 0);
  tabla([
    { h: "Cliente", k: "cli", w: 62 }, { h: "Unidad", k: "uni", w: 20 },
    { h: "Pie", k: "pie", w: 15, right: true }, { h: "Abono gastos", k: "abo", w: 22, right: true }, { h: "P. c/escritura", k: "esc", w: 22, right: true },
    { h: "Total UF", k: "tot", w: 26, right: true }, { h: "Pagado UF", k: "pag", w: 26, right: true }, { h: "Falta UF", k: "fal", w: 26, right: true },
    { h: "Vencido UF", k: "ven", w: 24, right: true, color: (f) => (f.ven && f.ven !== "—" ? [200, 40, 60] : OSCURO) },
    { h: "Avance", k: "av", w: 14, right: true }, { h: "Situación", k: "sit", w: 20 },
  ], clientes.map((c) => ({
    cli: c.cliente, uni: c.unidad, pie: parcial(c, TIPOS_ORDEN[0]), abo: parcial(c, TIPOS_ORDEN[1]), esc: parcial(c, TIPOS_ORDEN[2]),
    tot: nf2.format(c.total), pag: nf2.format(c.pagado), fal: nf2.format(c.saldo), ven: c.vencido > 0.05 ? nf2.format(c.vencido) : "—",
    av: `${Math.round(c.avance * 100)}%`, sit: SITUACION[c.situacion],
  })), { totales: { cli: `TOTAL (${clientes.length} clientes)`, tot: nf2.format(tot("total")), pag: nf2.format(tot("pagado")), fal: nf2.format(tot("saldo")), ven: nf2.format(tot("vencido")) } });
  doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(...GRIS);
  doc.text("Pie / Abono / P. c/escritura: cuotas pagadas / cuotas pactadas. Pago contra escritura es informativo: no se suma a lo adeudado ni a la mora.", M, y);

  const paginas = doc.getNumberOfPages();
  for (let p = 1; p <= paginas; p++) {
    doc.setPage(p); doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(...GRIS);
    doc.text(`Página ${p} de ${paginas}`, W - M, H - 5, { align: "right" });
  }
  doc.save(`Cuotas_y_Pagos_${slugArchivo(proyecto)}_${fechaArchivo(hoy)}.pdf`);
}
