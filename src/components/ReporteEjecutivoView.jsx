import { useState, useMemo } from "react";
import { PieChart, Pie, Cell, AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { FileText, User, LayoutGrid, MapPin, Layers, BarChart3, Lightbulb, ListChecks } from "lucide-react";
import { DONUT_COLORS, LINE_COLOR, MESES_ES, MESES_ES_LARGO } from "../lib/constants";
import { parseFechaAMes, labelPeriodo as labelPeriodoBase, agruparListaPreciosPorCodigo, normalizarCodigo } from "../lib/helpers";
import { KpiCard, PageHeader, PAGE_CLASS, Panel, CardTitle } from "./Shared";
import RutAnalysisSection from "./RutAnalysisSection";
import FilterBar from "./FilterBar";

const TODO = "Todo";
const EN_BLANCO = "(en blanco)";

function labelPeriodo(key, modo) {
  return labelPeriodoBase(key, modo, MESES_ES);
}

function mesActualKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function valorOBlanco(v) {
  return v && v.trim() ? v.trim() : EN_BLANCO;
}

export default function ReporteEjecutivoView({ db, onUpload }) {
  const [modo, setModo] = useState("mes");
  const [filtros, setFiltros] = useState({ periodoDesde: mesActualKey(), periodoHasta: mesActualKey(), proyecto: TODO, tipologia: TODO });

  // El Aval a veces trae la Tipología mal o vacía para una Opp (problema
  // del archivo de origen, no de esta app). En vez de confiar en esa
  // columna, se cruza el "Lote" que sí trae el Aval contra el "Codigo" del
  // listado de precios vigente y se usa la columna "Tipología Reporte" de
  // esa fila del listado — si no hay cruce o esa columna viene vacía, se
  // deja la tipología que haya traído el Aval como respaldo.
  const listaPreciosPorCodigo = useMemo(
    () => agruparListaPreciosPorCodigo(db.listaPrecios),
    [db.listaPrecios]
  );
  const filasTotales = useMemo(() => {
    return Object.values(db.cotizaciones || {}).map((r) => {
      const unidad = r.lote ? listaPreciosPorCodigo[normalizarCodigo(r.lote)] : null;
      const tipologiaReporte = unidad?.tipologiaReporte?.trim();
      return tipologiaReporte ? { ...r, tipologia: tipologiaReporte } : r;
    });
  }, [db.cotizaciones, listaPreciosPorCodigo]);

  // Opciones de los filtros: se calculan siempre sobre el universo completo,
  // para que no se achiquen a medida que el usuario va filtrando.
  const opciones = useMemo(() => {
    const periodosSet = new Map(); // key "YYYY-MM" -> label
    const proyectosSet = new Set();
    const tipologiasSet = new Set();

    filasTotales.forEach((r) => {
      const fm = parseFechaAMes(r.fecha);
      if (fm) {
        const key = `${fm.year}-${String(fm.month).padStart(2, "0")}`;
        periodosSet.set(key, labelPeriodo(key, "mes"));
      }
      proyectosSet.add(r.proyecto && r.proyecto.trim() ? r.proyecto.trim() : EN_BLANCO);
      tipologiasSet.add(valorOBlanco(r.tipologia));
    });

    if (!periodosSet.has(mesActualKey())) {
      periodosSet.set(mesActualKey(), labelPeriodo(mesActualKey(), "mes"));
    }

    const periodos = [
      { value: TODO, label: "Todo" },
      ...[...periodosSet.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([value, label]) => ({ value, label })),
    ];
    const toOptions = (set) => [{ value: TODO, label: "Todo" }, ...[...set].sort().map((v) => ({ value: v, label: v }))];

    return { periodos, proyectos: toOptions(proyectosSet), tipologias: toOptions(tipologiasSet) };
  }, [filasTotales]);

  // Filtro de proyecto + tipología, sin el rango de período: esto alimenta
  // exclusivamente el gráfico de tendencia, que debe verse completo aunque
  // el usuario haya acotado el período arriba (si no, filtrar a un solo mes
  // dejaría el gráfico con un solo punto, que no sirve de nada).
  const filasTendencia = useMemo(() => {
    return filasTotales.filter((r) => {
      if (filtros.proyecto !== TODO && (r.proyecto && r.proyecto.trim() ? r.proyecto.trim() : EN_BLANCO) !== filtros.proyecto) return false;
      if (filtros.tipologia !== TODO && valorOBlanco(r.tipologia) !== filtros.tipologia) return false;
      return true;
    });
  }, [filasTotales, filtros.proyecto, filtros.tipologia]);

  // Filtro completo (incluye rango de período): alimenta las tarjetas,
  // la dona de tipología, el análisis por RUT y los hallazgos.
  const filas = useMemo(() => {
    return filasTendencia.filter((r) => {
      if (filtros.periodoDesde === TODO && filtros.periodoHasta === TODO) return true;
      const fm = parseFechaAMes(r.fecha);
      if (!fm) return false;
      const key = `${fm.year}-${String(fm.month).padStart(2, "0")}`;
      if (filtros.periodoDesde !== TODO && key < filtros.periodoDesde) return false;
      if (filtros.periodoHasta !== TODO && key > filtros.periodoHasta) return false;
      return true;
    });
  }, [filasTendencia, filtros.periodoDesde, filtros.periodoHasta]);

  function agregarPorTipoYFecha(lista) {
    const tipologiaCounts = {};
    const regionCounts = {};
    const mesCounts = {};
    const anioCounts = {};
    let sinFecha = 0;

    lista.forEach((r) => {
      tipologiaCounts[valorOBlanco(r.tipologia)] = (tipologiaCounts[valorOBlanco(r.tipologia)] || 0) + 1;
      regionCounts[valorOBlanco(r.region)] = (regionCounts[valorOBlanco(r.region)] || 0) + 1;
      const fm = parseFechaAMes(r.fecha);
      if (fm) {
        const key = `${fm.year}-${String(fm.month).padStart(2, "0")}`;
        mesCounts[key] = (mesCounts[key] || 0) + 1;
        anioCounts[fm.year] = (anioCounts[fm.year] || 0) + 1;
      } else {
        sinFecha++;
      }
    });

    return {
      total: lista.length,
      tipologiaOrdenada: Object.entries(tipologiaCounts).sort((a, b) => b[1] - a[1]),
      regionOrdenada: Object.entries(regionCounts).sort((a, b) => b[1] - a[1]),
      mesesOrdenados: Object.entries(mesCounts).sort((a, b) => (a[0] < b[0] ? -1 : 1)),
      aniosOrdenados: Object.entries(anioCounts).sort((a, b) => a[0] - b[0]),
      sinFecha,
    };
  }

  const data = useMemo(() => agregarPorTipoYFecha(filas), [filas]);
  const dataTendencia = useMemo(() => agregarPorTipoYFecha(filasTendencia), [filasTendencia]);

  const analisisRut = useMemo(() => {
    const rutSet = new Set();
    const tipPorRut = {}; // tipologia -> Set(rut)
    filas.forEach((r) => {
      rutSet.add(r.rut);
      const tip = valorOBlanco(r.tipologia);
      if (!tipPorRut[tip]) tipPorRut[tip] = new Set();
      tipPorRut[tip].add(r.rut);
    });
    const tipOrdenada = Object.entries(tipPorRut).map(([tip, set]) => [tip, set.size]).sort((a, b) => b[1] - a[1]);
    return { clientesUnicos: rutSet.size, tipTop: tipOrdenada[0] || null };
  }, [filas]);

  // El sistema recién arrancó: nunca se ha cargado el Maestro Aval.
  if (filasTotales.length === 0) {
    return (
      <div className={PAGE_CLASS + " text-center"}>
        <div className="font-display text-xl text-[#0F3D66] mb-2">Sin cotizaciones cargadas todavía</div>
        <p className="text-stone-500 text-sm">
          El dashboard se arma solo apenas subas la plantilla del Maestro Aval, en la pestaña "Carga".
        </p>
      </div>
    );
  }

  const hoy = new Date();
  const fechaExtraccion = `${hoy.getDate()} de ${MESES_ES_LARGO[hoy.getMonth()]} de ${hoy.getFullYear()}`;

  const header = (
    <>
      <PageHeader title="Dashboard" subtitle={`Reporte ejecutivo de cotizaciones · Proyecto Pilpilén · Extracción: ${fechaExtraccion}`} />

      <FilterBar filtros={filtros} onChange={setFiltros} opciones={opciones} />
    </>
  );

  // Hay datos en el sistema, pero el filtro elegido no deja ninguna fila.
  if (data.total === 0) {
    return (
      <div className={PAGE_CLASS}>
        {header}
        <Panel className="p-10 text-center">
          <div className="text-stone-500 text-sm mb-3">No hay cotizaciones para esta combinación de filtros.</div>
          <button
            onClick={() => setFiltros({ periodoDesde: TODO, periodoHasta: TODO, proyecto: TODO, tipologia: TODO })}
            className="text-xs text-[#0F3D66] underline"
          >
            Quitar filtros
          </button>
        </Panel>
      </div>
    );
  }

  const topTipologia = data.tipologiaOrdenada[0];
  const topRegion = data.regionOrdenada[0];
  const serieTiempo = (modo === "mes" ? dataTendencia.mesesOrdenados : dataTendencia.aniosOrdenados).slice(-18);
  const mesPico = data.mesesOrdenados.slice().sort((a, b) => b[1] - a[1])[0];
  const mesPicoLabel = mesPico ? labelPeriodo(mesPico[0], "mes") : "—";

  // Los "Principales hallazgos" y "Recomendaciones" deben reflejar siempre
  // el histórico completo (solo respetan los filtros de Proyecto/Tipología,
  // nunca el de Período) — por eso usan dataTendencia en vez de data, a
  // diferencia de las tarjetas KPI de arriba, que sí respetan el período
  // elegido a propósito.
  const topTipologiaHistorica = dataTendencia.tipologiaOrdenada[0];
  const topRegionHistorica = dataTendencia.regionOrdenada[0];
  const mesPicoHistorico = dataTendencia.mesesOrdenados.slice().sort((a, b) => b[1] - a[1])[0];
  const mesPicoHistoricoLabel = mesPicoHistorico ? labelPeriodo(mesPicoHistorico[0], "mes") : "—";

  const donutData = data.tipologiaOrdenada.map(([name, value]) => ({ name, value }));
  const lineData = serieTiempo.map(([key, value]) => ({ periodo: labelPeriodo(key, modo), value }));

  let tendenciaTexto = null;
  if (dataTendencia.mesesOrdenados.length >= 2) {
    const [, actual] = dataTendencia.mesesOrdenados[dataTendencia.mesesOrdenados.length - 1];
    const [, anterior] = dataTendencia.mesesOrdenados[dataTendencia.mesesOrdenados.length - 2];
    const [claveActual] = dataTendencia.mesesOrdenados[dataTendencia.mesesOrdenados.length - 1];
    const [claveAnterior] = dataTendencia.mesesOrdenados[dataTendencia.mesesOrdenados.length - 2];
    if (anterior > 0) {
      const pct = Math.round(((actual - anterior) / anterior) * 100);
      tendenciaTexto = `Las cotizaciones de ${labelPeriodo(claveActual, "mes")} ${pct >= 0 ? "subieron" : "bajaron"} un ${Math.abs(pct)}% respecto a ${labelPeriodo(claveAnterior, "mes")}.`;
    }
  }

  const pctSinRegion = Math.round(((data.regionOrdenada.find((t) => t[0] === EN_BLANCO)?.[1] || 0) / data.total) * 100);
  const pctSinFecha = Math.round((data.sinFecha / data.total) * 100);

  const hallazgos = [
    `La tipología ${topTipologiaHistorica[0]} concentra el ${Math.round((topTipologiaHistorica[1] / dataTendencia.total) * 100)}% del total histórico de cotizaciones.`,
    topRegionHistorica ? `La región de ${topRegionHistorica[0]} representa el ${Math.round((topRegionHistorica[1] / dataTendencia.total) * 100)}% del histórico de cotizaciones.` : null,
    mesPicoHistorico ? `El mes de ${mesPicoHistoricoLabel} registró el mayor número de cotizaciones (${mesPicoHistorico[1]}).` : null,
    tendenciaTexto,
    pctSinFecha > 0 ? `El ${pctSinFecha}% de las cotizaciones no tiene una fecha de cotización interpretable.` : null,
    pctSinRegion > 0 ? `El ${pctSinRegion}% de las cotizaciones no cuenta con información de región.` : null,
  ].filter(Boolean);

  const recomendaciones = [
    `Reforzar la oferta y comunicación de la tipología ${topTipologiaHistorica[0]}, la más demandada según el histórico.`,
    topRegionHistorica ? `Concentrar esfuerzos comerciales en ${topRegionHistorica[0]}, de donde proviene la mayor parte de la demanda.` : null,
    tendenciaTexto && tendenciaTexto.includes("bajaron")
      ? "Investigar las causas de la baja de cotizaciones del último mes y reforzar la captación."
      : "Mantener el ritmo de captación observado en los últimos meses.",
    pctSinRegion > 0 || pctSinFecha > 0
      ? "Mejorar el registro de región y fecha de cotización en el Maestro Aval para elevar la calidad del análisis."
      : null,
  ].filter(Boolean);

  // Mini-curvas de las tarjetas: últimos 12 meses, con los filtros de
  // Proyecto y Tipología pero sin el de Período (igual que la tendencia).
  const claveMes = (r) => {
    const fm = parseFechaAMes(r.fecha);
    return fm ? `${fm.year}-${String(fm.month).padStart(2, "0")}` : null;
  };
  const ultimos12 = (() => {
    const out = [];
    const hoy12 = new Date();
    for (let i = 11; i >= 0; i--) {
      const x = new Date(hoy12.getFullYear(), hoy12.getMonth() - i, 1);
      out.push(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`);
    }
    return out;
  })();
  const serieDe = (pred, unico) => {
    const m = {};
    filasTendencia.forEach((r) => {
      if (pred && !pred(r)) return;
      const k = claveMes(r);
      if (!k) return;
      if (unico) (m[k] = m[k] || new Set()).add(r.rut);
      else m[k] = (m[k] || 0) + 1;
    });
    return ultimos12.map((k) => ({ v: unico ? (m[k] ? m[k].size : 0) : m[k] || 0 }));
  };
  const serieCot = serieDe(null, false);
  const serieRut = serieDe(null, true);
  const serieTip = analisisRut.tipTop ? serieDe((r) => valorOBlanco(r.tipologia) === analisisRut.tipTop[0], false) : [];
  const serieReg = topRegion ? serieDe((r) => valorOBlanco(r.region) === topRegion[0], false) : [];
  let acumulado = 0;
  const serieTotal = serieCot.map((p) => ({ v: (acumulado += p.v) }));

  // Variación del último mes del período contra el mes calendario anterior.
  const cotsPorMes = Object.fromEntries(dataTendencia.mesesOrdenados);
  const claveUltimoMes = data.mesesOrdenados.length ? data.mesesOrdenados[data.mesesOrdenados.length - 1][0] : null;
  let deltaMes = null;
  if (claveUltimoMes) {
    const [yy, mm] = claveUltimoMes.split("-").map(Number);
    const prev = `${mm === 1 ? yy - 1 : yy}-${String(mm === 1 ? 12 : mm - 1).padStart(2, "0")}`;
    const previo = cotsPorMes[prev] || 0;
    if (previo > 0) deltaMes = Math.round((((cotsPorMes[claveUltimoMes] || 0) - previo) / previo) * 100);
  }

  return (
    <div className={PAGE_CLASS}>
      {header}

      <div className="grid-60 gap-4 mb-5">
        <KpiCard bid="kpi1" orden={0}
          tone="blue"
          icon={FileText}
          label="Cotizaciones mes actual"
          value={mesPico ? data.mesesOrdenados[data.mesesOrdenados.length - 1][1] : 0}
          sub={data.mesesOrdenados.length ? labelPeriodo(data.mesesOrdenados[data.mesesOrdenados.length - 1][0], "mes") : "—"}
          delta={deltaMes}
          serie={serieCot}
        />
        <KpiCard bid="kpi2" orden={1} tone="purple" icon={User} label="Clientes únicos (RUT)" value={analisisRut.clientesUnicos} sub="Distintos RUT que han cotizado" serie={serieRut} />
        <KpiCard bid="kpi3" orden={2}
          tone="pink"
          icon={LayoutGrid}
          label="Tipología con más clientes"
          value={analisisRut.tipTop ? analisisRut.tipTop[0] : "—"}
          sub={analisisRut.tipTop ? `${analisisRut.tipTop[1]} clientes distintos` : "—"}
          small
          serie={serieTip}
        />
        <KpiCard bid="kpi4" orden={3}
          tone="green"
          icon={MapPin}
          label="Región con mayor cotización"
          value={topRegion ? topRegion[0] : "—"}
          sub={topRegion ? `${topRegion[1]} cotizaciones` : "—"}
          small
          serie={serieReg}
        />
        <KpiCard bid="kpi5" orden={4} tone="amber" icon={FileText} label="Total cotizaciones" value={filasTendencia.length} sub="Histórico completo" serie={serieTotal} />
      </div>

      <div className="grid-60 gap-5 mb-5">
        <Panel bid="fila1-tipologia" grupo="dash-f1" orden={0}>
          <CardTitle icon={Layers}>Cotizaciones por tipología</CardTitle>
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <div className="relative w-full sm:w-1/2 h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={donutData} dataKey="value" nameKey="name" innerRadius={62} outerRadius={92} paddingAngle={2} cornerRadius={4} stroke="none">
                    {donutData.map((_, i) => (
                      <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="font-display text-2xl text-[#13234A]">{data.total}</span>
                <span className="text-xs text-stone-500">Cotizaciones</span>
              </div>
            </div>
            <table className="w-full sm:w-1/2 text-xs">
              <thead>
                <tr className="text-left text-stone-400">
                  <th className="py-1.5 pr-2 font-normal">Tipología</th>
                  <th className="py-1.5 pr-2 text-right font-normal">Cantidad</th>
                  <th className="py-1.5 text-right font-normal">%</th>
                </tr>
              </thead>
              <tbody>
                {data.tipologiaOrdenada.map(([name, value], i) => (
                  <tr key={name} className="border-t border-stone-100">
                    <td className="py-1.5 pr-2">
                      <span className="inline-block w-2.5 h-2.5 rounded-[3px] mr-2" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                      {name}
                    </td>
                    <td className="py-1.5 pr-2 text-right">{value}</td>
                    <td className="py-1.5 text-right text-stone-400">{Math.round((value / data.total) * 100)}%</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-stone-200 font-semibold text-[#13234A]">
                  <td className="py-1.5 pr-2 pl-[18px]">Total</td>
                  <td className="py-1.5 pr-2 text-right">{data.total}</td>
                  <td className="py-1.5 text-right">100%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Panel>

        <Panel bid="fila1-mes" grupo="dash-f1" orden={1}>
          <CardTitle
            icon={BarChart3}
            right={
              <span className="flex rounded-lg border border-stone-200 overflow-hidden text-xs">
                {[["mes", "Mes"], ["año", "Año"]].map(([k, l]) => (
                  <button
                    key={k}
                    onClick={() => setModo(k)}
                    className={`px-3.5 py-1.5 font-medium transition-colors ${modo === k ? "bg-[#2563EB] text-white" : "bg-white text-stone-600 hover:bg-stone-50"}`}
                  >
                    {l}
                  </button>
                ))}
              </span>
            }
          >
            Cotizaciones por {modo === "mes" ? "mes" : "año"}
          </CardTitle>
          <div className="h-64">
            {lineData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-stone-400">Sin datos para este filtro.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={lineData}>
                  <defs>
                    <linearGradient id="gradLinea" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={LINE_COLOR} stopOpacity={0.25} />
                      <stop offset="100%" stopColor={LINE_COLOR} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E8ECF4" />
                  <XAxis
                    dataKey="periodo"
                    tick={{ fontSize: 10, fill: "#64748B" }}
                    axisLine={false}
                    tickLine={false}
                    interval={0}
                    angle={lineData.length > 8 ? -35 : 0}
                    textAnchor={lineData.length > 8 ? "end" : "middle"}
                    height={lineData.length > 8 ? 50 : 25}
                  />
                  <YAxis tick={{ fontSize: 10, fill: "#64748B" }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #EEF1F8", boxShadow: "0 4px 18px rgba(31,64,140,0.1)" }} />
                  <Area type="monotone" dataKey="value" stroke={LINE_COLOR} strokeWidth={2.5} fill="url(#gradLinea)" dot={{ r: 3, fill: LINE_COLOR, strokeWidth: 0 }} activeDot={{ r: 5 }} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </Panel>
      </div>

      <RutAnalysisSection filas={filas} gestion={db.gestion} tipologiaOrdenada={data.tipologiaOrdenada} />

      <div className="grid-60 gap-5 mb-5">
        <Panel bid="fila3-hallazgos" grupo="dash-f3" orden={0}>
          <CardTitle icon={Lightbulb}>Principales hallazgos</CardTitle>
          <ul className="flex flex-col gap-2 text-sm text-stone-700">
            {hallazgos.map((h, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-[#2563EB] mt-0.5">✓</span>
                <span>{h}</span>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel bid="fila3-recomendaciones" grupo="dash-f3" orden={1}>
          <CardTitle icon={ListChecks}>Recomendaciones</CardTitle>
          <ul className="flex flex-col gap-2 text-sm text-stone-700">
            {recomendaciones.map((r, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-[#2563EB] mt-0.5">✓</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <div className="rounded-2xl bg-[#0F3D66] text-white text-xs px-5 py-3 flex justify-between">
        <span>Fuente: Maestro Aval</span>
        <span>MDA Inmobiliaria</span>
      </div>
    </div>
  );
}
