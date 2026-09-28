import { useState, useEffect, useMemo, useRef } from "react";
import { useAuthSession } from "../lib/useAuthSession";
import {
  fetchComisionesValidacion, setComisionesValidacionRemote,
  fetchComisionesVentas, guardarComisionVentaRemote, eliminarComisionVentaRemote,
} from "../lib/db";
import { parseFechaCompleta, todayISO } from "../lib/helpers";
import { currencyDecimal } from "../lib/quotePdf";
import { MESES_ES } from "../lib/constants";
import { Panel, Field } from "./Shared";

const RETENCION_DEFAULT = 14.5;

// Los montos en UF se muestran con 4 decimales (no 2): el % de comisión
// aplicado sobre un precio con decimales puede arrastrar una fracción de
// UF que a 2 decimales ya se ve "aproximada" — con 4 queda exacta.
const ufFmt = (n) => new Intl.NumberFormat("es-CL", { minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(Number(n) || 0);

function mesLabel(key) {
  const [y, m] = (key || "").split("-");
  if (!y || !m) return key;
  return `${MESES_ES[Number(m) - 1]} ${y}`;
}

function fechaHoraCl(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

// Tabla de tramos de comisión: el % depende del TOTAL de unidades que el
// ejecutivo vendió en el mes, y ese mismo % se aplica a TODAS sus unidades
// de ese mes (1 unidad → todas al 0,50%; 2 unidades → todas al 0,60%; 3 o
// más → todas al 0,75%) — corregido explícitamente por el usuario: no es
// un tramo distinto por cada unidad según su orden de venta. Este valor
// automático puede corregirse a mano caso a caso en cada fila (por
// ejemplo si el SII o la venta real califica distinto).
function tramoPctPorTotal(totalUnidades) {
  if (totalUnidades <= 1) return 0.5;
  if (totalUnidades === 2) return 0.6;
  return 0.75;
}

function useValorUFHoy() {
  const [valorUF, setValorUF] = useState(null);
  const [loading, setLoading] = useState(true);
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
        setLoading(false);
      }
    })();
  }, []);
  return { valorUF, loading };
}

