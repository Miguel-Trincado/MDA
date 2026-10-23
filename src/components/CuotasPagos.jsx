import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Wallet, Users, CalendarClock, AlertTriangle, ArrowLeft, Search, RefreshCw, ChevronDown, ChevronRight,
  Banknote, PiggyBank, HandCoins, CircleDollarSign, FileSpreadsheet, FileText,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { MESES_ES } from "../lib/constants";
import { fmtDate, fmtDateTime, esProyectoPilpilen, normalizarBusqueda } from "../lib/helpers";
import { fetchCuotasPago, fetchBonosPie, marcarBonoPieRemote, fetchCuponesPce } from "../lib/db";
import { esProyectoExcluido } from "../lib/parseCuotas";
import { exportarExcel, exportarPdf } from "../lib/exportCuotas";
import { useValorUFHoy } from "../lib/uf";
import { armarClientes, totalesGenerales, resumenPorTipo, resumenPorMes, hoyChile, TIPOS_ORDEN, esContraEscritura } from "../lib/cuotas";
import { KpiCard, PageHeader, PAGE_CLASS, Panel, CardTitle } from "./Shared";

/* ----------------------------- formatos ----------------------------- */
const nf2 = new Intl.NumberFormat("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf0 = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 });
const fmtUF = (n) => nf2.format(Number(n) || 0);
const fmtUF0 = (n) => `${nf0.format(Number(n) || 0)} UF`;
const fmtCLP = (n) => `$ ${nf0.format(Math.round(Number(n) || 0))}`;
const fmtPct = (x) => `${Math.round((Number(x) || 0) * 100)}%`;
const TODOS = "__todos__";
const Fila = ({ children }) => <div className="grid-60 gap-5">{children}</div>;

function fmtRut(r) {
  const s = String(r || "").replace(/[^0-9kK]/g, "");
  if (s.length < 2) return s;
  return `${s.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, ".")}-${s.slice(-1).toUpperCase()}`;
}
function fmtMes(m, corto) {
  const [y, mm] = String(m).split("-");
  if (!y || !mm) return m;
  return corto ? `${MESES_ES[Number(mm) - 1]} ${y.slice(2)}` : `${MESES_ES[Number(mm) - 1]} ${y}`;
}
const ICONO_TIPO = { Pie: PiggyBank, "Abono Provisión de Gastos": HandCoins, "Pago contra escritura": Banknote };

/* --------------------------- piezas chicas --------------------------- */
const CHIPS = {
  pagada: ["Pagada", "bg-emerald-50 text-emerald-700"],
  parcial: ["Parcial", "bg-amber-50 text-amber-700"],
  vencida: ["Vencida", "bg-rose-50 text-rose-700"],
  porVencer: ["Por vencer", "bg-sky-50 text-sky-700"],
  bono: ["Bono pie", "bg-violet-50 text-violet-700"],
  neteada: ["Neteada con cupón", "bg-violet-50 text-violet-700"],
  difEscritura: ["Paga diferencia en escritura", "bg-amber-50 text-amber-700"],
  sinCupon: ["Sin dato de cupón", "bg-stone-100 text-stone-600"],
};
const estadoVisible = (q) => (q.escritura ? (q.sinDato ? "sinCupon" : q.diferencia > 0 ? "difEscritura" : "neteada") : q.estado);
function ChipCuota({ estado }) {
  const [txt, cls] = CHIPS[estado] || CHIPS.porVencer;
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap ${cls}`}>{txt}</span>;
}

function Barra({ pct, className = "" }) {
  const p = Math.max(0, Math.min(1, pct || 0));
  return (
    <span className={`block h-2 rounded-full bg-stone-100 overflow-hidden ${className}`}>
      <span className="block h-full rounded-full bg-[#14B8A6]" style={{ width: `${p * 100}%` }} />
    </span>
  );
}

function Interruptor({ opciones, valor, onChange }) {
  return (
    <span className="flex rounded-lg border border-stone-200 overflow-hidden text-xs shrink-0">
      {opciones.map(([k, l]) => (
        <button
          key={k}
          onClick={() => onChange(k)}
          className={`px-3.5 py-1.5 font-medium transition-colors ${valor === k ? "bg-[#2563EB] text-white" : "bg-white text-stone-600 hover:bg-stone-50"}`}
        >
          {l}
        </button>
      ))}
    </span>
  );
}

const TH = "text-left font-medium text-stone-400 text-xs px-3 py-2 whitespace-nowrap";
const THR = "text-right font-medium text-stone-400 text-xs px-3 py-2 whitespace-nowrap";
const TD = "px-3 py-2 text-sm text-[#13234A] whitespace-nowrap";
const TDR = "px-3 py-2 text-sm text-[#13234A] text-right tabular-nums whitespace-nowrap";

/* ============================ TOTALES ============================ */
export function Totales({ clientes, hoy }) {
  const { valorUF } = useValorUFHoy();
  const [tipoSel, setTipoSel] = useState("");
  const [rango, setRango] = useState("todos");
  const [mesAbierto, setMesAbierto] = useState("");
  const mesActual = hoy.slice(0, 7);

  const porTipo = useMemo(() => resumenPorTipo(clientes), [clientes]);
  const k = useMemo(() => (tipoSel ? porTipo.find((t) => t.tipo === tipoSel) || totalesGenerales([]) : totalesGenerales(clientes)), [tipoSel, porTipo, clientes]);
  const mesesTodos = useMemo(() => resumenPorMes(clientes, tipoSel || undefined), [clientes, tipoSel]);
  const meses = useMemo(() => (rango === "desde" ? mesesTodos.filter((m) => m.mes >= mesActual) : mesesTodos), [mesesTodos, rango, mesActual]);
  const esteMes = mesesTodos.find((m) => m.mes === mesActual);
  const avance = k.total > 0 ? k.pagado / k.total : 0;
  const datosGrafico = meses.map((m) => ({ mes: fmtMes(m.mes, true), Pagado: m.pagado, Vencido: m.vencido, "Por vencer": m.porVencer }));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-stone-400 mr-1">Tipo de financiamiento:</span>
        {[["", "Todos"], ...porTipo.map((t) => [t.tipo, t.tipo])].map(([v, l]) => (
          <button
            key={v || "todos"}
            onClick={() => setTipoSel(v)}
            className={`rounded-full border px-3.5 py-1 text-xs font-medium transition-colors ${tipoSel === v ? "bg-[#2563EB] border-[#2563EB] text-white" : "bg-white border-stone-200 text-stone-600 hover:bg-stone-50"}`}
          >
            {l}
          </button>
        ))}
      </div>

      <div className="grid-60 gap-4">
        <KpiCard bid="cuo-kpi1" orden={0} tone="blue" icon={Users} label="Clientes promesados" value={String(k.clientes)} sub={`${nf0.format(k.nCuotas)} cuotas en total`} />
        <KpiCard bid="cuo-kpi2" orden={1} tone="purple" icon={CircleDollarSign} label="Total a cobrar" value={fmtUF0(k.total)} sub={valorUF ? `≈ ${fmtCLP(k.total * valorUF)}` : "en UF"} />
        <KpiCard bid="cuo-kpi3" orden={2} tone="green" icon={Wallet} label="Pagado" value={fmtUF0(k.pagado)} sub={`${fmtPct(avance)} pagado`} />
        <KpiCard bid="cuo-kpi4" orden={3} tone="amber" icon={CalendarClock} label="Falta por pagar" value={fmtUF0(k.saldo)} sub={valorUF ? `≈ ${fmtCLP(k.saldo * valorUF)}` : "en UF"} />
        <KpiCard bid="cuo-kpi5" orden={4} tone="pink" icon={AlertTriangle} label="Vencido sin pagar" value={fmtUF0(k.vencido)} sub={`${nf0.format(k.nVencidas)} cuotas vencidas`} />
        <KpiCard bid="cuo-kpi7" orden={6} tone="purple" icon={Banknote} label="Dif. a pagar en escritura" value={fmtUF0(k.difEscritura)} sub={`${nf0.format(k.nDifEscritura)} cuota(s) · cupón neteado ${fmtUF0(k.neteo)}${k.nSinCupon ? ` · ${k.nSinCupon} sin dato` : ""}`} />
        <KpiCard bid="cuo-kpi6" orden={5} tone="blue" icon={CalendarClock} label={`Por percibir ${fmtMes(mesActual)}`} value={fmtUF0(esteMes?.pendiente || 0)} sub={valorUF ? `≈ ${fmtCLP((esteMes?.pendiente || 0) * valorUF)}` : "cuotas del mes"} />
      </div>

      <Fila><Panel bid="cuo-tipos" grupo="cuo-f1" orden={0} span={60}>
        <CardTitle icon={Wallet}>Resumen por tipo de financiamiento</CardTitle>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className={TH}>Tipo</th><th className={THR}>Clientes</th><th className={THR}>Cuotas</th><th className={THR}>Pagadas</th>
                <th className={THR}>Vencidas</th><th className={THR}>Por vencer</th><th className={THR}>Total UF</th><th className={THR}>Pagado UF</th>
                <th className={THR}>Falta UF</th><th className={`${TH} w-[140px]`}>Avance</th>
              </tr>
            </thead>
            <tbody>
              {porTipo.map((t) => (
                <tr key={t.tipo} onClick={() => setTipoSel(tipoSel === t.tipo ? "" : t.tipo)} className={`border-t border-stone-100 cursor-pointer hover:bg-sky-50/50 ${tipoSel === t.tipo ? "bg-sky-50" : ""}`}>
                  <td className={`${TD} font-medium`}>{t.tipo}{t.informativo && <span className="ml-2 text-[10px] rounded-full bg-stone-100 text-stone-500 px-2 py-0.5 font-normal">no se suma a lo adeudado</span>}</td>
                  <td className={TDR}>{t.clientes}</td><td className={TDR}>{t.nCuotas}</td><td className={TDR}>{t.nPagadas}</td>
                  <td className={`${TDR} ${t.nVencidas ? "text-rose-600 font-semibold" : ""}`}>{t.nVencidas}</td><td className={TDR}>{t.nPorVencer}</td>
                  <td className={TDR}>{fmtUF(t.total)}</td><td className={TDR}>{fmtUF(t.pagado)}</td><td className={TDR}>{fmtUF(t.saldo)}</td>
                  <td className={TD}><span className="flex items-center gap-2"><Barra pct={t.total ? t.pagado / t.total : 0} className="flex-1" /><span className="text-xs text-stone-500 w-9 text-right">{fmtPct(t.total ? t.pagado / t.total : 0)}</span></span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-stone-400 mt-2">Haz clic en un tipo para filtrar todo lo de abajo. Pago contra escritura es informativo: no entra en los totales generales ni en lo que se debe percibir.</p>
      </Panel></Fila>

      <Fila><Panel bid="cuo-meses" grupo="cuo-f2" orden={0} span={60}>
        <CardTitle icon={CalendarClock} right={<Interruptor opciones={[["todos", "Todos los meses"], ["desde", "Desde este mes"]]} valor={rango} onChange={setRango} />}>
          Cuánto se debe percibir por mes
        </CardTitle>
        <p className="text-xs text-stone-400 -mt-2 mb-3">
          Por mes de vencimiento de cada cuota: lo pagado, lo vencido que sigue impago y lo que aún está por vencer
          {tipoSel ? ` (solo ${tipoSel})` : ""}.
        </p>
        {meses.length === 0 ? (
          <p className="text-sm text-stone-400 py-6 text-center">No hay cuotas en este rango.</p>
        ) : (
          <>
            <div className="h-[280px] mb-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={datosGrafico} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E9F2" vertical={false} />
                  <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "#7B8499" }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 11, fill: "#7B8499" }} tickFormatter={(v) => nf0.format(v)} width={52} />
                  <Tooltip formatter={(v) => `${fmtUF(v)} UF`} cursor={{ fill: "#F3F6FD" }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Pagado" stackId="a" fill="#14B8A6" />
                  <Bar dataKey="Vencido" stackId="a" fill="#EF4444" />
                  <Bar dataKey="Por vencer" stackId="a" fill="#2563EB" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className={`${TH} w-6`} /><th className={TH}>Mes</th><th className={THR}>Cuotas</th><th className={THR}>Pagadas</th>
                    <th className={THR}>Cuota UF</th><th className={THR}>Pagado UF</th><th className={THR}>Por percibir UF</th>
                    <th className={THR}>De ello vencido</th><th className={THR} title="Por percibir × UF de hoy">Por percibir ≈ $</th>
                  </tr>
                </thead>
                <tbody>
                  {meses.map((m) => {
                    const abierto = mesAbierto === m.mes;
                    const actual = m.mes === mesActual;
                    return (
                      <FilaMes key={m.mes} m={m} abierto={abierto} actual={actual} valorUF={valorUF} onToggle={() => setMesAbierto(abierto ? "" : m.mes)} />
                    );
                  })}
                  <tr className="border-t-2 border-stone-200 font-semibold">
                    <td /><td className={TD}>Total</td>
                    <td className={TDR}>{meses.reduce((a, m) => a + m.nCuotas, 0)}</td><td className={TDR}>{meses.reduce((a, m) => a + m.nPagadas, 0)}</td>
                    <td className={TDR}>{fmtUF(meses.reduce((a, m) => a + m.monto, 0))}</td><td className={TDR}>{fmtUF(meses.reduce((a, m) => a + m.pagado, 0))}</td>
                    <td className={TDR}>{fmtUF(meses.reduce((a, m) => a + m.pendiente, 0))}</td><td className={TDR}>{fmtUF(meses.reduce((a, m) => a + m.vencido, 0))}</td>
                    <td className={TDR}>{valorUF ? fmtCLP(meses.reduce((a, m) => a + m.pendiente, 0) * valorUF) : "—"}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-stone-400 mt-2">Haz clic en un mes para ver qué cliente paga cada cuota. El monto en pesos es una estimación con la UF de hoy.</p>
          </>
        )}
      </Panel></Fila>
    </div>
  );
}

function FilaMes({ m, abierto, actual, valorUF, onToggle }) {
  return (
    <>
      <tr onClick={onToggle} className={`border-t border-stone-100 cursor-pointer hover:bg-sky-50/50 ${actual ? "bg-sky-50" : ""}`}>
        <td className="pl-3">{abierto ? <ChevronDown size={14} className="text-stone-400" /> : <ChevronRight size={14} className="text-stone-400" />}</td>
        <td className={`${TD} font-medium`}>{fmtMes(m.mes)}{actual && <span className="ml-2 text-[10px] rounded-full bg-[#2563EB] text-white px-2 py-0.5">este mes</span>}</td>
        <td className={TDR}>{m.nCuotas}</td><td className={TDR}>{m.nPagadas}</td>
        <td className={TDR}>{fmtUF(m.monto)}</td><td className={TDR}>{fmtUF(m.pagado)}</td>
        <td className={`${TDR} font-semibold`}>{fmtUF(m.pendiente)}</td>
        <td className={`${TDR} ${m.vencido > 0.05 ? "text-rose-600 font-semibold" : "text-stone-300"}`}>{m.vencido > 0.05 ? fmtUF(m.vencido) : "—"}</td>
        <td className={TDR}>{valorUF ? fmtCLP(m.pendiente * valorUF) : "—"}</td>
      </tr>
      {abierto && (
        <tr className="bg-stone-50/60">
          <td />
          <td colSpan={8} className="px-3 pb-3 pt-1">
            <table className="w-full">
              <thead>
                <tr><th className={TH}>Cliente</th><th className={TH}>Unidad</th><th className={TH}>Tipo</th><th className={THR}>Cuota N°</th><th className={TH}>Vence</th><th className={THR}>Monto UF</th><th className={THR}>Pagado UF</th><th className={THR}>Pendiente UF</th><th className={TH}>Estado</th></tr>
              </thead>
              <tbody>
                {[...m.detalle].sort((a, b) => a.cliente.localeCompare(b.cliente, "es") || a.nroCuota - b.nroCuota).map((d) => (
                  <tr key={`${d.opp}|${d.tipoFinanciamiento}|${d.nroCuota}`} className="border-t border-stone-100">
                    <td className={TD}>{d.cliente}</td><td className={TD}>{d.unidad}</td><td className={TD}>{d.tipoFinanciamiento}</td>
                    <td className={TDR}>{d.nroCuota}</td><td className={TD}>{fmtDate(d.fechaVencimiento)}</td>
                    <td className={TDR}>{fmtUF(d.monto)}</td><td className={TDR}>{fmtUF(d.pagado)}</td><td className={TDR}>{fmtUF(d.pendiente)}</td>
                    <td className={TD}><ChipCuota estado={estadoVisible(d)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </td>
        </tr>
      )}
    </>
  );
}

/* ============================ CLIENTES ============================ */
const SITUACION = {
  pagado: ["Pagado", "bg-sky-50 text-sky-700"],
  aldia: ["Al día", "bg-emerald-50 text-emerald-700"],
  mora: ["Con mora", "bg-rose-50 text-rose-700"],
};

function ListaClientes({ clientes, onAbrir }) {
  const [q, setQ] = useState("");
  const [situacion, setSituacion] = useState("todas");
  const [orden, setOrden] = useState("nombre");

  const hayOtros = useMemo(() => clientes.some((c) => c.tipos.some((t) => !TIPOS_ORDEN.includes(t.tipo))), [clientes]);
  const lista = useMemo(() => {
    const nq = normalizarBusqueda(q);
    let l = clientes.filter((c) => (situacion === "todas" || c.situacion === situacion) && (!nq || normalizarBusqueda(`${c.cliente} ${c.rut} ${c.opp} ${c.unidad}`).includes(nq)));
    const cmp = {
      nombre: (a, b) => a.cliente.localeCompare(b.cliente, "es"),
      saldo: (a, b) => b.saldo - a.saldo,
      mora: (a, b) => b.vencido - a.vencido,
      avance: (a, b) => a.avance - b.avance,
    }[orden];
    return [...l].sort(cmp);
  }, [clientes, q, situacion, orden]);
  const conteo = (s) => clientes.filter((c) => c.situacion === s).length;

  return (
    <Fila><Panel bid="cuo-lista" grupo="cuo-f3" orden={0} span={60}>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <span className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar cliente, RUT, Opp o unidad…"
            className="pl-9 pr-3 py-2 text-sm border border-stone-200 rounded-lg w-[280px] focus:outline-none focus:border-[#2563EB]"
          />
        </span>
        <Interruptor
          opciones={[["todas", `Todos (${clientes.length})`], ["mora", `Con mora (${conteo("mora")})`], ["aldia", `Al día (${conteo("aldia")})`], ["pagado", `Pagados (${conteo("pagado")})`]]}
          valor={situacion}
          onChange={setSituacion}
        />
        <label className="flex items-center gap-2 text-xs text-stone-500 ml-auto">
          Ordenar por
          <select value={orden} onChange={(e) => setOrden(e.target.value)} className="border border-stone-200 rounded-lg px-2 py-1.5 text-sm text-[#13234A]">
            <option value="nombre">Nombre</option><option value="saldo">Mayor saldo</option><option value="mora">Mayor mora</option><option value="avance">Menor avance</option>
          </select>
        </label>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className={TH}>Cliente</th><th className={TH}>Unidad</th>
              {TIPOS_ORDEN.map((t) => <th key={t} className={THR} title="Cuotas pagadas / cuotas pactadas">{t === "Abono Provisión de Gastos" ? "Abono gastos" : t === "Pago contra escritura" ? "P. c/escritura" : t}</th>)}
              {hayOtros && <th className={TH}>Otros</th>}
              <th className={THR} title="Pago contra escritura menos el cupón del Aval: se paga en la escritura">Dif. escritura UF</th><th className={THR}>Total UF</th><th className={THR}>Pagado UF</th><th className={THR}>Falta UF</th><th className={`${TH} w-[120px]`}>Avance</th><th className={TH}>Situación</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((c) => {
              const [txt, cls] = SITUACION[c.situacion];
              return (
                <tr key={c.opp} onClick={() => onAbrir(c.opp)} className="border-t border-stone-100 cursor-pointer hover:bg-sky-50/50">
                  <td className={TD}><div className="font-medium">{c.cliente}</div><div className="text-[11px] text-stone-400">RUT {fmtRut(c.rut)} · Opp {c.opp}</div></td>
                  <td className={TD}>{c.unidad}</td>
                  {TIPOS_ORDEN.map((nombre) => {
                    const t = c.tipos.find((x) => x.tipo === nombre);
                    return <td key={nombre} className={TDR}>{t ? <span className={t.nVencidas ? "text-rose-600 font-semibold" : ""}>{t.nPagadas}/{t.nCuotas}</span> : <span className="text-stone-300">—</span>}</td>;
                  })}
                  {hayOtros && <td className={`${TD} text-xs text-stone-500`}>{c.tipos.filter((t) => !TIPOS_ORDEN.includes(t.tipo)).map((t) => `${t.tipo} ${t.nPagadas}/${t.nCuotas}`).join(", ") || "—"}</td>}
                  <td className={`${TDR} ${c.difEscritura > 0 ? "text-amber-700 font-semibold" : ""}`}>{c.nSinCupon ? <span className="text-stone-400" title="El Aval no trae el cupón de este cliente">s/d</span> : c.difEscritura > 0 ? fmtUF(c.difEscritura) : <span className="text-stone-300">—</span>}</td>
                  <td className={TDR}>{fmtUF(c.total)}</td><td className={TDR}>{fmtUF(c.pagado)}</td><td className={TDR}>{fmtUF(c.saldo)}</td>
                  <td className={TD}><span className="flex items-center gap-2"><Barra pct={c.avance} className="flex-1" /><span className="text-xs text-stone-500 w-9 text-right">{fmtPct(c.avance)}</span></span></td>
                  <td className={TD}>
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${cls}`}>{txt}{c.situacion === "mora" ? ` · ${c.nVencidas}` : ""}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {lista.length === 0 && <p className="text-sm text-stone-400 py-8 text-center">No hay clientes con ese filtro.</p>}
      </div>
      <p className="text-[11px] text-stone-400 mt-2">Las columnas por tipo muestran cuotas pagadas / cuotas pactadas (en rojo si tiene cuotas vencidas). Haz clic en un cliente para ver su ficha.</p>
    </Panel></Fila>
  );
}

