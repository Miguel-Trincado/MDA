import { useState, useMemo } from "react";
import { PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { DONUT_COLORS, LINE_COLOR, MESES_ES, MESES_ES_LARGO } from "../lib/constants";
import { parseFechaAMes, labelPeriodo as labelPeriodoBase } from "../lib/helpers";
import { KpiCard } from "./Shared";
import UploadMaestroPanel from "./UploadMaestroPanel";
import RutAnalysisSection from "./RutAnalysisSection";
import FilterBar from "./FilterBar";

const TODO = "Todo";
const EN_BLANCO = "(en blanco)";

function labelPeriodo(key, modo) {
  return labelPeriodoBase(key, modo, MESES_ES);
}

function valorOBlanco(v) {
  return v && v.trim() ? v.trim() : EN_BLANCO;
}

export default function ReporteEjecutivoView({ db, onUpload }) {
  const [modo, setModo] = useState("mes");
  const [showUpload, setShowUpload] = useState(false);
  const [filtros, setFiltros] = useState({ periodoDesde: TODO, periodoHasta: TODO, proyecto: TODO, tipologia: TODO });

  const filasTotales = useMemo(() => Object.values(db.cotizaciones || {}), [db.cotizaciones]);

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

  const hayFiltrosActivos = Object.values(filtros).some((v) => v !== TODO);

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

  // El sistema recién arrancó: nunca se ha cargado el Maestro Aval.
  if (filasTotales.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-5 py-16">
        {!showUpload ? (
          <div className="text-center py-8">
            <div className="font-display text-xl text-[#0F3D66] mb-2">Sin cotizaciones cargadas todavía</div>
            <p className="text-stone-500 text-sm mb-6">
              El dashboard se arma solo apenas subas la plantilla del Maestro Aval.
            </p>
            <button
              onClick={() => setShowUpload(true)}
              className="bg-[#0F3D66] hover:bg-[#1E5AA8] text-white text-sm px-5 py-2.5"
            >
              Subir plantilla
            </button>
          </div>
        ) : (
          <UploadMaestroPanel onUpload={onUpload} open={showUpload} onClose={() => setShowUpload(false)} />
        )}
      </div>
    );
  }

  const hoy = new Date();
  const fechaExtraccion = `${hoy.getDate()} de ${MESES_ES_LARGO[hoy.getMonth()]} de ${hoy.getFullYear()}`;

  const header = (
    <>
      <div className="bg-white border border-stone-200 p-5 flex items-center justify-between flex-wrap gap-4 mb-4">
        <div className="flex items-center gap-4">
          <div className="bg-[#0F3D66] text-white w-16 h-16 flex flex-col items-center justify-center leading-none shrink-0">
            <span className="font-display font-bold text-lg">MDA</span>
            <span className="text-[7px] tracking-wider mt-1">INMOBILIARIA</span>
          </div>
          <div>
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#0F3D66] leading-tight">
              REPORTE EJECUTIVO DE COTIZACIONES
            </h2>
            <div className="text-xs tracking-widest text-stone-500 font-medium">PROYECTO PILPILÉN</div>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => setShowUpload((v) => !v)}
            className="bg-[#0F3D66] hover:bg-[#1E5AA8] text-white text-sm px-4 py-2.5"
          >
            Subir plantilla
          </button>
          <div className="border border-stone-200 px-4 py-2 text-right">
            <div className="text-[11px] text-stone-400">Fecha de extracción</div>
            <div className="text-sm font-medium text-[#0F3D66]">{fechaExtraccion}</div>
          </div>
        </div>
      </div>

      <UploadMaestroPanel onUpload={onUpload} open={showUpload} onClose={() => setShowUpload(false)} />

      <FilterBar filtros={filtros} onChange={setFiltros} opciones={opciones} />
    </>
  );

  // Hay datos en el sistema, pero el filtro elegido no deja ninguna fila.
  if (data.total === 0) {
    return (
      <div className="max-w-6xl mx-auto px-5 py-6">
        {header}
        <div className="bg-white border border-stone-200 p-10 text-center">
          <div className="text-stone-500 text-sm mb-3">No hay cotizaciones para esta combinación de filtros.</div>
          <button
            onClick={() => setFiltros({ periodoDesde: TODO, periodoHasta: TODO, proyecto: TODO, tipologia: TODO })}
            className="text-xs text-[#0F3D66] underline"
          >
            Quitar filtros
          </button>
        </div>
      </div>
    );
  }

  const topTipologia = data.tipologiaOrdenada[0];
  const topRegion = data.regionOrdenada[0];
  const serieTiempo = (modo === "mes" ? dataTendencia.mesesOrdenados : dataTendencia.aniosOrdenados).slice(-18);
  const mesPico = data.mesesOrdenados.slice().sort((a, b) => b[1] - a[1])[0];
  const mesPicoLabel = mesPico ? labelPeriodo(mesPico[0], "mes") : "—";

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
    `La tipología ${topTipologia[0]} concentra el ${Math.round((topTipologia[1] / data.total) * 100)}% del total de cotizaciones.`,
    topRegion ? `La región de ${topRegion[0]} representa el ${Math.round((topRegion[1] / data.total) * 100)}% de las cotizaciones.` : null,
    mesPico ? `El mes de ${mesPicoLabel} registró el mayor número de cotizaciones (${mesPico[1]}).` : null,
    tendenciaTexto,
    pctSinFecha > 0 ? `El ${pctSinFecha}% de las cotizaciones no tiene una fecha de cotización interpretable.` : null,
    pctSinRegion > 0 ? `El ${pctSinRegion}% de las cotizaciones no cuenta con información de región.` : null,
  ].filter(Boolean);

  const recomendaciones = [
    `Reforzar la oferta y comunicación de la tipología ${topTipologia[0]}, la más demandada.`,
    topRegion ? `Concentrar esfuerzos comerciales en ${topRegion[0]}, de donde proviene la mayor parte de la demanda.` : null,
    tendenciaTexto && tendenciaTexto.includes("bajaron")
      ? "Investigar las causas de la baja de cotizaciones del último mes y reforzar la captación."
      : "Mantener el ritmo de captación observado en los últimos meses.",
    pctSinRegion > 0 || pctSinFecha > 0
      ? "Mejorar el registro de región y fecha de cotización en el Maestro Aval para elevar la calidad del análisis."
      : null,
  ].filter(Boolean);

  return (
    <div className="max-w-6xl mx-auto px-5 py-6">
      {header}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <KpiCard label="Total cotizaciones" value={data.total} sub={hayFiltrosActivos ? "Con filtros aplicados" : "Histórico completo"} />
        <KpiCard
          label="Cotizaciones último mes"
          value={mesPico ? data.mesesOrdenados[data.mesesOrdenados.length - 1][1] : 0}
          sub={data.mesesOrdenados.length ? labelPeriodo(data.mesesOrdenados[data.mesesOrdenados.length - 1][0], "mes") : "—"}
        />
        <KpiCard label="Tipología más cotizada" value={topTipologia[0]} sub={`${Math.round((topTipologia[1] / data.total) * 100)}% del total`} small />
        <KpiCard label="Mes con mayor cotización" value={mesPicoLabel} sub={mesPico ? `${mesPico[1]} cotizaciones` : "—"} small />
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mb-4">
        <div className="bg-white border border-stone-200 p-5">
          <div className="bg-[#0F3D66] text-white text-sm font-medium px-3 py-2 -mx-5 -mt-5 mb-4">COTIZACIONES POR TIPOLOGÍA</div>
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <div className="w-full sm:w-1/2 h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={donutData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={1}>
                    {donutData.map((_, i) => (
                      <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <table className="w-full sm:w-1/2 text-xs">
              <tbody>
                {data.tipologiaOrdenada.map(([name, value], i) => (
                  <tr key={name} className="border-b border-stone-100">
                    <td className="py-1.5 pr-2">
                      <span className="inline-block w-2.5 h-2.5 mr-1.5" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                      {name}
                    </td>
                    <td className="py-1.5 pr-2 text-right">{value}</td>
                    <td className="py-1.5 text-right text-stone-400">{Math.round((value / data.total) * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white border border-stone-200 p-5">
          <div className="bg-[#0F3D66] text-white text-sm font-medium px-3 py-2 -mx-5 -mt-5 mb-4 flex items-center justify-between flex-wrap gap-2">
            <span>COTIZACIONES POR {modo === "mes" ? "MES" : "AÑO"}</span>
            <span className="flex gap-1">
              <button onClick={() => setModo("mes")} className={`text-[10px] px-2 py-0.5 ${modo === "mes" ? "bg-white text-[#0F3D66]" : "text-sky-100 border border-sky-100/40"}`}>
                Mes
              </button>
              <button onClick={() => setModo("año")} className={`text-[10px] px-2 py-0.5 ${modo === "año" ? "bg-white text-[#0F3D66]" : "text-sky-100 border border-sky-100/40"}`}>
                Año
              </button>
            </span>
          </div>
          <div className="h-64">
            {lineData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-stone-400">
                Sin datos para este filtro.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={lineData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e7e5e4" />
                  <XAxis
                    dataKey="periodo"
                    tick={{ fontSize: 10 }}
                    interval={0}
                    angle={lineData.length > 8 ? -35 : 0}
                    textAnchor={lineData.length > 8 ? "end" : "middle"}
                    height={lineData.length > 8 ? 50 : 25}
                  />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                  <Tooltip />
                  <Line type="monotone" dataKey="value" stroke={LINE_COLOR} strokeWidth={2.5} dot={{ r: 3, fill: LINE_COLOR }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      <RutAnalysisSection filas={filas} gestion={db.gestion} tipologiaOrdenada={data.tipologiaOrdenada} />

      <div className="grid lg:grid-cols-2 gap-4 mb-4">
        <div className="bg-white border border-stone-200 p-5">
          <div className="font-display text-base font-semibold text-[#0F3D66] mb-3">Principales hallazgos</div>
          <ul className="flex flex-col gap-2 text-sm text-stone-700">
            {hallazgos.map((h, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-[#1E5AA8] mt-0.5">✓</span>
                <span>{h}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="bg-white border border-stone-200 p-5">
          <div className="font-display text-base font-semibold text-[#0F3D66] mb-3">Recomendaciones</div>
          <ul className="flex flex-col gap-2 text-sm text-stone-700">
            {recomendaciones.map((r, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-[#1E5AA8] mt-0.5">✓</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="bg-[#0F3D66] text-white text-xs px-4 py-2 flex justify-between">
        <span>Fuente: Maestro Aval</span>
        <span>MDA Inmobiliaria</span>
      </div>
    </div>
  );
}
