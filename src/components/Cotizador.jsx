import { useState, useEffect, useMemo } from "react";
import { Search, FileText, Loader2, Check, ChevronLeft } from "lucide-react";
import { buildQuotePdfDoc, currency, quoteNumber } from "../lib/quotePdf";
import { fetchCotizacionesDeCliente, guardarCotizacionGenerada } from "../lib/db";
import { Panel, Field } from "./Shared";

const FINANCIAMIENTO_ROWS_DEFAULT = {
  reserva: { modo: "%", valor: 0 },
  pie: { modo: "%", valor: 0 },
  contraEscritura: { modo: "%", valor: 5 },
  hipotecario: { modo: "%", valor: 80 },
};
const ROW_LABEL = { reserva: "Reserva", pie: "Pie", contraEscritura: "Contra escritura", hipotecario: "Crédito hipotecario" };

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
  const [descuentoPct, setDescuentoPct] = useState("0");
  const [rows, setRows] = useState(FINANCIAMIENTO_ROWS_DEFAULT);
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

  useEffect(() => {
    if (!rutCliente) {
      setHistorial([]);
      return;
    }
    fetchCotizacionesDeCliente(rutCliente).then(setHistorial).catch(() => setHistorial([]));
  }, [rutCliente]);

  const clientesFiltrados = useMemo(() => {
    if (!buscarCliente) return [];
    const q = buscarCliente.toLowerCase();
    return Object.values(db.gestion)
      .filter((g) => (g.cliente || "").toLowerCase().includes(q) || (g.rut || "").includes(q))
      .slice(0, 12);
  }, [db.gestion, buscarCliente]);

  const unidadesFiltradas = useMemo(() => {
    const q = buscarUnidad.toLowerCase();
    return Object.values(db.listaPrecios)
      .filter((u) => u.estado === "Disponible" && u.tipo === "Departamento")
      .filter((u) => !q || u.unidad.toLowerCase().includes(q) || (u.tipologia || "").toLowerCase().includes(q))
      .sort((a, b) => (Number(a.precio) || 0) - (Number(b.precio) || 0));
  }, [db.listaPrecios, buscarUnidad]);

  function elegirUnidad(u) {
    setUnidadId(u.id);
    setSavedCotizacion(null);
    closePreview();
    setDescuentoPct(u.descuentoMax != null ? String(u.descuentoMax) : "0");
  }

  const setRow = (key, patch) => setRows((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));

  const precioListaUF = unidad ? Number(unidad.precio) || 0 : 0;
  const descuentoUF = (precioListaUF * (Number(descuentoPct) || 0)) / 100;
  const precioFinalUF = precioListaUF - descuentoUF;

  const rowValueUF = (row, baseUF) => (row.modo === "%" ? (baseUF * (Number(row.valor) || 0)) / 100 : Number(row.valor) || 0);
  const reservaUF = rowValueUF(rows.reserva, precioFinalUF);
  const pieUF = rowValueUF(rows.pie, precioFinalUF);
  const contraEscrituraUF = rowValueUF(rows.contraEscritura, precioFinalUF);
  const hipotecarioUF = rowValueUF(rows.hipotecario, precioFinalUF);
  const totalDistribuidoUF = reservaUF + pieUF + contraEscrituraUF + hipotecarioUF;
  const distribucionValidada = Math.abs(totalDistribuidoUF - precioFinalUF) < 0.5;
  const toCLP = (uf) => (valorUF ? uf * valorUF : 0);

  const quoteSnapshot = () => ({
    clientName: cliente?.cliente || null,
    clientRut: cliente?.rut || null,
    clientPhone: cliente?.telefono || null,
    agentName: cliente?.ejecutivo || null,
    units: unidad ? [{ label: `Unidad ${unidad.unidad}`, tipologia: unidad.tipologia, area: unidad.area, priceUF: precioListaUF }] : [],
    subtotal: precioListaUF,
    discount: descuentoUF,
    descuentoPct,
    precioFinalUF,
    valorUF,
    reservaUF,
    pieUF,
    contraEscrituraUF,
    hipotecarioRowUF: hipotecarioUF,
    totalDistribuidoUF,
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
        subtotal: precioListaUF,
        descuento: descuentoUF,
        precioFinal: precioFinalUF,
        reserva: reservaUF,
        observaciones: observaciones?.trim() || "",
        snapshot: quoteSnapshot(),
      });
      setSavedCotizacion(saved);
      setHistorial((prev) => [saved, ...prev]);
      return saved;
    } catch (e) {
      setError(e.message || "No se pudo guardar la cotización.");
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
      setError("Elige una unidad antes de generar la cotización.");
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
        <h2 className="font-display text-2xl text-[#0F3D66]">Cotizador</h2>
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
              onClick={() => { setRutCliente(""); setUnidadId(""); setSavedCotizacion(null); closePreview(); }}
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
              <button onClick={() => { setUnidadId(""); setSavedCotizacion(null); closePreview(); }} className="text-xs text-stone-500 hover:text-[#0F3D66] underline">
                Elegir otra unidad
              </button>
            </div>
          ) : (
            <div>
              <input
                value={buscarUnidad}
                onChange={(e) => setBuscarUnidad(e.target.value)}
                placeholder="Buscar por unidad o tipología…"
                className="w-full border border-stone-300 rounded-sm px-3 py-2 text-sm mb-3 focus:outline-none focus:border-[#1E5AA8]"
              />
              {unidadesFiltradas.length === 0 ? (
                <p className="text-sm text-stone-400">No hay unidades disponibles. Sube el listado de precios en la pestaña "Carga".</p>
              ) : (
                <div className="border border-stone-200 rounded-sm max-h-72 overflow-y-auto divide-y divide-stone-100">
                  {unidadesFiltradas.slice(0, 100).map((u) => (
                    <button
                      key={u.id}
                      onClick={() => elegirUnidad(u)}
                      className="w-full flex items-center justify-between px-3 py-2 text-left text-sm hover:bg-stone-50"
                    >
                      <span>
                        Unidad {u.unidad}{u.modelo ? ` (Modelo ${u.modelo})` : ""} <span className="text-xs text-stone-400">{u.tipologia || "—"} · {u.area ? `${u.area} m²` : "—"}</span>
                      </span>
                      <span className="text-xs font-mono">{currency(u.precio)} UF</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </Panel>
      )}

      {/* Paso 3: financiamiento */}
      {unidad && (
        <>
          <Panel className="mb-4">
            <div className="text-xs text-stone-400 uppercase tracking-wide mb-3">3. Financiamiento</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <Field label="Precio lista (UF)">
                <div className="ipt bg-stone-50">{currency(precioListaUF)}</div>
              </Field>
              <Field label={`Descuento (%)${unidad.descuentoMax != null ? ` — máx. ${unidad.descuentoMax}%` : ""}`}>
                <input
                  type="number"
                  value={descuentoPct}
                  onChange={(e) => setDescuentoPct(e.target.value)}
                  className="ipt"
                />
              </Field>
              <Field label="Precio final (UF)">
                <div className="ipt bg-stone-50 font-semibold text-[#0F3D66]">{currency(precioFinalUF)}</div>
              </Field>
              <Field label="Precio final (CLP)">
                <div className="ipt bg-stone-50">{valorUF ? `$${currency(toCLP(precioFinalUF))}` : "—"}</div>
              </Field>
            </div>

            <div className="text-xs text-stone-400 uppercase tracking-wide mb-2">Distribución del pie</div>
            <div className="border border-stone-200 rounded-sm overflow-hidden">
              <div className="grid grid-cols-[1.2fr_0.8fr_0.7fr_1fr] gap-2 px-3 py-2 text-[10px] text-stone-400 uppercase bg-stone-50">
                <span>Concepto</span>
                <span>Modo</span>
                <span>Valor</span>
                <span>Equivale a</span>
              </div>
              {Object.keys(rows).map((key) => (
                <div key={key} className="grid grid-cols-[1.2fr_0.8fr_0.7fr_1fr] gap-2 px-3 py-2 items-center border-t border-stone-100 text-sm">
                  <span>{ROW_LABEL[key]}</span>
                  <select value={rows[key].modo} onChange={(e) => setRow(key, { modo: e.target.value })} className="ipt text-xs">
                    <option value="%">%</option>
                    <option value="UF">UF</option>
                  </select>
                  <input
                    type="number"
                    value={rows[key].valor}
                    onChange={(e) => setRow(key, { valor: e.target.value })}
                    className="ipt text-xs"
                  />
                  <span className="text-xs text-stone-500">{currency(rowValueUF(rows[key], precioFinalUF))} UF</span>
                </div>
              ))}
            </div>
            <div className={`mt-3 text-xs font-medium ${distribucionValidada ? "text-emerald-700" : "text-amber-700"}`}>
              {distribucionValidada ? "✓ Distribución validada al 100%" : `Distribución de referencia: suma ${currency(totalDistribuidoUF)} UF de ${currency(precioFinalUF)} UF`}
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
                <a href={previewUrl} download={`Cotizacion-${cliente?.cliente || "cliente"}.pdf`} className="text-xs text-[#0F3D66] underline">
                  Descargar PDF
                </a>
              </div>
              <iframe title="Vista previa cotización" src={previewUrl} className="w-full h-[600px] border border-stone-200 rounded-sm" />
            </Panel>
          )}
        </>
      )}

      {/* Historial del cliente */}
      {cliente && historial.length > 0 && (
        <Panel title={`Cotizaciones anteriores de ${cliente.cliente}`}>
          <div className="flex flex-col gap-1">
            {historial.map((c) => (
              <div key={c.id} className="flex items-center justify-between text-sm border-b border-stone-50 py-2 last:border-0">
                <span>
                  N°{quoteNumber(c.displayId)} · {new Date(c.createdAt).toLocaleDateString("es-CL")} · {currency(c.precioFinal)} UF
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