/* ============================== FICHA ============================== */
export function Ficha({ cliente: c, onVolver, onCambiarBono }) {
  return (
    <div className="flex flex-col gap-5">
      <button onClick={onVolver} className="self-start flex items-center gap-1.5 text-sm text-[#2563EB] hover:underline">
        <ArrowLeft size={16} /> Volver a clientes
      </button>
      <Fila><Panel bid="cuo-ficha-cab" grupo="cuo-f4" orden={0} span={60}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl text-[#13234A]">{c.cliente}</h2>
            <p className="text-sm text-stone-500 mt-1">
              RUT {fmtRut(c.rut)} · Opp {c.opp} · {c.proyecto} · Unidad {c.unidad}
            </p>
            <p className="text-sm text-stone-500">
              Promesa: {c.fechaPromesa ? fmtDate(c.fechaPromesa) : "—"} · Precio final: {fmtUF(c.precioFinal)} UF
            </p>
          </div>
          <span className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${SITUACION[c.situacion][1]}`}>
            {SITUACION[c.situacion][0]}{c.situacion === "mora" ? ` · ${c.nVencidas} cuota(s) vencida(s)` : ""}
          </span>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-5">
          {[
            ["Total a pagar", fmtUF(c.total), "text-[#13234A]"],
            ["Pagado", fmtUF(c.pagado), "text-emerald-600"],
            ["Falta por pagar", fmtUF(c.saldo), "text-[#13234A]"],
            ["Vencido sin pagar", fmtUF(c.vencido), c.vencido > 0.05 ? "text-rose-600" : "text-stone-400"],
          ].map(([l, v, cls]) => (
            <div key={l} className="rounded-xl bg-stone-50 px-4 py-3">
              <div className="text-xs text-stone-400">{l} (UF)</div>
              <div className={`font-display text-2xl ${cls}`}>{v}</div>
            </div>
          ))}
        </div>
        {c.nBonos > 0 && (
          <p className="mt-3 text-xs text-violet-700 bg-violet-50 border border-violet-200 rounded-lg px-3 py-2">
            Bono pie: {c.nBonos} cuota(s) por {fmtUF(c.bono)} UF entregadas sin pago al cliente. No se suman a lo adeudado.
          </p>
        )}
        <div className="mt-4 flex items-center gap-3">
          <Barra pct={c.avance} className="flex-1 h-3" />
          <span className="text-sm text-stone-600 w-24 text-right">{fmtPct(c.avance)} pagado</span>
        </div>
      </Panel></Fila>

      {c.tipos.map((t) => {
        const Icono = ICONO_TIPO[t.tipo] || Wallet;
        return (
          <Fila key={t.tipo}><Panel bid={"cuo-ficha-" + t.tipo.toLowerCase().replace(/[^a-z0-9]+/g, "-")} grupo="cuo-f5" orden={0} span={60}>
            <CardTitle
              icon={Icono}
              right={
                <span className="flex flex-wrap gap-1.5">
                  <span className="rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-semibold px-2.5 py-0.5">{t.nPagadas} pagadas</span>
                  {t.nParciales > 0 && <span className="rounded-full bg-amber-50 text-amber-700 text-[11px] font-semibold px-2.5 py-0.5">{t.nParciales} parcial</span>}
                  {t.nVencidas > 0 && <span className="rounded-full bg-rose-50 text-rose-700 text-[11px] font-semibold px-2.5 py-0.5">{t.nVencidas} vencidas</span>}
                  <span className="rounded-full bg-sky-50 text-sky-700 text-[11px] font-semibold px-2.5 py-0.5">{t.nPorVencer} por vencer</span>
                  {t.nBonos > 0 && <span className="rounded-full bg-violet-50 text-violet-700 text-[11px] font-semibold px-2.5 py-0.5">{t.nBonos} bono pie</span>}
                </span>
              }
            >
              {`${t.tipo} · ${t.nCuotas} cuota${t.nCuotas === 1 ? "" : "s"}`}
            </CardTitle>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4 text-sm">
              <div><div className="text-xs text-stone-400">Total UF</div><div className="font-semibold text-[#13234A]">{fmtUF(t.total)}</div></div>
              <div><div className="text-xs text-stone-400">Pagado UF</div><div className="font-semibold text-emerald-600">{fmtUF(t.pagado)}</div></div>
              <div><div className="text-xs text-stone-400">Falta UF</div><div className="font-semibold text-[#13234A]">{fmtUF(t.saldo)}</div></div>
              <div><div className="text-xs text-stone-400">Avance</div><span className="flex items-center gap-2 mt-1"><Barra pct={t.total ? t.pagado / t.total : 0} className="flex-1" /><span className="text-xs text-stone-500">{fmtPct(t.total ? t.pagado / t.total : 0)}</span></span></div>
            </div>
            {esContraEscritura(t.tipo) && (
              <p className="text-xs text-stone-600 bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 mb-3">
                Informativo: este monto no se suma a lo adeudado. Se netea con el "Cupón Pago Contra Escritura" del Aval (regalo de la inmobiliaria) y la diferencia, si existe, se paga en la escritura.
                {t.sinCupon > 0 || t.nSinCupon > 0 ? " El Aval no trae el cupón de este cliente: sube el Aval actualizado." : ` Cupón neteado: ${fmtUF(t.neteo)} UF · Diferencia a pagar en escritura: ${fmtUF(t.difEscritura)} UF.`}
              </p>
            )}
            {t.difiereTotal && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
                El reporte informa un monto total de financiamiento de {fmtUF(t.montoTotalInformado)} UF, distinto de la suma de las cuotas ({fmtUF(t.total)} UF). Aquí se usa la suma de las cuotas.
              </p>
            )}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr><th className={THR}>N°</th><th className={TH}>Vencimiento</th><th className={THR}>Cuota UF</th><th className={THR}>Pagado UF</th><th className={THR}>Pagado $</th><th className={THR}>Pendiente UF</th>{esContraEscritura(t.tipo) && <><th className={THR}>Cupón Aval UF</th><th className={THR}>Neteado UF</th><th className={THR}>Diferencia UF</th></>}<th className={TH}>Estado</th></tr>
                </thead>
                <tbody>
                  {t.cuotas.map((q) => (
                    <tr key={q.nroCuota} className={`border-t border-stone-100 ${q.bono ? "bg-violet-50/40 text-stone-400" : ""} ${q.estado === "vencida" ? "bg-rose-50/40" : q.estado === "parcial" ? "bg-amber-50/40" : ""}`}>
                      <td className={TDR}>{q.nroCuota}</td><td className={TD}>{fmtDate(q.fechaVencimiento)}</td>
                      <td className={TDR}>{fmtUF(q.monto)}</td><td className={TDR}>{q.pagado > 0 ? fmtUF(q.pagado) : <span className="text-stone-300">—</span>}</td>
                      <td className={TDR}>{Number(q.montoPagadoClp) > 0 ? fmtCLP(q.montoPagadoClp) : <span className="text-stone-300">—</span>}</td>
                      <td className={TDR}>{q.pendiente > 0 ? fmtUF(q.pendiente) : <span className="text-stone-300">—</span>}</td>
                      {esContraEscritura(t.tipo) && (
                        <>
                          <td className={TDR}>{q.cupon !== null && q.cupon !== undefined ? fmtUF(q.cupon) : <span className="text-stone-300">s/d</span>}</td>
                          <td className={TDR}>{q.neteo > 0 ? fmtUF(q.neteo) : <span className="text-stone-300">—</span>}</td>
                          <td className={`${TDR} ${q.diferencia > 0 ? "text-amber-700 font-semibold" : ""}`}>{q.diferencia > 0 ? fmtUF(q.diferencia) : <span className="text-stone-300">—</span>}</td>
                        </>
                      )}
                      <td className={TD}>
                        {onCambiarBono ? (
                          <select
                            value={q.bono ? "bono" : "auto"}
                            onChange={(e) => onCambiarBono(q, e.target.value === "bono")}
                            title="Elige Bono pie si es un bono entregado al cliente sin pago: no se suma a lo adeudado"
                            className={`rounded-full border-0 px-2.5 py-0.5 text-[11px] font-semibold cursor-pointer focus:outline-none ${CHIPS[estadoVisible(q)]?.[1] || ""}`}
                          >
                            <option value="auto">{q.bono ? "Automático" : CHIPS[estadoVisible(q)]?.[0]}</option>
                            <option value="bono">Bono pie</option>
                          </select>
                        ) : <ChipCuota estado={estadoVisible(q)} />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel></Fila>
        );
      })}
    </div>
  );
}

/* ============================ PANTALLA ============================ */
export function CuotasPagosVista({ filas, bonos, cupones, onCambiarBono, cargadoEl, onRecargar, hoy: hoyProp }) {
  const hoy = hoyProp || hoyChile();
  const { valorUF } = useValorUFHoy();
  const [vista, setVista] = useState("clientes");
  const [proyectoSel, setProyectoSel] = useState(null);
  const [oppSel, setOppSel] = useState("");

  const todos = useMemo(() => armarClientes(filas, hoy, bonos, cupones), [filas, hoy, bonos, cupones]);
  const proyectos = useMemo(() => [...new Set(filas.map((f) => f.proyecto))].filter(Boolean).sort(), [filas]);
  const proyecto = proyectoSel ?? proyectos.find((p) => esProyectoPilpilen(p)) ?? proyectos[0] ?? TODOS;
  const clientes = useMemo(() => (proyecto === TODOS ? todos : todos.filter((c) => c.proyecto === proyecto)), [todos, proyecto]);
  const cliente = oppSel ? clientes.find((c) => c.opp === oppSel) : null;

  return (
    <div className={PAGE_CLASS}>
      <PageHeader
        title="Cuotas y Pagos"
        subtitle={`Plan de cuotas de los clientes promesados${cargadoEl ? ` · Datos al ${fmtDateTime(cargadoEl)}` : ""}`}
      />
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <label className="flex items-center gap-2 bg-white rounded-2xl shadow-card px-4 py-2.5 text-sm">
          <span className="text-xs text-stone-400">Proyecto</span>
          <select
            value={proyecto}
            onChange={(e) => { setProyectoSel(e.target.value); setOppSel(""); }}
            className="font-semibold text-[#13234A] bg-transparent focus:outline-none cursor-pointer"
          >
            {proyectos.map((p) => <option key={p} value={p}>{p}</option>)}
            {proyectos.length > 1 && <option value={TODOS}>Todos los proyectos</option>}
          </select>
        </label>
        <Interruptor opciones={[["clientes", "Por cliente"], ["totales", "Totales y por mes"]]} valor={vista} onChange={(v) => { setVista(v); setOppSel(""); }} />
        <button onClick={() => exportarExcel({ clientes, proyecto: proyecto === TODOS ? "Todos los proyectos" : proyecto, hoy, valorUF })} className="flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-medium text-stone-600 hover:bg-stone-50" title="Descargar Excel con totales por mes, por cliente y detalle de cuotas">
          <FileSpreadsheet size={15} className="text-emerald-600" /> Excel
        </button>
        <button onClick={() => exportarPdf({ clientes, proyecto: proyecto === TODOS ? "Todos los proyectos" : proyecto, hoy, valorUF })} className="flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-medium text-stone-600 hover:bg-stone-50" title="Descargar PDF con totales por mes y por cliente">
          <FileText size={15} className="text-rose-600" /> PDF
        </button>
        {onRecargar && (
          <button onClick={onRecargar} className="ml-auto flex items-center gap-1.5 text-xs text-stone-500 hover:text-[#2563EB]" title="Volver a leer los datos">
            <RefreshCw size={14} /> Actualizar
          </button>
        )}
      </div>

      {clientes.length === 0 ? (
        <Panel className="p-10 text-center text-sm text-stone-500">No hay clientes promesados con cuotas en este proyecto.</Panel>
      ) : vista === "totales" ? (
        <Totales clientes={clientes} hoy={hoy} />
      ) : cliente ? (
        <Ficha cliente={cliente} onVolver={() => setOppSel("")} onCambiarBono={onCambiarBono} />
      ) : (
        <ListaClientes clientes={clientes} onAbrir={setOppSel} />
      )}
    </div>
  );
}

const FALTA_TABLA = /does not exist|schema cache|42P01|could not find the table/i;

export default function CuotasPagos({ cargas, usuario }) {
  const [filas, setFilas] = useState(null);
  const [bonos, setBonos] = useState(() => new Set());
  const [cupones, setCupones] = useState(() => new Map());
  const [avisoBono, setAvisoBono] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(true);
  const version = cargas?.cuotas_pago?.createdAt;

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      const filasOk = (await fetchCuotasPago()).filter((f) => !esProyectoExcluido(f.proyecto));
      setFilas(filasOk);
      try { setBonos(new Set(await fetchBonosPie())); } catch { setBonos(new Set()); } // sin tabla v173: sin bonos
      try { setCupones(await fetchCuponesPce(filasOk.map((f) => f.opp))); } catch { setCupones(new Map()); } // sin columna v175: sin cupones
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setCargando(false);
    }
  }, []);
  useEffect(() => { cargar(); }, [cargar, version]);

  const cambiarBono = async (q, marcado) => {
    const k = `${q.opp}|${q.tipoFinanciamiento}|${q.nroCuota}`;
    const antes = bonos;
    const nuevo = new Set(bonos);
    if (marcado) nuevo.add(k); else nuevo.delete(k);
    setBonos(nuevo);
    setAvisoBono("");
    try {
      await marcarBonoPieRemote(q, marcado, usuario);
    } catch (e) {
      setBonos(antes);
      setAvisoBono(FALTA_TABLA.test(e.message || "") ? "Falta crear la tabla de bonos: corre la migración v173 en Supabase." : `No se pudo guardar: ${e.message || e}`);
    }
  };

  if (cargando && !filas) {
    return <div className={PAGE_CLASS}><PageHeader title="Cuotas y Pagos" subtitle="Plan de cuotas de los clientes promesados" /><Panel className="p-10 text-center text-sm text-stone-500">Cargando cuotas…</Panel></div>;
  }
  if (error) {
    return (
      <div className={PAGE_CLASS}>
        <PageHeader title="Cuotas y Pagos" subtitle="Plan de cuotas de los clientes promesados" />
        <div className="text-sm text-rose-800 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">
          {FALTA_TABLA.test(error)
            ? "Falta crear la tabla de cuotas: corre la migración v167 en Supabase (SQL Editor) y vuelve a entrar."
            : `No se pudieron leer las cuotas: ${error}`}
          <button onClick={cargar} className="ml-3 underline">Reintentar</button>
        </div>
      </div>
    );
  }
  if (!filas || filas.length === 0) {
    return (
      <div className={PAGE_CLASS}>
        <PageHeader title="Cuotas y Pagos" subtitle="Plan de cuotas de los clientes promesados" />
        <Panel className="p-10 text-center text-sm text-stone-500">
          Aún no hay cuotas cargadas. Sube el reporte de cobranza de Vivet en Configuración → Carga ("Cuotas y pagos").
        </Panel>
      </div>
    );
  }
  return (
    <>
      {avisoBono && <div className={PAGE_CLASS}><div className="text-sm text-rose-800 bg-rose-50 border border-rose-200 rounded-xl px-4 py-2">{avisoBono}</div></div>}
      <CuotasPagosVista filas={filas} bonos={bonos} cupones={cupones} onCambiarBono={cambiarBono} cargadoEl={cargas?.cuotas_pago?.createdAt} onRecargar={cargar} />
    </>
  );
}
