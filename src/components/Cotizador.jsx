import { useState, useEffect, useMemo } from "react";
import { Search, FileText, Loader2, Check, ChevronLeft, Trash2 } from "lucide-react";
import { buildQuotePdfDoc, currency, currencyDecimal, quoteNumber } from "../lib/quotePdf";
import {
  fetchCotizacionesDeCliente,
  fetchTodasCotizacionesGeneradas,
  guardarCotizacionGenerada,
  eliminarCotizacionGenerada,
} from "../lib/db";
import { normalizarBusqueda, normalizeRut, calcularPlanCuotas } from "../lib/helpers";
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
  // Cliente "manual": prospecto que todavía no está en la cartera (gestion),
  // o sea que no aparece en ningún Aval cargado. Se guarda aparte porque
  // db.gestion no lo tiene — mismas tres propiedades que usa el resto del
  // Simulador de un cliente de gestion (cliente, rut, telefono, ejecutivo).
  const [clienteManual, setClienteManual] = useState(null);
  const [mostrarClienteManual, setMostrarClienteManual] = useState(false);
  const [nombreManual, setNombreManual] = useState("");
  const [rutManualInput, setRutManualInput] = useState("");
  const [errorManual, setErrorManual] = useState("");
  const [unidadId, setUnidadId] = useState("");
  const [buscarUnidad, setBuscarUnidad] = useState("");
  const [filtroTipologia, setFiltroTipologia] = useState("");
  const [estacionamientoId, setEstacionamientoId] = useState("");
  const [descuentoPct, setDescuentoPct] = useState("0");
  const [rows, setRows] = useState(FINANCIAMIENTO_ROWS_DEFAULT);
  const [cuotasContraEscritura, setCuotasContraEscritura] = useState(1);
  // Permite que la primera y/o la última cuota de la Contra escritura
  // tengan un monto propio (normalmente mayor), repartiendo el resto en
  // partes iguales entre las cuotas del medio — ver calcularPlanCuotas().
  const [primeraCuotaDistinta, setPrimeraCuotaDistinta] = useState(false);
  const [primeraCuotaMonto, setPrimeraCuotaMonto] = useState("");
  const [ultimaCuotaDistinta, setUltimaCuotaDistinta] = useState(false);
  const [ultimaCuotaMonto, setUltimaCuotaMonto] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [savedCotizacion, setSavedCotizacion] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [generatingPreview, setGeneratingPreview] = useState(false);
  const [historial, setHistorial] = useState([]);
  const [todasSimulaciones, setTodasSimulaciones] = useState([]);
  const [buscarTodas, setBuscarTodas] = useState("");
  const [eliminandoId, setEliminandoId] = useState(null);

  const { valorUF, loadingUF } = useValorUF();

  // El cliente puede venir de la cartera (gestion) o haber sido ingresado
  // a mano porque todavía no cotiza por el Aval — en ambos casos queda
  // con la misma forma (cliente, rut, telefono, ejecutivo) para que el
  // resto del Simulador no tenga que distinguir el origen.
  const clienteGestion = rutCliente ? db.gestion[rutCliente] : null;
  const cliente = clienteGestion || clienteManual;
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

  // Listado general de todas las simulaciones (de cualquier cliente), se
  // carga una sola vez al entrar al Simulador y se actualiza localmente
  // cada vez que se guarda una simulación nueva (sin tener que recargar).
  useEffect(() => {
    fetchTodasCotizacionesGeneradas()
      .then(setTodasSimulaciones)
      .catch(() => setTodasSimulaciones([]));
  }, []);

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
    setPrimeraCuotaDistinta(false);
    setPrimeraCuotaMonto("");
    setUltimaCuotaDistinta(false);
    setUltimaCuotaMonto("");
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

  const cuotasPlan = useMemo(
    () =>
      calcularPlanCuotas(
        contraEscrituraUF,
        cuotasContraEscritura,
        { activa: primeraCuotaDistinta, monto: primeraCuotaMonto },
        { activa: ultimaCuotaDistinta, monto: ultimaCuotaMonto }
      ),
    [contraEscrituraUF, cuotasContraEscritura, primeraCuotaDistinta, primeraCuotaMonto, ultimaCuotaDistinta, ultimaCuotaMonto]
  );

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
    cuotasPlan,
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
      setTodasSimulaciones((prev) => [saved, ...prev]);
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

  async function eliminarSimulacion(cot) {
    if (!window.confirm(`¿Eliminar la simulación N°${quoteNumber(cot.displayId)}? Esta acción no se puede deshacer.`)) return;
    setEliminandoId(cot.id);
    try {
      await eliminarCotizacionGenerada(cot.id);
      setHistorial((prev) => prev.filter((c) => c.id !== cot.id));
      setTodasSimulaciones((prev) => prev.filter((c) => c.id !== cot.id));
      if (savedCotizacion?.id === cot.id) {
        setSavedCotizacion(null);
        closePreview();
      }
    } catch (e) {
      setError(e.message || "No se pudo eliminar la simulación.");
    } finally {
      setEliminandoId(null);
    }
  }

  const seleccionarCliente = (g) => {
    setRutCliente(g.rut);
    setBuscarCliente("");
    setClienteManual(null);
    setUnidadId("");
    setSavedCotizacion(null);
    closePreview();
  };

  function confirmarClienteManual() {
    const rut = normalizeRut(rutManualInput);
    const nombre = nombreManual.trim();
    if (!rut) {
      setErrorManual("Ingresa el RUT del cliente.");
      return;
    }
    if (!nombre) {
      setErrorManual("Ingresa el nombre del cliente.");
      return;
    }
    setErrorManual("");
    setClienteManual({ rut, cliente: nombre, telefono: "", ejecutivo: "" });
    setRutCliente(rut);
    setMostrarClienteManual(false);
    setNombreManual("");
    setRutManualInput("");
    setUnidadId("");
    setSavedCotizacion(null);
    closePreview();
  }

  function quitarCliente() {
    setRutCliente("");
    setClienteManual(null);
    setUnidadId("");
    setEstacionamientoId("");
    setSavedCotizacion(null);
    closePreview();
  }

  return (
    <div className="max-w-4xl mx-auto px-5 pt-4 pb-6">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <h2 className="font-display text-3xl font-semibold text-[#0F3D66]">Simulador</h2>
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
              <span className="text-xs text-stone-400 ml-2">
                RUT {cliente.rut} · {cliente.ejecutivo || "sin ejecutivo"}
                {!clienteGestion && <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full border border-amber-300 bg-amber-50 text-amber-700">Cliente nuevo (no está en la cartera)</span>}
              </span>
            </div>
            <button onClick={quitarCliente} className="text-xs text-stone-500 hover:text-[#0F3D66] underline">
              Elegir otro cliente
            </button>
          </div>
        ) : mostrarClienteManual ? (
          <div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-2">
              <Field label="Nombre del cliente">
                <input value={nombreManual} onChange={(e) => setNombreManual(e.target.value)} className="ipt" placeholder="Nombre completo" />
              </Field>
              <Field label="RUT">
                <input value={rutManualInput} onChange={(e) => setRutManualInput(e.target.value)} className="ipt" placeholder="12345678-9" />
              </Field>
            </div>
            {errorManual && <p className="text-xs text-rose-600 mb-2">{errorManual}</p>}
            <div className="flex items-center gap-3">
              <button
                onClick={confirmarClienteManual}
                className="bg-[#0F3D66] hover:bg-[#1E5AA8] text-white text-sm rounded-full px-4 py-1.5"
              >
                Usar este cliente
              </button>
              <button
                onClick={() => { setMostrarClienteManual(false); setErrorManual(""); }}
                className="text-xs text-stone-500 hover:text-[#0F3D66] underline"
              >
                Cancelar
              </button>
            </div>
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
            <p className="text-xs text-stone-400 mt-2">
              ¿El cliente todavía no está en tu cartera?{" "}
              <button onClick={() => setMostrarClienteManual(true)} className="text-[#0F3D66] underline">
                Ingresarlo manualmente
              </button>
            </p>
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
              <div className="mt-3 border border-stone-200 rounded-sm p-3 bg-stone-50/60">
                <div className="text-xs text-stone-400 uppercase tracking-wide mb-2">
                  Primera y/o última cuota con monto distinto (opcional)
                </div>
                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={primeraCuotaDistinta}
                      onChange={(e) => setPrimeraCuotaDistinta(e.target.checked)}
                    />
                    Primera cuota
                  </label>
                  {primeraCuotaDistinta && (
                    <input
                      type="number"
                      value={primeraCuotaMonto}
                      onChange={(e) => setPrimeraCuotaMonto(e.target.value)}
                      placeholder="Monto UF"
                      className="ipt text-xs"
                      style={{ width: "100px" }}
                    />
                  )}
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={ultimaCuotaDistinta}
                      onChange={(e) => setUltimaCuotaDistinta(e.target.checked)}
                    />
                    Última cuota
                  </label>
                  {ultimaCuotaDistinta && (
                    <input
                      type="number"
                      value={ultimaCuotaMonto}
                      onChange={(e) => setUltimaCuotaMonto(e.target.value)}
                      placeholder="Monto UF"
                      className="ipt text-xs"
                      style={{ width: "100px" }}
                    />
                  )}
                </div>
                <p className="text-xs text-stone-500 mt-3">
                  {cuotasPlan.length > 0 && (cuotasPlan[0].especial || cuotasPlan[cuotasPlan.length - 1].especial) ? (
                    <>
                      Cuota 1: {currencyDecimal(cuotasPlan[0].montoUF)} UF
                      {cuotasPlan.length > 1 && (
                        <>
                          {" "}· Cuotas del medio ({cuotasPlan.filter((c, i) => !c.especial && i !== 0 && i !== cuotasPlan.length - 1).length}):{" "}
                          {currencyDecimal(cuotasPlan.find((c) => !c.especial)?.montoUF || 0)} UF cada una
                        </>
                      )}
                      {" "}· Cuota {cuotasPlan.length}: {currencyDecimal(cuotasPlan[cuotasPlan.length - 1].montoUF)} UF
                    </>
                  ) : (
                    <>
                      Contra escritura en {cuotasContraEscritura} cuotas de {currency(contraEscrituraUF / cuotasContraEscritura)} UF cada una
                    </>
                  )}{" "}
                  (el plan de pago va en la segunda hoja del PDF).
                </p>
              </div>
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
        <Panel title={`Simulaciones anteriores de ${cliente.cliente}`} className="mb-4">
          <div className="flex flex-col gap-1">
            {historial.map((c) => (
              <div key={c.id} className="flex items-center justify-between text-sm border-b border-stone-50 py-2 last:border-0">
                <span>
                  N°{quoteNumber(c.displayId)} · {new Date(c.createdAt).toLocaleDateString("es-CL")} ·{" "}
                  {c.snapshot?.units?.[0]?.label || "—"} · {c.snapshot?.units?.[0]?.tipologia || "—"} · {currency(c.precioFinal)} UF
                </span>
                <span className="flex items-center gap-3 shrink-0 ml-2">
                  <button onClick={() => verCotizacionAnterior(c)} className="text-xs text-[#0F3D66] underline flex items-center gap-1">
                    <ChevronLeft size={12} className="rotate-180" /> Ver PDF
                  </button>
                  <button
                    onClick={() => eliminarSimulacion(c)}
                    disabled={eliminandoId === c.id}
                    className="text-xs text-rose-600 hover:text-rose-800 underline flex items-center gap-1 disabled:opacity-50"
                  >
                    {eliminandoId === c.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />} Eliminar
                  </button>
                </span>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* Todas las simulaciones realizadas, de cualquier cliente */}
      <Panel title="Todas las simulaciones">
        <input
          value={buscarTodas}
          onChange={(e) => setBuscarTodas(e.target.value)}
          placeholder="Buscar por cliente o RUT…"
          className="w-full border border-stone-300 rounded-sm px-3 py-2 text-sm mb-3 focus:outline-none focus:border-[#1E5AA8]"
        />
        {(() => {
          const q = normalizarBusqueda(buscarTodas);
          const lista = !q
            ? todasSimulaciones
            : todasSimulaciones.filter(
                (c) =>
                  normalizarBusqueda(c.snapshot?.clientName || "").includes(q) ||
                  (c.rutCliente || "").toLowerCase().includes(q)
              );
          if (lista.length === 0) {
            return <p className="text-sm text-stone-400">Sin simulaciones{buscarTodas ? " para esa búsqueda" : " registradas todavía"}.</p>;
          }
          return (
            <div className="flex flex-col gap-1 max-h-96 overflow-y-auto">
              {lista.slice(0, 200).map((c) => (
                <div key={c.id} className="flex items-center justify-between text-sm border-b border-stone-50 py-2 last:border-0">
                  <span className="min-w-0">
                    N°{quoteNumber(c.displayId)} · {new Date(c.createdAt).toLocaleDateString("es-CL")} ·{" "}
                    <span className="font-medium">{c.snapshot?.clientName || "(sin nombre)"}</span>{" "}
                    <span className="text-xs text-stone-400">RUT {c.rutCliente}</span> ·{" "}
                    {c.snapshot?.units?.[0]?.label || "—"} · {currency(c.precioFinal)} UF
                  </span>
                  <span className="flex items-center gap-3 shrink-0 ml-2">
                    <button onClick={() => verCotizacionAnterior(c)} className="text-xs text-[#0F3D66] underline flex items-center gap-1">
                      <ChevronLeft size={12} className="rotate-180" /> Ver PDF
                    </button>
                    <button
                      onClick={() => eliminarSimulacion(c)}
                      disabled={eliminandoId === c.id}
                      className="text-xs text-rose-600 hover:text-rose-800 underline flex items-center gap-1 disabled:opacity-50"
                    >
                      {eliminandoId === c.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />} Eliminar
                    </button>
                  </span>
                </div>
              ))}
              {lista.length > 200 && (
                <p className="text-[11px] text-stone-400 mt-1">Mostrando las primeras 200 de {lista.length} simulaciones. Usa el buscador para acotar.</p>
              )}
            </div>
          );
        })()}
      </Panel>
    </div>
  );
}
