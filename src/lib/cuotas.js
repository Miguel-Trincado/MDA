// Cálculos de Cuotas y Pagos (funciones puras, sin pantalla).
//
// Reglas (validadas contra las columnas "Cuotas Pagadas" y "Cuotas Pendientes"
// del propio reporte de Vivet, que coinciden al 100 %):
//  - Cuota PAGADA:      pagado >= monto de la cuota (tolerancia de 0,05 UF).
//  - Cuota PARCIAL:     pagó algo, pero menos que el monto.
//  - Cuota VENCIDA:     sin pago y con fecha de vencimiento anterior a hoy (mora).
//  - Cuota POR VENCER:  sin pago y con vencimiento hoy o después.

export const TIPOS_ORDEN = ["Pie", "Abono Provisión de Gastos", "Pago contra escritura"];
export const TOLERANCIA_UF = 0.05;

export function hoyChile() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

const r3 = (n) => Math.round(n * 1000) / 1000;

export function ordenTipo(t) {
  const i = TIPOS_ORDEN.indexOf(t);
  return i === -1 ? TIPOS_ORDEN.length : i;
}

// Pago contra escritura: se paga en la escritura (el cupón del Aval lo cubre por el mismo
// monto y cualquier diferencia se salda ahí), por lo que nunca cuenta como mora.
export const esContraEscritura = (tipo) => /contra\s*escritura/i.test(String(tipo || ""));

export function estadoDeCuota(f, hoy) {
  const monto = Number(f.montoCuota) || 0;
  const pag = Number(f.montoPagadoUf) || 0;
  if (pag >= monto - TOLERANCIA_UF) return "pagada";
  if (pag > 0) return "parcial";
  if (esContraEscritura(f.tipoFinanciamiento)) return "porVencer";
  return f.fechaVencimiento && f.fechaVencimiento < hoy ? "vencida" : "porVencer";
}

// Una cuota con sus montos ya calculados.
export const claveCuota = (f) => `${f.opp}|${f.tipoFinanciamiento}|${f.nroCuota}`;

// Abono Provisión de Gastos: el reporte trae mal la fecha de vencimiento; cuando la cuota está
// pagada, se pagó el día de la promesa, así que se ubica en ese día (y en ese mes).
export const esAbonoGastos = (tipo) => /abono\s*provisi/i.test(String(tipo || ""));

export function enriquecer(f0, hoy, bonos, cupones) {
  let f = f0;
  if (esAbonoGastos(f0.tipoFinanciamiento) && f0.fechaPromesa && estadoDeCuota(f0, hoy) === "pagada") {
    f = { ...f0, fechaVencimientoReporte: f0.fechaVencimiento, fechaVencimiento: f0.fechaPromesa };
  }
  if (bonos && bonos.has(claveCuota(f))) {
    const monto = Number(f.montoCuota) || 0;
    return { ...f, monto, pagado: 0, estado: "bono", bono: true, pendiente: 0, vencido: 0, porVencer: 0, mes: (f.fechaVencimiento || "").slice(0, 7) };
  }
  const monto = Number(f.montoCuota) || 0;
  const pag = Number(f.montoPagadoUf) || 0;
  const estado = estadoDeCuota(f, hoy);
  const pendiente = estado === "pagada" ? 0 : r3(Math.max(0, monto - pag));
  const venceAntes = !!f.fechaVencimiento && f.fechaVencimiento < hoy && !esContraEscritura(f.tipoFinanciamiento);
  // Pago contra escritura: se cruza con el "Cupon Pago Contra Escritura" del Aval (regalo de la inmobiliaria).
  // El cupón se netea contra la cuota; lo que sobra (diferencia) sí se paga en la escritura.
  const escritura = esContraEscritura(f.tipoFinanciamiento) && estado !== "pagada";
  let cupon = null, neteo = 0, diferencia = 0, sinDato = false;
  if (escritura) {
    const c = cupones ? cupones.get(String(f.opp)) : undefined;
    if (c === undefined || c === null) sinDato = true;
    else {
      cupon = Number(c) || 0;
      neteo = r3(Math.min(cupon, pendiente));
      diferencia = r3(Math.max(0, pendiente - cupon));
      if (diferencia <= TOLERANCIA_UF) diferencia = 0;
    }
  }
  return {
    ...f,
    monto,
    pagado: pag,
    estado,
    escritura,
    cupon, neteo, diferencia, sinDato,
    pendiente,
    vencido: venceAntes ? pendiente : 0, // mora
    porVencer: venceAntes ? 0 : pendiente,
    mes: (f.fechaVencimiento || "").slice(0, 7),
  };
}

