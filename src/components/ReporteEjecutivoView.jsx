import { useState, useMemo } from "react";
import { PieChart, Pie, Cell, AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { FileText, User, LayoutGrid, MapPin, Layers, BarChart3, Lightbulb, ListChecks, TrendingUp, UserX, Building2, BellOff } from "lucide-react";
import { DONUT_COLORS, LINE_COLOR, MESES_ES, MESES_ES_LARGO } from "../lib/constants";
import { formatFechaCorta, parseFechaCompleta, parseFechaAMes, labelPeriodo as labelPeriodoBase, agruparListaPreciosPorCodigo, normalizarCodigo, normalizarTipologia, limpiarTipologiaLista, esProyectoPilpilen, esProyectoExcluidoDashboard, stripAccents } from "../lib/helpers";
import { KpiCard, PageHeader, PAGE_CLASS, Panel, CardTitle } from "./Shared";
import RutAnalysisSection from "./RutAnalysisSection";
import FilterBar from "./FilterBar";
import KpiDetalle from "./KpiDetalle";

const TODO = "Todo";
const EN_BLANCO = "(en blanco)";
// Cotizaciones de clientes activos sin acción registrada hace más de este número de días.
const DIAS_SIN_GESTION = 7;
const PROYECTO_DEFECTO = "__pilpilen__"; // hasta que el usuario elige otro, se usa Pilpilén

// Filtro "Estado": qué Opp del Aval se leen y con qué fecha se ubican en el tiempo.
const ESTADOS = [
  { value: "cotizaciones", label: "Cotizaciones" },
  { value: "promesas", label: "Promesas" },
  { value: "escrituradas", label: "Escrituradas" },
  { value: "desistidas", label: "Desistidas" },
];
// La tipología sale de la columna "Tipología" del Aval (con espacios unificados).
// Solo si viene vacía o no parece una tipología (ej. "Torre 1") se recurre al
// listado de precios.
const pareceTipologia = (t) => /\dD/i.test(t || "");
const claseEstado = (e) => {
  const s = stripAccents(e || "").toLowerCase();
  if (s.includes("promes")) return "promesas";
  if (s.includes("escritur")) return "escrituradas";
  if (s.includes("desist")) return "desistidas";
  return "otro";
};
const FECHA_POR_ESTADO = {
  cotizaciones: (r) => r.fecha || r.fechaOpp || "",
  promesas: (r) => r.fechaPromesa || "",
  escrituradas: (r) => r.fechaEscritura || "",
  desistidas: (r) => r.fechaDesistimiento || "",
};

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

// Región Metropolitana (con o sin "de Santiago") se muestra como RM.
const abrevRegion = (n) => (/metropolitana/i.test(n || "") ? "RM" : n);

export default function ReporteEjecutivoView({ db, onUpload }) {
  const [modo, setModo] = useState("mes");
  const [detalle, setDetalle] = useState(null); // ventana flotante de una tarjeta
  const [filtros, setFiltros] = useState({ periodoDesde: mesActualKey(), periodoHasta: mesActualKey(), proyecto: PROYECTO_DEFECTO, tipologia: TODO, estado: "cotizaciones" });

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
  // Fuente: el Aval completo (todos los proyectos y estados). Si todavía no
  // se ha cargado, se usa el detalle de cotizaciones de siempre.
  const usaAvalCompleto = Array.isArray(db.avalCompleto) && db.avalCompleto.length > 0;
  const base = useMemo(
    () => (usaAvalCompleto ? db.avalCompleto : Object.values(db.cotizaciones || {})).filter((r) => !esProyectoExcluidoDashboard(r.proyecto)).map((r) => (r.proyecto && /\s{2,}/.test(r.proyecto) ? { ...r, proyecto: r.proyecto.replace(/\s+/g, " ") } : r)),
    [usaAvalCompleto, db.avalCompleto, db.cotizaciones]
  );
  const estadoSel = filtros.estado;
  const sustantivo = ESTADOS.find((e) => e.value === estadoSel)?.label || "Cotizaciones";
  const sust = sustantivo.toLowerCase();
  const esCotizaciones = estadoSel === "cotizaciones";

  // Tipo Unidad: se cruza el "Lote" del Aval con el "Código" del listado de precios.
  const tiposUnidadPorCodigo = db.tiposUnidad || {};
  const tipoUnidadDe = (r) => tiposUnidadPorCodigo[normalizarCodigo(r.lote)]?.tipoUnidad || "";

  const tipologiaDe = (r) => {
    // 1) La del listado de precios (columna "Tipologia", sin la letra entre paréntesis).
    const info = tiposUnidadPorCodigo[normalizarCodigo(r.lote)];
    if (info && info.tipologia !== undefined) return limpiarTipologiaLista(info.tipologia);
    // 2) Respaldo si el listado aún no trae ese dato: la del Aval.
    const t = normalizarTipologia(r.tipologia);
    if (pareceTipologia(t)) return t;
    const unidad = r.lote ? listaPreciosPorCodigo[normalizarCodigo(r.lote)] : null;
    const rep = unidad?.tipologiaReporte?.trim();
    return rep ? normalizarTipologia(rep) : t;
  };

  const filasTotales = useMemo(() => {
    const fechaDe = FECHA_POR_ESTADO[estadoSel] || FECHA_POR_ESTADO.cotizaciones;
    return base
      .filter((r) => estadoSel === "cotizaciones" || claseEstado(r.estado) === estadoSel)
      .map((r) => {
        return { ...r, fecha: fechaDe(r), tipologia: tipologiaDe(r), tipoUnidad: tipoUnidadDe(r) };
      });
  }, [base, estadoSel, listaPreciosPorCodigo, tiposUnidadPorCodigo]);

  // Opciones de los filtros: se calculan siempre sobre el universo completo,
  // para que no se achiquen a medida que el usuario va filtrando.
  const opciones = useMemo(() => {
    const proyectosSet = new Set();
    const tipologiasSet = new Set();
    base.forEach((r) => proyectosSet.add(r.proyecto && r.proyecto.trim() ? r.proyecto.trim() : EN_BLANCO));
    filasTotales.forEach((r) => tipologiasSet.add(valorOBlanco(r.tipoUnidad)));
    const toOptions = (set) => [{ value: TODO, label: "Todo" }, ...[...set].sort().map((v) => ({ value: v, label: v }))];
    return { proyectos: toOptions(proyectosSet), tipologias: toOptions(tipologiasSet), estados: ESTADOS };
  }, [base, filasTotales]);

  // Proyecto por defecto: Pilpilén (si el Aval lo trae); el usuario puede cambiarlo.
  const proyectoEf =
    filtros.proyecto === PROYECTO_DEFECTO
      ? opciones.proyectos.find((o) => o.value !== TODO && esProyectoPilpilen(o.value))?.value || TODO
      : filtros.proyecto;

  // Calendario: va desde el mes de la primera cotización del proyecto elegido
  // hasta su actividad más reciente (o el mes actual si el proyecto sigue activo),
  // del más nuevo al más antiguo.
  const periodos = useMemo(() => {
    // Solo meses con datos del proyecto elegido y del Estado elegido (con la fecha
    // propia de ese estado): del primero al último, sin meses vacíos.
    const meses = new Set();
    filasTotales.forEach((r) => {
      if (proyectoEf !== TODO && (r.proyecto && r.proyecto.trim() ? r.proyecto.trim() : EN_BLANCO) !== proyectoEf) return;
      const fm = parseFechaAMes(r.fecha);
      if (fm) meses.add(`${fm.year}-${String(fm.month).padStart(2, "0")}`);
    });
    const lista = [...meses].sort().reverse().map((key) => ({ value: key, label: labelPeriodo(key, "mes") }));
    return [{ value: TODO, label: "Todo" }, ...lista];
  }, [filasTotales, proyectoEf]);
  opciones.periodos = periodos;
  // Si el período elegido no existe para este proyecto, se usa su mes más reciente.
  const periodoValido = new Set(periodos.map((o) => o.value));
  const ajustaPeriodo = (v) => (v === TODO || periodoValido.has(v) ? v : periodos[1]?.value || TODO);
  // "Tipo Unidad": valores de la columna del Aval de ese nombre, solo del proyecto elegido.
  const tiposUnidad = useMemo(() => {
    const set = new Set();
    filasTotales.forEach((r) => {
      if (proyectoEf !== TODO && (r.proyecto && r.proyecto.trim() ? r.proyecto.trim() : EN_BLANCO) !== proyectoEf) return;
      set.add(valorOBlanco(r.tipoUnidad));
    });
    return [{ value: TODO, label: "Todo" }, ...[...set].sort().map((v) => ({ value: v, label: v }))];
  }, [filasTotales, proyectoEf]);
  opciones.tipologias = tiposUnidad;
  const tipoEf = filtros.tipologia === TODO || tiposUnidad.some((o) => o.value === filtros.tipologia) ? filtros.tipologia : TODO;
  const filtrosEf = { ...filtros, tipologia: tipoEf, proyecto: proyectoEf, periodoDesde: ajustaPeriodo(filtros.periodoDesde), periodoHasta: ajustaPeriodo(filtros.periodoHasta) };

  // Filtro de proyecto + tipología, sin el rango de período: esto alimenta
  // exclusivamente el gráfico de tendencia, que debe verse completo aunque
  // el usuario haya acotado el período arriba (si no, filtrar a un solo mes
  // dejaría el gráfico con un solo punto, que no sirve de nada).
  const filasTendencia = useMemo(() => {
    return filasTotales.filter((r) => {
      if (proyectoEf !== TODO && (r.proyecto && r.proyecto.trim() ? r.proyecto.trim() : EN_BLANCO) !== proyectoEf) return false;
      if (tipoEf !== TODO && valorOBlanco(r.tipoUnidad) !== tipoEf) return false;
      return true;
    });
  }, [filasTotales, proyectoEf, tipoEf]);

  // Filtro completo (incluye rango de período): alimenta las tarjetas,
  // la dona de tipología, el análisis por RUT y los hallazgos.
  const filas = useMemo(() => {
    return filasTendencia.filter((r) => {
      if (filtrosEf.periodoDesde === TODO && filtrosEf.periodoHasta === TODO) return true;
      const fm = parseFechaAMes(r.fecha);
      if (!fm) return false;
      const key = `${fm.year}-${String(fm.month).padStart(2, "0")}`;
      if (filtrosEf.periodoDesde !== TODO && key < filtrosEf.periodoDesde) return false;
      if (filtrosEf.periodoHasta !== TODO && key > filtrosEf.periodoHasta) return false;
      return true;
    });
  }, [filasTendencia, filtrosEf.periodoDesde, filtrosEf.periodoHasta]);

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
  if (db.cargandoAval && !usaAvalCompleto) {
    return (
      <div className={PAGE_CLASS}>
        <PageHeader title="Dashboard" subtitle="Cargando el Aval completo…" />
        <Panel className="p-10 text-center text-sm text-stone-500">Cargando datos del Dashboard…</Panel>
      </div>
    );
  }

  if (base.length === 0) {
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
      <PageHeader title="Dashboard" subtitle={`Reporte ejecutivo de ${sust} · ${proyectoEf === TODO ? "Todos los proyectos" : proyectoEf} · Extracción: ${fechaExtraccion}`} />

      <FilterBar filtros={filtrosEf} onChange={setFiltros} opciones={opciones} />
      {!db.cargandoAval && Object.keys(tiposUnidadPorCodigo).length === 0 && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-4">
          El filtro "Tipo Unidad" se llena con el listado de precios: corre la migración v158 y vuelve a cargar el listado (pestaña Carga).
        </p>
      )}
      {!db.cargandoAval && !usaAvalCompleto && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-4">
          Aún no hay Aval completo guardado: se muestran solo las Opp de Pilpilén. Corre la migración v147 y vuelve a cargar el Aval (pestaña Carga) para ver todos los proyectos y las Escrituradas y Desistidas.
        </p>
      )}
    </>
  );

  // Hay datos en el sistema, pero el filtro elegido no deja ninguna fila.
  if (data.total === 0) {
    return (
      <div className={PAGE_CLASS}>
        {header}
        <Panel className="p-10 text-center">
          <div className="text-stone-500 text-sm mb-3">{`No hay ${sust} para esta combinación de filtros.`}</div>
          <button
            onClick={() => setFiltros({ periodoDesde: TODO, periodoHasta: TODO, proyecto: TODO, tipologia: TODO, estado: estadoSel })}
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
      tendenciaTexto = `Las ${sust} de ${labelPeriodo(claveActual, "mes")} ${pct >= 0 ? "subieron" : "bajaron"} un ${Math.abs(pct)}% respecto a ${labelPeriodo(claveAnterior, "mes")}.`;
    }
  }

  const pctSinRegion = Math.round(((data.regionOrdenada.find((t) => t[0] === EN_BLANCO)?.[1] || 0) / data.total) * 100);
  const pctSinFecha = Math.round((data.sinFecha / data.total) * 100);

  const hallazgos = [
    `La tipología ${topTipologiaHistorica[0]} concentra el ${Math.round((topTipologiaHistorica[1] / dataTendencia.total) * 100)}% del total histórico de ${sust}.`,
    topRegionHistorica ? `La ${/metropolitana/i.test(topRegionHistorica[0]) ? "RM" : "región de " + topRegionHistorica[0]} representa el ${Math.round((topRegionHistorica[1] / dataTendencia.total) * 100)}% del histórico de ${sust}.` : null,
    mesPicoHistorico ? `El mes de ${mesPicoHistoricoLabel} registró el mayor número de ${sust} (${mesPicoHistorico[1]}).` : null,
    tendenciaTexto,
    pctSinFecha > 0 ? `El ${pctSinFecha}% de las ${sust} no tiene una fecha interpretable.` : null,
    pctSinRegion > 0 ? `El ${pctSinRegion}% de las ${sust} no cuenta con información de región.` : null,
  ].filter(Boolean);

  const recomendaciones = [
    `Reforzar la oferta y comunicación de la tipología ${topTipologiaHistorica[0]}, la más demandada según el histórico.`,
    topRegionHistorica ? `Concentrar esfuerzos comerciales en ${abrevRegion(topRegionHistorica[0])}, de donde proviene la mayor parte de la demanda.` : null,
    tendenciaTexto && tendenciaTexto.includes("bajaron")
      ? `Investigar las causas de la baja de ${sust} del último mes y reforzar la captación.`
      : "Mantener el ritmo de captación observado en los últimos meses.",
    pctSinRegion > 0 || pctSinFecha > 0
      ? "Mejorar el registro de región y fechas en el Maestro Aval para elevar la calidad del análisis."
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
  // Totales históricos por estado (respetan Proyecto y Tipología, no el Período ni el Estado).
  const totalEstado = (clase) => {
    const fechaDe = FECHA_POR_ESTADO[clase];
    const filasE = base
      .filter((r) => claseEstado(r.estado) === clase)
      .map((r) => {
        return { ...r, fecha: fechaDe(r), tipologia: tipologiaDe(r), tipoUnidad: tipoUnidadDe(r) };
      })
      .filter((r) => {
        if (proyectoEf !== TODO && (r.proyecto && r.proyecto.trim() ? r.proyecto.trim() : EN_BLANCO) !== proyectoEf) return false;
        if (tipoEf !== TODO && valorOBlanco(r.tipoUnidad) !== tipoEf) return false;
        return true;
      });
    const porMes = {};
    filasE.forEach((r) => {
      const k = claveMes(r);
      if (k) porMes[k] = (porMes[k] || 0) + 1;
    });
    let acum = 0;
    const serie = ultimos12.map((k) => ({ v: (acum += porMes[k] || 0) }));
    return { total: filasE.length, serie };
  };
  const totPromesas = totalEstado("promesas");
  const totEscrituradas = totalEstado("escrituradas");

  // ---- KPI comerciales (independientes del filtro "Estado"; respetan Proyecto, Tipo Unidad y Período) ----
  const pad2 = (n) => String(n).padStart(2, "0");
  const claveDeFecha = (str) => {
    const fm = parseFechaAMes(str);
    return fm ? `${fm.year}-${pad2(fm.month)}` : null;
  };
  const filtraProyTipo = (r) => {
    if (proyectoEf !== TODO && (r.proyecto && r.proyecto.trim() ? r.proyecto.trim() : EN_BLANCO) !== proyectoEf) return false;
    if (tipoEf !== TODO && valorOBlanco(tipoUnidadDe(r)) !== tipoEf) return false;
    return true;
  };
  const baseKpi = base.filter(filtraProyTipo).map((r) => ({ r, cot: claveDeFecha(r.fecha || r.fechaOpp), prom: claveDeFecha(r.fechaPromesa), des: claveDeFecha(r.fechaDesistimiento) }));
  const dentro = (k, desde, hasta) => !!k && k >= desde && k <= hasta;
  const desdeSel = filtrosEf.periodoDesde === TODO ? "0000-00" : filtrosEf.periodoDesde;
  const hastaSel = filtrosEf.periodoHasta === TODO ? "9999-99" : filtrosEf.periodoHasta;
  const prevClaveSel = (() => { const k = filtrosEf.periodoHasta; if (!k || k === TODO) return ""; const [y, m] = k.split("-").map(Number); return `${m === 1 ? y - 1 : y}-${pad2(m === 1 ? 12 : m - 1)}`; })();
  const hayUnMes = filtrosEf.periodoDesde !== TODO && filtrosEf.periodoDesde === filtrosEf.periodoHasta;
  const textoRango = filtrosEf.periodoDesde === TODO && filtrosEf.periodoHasta === TODO
    ? "todo el histórico"
    : hayUnMes ? labelPeriodo(filtrosEf.periodoDesde, "mes") : `${labelPeriodo(desdeSel, "mes")} – ${labelPeriodo(hastaSel, "mes")}`;
  const pctDe = (a, b) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);
  const fmtPct = (v) => (v === null ? "—" : `${String(v).replace(".", ",")}%`);

  // 1) Conversión cotización → promesa (sin pasar por la reserva): de las cotizaciones del período,
  //    cuántas llegaron a promesa.
  // Todo se cuenta por RUT único: un cliente con varias cotizaciones cuenta una sola vez.
  const rutDe = (x) => (x.r.rut && String(x.r.rut).trim() ? String(x.r.rut).trim() : `opp:${x.r.opp}`);
  const rutsUnicos = (lista) => new Set(lista.map(rutDe));
  const conversion = (desde, hasta) => {
    const cot = baseKpi.filter((x) => dentro(x.cot, desde, hasta));
    const prom = cot.filter((x) => !!x.prom || claseEstado(x.r.estado) === "promesas" || claseEstado(x.r.estado) === "escrituradas");
    const nCot = rutsUnicos(cot).size;
    const nProm = rutsUnicos(prom).size;
    return { cot: nCot, prom: nProm, pct: pctDe(nProm, nCot) };
  };
  const convSel = conversion(desdeSel, hastaSel);
  const convPrev = hayUnMes ? conversion(prevClaveSel, prevClaveSel) : null;
  const pl = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
  const convSub = `${pl(convSel.prom, "cliente con promesa", "clientes con promesa")} de ${pl(convSel.cot, "cliente que cotizó", "clientes que cotizaron")}${convPrev && convPrev.pct !== null ? ` · mes anterior ${fmtPct(convPrev.pct)}` : ""}`;
  const serieConv = ultimos12.map((k) => ({ v: conversion(k, k).pct || 0 }));

  // 2) Tasa de desistimiento: de las promesas del período, cuántas terminaron desistidas.
  const desistimiento = (desde, hasta) => {
    const prom = baseKpi.filter((x) => dentro(x.prom, desde, hasta));
    const des = prom.filter((x) => claseEstado(x.r.estado) === "desistidas" || !!x.des);
    // Por unidad (Opp): un cliente con 3 unidades aporta 3 promesas y, si desisten, 3 desistimientos.
    return { prom: prom.length, des: des.length, pct: pctDe(des.length, prom.length) };
  };
  const desSel = desistimiento(desdeSel, hastaSel);
  const desPrev = hayUnMes ? desistimiento(prevClaveSel, prevClaveSel) : null;
  const desSub = `${pl(desSel.des, "promesa desistida", "promesas desistidas")} de ${pl(desSel.prom, "promesa", "promesas")}${desPrev && desPrev.pct !== null ? ` · mes anterior ${fmtPct(desPrev.pct)}` : ""}`;
  const serieDes = ultimos12.map((k) => ({ v: desistimiento(k, k).des }));

  // 3) Unidades del listado de precios (solo departamentos): disponibles, reservadas y vendidas.
  const unidadesLista = Object.values(db.listaPrecios || {});
  const deptos = unidadesLista.filter((u) => /depart/i.test(u.tipo || ""));
  const unidadesBase = deptos.length > 0 ? deptos : unidadesLista;
  const nEstado = (...nombres) => unidadesBase.filter((u) => nombres.includes(u.estado)).length;
  const uDisp = nEstado("Disponible");
  const uRes = nEstado("Reservada", "Pre-reservada");
  const uVend = nEstado("Vendida", "Promesada");
  const uTotal = unidadesBase.length;
  const stockUf = Math.round(unidadesBase.filter((u) => u.estado === "Disponible").reduce((t, u) => t + (Number(u.precio) || 0), 0));

  // 4) Clientes activos sin acción registrada hace más de DIAS_SIN_GESTION días.
  const msHoy = Date.now();
  const normProy = (x) => stripAccents(x || "").toUpperCase();
  const gestionKpi = Object.values(db.gestion || {}).filter((g) => {
    if ((g.estado || "") !== "Activo") return false;
    if (proyectoEf !== TODO) {
      const a = normProy(proyectoEf), b = normProy(g.proyecto || "PILPILEN");
      if (!a.includes(b) && !b.includes(a)) return false;
    }
    return true;
  }).map((g) => {
    const fechas = [g.fechaUltimaAccionEfectiva, g.ultimaActualizacionEjecutivo, g.fechaUltimaCotizacion]
      .map((x) => parseFechaCompleta(x)).filter(Boolean).map((d) => d.getTime());
    const ref = fechas.length ? Math.max(...fechas) : null;
    return { g, ref, dias: ref === null ? null : Math.floor((msHoy - ref) / 86400000) };
  });
  const sinGestion = gestionKpi.filter((x) => x.dias === null || x.dias > DIAS_SIN_GESTION);
  const activos = Object.values(db.gestion || {}).filter((g) => (g.estado || "") === "Activo").length;

  // ---- Detalle de cada tarjeta (ventana flotante) ----
  const fechaTxt = (x) => { const d = parseFechaCompleta(x); return d ? formatFechaCorta(d) : "—"; };
  const tms = (x) => { const d = parseFechaCompleta(x); return d ? d.getTime() : 0; };
  const colF = (key, label) => ({ key, label, sort: (f) => f["_" + key] || 0 });
  const filaOpp = (r, fechaStr, tip) => ({
    fecha: fechaTxt(fechaStr), _fecha: tms(fechaStr), opp: r.opp, cliente: r.cliente || "—", rut: r.rut || "—",
    ejecutivo: r.ejecutivo || "—", unidad: r.lote || "—", tipologia: tip !== undefined ? tip : tipologiaDe(r), region: abrevRegion(r.region) || "—",
  });
  const COLS_OPP = [colF("fecha", "Fecha"), { key: "opp", label: "Opp" }, { key: "cliente", label: "Cliente" }, { key: "rut", label: "RUT" }, { key: "ejecutivo", label: "Ejecutivo" }, { key: "unidad", label: "Unidad" }, { key: "tipologia", label: "Tipología" }, { key: "region", label: "Región" }];
  const porFechaDesc = (a, b) => b._fecha - a._fecha;
  const subFiltros = `${proyectoEf === TODO ? "Todos los proyectos" : proyectoEf} · ${textoRango}`;
  const contar = (lista, fnClave) => {
    const m = new Map();
    lista.forEach((r) => {
      const k = fnClave(r);
      if (!m.has(k)) m.set(k, { cot: 0, ruts: new Set() });
      const e = m.get(k);
      e.cot += 1;
      e.ruts.add(r.rut || `opp:${r.opp}`);
    });
    return [...m.entries()].map(([k, e]) => ({ k, cot: e.cot, clientes: e.ruts.size })).sort((a, b) => b.clientes - a.clientes || b.cot - a.cot);
  };

  const detCotizaciones = () => {
    const rows = filasTendencia.filter((r) => claveMes(r) === claveUltimoMes).map((r) => filaOpp(r, r.fecha, r.tipologia)).sort(porFechaDesc);
    return { titulo: `${sustantivo} de ${labelPeriodo(claveUltimoMes, "mes")}`, subtitulo: subFiltros, resumen: [{ label: "Total", valor: rows.length }], columnas: COLS_OPP, filas: rows, archivo: `Dashboard_${sust}` };
  };
  const detClientes = () => {
    const m = new Map();
    filas.forEach((r) => {
      const k = r.rut || `opp:${r.opp}`;
      const t = tms(r.fecha);
      const e = m.get(k) || { cliente: r.cliente || "—", rut: r.rut || "—", n: 0, _ult: 0, ejecutivo: r.ejecutivo || "—" };
      e.n += 1;
      if (t >= e._ult) { e._ult = t; e.ejecutivo = r.ejecutivo || e.ejecutivo; e.cliente = r.cliente || e.cliente; }
      m.set(k, e);
    });
    const rows = [...m.values()].map((e) => ({ cliente: e.cliente, rut: e.rut, n: e.n, ultima: e._ult ? formatFechaCorta(new Date(e._ult)) : "—", _ultima: e._ult, ejecutivo: e.ejecutivo })).sort((a, b) => b.n - a.n || b._ultima - a._ultima);
    return { titulo: "Clientes únicos (RUT)", subtitulo: subFiltros, resumen: [{ label: "Clientes únicos", valor: rows.length }, { label: sustantivo, valor: filas.length }], columnas: [{ key: "cliente", label: "Cliente" }, { key: "rut", label: "RUT" }, { key: "n", label: sustantivo, align: "right" }, colF("ultima", "Última fecha"), { key: "ejecutivo", label: "Ejecutivo" }], filas: rows, archivo: "Dashboard_clientes_unicos" };
  };
  const detTipologia = () => {
    const rows = contar(filas, (r) => valorOBlanco(r.tipologia)).map((e) => ({ tipologia: e.k, clientes: e.clientes, cot: e.cot }));
    return { titulo: "Clientes por tipología", subtitulo: subFiltros, resumen: [{ label: "Clientes únicos", valor: analisisRut.clientesUnicos }], columnas: [{ key: "tipologia", label: "Tipología" }, { key: "clientes", label: "Clientes únicos", align: "right" }, { key: "cot", label: sustantivo, align: "right" }], filas: rows, pie: { tipologia: "Total", clientes: analisisRut.clientesUnicos, cot: filas.length }, archivo: "Dashboard_tipologia" };
  };
  const detRegion = () => {
    const rows = contar(filas, (r) => abrevRegion(valorOBlanco(r.region))).sort((a, b) => b.cot - a.cot).map((e) => ({ region: e.k, cot: e.cot, clientes: e.clientes }));
    return { titulo: `${sustantivo} por región`, subtitulo: subFiltros, columnas: [{ key: "region", label: "Región" }, { key: "cot", label: sustantivo, align: "right" }, { key: "clientes", label: "Clientes únicos", align: "right" }], filas: rows, pie: { region: "Total", cot: filas.length, clientes: analisisRut.clientesUnicos }, archivo: "Dashboard_region" };
  };
  const detEstado = (clase, titulo, campo) => {
    const rows = base.filter((r) => claseEstado(r.estado) === clase && filtraProyTipo(r)).map((r) => filaOpp(r, r[campo])).sort(porFechaDesc);
    return { titulo, subtitulo: `${proyectoEf === TODO ? "Todos los proyectos" : proyectoEf} · histórico completo`, resumen: [{ label: "Total", valor: rows.length }], columnas: COLS_OPP.map((c) => (c.key === "fecha" ? colF("fecha", clase === "promesas" ? "F. promesa" : "F. escritura") : c)), filas: rows, archivo: `Dashboard_${clase}` };
  };
  const TODO_DESDE = "0000-00", TODO_HASTA = "9999-99";
  const mesesDe = (campo) => [...new Set(baseKpi.map((x) => x[campo]).filter((k) => k && k <= mesActualKey()))].sort();
  const detConversion = () => {
    const tot = conversion(TODO_DESDE, TODO_HASTA);
    const rows = mesesDe("cot").map((k) => { const c = conversion(k, k); return { mes: labelPeriodo(k, "mes"), _mes: k, cot: c.cot, prom: c.prom, pct: fmtPct(c.pct), _pct: c.pct || 0, _tono: dentro(k, desdeSel, hastaSel) ? "green" : undefined }; });
    return {
      titulo: "Conversión cotización → promesa", subtitulo: `${proyectoEf === TODO ? "Todos los proyectos" : proyectoEf} · clientes por RUT único, sin pasar por la reserva`,
      resumen: [
        { label: "Conversión total", valor: fmtPct(tot.pct) },
        { label: "Clientes con promesa (total)", valor: tot.prom },
        { label: "Clientes que cotizaron (total)", valor: tot.cot },
        { label: `Período (${textoRango})`, valor: fmtPct(convSel.pct) },
      ],
      columnas: [{ key: "mes", label: "Mes de cotización", sort: (f) => f._mes }, { key: "cot", label: "Clientes que cotizaron", align: "right" }, { key: "prom", label: "Con promesa", align: "right" }, { key: "pct", label: "Conversión", align: "right", sort: (f) => f._pct }],
      filas: rows, pie: { mes: "Total (clientes únicos)", cot: tot.cot, prom: tot.prom, pct: fmtPct(tot.pct) }, archivo: "Dashboard_conversion",
    };
  };
  const detDesistimiento = () => {
    const tot = desistimiento(TODO_DESDE, TODO_HASTA);
    const meses = mesesDe("prom").map((k) => { const d = desistimiento(k, k); return { mes: labelPeriodo(k, "mes"), _mes: k, prom: d.prom, des: d.des, pct: fmtPct(d.pct), _pct: d.pct || 0, _tono: dentro(k, desdeSel, hastaSel) ? "rose" : undefined }; });
    const rows = baseKpi.filter((x) => (claseEstado(x.r.estado) === "desistidas" || !!x.des) && !!x.prom).map((x) => ({
      ...filaOpp(x.r, x.r.fechaPromesa), desist: fechaTxt(x.r.fechaDesistimiento), _desist: tms(x.r.fechaDesistimiento), _tono: dentro(x.prom, desdeSel, hastaSel) ? "rose" : undefined,
    })).sort(porFechaDesc);
    return {
      titulo: "Tasa de desistimiento", subtitulo: `${proyectoEf === TODO ? "Todos los proyectos" : proyectoEf} · por unidad (cada Opp cuenta), según el mes de la promesa`,
      resumen: [
        { label: "Desistimiento total", valor: fmtPct(tot.pct) },
        { label: "Desistidas (total)", valor: tot.des },
        { label: "Promesas (total)", valor: tot.prom },
        { label: `Período (${textoRango})`, valor: fmtPct(desSel.pct) },
      ],
      vistas: [
        {
          nombre: "Por mes", archivo: "Dashboard_desistimiento_mensual", vacio: "Aún no hay promesas.",
          columnas: [{ key: "mes", label: "Mes de promesa", sort: (f) => f._mes }, { key: "prom", label: "Promesas", align: "right" }, { key: "des", label: "Desistidas", align: "right" }, { key: "pct", label: "Desistimiento", align: "right", sort: (f) => f._pct }],
          filas: meses, pie: { mes: "Total", prom: tot.prom, des: tot.des, pct: fmtPct(tot.pct) },
        },
        {
          nombre: "Detalle de desistidas", archivo: "Dashboard_desistimientos", vacio: "No hay promesas desistidas.",
          columnas: [colF("fecha", "F. promesa"), colF("desist", "F. desistimiento"), { key: "opp", label: "Opp" }, { key: "cliente", label: "Cliente" }, { key: "rut", label: "RUT" }, { key: "ejecutivo", label: "Ejecutivo" }, { key: "unidad", label: "Unidad" }, { key: "tipologia", label: "Tipología" }],
          filas: rows,
        },
      ],
    };
  };
  const detUnidades = () => {
    const orden = { Disponible: 0, "Pre-reservada": 1, Reservada: 1, Promesada: 2, Vendida: 3 };
    const rows = unidadesBase.slice().sort((a, b) => (orden[a.estado] ?? 9) - (orden[b.estado] ?? 9) || String(a.unidad).localeCompare(String(b.unidad), "es", { numeric: true })).map((u) => ({
      unidad: u.unidad, codigo: u.codigo || "—", tipologia: u.tipologia || "—", estado: u.estado || "—", precio: u.precio != null ? Number(u.precio).toLocaleString("es-CL", { maximumFractionDigits: 2 }) : "—", _precio: Number(u.precio) || 0,
      _tono: u.estado === "Disponible" ? "green" : u.estado === "Reservada" || u.estado === "Pre-reservada" ? "amber" : undefined,
    }));
    return {
      titulo: "Unidades del proyecto", subtitulo: "Según el último listado de precios",
      resumen: [{ label: "Disponibles", valor: uDisp }, { label: "Reservadas", valor: uRes }, { label: "Vendidas", valor: uVend }, { label: "Total", valor: uTotal }, { label: "Stock disponible", valor: `${stockUf.toLocaleString("es-CL")} UF` }],
      columnas: [{ key: "unidad", label: "Unidad" }, { key: "codigo", label: "Código" }, { key: "tipologia", label: "Tipología" }, { key: "estado", label: "Estado" }, { key: "precio", label: "Precio UF", align: "right", sort: (f) => f._precio }],
      filas: rows, vacio: "Aún no hay listado de precios cargado.", archivo: "Dashboard_unidades",
    };
  };
  const detSinGestion = () => {
    const rows = sinGestion.map(({ g, ref, dias }) => ({
      cliente: g.cliente || "—", rut: g.rut || "—", ejecutivo: g.ejecutivo || "—", etapa: g.etapaComercial || "—",
      ultima: ref ? formatFechaCorta(new Date(ref)) : "—", dias: dias === null ? "—" : dias, _dias: dias === null ? 9999 : dias, _tono: dias === null || dias > 30 ? "rose" : "amber",
    })).sort((a, b) => b._dias - a._dias);
    return {
      titulo: `Cotizaciones sin gestión (+${DIAS_SIN_GESTION} días)`, subtitulo: "Clientes activos sin acción registrada",
      resumen: [{ label: "Sin gestión", valor: rows.length }, { label: "Clientes activos", valor: activos }],
      columnas: [{ key: "cliente", label: "Cliente" }, { key: "rut", label: "RUT" }, { key: "ejecutivo", label: "Ejecutivo" }, { key: "etapa", label: "Etapa" }, colF("ultima", "Última actividad"), { key: "dias", label: "Días", align: "right", sort: (f) => f._dias }],
      filas: rows, vacio: "Todos los clientes activos tienen gestión reciente.", archivo: "Dashboard_sin_gestion",
    };
  };


  // Variación del mes elegido contra el mes anterior, comparando el ACUMULADO
  // hasta el mismo día del mes (si el mes elegido es el actual, hasta hoy; si ya
  // terminó, el mes completo contra el mes anterior completo).
  const cotsPorMes = Object.fromEntries(dataTendencia.mesesOrdenados);
  const claveUltimoMes = filtrosEf.periodoHasta !== TODO ? filtrosEf.periodoHasta : mesActualKey();
  const [yyK, mmK] = claveUltimoMes.split("-").map(Number);
  const prevClave = `${mmK === 1 ? yyK - 1 : yyK}-${String(mmK === 1 ? 12 : mmK - 1).padStart(2, "0")}`;
  const diasDelMes = (y, m) => new Date(y, m, 0).getDate();
  const hoyKPI = new Date();
  const diaCorte = claveUltimoMes === mesActualKey() ? hoyKPI.getDate() : diasDelMes(yyK, mmK);
  const diaCortePrev = Math.min(diaCorte, diasDelMes(mmK === 1 ? yyK - 1 : yyK, mmK === 1 ? 12 : mmK - 1));
  const acumulado = (k, dia, unico) => {
    const set = new Set();
    let n = 0;
    filasTendencia.forEach((r) => {
      const d = parseFechaCompleta(r.fecha);
      if (!d) return;
      const kk = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
      if (kk !== k || d.getUTCDate() > dia) return;
      if (unico) set.add(r.rut);
      else n += 1;
    });
    return unico ? set.size : n;
  };
  const nombreMes = (k) => (k ? labelPeriodo(k, "mes") : "—");
  const cotActual = acumulado(claveUltimoMes, diaCorte, false);
  const cotPrevio = acumulado(prevClave, diaCortePrev, false);
  const deltaMes = cotPrevio > 0 ? Math.round(((cotActual - cotPrevio) / cotPrevio) * 100) : null;
  const infoMes =
    deltaMes != null
      ? `Acumulado de ${nombreMes(claveUltimoMes)} al día ${diaCorte}: ${cotActual} ${sust}. Acumulado de ${nombreMes(prevClave)} al día ${diaCortePrev}: ${cotPrevio}.`
      : "";
  const rutActual = acumulado(claveUltimoMes, diaCorte, true);
  const rutPrevio = acumulado(prevClave, diaCortePrev, true);
  const deltaRut = rutPrevio > 0 ? Math.round(((rutActual - rutPrevio) / rutPrevio) * 100) : null;
  const infoRut =
    deltaRut != null
      ? `Clientes únicos (RUT distintos). Acumulado de ${nombreMes(claveUltimoMes)} al día ${diaCorte}: ${rutActual}. Acumulado de ${nombreMes(prevClave)} al día ${diaCortePrev}: ${rutPrevio}.`
      : "";

  return (
    <div className={PAGE_CLASS}>
      {header}

      <div className="grid-60 gap-4 mb-5">
        <KpiCard bid="kpi1" onClick={() => setDetalle(detCotizaciones())} orden={0}
          tone="blue"
          icon={FileText}
          label={claveUltimoMes === mesActualKey() ? `${sustantivo} mes actual` : `${sustantivo} del mes`}
          value={cotsPorMes[claveUltimoMes] || 0}
          sub={labelPeriodo(claveUltimoMes, "mes")}
          delta={deltaMes}
          deltaInfo={infoMes}
          serie={serieCot}
        />
        <KpiCard bid="kpi2" onClick={() => setDetalle(detClientes())} orden={1} tone="purple" icon={User} label="Clientes únicos (RUT)" value={analisisRut.clientesUnicos} sub="Distintos RUT que han cotizado" delta={deltaRut} deltaInfo={infoRut} serie={serieRut} />
        <KpiCard bid="kpi3" onClick={() => setDetalle(detTipologia())} orden={2}
          tone="pink"
          icon={LayoutGrid}
          label="Tipología con más clientes"
          value={analisisRut.tipTop ? analisisRut.tipTop[0] : "—"}
          sub={analisisRut.tipTop ? `${analisisRut.tipTop[1]} clientes distintos` : "—"}
          small
          serie={serieTip}
        />
        <KpiCard bid="kpi4" onClick={() => setDetalle(detRegion())} orden={3}
          tone="green"
          icon={MapPin}
          label={esCotizaciones ? "Región con mayor cotización" : `Región con más ${sust}`}
          value={topRegion ? abrevRegion(topRegion[0]) : "—"}
          sub={topRegion ? `${topRegion[1]} ${sust}` : "—"}
          small
          serie={serieReg}
        />
        <KpiCard bid="kpi5" onClick={() => setDetalle(detEstado("promesas", "Promesas (histórico)", "fechaPromesa"))} orden={4} tone="amber" icon={FileText} label="Total promesas" value={totPromesas.total} sub="Histórico completo" serie={totPromesas.serie} />
        {totEscrituradas.total > 0 && (
          <KpiCard bid="kpi6" onClick={() => setDetalle(detEstado("escrituradas", "Escrituradas (histórico)", "fechaEscritura"))} orden={5} tone="blue" icon={FileText} label="Total escrituradas" value={totEscrituradas.total} sub="Histórico completo" serie={totEscrituradas.serie} />
        )}
      </div>

      {/* Segunda fila: indicadores comerciales (conversión, desistimiento, unidades, gestión) */}
      <div className="grid-60 gap-4 mb-5">
        <KpiCard bid="kpi7" onClick={() => setDetalle(detConversion())} orden={6} tone="green" icon={TrendingUp} label="Conversión cotización → promesa" value={fmtPct(convSel.pct)} sub={convSub} deltaInfo={`Clientes con promesa ÷ clientes que cotizaron en ${textoRango}, contados por RUT único y sin pasar por la reserva. Incluye promesas escrituradas y desistidas.`} serie={serieConv} />
        <KpiCard bid="kpi8" onClick={() => setDetalle(detDesistimiento())} orden={7} tone="rose" icon={UserX} label="Tasa de desistimiento" value={fmtPct(desSel.pct)} sub={desSub} deltaInfo={`Promesas desistidas ÷ promesas de ${textoRango}, contadas por unidad (cada Opp cuenta): un cliente con 3 unidades aporta 3 promesas.`} serie={serieDes} />
        <KpiCard bid="kpi9" onClick={() => setDetalle(detUnidades())} orden={8} tone="blue" icon={Building2} label="Unidades disponibles" value={uTotal ? uDisp : "—"} sub={uTotal ? `${pl(uVend, "vendida", "vendidas")} · ${pl(uRes, "reservada", "reservadas")} · ${pctDe(uVend, uTotal) ?? 0}% vendido de ${uTotal}${stockUf ? ` · stock ${stockUf.toLocaleString("es-CL")} UF` : ""}` : "Carga el listado de precios"} />
        <KpiCard bid="kpi10" onClick={() => setDetalle(detSinGestion())} orden={9} tone="amber" icon={BellOff} label={`Cotizaciones sin gestión (+${DIAS_SIN_GESTION} días)`} value={sinGestion.length} sub={`de ${activos} clientes activos sin acción registrada en ${DIAS_SIN_GESTION} días`} />
      </div>

      <div className="grid-60 gap-5 mb-5">
        <Panel bid="fila1-tipologia" grupo="dash-f1" orden={0}>
          <CardTitle icon={Layers}>{`${sustantivo} por tipología`}</CardTitle>
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <div className="relative w-full sm:w-1/2 h-[224px]">
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
                <span className="text-xs text-stone-500">{sustantivo}</span>
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
                      <span className="inline-block w-[10px] h-[10px] rounded-[3px] mr-2" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
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
            {`${sustantivo} por ${modo === "mes" ? "mes" : "año"}`}
          </CardTitle>
          <div className="h-[256px]">
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

      <RutAnalysisSection filas={filas} gestion={db.gestion} tipologiaOrdenada={data.tipologiaOrdenada} sustantivo={sustantivo} />

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
      {detalle && <KpiDetalle {...detalle} onClose={() => setDetalle(null)} />}
    </div>
  );
}