export default function Comisiones({ db }) {
  const { session, email, setEmail, password, setPassword, loginError, loggingIn, handleLogin, handleLogout } = useAuthSession();

  const [mes, setMes] = useState(todayISO().slice(0, 7));
  // La UF y la retención de boleta de honorarios ya NO son un valor único
  // para todo el mes: cada ejecutivo entrega su boleta un día distinto y
  // se revisa caso a caso, así que se guardan y se aprueban ("validan")
  // por (mes, ejecutivo) — ver comisiones_validacion_ejecutivo.
  const [validaciones, setValidaciones] = useState({});
  const [ventas, setVentas] = useState({});
  const [loadingDatos, setLoadingDatos] = useState(false);
  const [errorDatos, setErrorDatos] = useState("");

  const { valorUF: valorUFHoy, loading: loadingUFHoy } = useValorUFHoy();

  useEffect(() => {
    if (!session) return;
    let cancelado = false;
    setLoadingDatos(true);
    setErrorDatos("");
    Promise.all([fetchComisionesValidacion(), fetchComisionesVentas()])
      .then(([v, ve]) => {
        if (cancelado) return;
        setValidaciones(v);
        setVentas(ve);
      })
      .catch((e) => !cancelado && setErrorDatos(e.message || "No se pudieron cargar los datos de comisiones."))
      .finally(() => !cancelado && setLoadingDatos(false));
    return () => {
      cancelado = true;
    };
  }, [session]);

  // Opp que pasaron a "Promesada" durante el mes elegido, con la misma
  // regla que "Promesados del mes" en el panel de la Jefa: solo cuenta
  // si hay una Fecha Promesa real; nunca se usa una fecha de respaldo.
  const promesadasPorEjecutivo = useMemo(() => {
    const vistos = new Map();
    (db.cambiosEstadoOpp || []).forEach((c) => {
      if (c.estadoNuevo !== "Promesada") return;
      const fecha = parseFechaCompleta(c.fechaPromesa);
      if (!fecha) return;
      if (fecha.toISOString().slice(0, 7) !== mes) return;
      if (vistos.has(c.opp)) return;
      vistos.set(c.opp, { opp: c.opp, rut: c.rut, fecha });
    });

    const grupos = {};
    vistos.forEach(({ opp, rut, fecha }) => {
      const g = db.gestion[rut];
      const ejecutivo = g?.ejecutivo || "(sin ejecutivo asignado)";
      if (!grupos[ejecutivo]) grupos[ejecutivo] = [];
      grupos[ejecutivo].push({ opp, rut, fecha, cliente: g?.cliente || "(cliente desconocido)" });
    });
    Object.values(grupos).forEach((arr) => arr.sort((a, b) => a.fecha - b.fecha));
    return grupos;
  }, [db.cambiosEstadoOpp, db.gestion, mes]);

  const ejecutivosOrdenados = useMemo(
    () => Object.keys(promesadasPorEjecutivo).sort((a, b) => a.localeCompare(b)),
    [promesadasPorEjecutivo]
  );

  // Cruce automático: el Aval trae el código de "Lote" de cada Opp y el
  // listado de precios trae ese mismo código en su columna "Codigo" — con
  // eso se identifica sola la unidad vendida, sin pedirle nada al
  // administrador. Se guarda como snapshot en comisiones_ventas apenas se
  // detecta (una sola vez por Opp, vía el ref de abajo) porque el listado
  // de precios se reemplaza completo cada vez que se sube uno nuevo.
  // Se normaliza (sin espacios extra, sin distinguir mayúsculas) antes de
  // comparar, porque el Aval y el listado de precios se escriben a mano en
  // Excel por personas distintas y un espacio de más o una mayúscula
  // distinta no debería impedir el cruce.
  const normalizarCodigo = (s) => String(s || "").trim().toUpperCase();

  // El listado real trae códigos repetidos (ej. estacionamientos listados
  // más de una vez). Si un código aparece varias veces, se prioriza la
  // fila que el listado marca como "Promesada" — es la que realmente
  // corresponde a la venta — y solo si ninguna lo está se usa la primera
  // como respaldo.
  const listaPreciosPorCodigo = useMemo(() => {
    const grupos = {};
    Object.values(db.listaPrecios || {}).forEach((u) => {
      if (!u.codigo) return;
      const key = normalizarCodigo(u.codigo);
      if (!grupos[key]) grupos[key] = [];
      grupos[key].push(u);
    });
    const map = {};
    Object.entries(grupos).forEach(([key, unidades]) => {
      map[key] = unidades.find((u) => u.estado === "Promesada") || unidades[0];
    });
    return map;
  }, [db.listaPrecios]);

  const autoAsignadosRef = useRef(new Set());
  useEffect(() => {
    if (!session || loadingDatos) return;
    const pendientes = [];
    Object.entries(promesadasPorEjecutivo).forEach(([ejecutivo, opps]) => {
      opps.forEach((o) => {
        if (ventas[o.opp] || autoAsignadosRef.current.has(o.opp)) return;
        const lote = db.cotizaciones[o.opp]?.lote;
        const unidad = lote ? listaPreciosPorCodigo[normalizarCodigo(lote)] : null;
        if (!unidad) return;
        pendientes.push({ opp: o.opp, rut: o.rut, cliente: o.cliente, ejecutivo, unidad });
      });
    });
    if (pendientes.length === 0) return;
    pendientes.forEach((p) => autoAsignadosRef.current.add(p.opp));
    (async () => {
      for (const p of pendientes) {
        try {
          const saved = await guardarComisionVentaRemote({
            opp: p.opp,
            rut: p.rut,
            cliente: p.cliente,
            ejecutivo: p.ejecutivo,
            mes,
            unidadLabel: `${p.unidad.unidad}${p.unidad.modelo ? ` (${p.unidad.modelo})` : ""}`,
            precioUf: Number(p.unidad.precio) || 0,
            descuentoPct: Number(p.unidad.descuentoMax) || 0,
          });
          setVentas((v) => ({ ...v, [saved.opp]: saved }));
        } catch (e) {
          console.error("No se pudo auto-asignar la comisión de la Opp", p.opp, e);
          autoAsignadosRef.current.delete(p.opp); // permite reintentar en el próximo render
        }
      }
    })();
  }, [session, loadingDatos, promesadasPorEjecutivo, ventas, db.cotizaciones, listaPreciosPorCodigo, mes]);

  async function guardarValidacionEjecutivo(ejecutivo, datos) {
    const saved = await setComisionesValidacionRemote(mes, ejecutivo, datos);
    setValidaciones((v) => ({ ...v, [`${mes}__${ejecutivo}`]: saved }));
  }

  if (session === undefined) {
    return <p className="text-stone-400 text-sm px-5 py-8">Verificando sesión…</p>;
  }

  if (!session) {
    return (
      <div className="max-w-md mx-auto px-5 py-16">
        <Panel>
          <div className="text-xs text-stone-400 uppercase tracking-wide mb-1">Solo administrador</div>
          <h2 className="font-display text-xl text-[#0F3D66] mb-4">Comisiones</h2>
          <p className="text-stone-500 text-sm mb-4">Esta sección es privada. Inicia sesión para continuar.</p>
          <form onSubmit={handleLogin} className="flex flex-col gap-3">
            <input
              type="email"
              placeholder="Correo"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="border border-stone-300 rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-[#1E5AA8]"
            />
            <input
              type="password"
              placeholder="Contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="border border-stone-300 rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-[#1E5AA8]"
            />
            {loginError && <div className="text-rose-600 text-xs">{loginError}</div>}
            <button
              type="submit"
              disabled={loggingIn}
              className="bg-[#0F3D66] hover:bg-[#1E5AA8] disabled:opacity-50 text-white px-4 py-2 text-sm font-medium rounded-sm"
            >
              {loggingIn ? "Ingresando…" : "Ingresar"}
            </button>
          </form>
        </Panel>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-5 py-6">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h2 className="font-display text-2xl text-[#0F3D66]">
            Comisiones <span className="text-[10px] align-middle text-stone-300 font-normal">build v79</span>
          </h2>
          <p className="text-stone-500 text-sm">Sesión: {session.user.email}</p>
        </div>
        <button onClick={handleLogout} className="text-xs text-stone-500 hover:text-[#0F3D66] underline">
          Cerrar sesión
        </button>
      </div>

      {errorDatos && (
        <div className="border border-rose-300 bg-rose-50 text-rose-800 text-sm px-4 py-3 rounded-sm mb-4">{errorDatos}</div>
      )}

      <Panel className="mb-5">
        <div className="flex flex-wrap items-end gap-4">
          <Field label="Mes">
            <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className="ipt" />
          </Field>
          <p className="text-xs text-stone-400 max-w-md">
            La UF y la retención de boleta ya no son un solo valor para todo el mes: cada ejecutivo entrega su boleta
            un día distinto, así que se configuran y se validan abajo, uno por uno.
          </p>
        </div>
      </Panel>

      {loadingDatos ? (
        <p className="text-stone-400 text-sm">Cargando comisiones…</p>
      ) : ejecutivosOrdenados.length === 0 ? (
        <div className="border border-stone-200 rounded-sm bg-white p-8 text-center text-stone-400 text-sm">
          No hay Opp promesadas con fecha real de promesa en {mesLabel(mes)}.
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {ejecutivosOrdenados.map((ejecutivo) => (
            <EjecutivoComisionPanel
              key={ejecutivo}
              ejecutivo={ejecutivo}
              opps={promesadasPorEjecutivo[ejecutivo]}
              ventas={ventas}
              db={db}
              mes={mes}
              valorUFHoy={valorUFHoy}
              loadingUFHoy={loadingUFHoy}
              validacion={validaciones[`${mes}__${ejecutivo}`]}
              onGuardarValidacion={(datos) => guardarValidacionEjecutivo(ejecutivo, datos)}
              onGuardarVenta={async (payload) => {
                const saved = await guardarComisionVentaRemote(payload);
                setVentas((v) => ({ ...v, [saved.opp]: saved }));
              }}
              onQuitarVenta={async (opp) => {
                await eliminarComisionVentaRemote(opp);
                setVentas((v) => {
                  const copy = { ...v };
                  delete copy[opp];
                  return copy;
                });
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function EjecutivoComisionPanel({
  ejecutivo, opps, ventas, db, mes, valorUFHoy, loadingUFHoy, validacion,
  onGuardarValidacion, onGuardarVenta, onQuitarVenta,
}) {
  const [editandoConfig, setEditandoConfig] = useState(!validacion);
  const [valorUfInput, setValorUfInput] = useState(String(validacion?.valorUf ?? valorUFHoy ?? ""));
  const [retencionInput, setRetencionInput] = useState(String(validacion?.retencionPct ?? RETENCION_DEFAULT));
  const [guardandoConfig, setGuardandoConfig] = useState(false);
  const [errorConfig, setErrorConfig] = useState("");

  useEffect(() => {
    if (validacion) {
      setValorUfInput(String(validacion.valorUf ?? ""));
      setRetencionInput(String(validacion.retencionPct ?? RETENCION_DEFAULT));
      setEditandoConfig(false);
    } else {
      setValorUfInput(valorUFHoy != null ? String(valorUFHoy) : "");
      setRetencionInput(String(RETENCION_DEFAULT));
      setEditandoConfig(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ejecutivo, mes, validacion?.valorUf, validacion?.retencionPct, validacion?.validado]);

  const valorUfMes = Number(valorUfInput) || 0;
  const retencionPct = Number(retencionInput) || 0;
  const validado = !!validacion?.validado;

  async function guardar(validar) {
    setGuardandoConfig(true);
    setErrorConfig("");
    try {
      await onGuardarValidacion({ valorUf: valorUfMes, retencionPct, validado: validar });
      setEditandoConfig(false);
    } catch (e) {
      setErrorConfig(e.message || "No se pudo guardar.");
    } finally {
      setGuardandoConfig(false);
    }
  }

  // El tramo automático depende del TOTAL de unidades del mes de este
  // ejecutivo (no del orden de cada venta) y es el mismo para todas.
  const pctAuto = tramoPctPorTotal(opps.length);

  const filas = opps.map((o, i) => {
    const venta = ventas[o.opp];
    const orden = i + 1;
    // Puede corregirse a mano por unidad (venta.tramoPct guardado) — cada
    // caso se revisa por separado, así que el automático es solo el
    // punto de partida.
    const pct = venta?.tramoPct != null ? Number(venta.tramoPct) : pctAuto;
    let comisionUf = null, brutoClp = null, netoClp = null, precioNetoUf = null;
    if (venta) {
      precioNetoUf = Number(venta.precioUf) * (1 - (Number(venta.descuentoPct) || 0) / 100);
      comisionUf = precioNetoUf * (pct / 100);
      brutoClp = comisionUf * valorUfMes;
      netoClp = brutoClp * (1 - retencionPct / 100);
    }
    return { ...o, orden, pctAuto, pct, venta, precioNetoUf, comisionUf, brutoClp, netoClp };
  });

  const totalComisionUf = filas.reduce((s, f) => s + (f.comisionUf || 0), 0);
  const totalBruto = filas.reduce((s, f) => s + (f.brutoClp || 0), 0);
  const totalNeto = filas.reduce((s, f) => s + (f.netoClp || 0), 0);
  const faltanAsignar = filas.filter((f) => !f.venta).length;

  return (
    <Panel>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <div className="font-display text-lg text-[#0F3D66]">{ejecutivo}</div>
        <div className="text-sm text-stone-600">
          {filas.length} unidad(es) · Comisión total:{" "}
          <span className="font-medium text-[#0F3D66]">{ufFmt(totalComisionUf)} UF</span> · Bruto{" "}
          <span className="font-medium">${currencyDecimal(totalBruto)}</span> · Neto{" "}
          <span className="font-medium text-emerald-700">${currencyDecimal(totalNeto)}</span>
        </div>
      </div>

      <div className={`border rounded-sm px-3 py-3 mb-3 ${validado ? "border-emerald-300 bg-emerald-50/50" : "border-amber-300 bg-amber-50/50"}`}>
        {editandoConfig ? (
          <div className="flex flex-wrap items-end gap-3">
            <Field label={`UF que entregó ${ejecutivo}`}>
              <input
                type="number"
                step="0.01"
                value={valorUfInput}
                onChange={(e) => setValorUfInput(e.target.value)}
                placeholder={loadingUFHoy ? "Obteniendo UF…" : ""}
                className="ipt w-32"
              />
            </Field>
            <Field label="Retención boleta honorarios (%)">
              <input
                type="number"
                step="0.1"
                value={retencionInput}
                onChange={(e) => setRetencionInput(e.target.value)}
                className="ipt w-28"
              />
            </Field>
            <button
              onClick={() => guardar(false)}
              disabled={guardandoConfig}
              className="border border-stone-300 text-sm rounded-sm px-3 py-2 text-stone-600 hover:border-[#1E5AA8] disabled:opacity-50"
            >
              Guardar
            </button>
            <button
              onClick={() => guardar(true)}
              disabled={guardandoConfig}
              className="bg-[#0F3D66] hover:bg-[#1E5AA8] disabled:opacity-50 text-white text-sm rounded-sm px-4 py-2"
            >
              {guardandoConfig ? "Guardando…" : "Guardar y validar"}
            </button>
            {validacion && (
              <button
                onClick={() => setEditandoConfig(false)}
                className="text-xs text-stone-400 hover:text-[#0F3D66] underline"
              >
                Cancelar
              </button>
            )}
            {errorConfig && <p className="text-xs text-rose-600 w-full">{errorConfig}</p>}
          </div>
        ) : (
          <div className="flex items-center justify-between flex-wrap gap-2 text-sm">
            <span>
              UF <span className="font-medium">{ufFmt(validacion.valorUf)}</span> · Retención{" "}
              <span className="font-medium">{validacion.retencionPct}%</span>
              {validado ? (
                <span className="ml-2 text-emerald-700 font-medium">
                  ✓ Validado {validacion.validadoAt ? `el ${fechaHoraCl(validacion.validadoAt)}` : ""}
                </span>
              ) : (
                <span className="ml-2 text-amber-700">Guardado, sin validar</span>
              )}
            </span>
            <span className="flex items-center gap-3">
              {!validado && (
                <button onClick={() => guardar(true)} disabled={guardandoConfig} className="text-xs text-emerald-700 hover:underline font-medium disabled:opacity-50">
                  Validar ahora
                </button>
              )}
              <button onClick={() => setEditandoConfig(true)} className="text-xs text-stone-500 hover:text-[#0F3D66] underline">
                {validado ? "Invalidar / editar" : "Editar"}
              </button>
            </span>
          </div>
        )}
      </div>

      {faltanAsignar > 0 && (
        <p className="text-xs text-amber-700 mb-3">
          {faltanAsignar} unidad(es) sin poder cruzar automáticamente con el listado de precios (el código de Lote de
          esa Opp no aparece en el listado actual) — asígnala a mano abajo.
        </p>
      )}
      <div className="hidden md:grid grid-cols-[1.4fr_1.5fr_0.7fr_0.9fr_0.6fr_0.9fr_1fr_1fr] gap-2 px-3 py-2 text-[10px] text-stone-500 uppercase tracking-wide font-medium bg-stone-100 border border-b-0 border-stone-200 rounded-t-sm">
        <span>Cliente</span>
        <span>Unidad</span>
        <span className="flex justify-center">Orden</span>
        <span className="flex justify-center">Tramo</span>
        <span className="flex justify-center">Desc.</span>
        <span>Comisión UF</span>
        <span>Bruto CLP</span>
        <span>Neto CLP</span>
      </div>
      <div className="border border-stone-200 rounded-b-sm divide-y divide-stone-200 overflow-hidden bg-white">
        {filas.map((f) => (
          <FilaComision key={f.opp} f={f} db={db} mes={mes} ejecutivo={ejecutivo} onGuardarVenta={onGuardarVenta} onQuitarVenta={onQuitarVenta} />
        ))}
      </div>
    </Panel>
  );
}

function FilaComision({ f, db, mes, ejecutivo, onGuardarVenta, onQuitarVenta }) {
  const [editando, setEditando] = useState(!f.venta);
  const [buscarUnidad, setBuscarUnidad] = useState("");
  const [unidadElegida, setUnidadElegida] = useState(null);
  const [precioUfInput, setPrecioUfInput] = useState(f.venta ? String(f.venta.precioUf) : "");
  const [descuentoInput, setDescuentoInput] = useState(f.venta ? String(f.venta.descuentoPct) : "0");
  const [tramoInput, setTramoInput] = useState(String(f.pct));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const unidadesFiltradas = useMemo(() => {
    if (!buscarUnidad) return [];
    const q = buscarUnidad.toLowerCase();
    return Object.values(db.listaPrecios || {})
      .filter((u) => (u.unidad || "").toLowerCase().includes(q) || (u.tipologia || "").toLowerCase().includes(q) || (u.modelo || "").toLowerCase().includes(q))
      .slice(0, 10);
  }, [db.listaPrecios, buscarUnidad]);

  function elegirUnidad(u) {
    setUnidadElegida(u);
    setBuscarUnidad("");
    setPrecioUfInput(u.precio != null ? String(u.precio) : "");
    setDescuentoInput(u.descuentoMax != null ? String(u.descuentoMax) : "0");
  }

  async function guardar() {
    const unidadLabel = unidadElegida
      ? `${unidadElegida.unidad}${unidadElegida.modelo ? ` (${unidadElegida.modelo})` : ""}`
      : f.venta?.unidadLabel;
    if (!unidadLabel) {
      setError("Elige la unidad vendida antes de guardar.");
      return;
    }
    setGuardando(true);
    setError("");
    try {
      // Si el tramo editado a mano coincide con el que se habría calculado
      // solo por orden, no vale la pena guardar un "override" — se deja en
      // null para que siga el cálculo automático por si el orden cambia
      // más adelante (ej. se agrega una venta anterior en el mes).
      const tramoNum = Number(tramoInput);
      const tramoOverride = Number.isFinite(tramoNum) && tramoNum !== f.pctAuto ? tramoNum : null;
      await onGuardarVenta({
        opp: f.opp,
        rut: f.rut,
        cliente: f.cliente,
        ejecutivo,
        mes,
        unidadLabel,
        precioUf: Number(precioUfInput) || 0,
        descuentoPct: Number(descuentoInput) || 0,
        tramoPct: tramoOverride,
      });
      setEditando(false);
    } catch (e) {
      setError(e.message || "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  }

  if (!editando && f.venta) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-[1.4fr_1.5fr_0.7fr_0.9fr_0.6fr_0.9fr_1fr_1fr] gap-2 items-center px-3 py-2 text-sm">
        <span className="truncate">
          {f.cliente} <span className="text-xs text-stone-400">RUT {f.rut}</span>
        </span>
        <span className="text-stone-700">{f.venta.unidadLabel}</span>
        <span className="text-stone-500 flex justify-center">{f.orden}ª</span>
        <span className="text-stone-500 flex justify-center">
          {f.pct}%{f.venta.tramoPct != null && <span className="text-amber-600" title="Corregido a mano"> *</span>}
        </span>
        <span className="text-stone-500 flex justify-center">{f.venta.descuentoPct}%</span>
        <span className="font-medium text-[#0F3D66]">{ufFmt(f.comisionUf)} UF</span>
        <span>${currencyDecimal(f.brutoClp)}</span>
        <span className="flex items-center justify-between gap-2">
          <span className="text-emerald-700 font-medium">${currencyDecimal(f.netoClp)}</span>
          <button onClick={() => setEditando(true)} className="text-xs text-stone-400 hover:text-[#0F3D66] underline shrink-0">
            Editar
          </button>
        </span>
      </div>
    );
  }

  const loteOpp = db.cotizaciones?.[f.opp]?.lote || "";

  return (
    <div className="px-3 py-3 bg-amber-50/40">
      <div className="flex flex-wrap items-center gap-2 mb-2 text-sm">
        <span className="font-medium">{f.cliente}</span>
        <span className="text-xs text-stone-400">RUT {f.rut} · Opp {f.opp} · {f.orden}ª unidad (automático: {f.pctAuto}%)</span>
      </div>
      {!f.venta && (
        <p className="text-xs text-stone-500 mb-2">
          Código de Lote en el Aval para esta Opp:{" "}
          <span className="font-mono bg-white border border-stone-300 rounded-sm px-1.5 py-0.5">
            {loteOpp || "(vacío — no vino informado en el Aval)"}
          </span>{" "}
          — revisa que exista exactamente ese código en la columna "Codigo" del listado de precios.
        </p>
      )}
      {!unidadElegida && !f.venta && (
        <div className="relative mb-2">
          <input
            value={buscarUnidad}
            onChange={(e) => setBuscarUnidad(e.target.value)}
            placeholder="Buscar unidad por N° o tipología…"
            className="ipt"
          />
          {unidadesFiltradas.length > 0 && (
            <div className="absolute z-10 left-0 right-0 bg-white border border-stone-300 rounded-sm shadow-md mt-1 max-h-56 overflow-auto">
              {unidadesFiltradas.map((u) => (
                <button
                  key={u.id}
                  onClick={() => elegirUnidad(u)}
                  className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-sky-50 text-left"
                >
                  <span>
                    Unidad {u.unidad} {u.modelo ? `(${u.modelo})` : ""}{" "}
                    <span className="text-xs text-stone-400">{u.tipologia}</span>
                  </span>
                  <span className="text-xs text-stone-500">{ufFmt(u.precio)} UF</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-end gap-3">
        {(unidadElegida || f.venta) && (
          <span className="text-sm text-stone-700">
            Unidad: <span className="font-medium">{unidadElegida ? unidadElegida.unidad : f.venta.unidadLabel}</span>{" "}
            {unidadElegida && (
              <button onClick={() => setUnidadElegida(null)} className="text-xs text-stone-400 hover:text-rose-600 underline">
                cambiar
              </button>
            )}
          </span>
        )}
        <Field label="Precio unidad (UF)">
          <input type="number" step="0.01" value={precioUfInput} onChange={(e) => setPrecioUfInput(e.target.value)} className="ipt w-32" />
        </Field>
        <Field label="Descuento (%)">
          <input type="number" step="0.01" value={descuentoInput} onChange={(e) => setDescuentoInput(e.target.value)} className="ipt w-24" />
        </Field>
        <Field label="Tramo (%)">
          <input type="number" step="0.01" value={tramoInput} onChange={(e) => setTramoInput(e.target.value)} className="ipt w-24" />
        </Field>
        <button
          onClick={guardar}
          disabled={guardando}
          className="bg-[#0F3D66] hover:bg-[#1E5AA8] disabled:opacity-50 text-white text-sm rounded-sm px-4 py-2"
        >
          {guardando ? "Guardando…" : "Guardar"}
        </button>
        {f.venta && (
          <button
            onClick={() => setEditando(false)}
            className="border border-stone-300 text-sm rounded-sm px-3 py-2 text-stone-600 hover:border-[#1E5AA8]"
          >
            Cancelar
          </button>
        )}
        {f.venta && (
          <button
            onClick={() => onQuitarVenta(f.opp)}
            className="text-xs text-rose-600 hover:underline"
          >
            Quitar asignación
          </button>
        )}
      </div>
      {error && <p className="text-xs text-rose-600 mt-2">{error}</p>}
    </div>
  );
}
