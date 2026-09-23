import { useState, useEffect, useMemo } from "react";
import { Search, FileText, Loader2, Check, ChevronLeft } from "lucide-react";
import { buildQuotePdfDoc, currency, currencyDecimal, quoteNumber } from "../lib/quotePdf";
import { fetchCotizacionesDeCliente, guardarCotizacionGenerada } from "../lib/db";
import { normalizarBusqueda } from "../lib/helpers";
import { Panel, Field } from "./Shared";

const FINANCIAMIENTO_ROWS_DEFAULT = {
  reserva: { modo: "UF", valor: 5 },
  pie: { modo: "%", valor: 0 },
  contraEscritura: { modo: "UF", valor: 0 },
  hipotecario: { modo: "%", valor: 80 },
};
const ROW_LABEL = { reserva: "Reserva", pie: "Pie", contraEscritura: "Contra escritura", hipotecario: "Crédito hipotecario" };

// Valores por defecto de la distribución cuando se elige una unidad o
// cambia el % de descuento: Reserva siempre 5 UF, Hipotecario siempre
// 80%, el Pie parte igualado al % de descuento (el descuento casi
// siempre se cubre como bono dentro del pie, no restándolo directo del
// precio — no es una fila aparte, es el valor por defecto del Pie), y
// lo que sobra se carga a Contra escritura. Siguen siendo editables
// después: esto solo precarga el punto de partida más común.
function calcularDefaults(precioBaseUF, descuentoPctVal) {
  const reservaUF = 5;
  const hipotecarioUF = precioBaseUF * 0.8;
  const pieUF = (precioBaseUF * (Number(descuentoPctVal) || 0)) / 100;
  const contraEscrituraUF = Math.max(0, precioBaseUF - reservaUF - hipotecarioUF - pieUF);
  return {
    reserva: { modo: "UF", valor: reservaUF },
    pie: { modo: "%", valor: Number(descuentoPctVal) || 0 },
    contraEscritura: { modo: "UF", valor: contraEscrituraUF },
    hipotecario: { modo: "%", valor: 80 },
  };
}

function useValorUF() {
  const [valorUF, setValorUF] = useState(null);
  const [loadingUF, setLoadingUF] = useState(true);
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("https://mindicador.cl/api/uf");
        const data = await res.json();
        const v = data?.serie?.[0]?.valor;
        if (v) setValorUF(v);
      } catch (e) {
        console.error("No se pudo obtener el valor de la UF", e);
      } finally {
        setLoadingUF(false);
      }
    })();
  }, []);
  return { valorUF, loadingUF };
}