function sumarTipo(todas) {
  // Las cuotas marcadas "Bono pie" no se suman: son un bono sin pago para el cliente.
  const cuotas = todas.filter((c) => !c.bono);
  const t = {
    neteo: r3(cuotas.reduce((a, c) => a + (c.neteo || 0), 0)), difEscritura: r3(cuotas.reduce((a, c) => a + (c.diferencia || 0), 0)),
    nDifEscritura: cuotas.filter((c) => c.diferencia > 0).length, nSinCupon: cuotas.filter((c) => c.sinDato).length,
    nBonos: todas.length - cuotas.length, bono: r3(todas.filter((c) => c.bono).reduce((a, c) => a + c.monto, 0)),
    total: 0, pagado: 0, saldo: 0, vencido: 0, porVencer: 0,
    nCuotas: cuotas.length, nPagadas: 0, nParciales: 0, nVencidas: 0, nPorVencer: 0,
  };
  for (const c of cuotas) {
    t.total += c.monto;
    t.pagado += c.estado === "pagada" ? c.monto : c.pagado;
    t.saldo += c.pendiente;
    t.vencido += c.vencido;
    t.porVencer += c.porVencer;
    if (c.estado === "pagada") t.nPagadas++;
    else if (c.estado === "parcial") t.nParciales++;
    else if (c.estado === "vencida") t.nVencidas++;
    else t.nPorVencer++;
  }
  for (const k of ["total", "pagado", "saldo", "vencido", "porVencer"]) t[k] = r3(t[k]);
  return t;
}

// Agrupa las cuotas por cliente (Opp) y, dentro de cada uno, por tipo de financiamiento.
export function armarClientes(filas, hoy, bonos, cupones) {
  const porOpp = new Map();
  for (const f of filas || []) {
    if (!porOpp.has(f.opp)) porOpp.set(f.opp, []);
    porOpp.get(f.opp).push(enriquecer(f, hoy, bonos, cupones));
  }
  const clientes = [];
  for (const [opp, cuotas] of porOpp) {
    const base = cuotas[0];
    const porTipo = new Map();
    for (const c of cuotas) {
      if (!porTipo.has(c.tipoFinanciamiento)) porTipo.set(c.tipoFinanciamiento, []);
      porTipo.get(c.tipoFinanciamiento).push(c);
    }
    const tipos = [...porTipo.entries()]
      .map(([tipo, cs]) => {
        cs.sort((a, b) => a.nroCuota - b.nroCuota);
        const resumen = sumarTipo(cs);
        const montoTotalInformado = Number(cs[0].montoTotal) || 0;
        return {
          tipo,
          cuotas: cs,
          ...resumen,
          montoTotalInformado,
          difiereTotal: montoTotalInformado > 0 && Math.abs(montoTotalInformado - resumen.total) > TOLERANCIA_UF,
        };
      })
      .sort((a, b) => ordenTipo(a.tipo) - ordenTipo(b.tipo) || a.tipo.localeCompare(b.tipo));
    // Pago contra escritura no se suma a lo adeudado: el cupón del Aval lo cubre y la diferencia se paga en la escritura.
    const tot = sumarTipo(cuotas.filter((c) => !esContraEscritura(c.tipoFinanciamiento)));
    clientes.push({
      opp,
      cliente: base.cliente,
      rut: base.rut,
      proyecto: base.proyecto,
      unidad: base.unidad,
      fechaPromesa: base.fechaPromesa,
      precioFinal: base.precioFinal,
      tipos,
      ...tot,
      ...(() => { const e = sumarTipo(cuotas.filter((c) => esContraEscritura(c.tipoFinanciamiento))); return { neteo: e.neteo, difEscritura: e.difEscritura, nDifEscritura: e.nDifEscritura, nSinCupon: e.nSinCupon }; })(),
      avance: tot.total > 0 ? tot.pagado / tot.total : 0,
      situacion: tot.saldo <= TOLERANCIA_UF ? "pagado" : tot.vencido > TOLERANCIA_UF ? "mora" : "aldia",
    });
  }
  return clientes.sort((a, b) => a.cliente.localeCompare(b.cliente, "es"));
}

// Totales generales de una lista de clientes.
export function totalesGenerales(clientes) {
  const t = { clientes: clientes.length, total: 0, pagado: 0, saldo: 0, vencido: 0, porVencer: 0, conMora: 0, neteo: 0, difEscritura: 0, nDifEscritura: 0, nSinCupon: 0, nCuotas: 0, nPagadas: 0, nVencidas: 0, nPorVencer: 0 };
  for (const c of clientes) {
    t.total += c.total;
    t.pagado += c.pagado;
    t.saldo += c.saldo;
    t.vencido += c.vencido;
    t.porVencer += c.porVencer;
    t.nCuotas += c.nCuotas;
    t.nPagadas += c.nPagadas;
    t.nVencidas += c.nVencidas;
    t.nPorVencer += c.nPorVencer;
    t.neteo += c.neteo || 0;
    t.difEscritura += c.difEscritura || 0;
    t.nDifEscritura += c.nDifEscritura || 0;
    t.nSinCupon += c.nSinCupon || 0;
    if (c.situacion === "mora") t.conMora++;
  }
  for (const k of ["total", "pagado", "saldo", "vencido", "porVencer", "neteo", "difEscritura"]) t[k] = r3(t[k]);
  return t;
}

// Resumen por tipo de financiamiento (Pie, Abono Provisión de Gastos, Pago contra escritura, …).
export function resumenPorTipo(clientes) {
  const mapa = new Map();
  for (const c of clientes) {
    for (const t of c.tipos) {
      if (!mapa.has(t.tipo)) mapa.set(t.tipo, { tipo: t.tipo, informativo: false, nBonos: 0, neteo: 0, difEscritura: 0, nDifEscritura: 0, nSinCupon: 0, clientes: 0, total: 0, pagado: 0, saldo: 0, vencido: 0, porVencer: 0, nCuotas: 0, nPagadas: 0, nVencidas: 0, nPorVencer: 0 });
      const m = mapa.get(t.tipo);
      m.clientes++;
      m.informativo = esContraEscritura(t.tipo);
      for (const k of ["total", "pagado", "saldo", "vencido", "porVencer", "nCuotas", "nPagadas", "nVencidas", "nPorVencer", "nBonos", "neteo", "difEscritura", "nDifEscritura", "nSinCupon"]) m[k] += t[k];
    }
  }
  return [...mapa.values()]
    .map((m) => ({ ...m, total: r3(m.total), pagado: r3(m.pagado), saldo: r3(m.saldo), vencido: r3(m.vencido), porVencer: r3(m.porVencer), neteo: r3(m.neteo), difEscritura: r3(m.difEscritura) }))
    .sort((a, b) => ordenTipo(a.tipo) - ordenTipo(b.tipo) || a.tipo.localeCompare(b.tipo));
}

// Por mes de vencimiento: cuánto corresponde cobrar, cuánto está pagado y cuánto falta.
// Si se indica `tipo`, solo cuenta ese tipo de financiamiento.
export function resumenPorMes(clientes, tipo) {
  const mapa = new Map();
  for (const c of clientes) {
    for (const t of c.tipos) {
      if (tipo ? t.tipo !== tipo : esContraEscritura(t.tipo)) continue;
      for (const q of t.cuotas) {
        if (!q.mes || q.bono) continue;
        if (!mapa.has(q.mes)) mapa.set(q.mes, { mes: q.mes, nCuotas: 0, nPagadas: 0, nPendientes: 0, monto: 0, pagado: 0, pendiente: 0, vencido: 0, porVencer: 0, detalle: [] });
        const m = mapa.get(q.mes);
        m.nCuotas++;
        if (q.estado === "pagada") m.nPagadas++;
        else m.nPendientes++;
        m.monto += q.monto;
        m.pagado += q.estado === "pagada" ? q.monto : q.pagado;
        m.pendiente += q.pendiente;
        m.vencido += q.vencido;
        m.porVencer += q.porVencer;
        m.detalle.push({ opp: c.opp, cliente: c.cliente, unidad: c.unidad, ...q });
      }
    }
  }
  return [...mapa.values()]
    .map((m) => ({ ...m, monto: r3(m.monto), pagado: r3(m.pagado), pendiente: r3(m.pendiente), vencido: r3(m.vencido), porVencer: r3(m.porVencer) }))
    .sort((a, b) => a.mes.localeCompare(b.mes));
}