export default function Cotizador({ db }) {
  const [rutCliente, setRutCliente] = useState("");
  const [buscarCliente, setBuscarCliente] = useState("");
  const [unidadId, setUnidadId] = useState("");
  const [buscarUnidad, setBuscarUnidad] = useState("");
  const [filtroTipologia, setFiltroTipologia] = useState("");
  const [estacionamientoId, setEstacionamientoId] = useState("");
  const [descuentoPct, setDescuentoPct] = useState("0");
  const [rows, setRows] = useState(FINANCIAMIENTO_ROWS_DEFAULT);
  const [cuotasContraEscritura, setCuotasContraEscritura] = useState(1);
  const [observaciones, setObservaciones] = useState("");
  const [savedCotizacion, setSavedCotizacion] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [generatingPreview, setGeneratingPreview] = useState(false);
  const [historial, setHistorial] = useState([]);

  const { valorUF, loadingUF } = useValorUF();

  const cliente = rutCliente ? db.gestion[rutCliente] : null;
  const unidad = unidadId ? db.listaPrecios[unidadId] : null;
  const estacionamiento = estacionamientoId ? db.listaPrecios[estacionamientoId] : null;

  useEffect(() => {
    if (!rutCliente) {
      setHistorial([]);
      return;
    }
    fetchCotizacionesDeCliente(rutCliente)
      .then((list) => setHistorial([...list].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))))
      .catch(() => setHistorial([]));
  }, [rutCliente]);

  const clientesFiltrados = useMemo(() => {
    if (!buscarCliente) return [];
    const q = normalizarBusqueda(buscarCliente);
    return Object.values(db.gestion)
      .filter((g) => normalizarBusqueda(g.cliente).includes(q) || (g.rut || "").includes(q))
      .slice(0, 12);
  }, [db.gestion, buscarCliente]);

  const tipologiasDisponibles = useMemo(() => {
    const set = new Set();
    Object.values(db.listaPrecios).forEach((u) => {
      if (u.tipo === "Departamento" && u.tipologia) set.add(u.tipologia);
    });
    return [...set].sort();
  }, [db.listaPrecios]);

  const unidadesFiltradas = useMemo(() => {
    const q = buscarUnidad.toLowerCase();
    return Object.values(db.listaPrecios)
      .filter((u) => u.tipo === "Departamento")
      .filter((u) => !filtroTipologia || u.tipologia === filtroTipologia)
      .filter((u) => !q || u.unidad.toLowerCase().includes(q) || (u.tipologia || "").toLowerCase().includes(q))
      .sort((a, b) => (Number(a.precio) || 0) - (Number(b.precio) || 0));
  }, [db.listaPrecios, buscarUnidad, filtroTipologia]);

  const estacionamientosFiltrados = useMemo(() => {
    return Object.values(db.listaPrecios)
      .filter((u) => u.tipo === "Estacionamiento" && u.estado === "Disponible" && Number(u.precio) > 0)
      .sort((a, b) => (Number(a.precio) || 0) - (Number(b.precio) || 0));
  }, [db.listaPrecios]);

  function elegirUnidad(u) {
    if (u.estado !== "Disponible") return; // no se puede cotizar una unidad no disponible
    setUnidadId(u.id);
    setEstacionamientoId("");
    setSavedCotizacion(null);
    closePreview();
    setDescuentoPct(u.descuentoMax != null ? String(u.descuentoMax) : "0");
    setCuotasContraEscritura(1);
  }

  function elegirEstacionamiento(id) {
    setEstacionamientoId(id);
    setSavedCotizacion(null);
    closePreview();
  }

  const setRow = (key, patch) => setRows((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));

  const precioListaUF = (unidad ? Number(unidad.precio) || 0 : 0) + (estacionamiento ? Number(estacionamiento.precio) || 0 : 0);

  // Recalcula los valores por defecto de la distribución cada vez que
  // cambia la unidad, el estacionamiento o el % de descuento — así el
  // Bono Pie siempre parte igualado al descuento actual, sin tener que
  // tocarlo a mano salvo que ese 1% de los casos lo requiera.
  useEffect(() => {
    if (!unidad) return;
    setRows(calcularDefaults(precioListaUF, descuentoPct));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unidadId, estacionamientoId, descuentoPct]);

  const descuentoUF = (precioListaUF * (Number(descuentoPct) || 0)) / 100;
  // El descuento ya no se resta directo del precio: ahora se refleja
  // como Bono Pie dentro de la distribución. El precio final (lo que se
  // reparte entre Reserva/Pie/Bono/Contra escritura/Hipotecario) es el
  // precio de lista completo.
  const precioFinalUF = precioListaUF;

  const rowValueUF = (row, baseUF) => (row.modo === "%" ? (baseUF * (Number(row.valor) || 0)) / 100 : Number(row.valor) || 0);
  const reservaUF = rowValueUF(rows.reserva, precioFinalUF);
  const pieUF = rowValueUF(rows.pie, precioFinalUF);
  const contraEscrituraUF = rowValueUF(rows.contraEscritura, precioFinalUF);
  const hipotecarioUF = rowValueUF(rows.hipotecario, precioFinalUF);
  const totalDistribuidoUF = reservaUF + pieUF + contraEscrituraUF + hipotecarioUF;
  const faltanteUF = precioFinalUF - totalDistribuidoUF;
  const distribucionValidada = Math.abs(faltanteUF) < 0.01;
  const toCLP = (uf) => (valorUF ? uf * valorUF : 0);

  const quoteSnapshot = () => ({
    clientName: cliente?.cliente || null,
    clientRut: cliente?.rut || null,
    clientPhone: cliente?.telefono || null,
    agentName: cliente?.ejecutivo || null,
    units: unidad
      ? [
          { label: `Unidad ${unidad.unidad}`, tipologia: unidad.tipologia, area: unidad.area, priceUF: Number(unidad.precio) || 0 },
          ...(estacionamiento
            ? [{ label: `Estacionamiento ${estacionamiento.unidad}`, tipologia: "Estacionamiento", area: estacionamiento.area, priceUF: Number(estacionamiento.precio) || 0 }]
            : []),
        ]
      : [],
    subtotal: precioListaUF,
    discount: descuentoUF,
    descuentoPct,
    precioFinalUF,
    valorUF,
    reservaUF,
    pieUF,
    contraEscrituraUF,
    cuotasContraEscritura,
    hipotecarioRowUF: hipotecarioUF,
    totalDistribuidoUF,
    faltanteUF,
    distribucionValidada,
    observaciones: observaciones?.trim() || null,
  });

  async function ensureCotizacion() {
    if (savedCotizacion) return savedCotizacion;
    if (!rutCliente || !unidadId) return null;
    setSaving(true);
    setError("");
    try {
      const saved = await guardarCotizacionGenerada({
        rutCliente,
        unidadId,
        secondaryIds: estacionamiento ? [estacionamiento.id] : [],
        subtotal: precioListaUF,
        descuento: descuentoUF,
        precioFinal: precioFinalUF,
        reserva: reservaUF,
        observaciones: observaciones?.trim() || "",
        snapshot: quoteSnapshot(),
      });
      setSavedCotizacion(saved);
      setHistorial((prev) => [saved, ...prev].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
      return saved;
    } catch (e) {
      setError(e.message || "No se pudo guardar la simulación.");
      return null;
    } finally {
      setSaving(false);
    }
  }

  function closePreview() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
  }

  async function abrirVistaPrevia() {
    if (!unidadId) {
      setError("Elige una unidad antes de generar la simulación.");
      return;
    }
    setError("");
    setGeneratingPreview(true);
    try {
      const saved = await ensureCotizacion();
      if (!saved) return;
      const doc = buildQuotePdfDoc({ ...saved.snapshot, displayId: saved.displayId });
      closePreview();
      setPreviewUrl(doc.output("bloburl"));
    } catch (e) {
      setError(e.message || "No se pudo generar la vista previa.");
    } finally {
      setGeneratingPreview(false);
    }
  }

  async function verCotizacionAnterior(cot) {
    const doc = buildQuotePdfDoc({ ...cot.snapshot, displayId: cot.displayId });
    closePreview();
    setPreviewUrl(doc.output("bloburl"));
  }

  const seleccionarCliente = (g) => {
    setRutCliente(g.rut);
    setBuscarCliente("");
    setUnidadId("");
    setSavedCotizacion(null);
    closePreview();
  };

  return (
    <div className="max-w-4xl mx-auto px-5 py-6">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <h2 className="font-display text-2xl text-[#0F3D66]">Simulador</h2>
        <span className="text-xs font-mono px-3 py-1.5 rounded-full border border-stone-300 text-stone-500">
          {loadingUF ? "Valor UF: obteniendo…" : valorUF ? `Valor UF hoy: $${currency(valorUF)}` : "Valor UF no disponible"}
        </span>
      </div>

      {error && <div className="mb-4 border border-rose-300 bg-rose-50 text-rose-800 text-sm px-3 py-2">{error}</div>}

      {/* Paso 1: cliente */}
      <Panel className="mb-4">
        <div className="text-xs text-stone-400 uppercase tracking-wide mb-2">1. Elige el cliente</div>
        {cliente ? (
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <span className="font-medium">{cliente.cliente}</span>
              <span className="text-xs text-stone-400 ml-2">RUT {cliente.rut} · {cliente.ejecutivo || "sin ejecutivo"}</span>
            </div>
            <button
              onClick={() => { setRutCliente(""); setUnidadId(""); setEstacionamientoId(""); setSavedCotizacion(null); closePreview(); }}
              className="text-xs text-stone-500 hover:text-[#0F3D66] underline"
            >
              Elegir otro cliente
            </button>
          </div>
        ) : (
          <div className="relative">
            <input
              value={buscarCliente}
              onChange={(e) => setBuscarCliente(e.target.value)}
              placeholder="Buscar por nombre o RUT…"
              className="w-full border border-stone-300 rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-[#1E5AA8]"
            />
            {clientesFiltrados.length > 0 && (
              <div className="absolute z-10 mt-1 w-full bg-white border border-stone-200 rounded-sm shadow-lg max-h-64 overflow-y-auto">
                {clientesFiltrados.map((g) => (
                  <button
                    key={g.rut}
                    onClick={() => seleccionarCliente(g)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-stone-50 border-b border-stone-50 last:border-0"
                  >
                    <span className="font-medium">{g.cliente || "(sin nombre)"}</span>
                    <span className="text-xs text-stone-400 ml-2">RUT {g.rut}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </Panel>

      {/* Paso 2: unidad */}
      {cliente && (
        <Panel className="mb-4">
          <div className="text-xs text-stone-400 uppercase tracking-wide mb-2">2. Elige la unidad</div>
          {unidad ? (
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="text-sm">
                <span className="font-medium">Unidad {unidad.unidad}{unidad.modelo ? ` (Modelo ${unidad.modelo})` : ""}</span>
                <span className="text-xs text-stone-400 ml-2">
                  {unidad.tipologia || "—"} · {unidad.area ? `${unidad.area} m²` : "—"} · {currency(unidad.precio)} UF
                </span>
              </div>
              <button onClick={() => { setUnidadId(""); setEstacionamientoId(""); setSavedCotizacion(null); closePreview(); }} className="text-xs text-stone-500 hover:text-[#0F3D66] underline">
                Elegir otra unidad
              </button>
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <input
                  value={buscarUnidad}
                  onChange={(e) => setBuscarUnidad(e.target.value)}
                  placeholder="Buscar por unidad o tipología…"
                  className="flex-1 min-w-[180px] border border-stone-300 rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-[#1E5AA8]"
                />
                <select
                  value={filtroTipologia}
                  onChange={(e) => setFiltroTipologia(e.target.value)}
                  className="border border-stone-300 rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-[#1E5AA8]"
                >
                  <option value="">Todas las tipologías</option>
                  {tipologiasDisponibles.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              {unidadesFiltradas.length === 0 ? (
                <p className="text-sm text-stone-400">No hay unidades cargadas. Sube el listado de precios en la pestaña "Carga".</p>
              ) : (
                <div className="border border-stone-200 rounded-sm max-h-72 overflow-y-auto divide-y divide-stone-100">
                  {unidadesFiltradas.slice(0, 100).map((u) => {
                    const disponible = u.estado === "Disponible";
                    return (
                      <button
                        key={u.id}
                        onClick={() => elegirUnidad(u)}
                        disabled={!disponible}
                        className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-sm ${
                          disponible ? "hover:bg-stone-50" : "opacity-50 cursor-not-allowed bg-stone-50/50"
                        }`}
                      >
                        <span className="min-w-0">
                          Unidad {u.unidad}{u.modelo ? ` (Modelo ${u.modelo})` : ""}{" "}
                          <span className="text-xs text-stone-400">{u.tipologia || "—"} · {u.area ? `${u.area} m²` : "—"}</span>
                        </span>
                        <span className="flex items-center gap-2 shrink-0">
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full border ${
                              disponible ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-stone-200 text-stone-500 border-stone-300"
                            }`}
                          >
                            {u.estado}
                          </span>
                          <span className="text-xs font-mono">{currency(u.precio)} UF</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </Panel>
      )}

      {/* Paso 3: estacionamiento (opcional) */}
      {unidad && (
        <Panel className="mb-4">
          <div className="text-xs text-stone-400 uppercase tracking-wide mb-2">3. Agrega un estacionamiento (opcional)</div>
          {estacionamiento ? (
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="text-sm">
                <span className="font-medium">Estacionamiento {estacionamiento.unidad}</span>
                <span className="text-xs text-stone-400 ml-2">{currency(estacionamiento.precio)} UF</span>
              </div>
              <button onClick={() => elegirEstacionamiento("")} className="text-xs text-stone-500 hover:text-[#0F3D66] underline">
                Quitar estacionamiento
              </button>
            </div>
          ) : estacionamientosFiltrados.length === 0 ? (
            <p className="text-sm text-stone-400">No hay estacionamientos disponibles en el listado.</p>
          ) : (
            <div className="border border-stone-200 rounded-sm max-h-56 overflow-y-auto divide-y divide-stone-100">
              {estacionamientosFiltrados.slice(0, 100).map((e) => (
                <button
                  key={e.id}
                  onClick={() => elegirEstacionamiento(e.id)}
                  className="w-full flex items-center justify-between px-3 py-2 text-left text-sm hover:bg-stone-50"
                >
                  <span>Estacionamiento {e.unidad}</span>
                  <span className="text-xs font-mono">{currency(e.precio)} UF</span>
                </button>
              ))}
            </div>
          )}
        </Panel>
      )}

      {/* Paso 3: financiamiento */}
      {unidad && (
        <>
          <Panel className="mb-4">
            <div className="text-xs text-stone-400 uppercase tracking-wide mb-3">4. Financiamiento</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <Field label="Precio lista (UF)">
                <div className="ipt bg-stone-50 font-semibold text-[#0F3D66]">{currency(precioListaUF)}</div>
              </Field>
              <Field label={`Descuento (%)${unidad.descuentoMax != null ? ` — máx. ${unidad.descuentoMax}%` : ""}`}>
                <input
                  type="number"
                  value={descuentoPct}
                  onChange={(e) => setDescuentoPct(e.target.value)}
                  className="ipt"
                />
              </Field>
              <Field label="Bono pie (UF)">
                <div className="ipt bg-emerald-50 text-emerald-700 font-medium">{currency(descuentoUF)}</div>
              </Field>
              <Field label="Precio lista (CLP)">
                <div className="ipt bg-stone-50">{valorUF ? `$${currency(toCLP(precioListaUF))}` : "—"}</div>
              </Field>
            </div>

            <div className="text-xs text-stone-400 uppercase tracking-wide mb-2">Distribución del pie</div>
            <div className="border border-stone-200 rounded-sm overflow-hidden">
              <div className="grid grid-cols-[1.3fr_1fr_1fr_0.9fr] gap-2 px-3 py-2 text-[10px] text-stone-400 uppercase bg-stone-50">
                <span>Concepto</span>
                <span>%</span>
                <span>UF</span>
                <span>Cuotas</span>
              </div>
              {Object.keys(rows).map((key) => {
                const row = rows[key];
                const ufValue = rowValueUF(row, precioFinalUF);
                const pctValue = precioFinalUF > 0 ? (ufValue / precioFinalUF) * 100 : 0;
                return (
                  <div key={key} className="grid grid-cols-[1.3fr_1fr_1fr_0.9fr] gap-2 px-3 py-2 items-center border-t border-stone-100 text-sm">
                    <span>{ROW_LABEL[key]}</span>
                    <input
                      type="number"
                      value={row.modo === "%" ? row.valor : Math.round(pctValue * 10000) / 10000}
                      onChange={(e) => setRow(key, { modo: "%", valor: e.target.value })}
                      className="ipt text-xs"
                      style={{ width: "80px" }}
                    />
                    <input
                      type="number"
                      value={row.modo === "UF" ? row.valor : Math.round(ufValue * 100) / 100}
                      onChange={(e) => setRow(key, { modo: "UF", valor: e.target.value })}
                      className="ipt text-xs"
                      style={{ width: "80px" }}
                    />
                    {key === "contraEscritura" ? (
                      <select
                        value={cuotasContraEscritura}
                        onChange={(e) => setCuotasContraEscritura(Number(e.target.value))}
                        className="ipt text-xs"
                        style={{ width: "90px" }}
                      >
                        {Array.from({ length: 24 }, (_, i) => i + 1).map((n) => (
                          <option key={n} value={n}>{n === 1 ? "Al contado" : `${n} cuotas`}</option>
                        ))}
                      </select>
                    ) : (
                      <span />
                    )}
                  </div>
                );
              })}
            </div>
            {cuotasContraEscritura > 1 && (
              <p className="text-xs text-stone-500 mt-2">
                Contra escritura en {cuotasContraEscritura} cuotas de {currency(contraEscrituraUF / cuotasContraEscritura)} UF cada una
                (el plan de pago va en la segunda hoja del PDF).
              </p>
            )}
            <div className={`mt-3 text-xs font-medium ${distribucionValidada ? "text-emerald-700" : "text-amber-700"}`}>
              {distribucionValidada
                ? `✓ Distribución validada al 100% (${currency(totalDistribuidoUF)} UF ingresadas de ${currency(precioFinalUF)} UF)`
                : faltanteUF > 0
                ? `Llevas ${currencyDecimal(totalDistribuidoUF)} UF ingresadas de ${currency(precioFinalUF)} UF — faltan ${currencyDecimal(faltanteUF)} UF por distribuir`
                : `Llevas ${currencyDecimal(totalDistribuidoUF)} UF ingresadas de ${currency(precioFinalUF)} UF — sobran ${currencyDecimal(-faltanteUF)} UF distribuidas de más`}
            </div>

            <Field label="Observaciones" className="mt-4">
              <textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)} rows={2} className="ipt" />
            </Field>

            <div className="flex items-center gap-3 mt-4 flex-wrap">
              <button
                onClick={abrirVistaPrevia}
                disabled={generatingPreview || saving}
                className="bg-[#0F3D66] hover:bg-[#1E5AA8] disabled:opacity-50 text-white text-sm rounded-full px-5 py-2 flex items-center gap-2"
              >
                {generatingPreview || saving ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
                {generatingPreview || saving ? "Generando…" : "Vista previa y guardar"}
              </button>
              {savedCotizacion && (
                <span className="text-xs text-emerald-700 flex items-center gap-1">
                  <Check size={13} /> Guardada como N°{quoteNumber(savedCotizacion.displayId)}
                </span>
              )}
            </div>
          </Panel>

          {previewUrl && (
            <Panel className="mb-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs text-stone-400 uppercase tracking-wide">Vista previa</div>
                <a href={previewUrl} download={`Simulacion-${cliente?.cliente || "cliente"}.pdf`} className="text-xs text-[#0F3D66] underline">
                  Descargar PDF
                </a>
              </div>
              <iframe title="Vista previa simulación" src={previewUrl} className="w-full h-[600px] border border-stone-200 rounded-sm" />
            </Panel>
          )}
        </>
      )}

      {/* Historial del cliente */}
      {cliente && historial.length > 0 && (
        <Panel title={`Simulaciones anteriores de ${cliente.cliente}`}>
          <div className="flex flex-col gap-1">
            {historial.map((c) => (
              <div key={c.id} className="flex items-center justify-between text-sm border-b border-stone-50 py-2 last:border-0">
                <span>
                  N°{quoteNumber(c.displayId)} · {new Date(c.createdAt).toLocaleDateString("es-CL")} ·{" "}
                  {c.snapshot?.units?.[0]?.label || "—"} · {c.snapshot?.units?.[0]?.tipologia || "—"} · {currency(c.precioFinal)} UF
                </span>
                <button onClick={() => verCotizacionAnterior(c)} className="text-xs text-[#0F3D66] underline flex items-center gap-1">
                  <ChevronLeft size={12} className="rotate-180" /> Ver PDF
                </button>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}
