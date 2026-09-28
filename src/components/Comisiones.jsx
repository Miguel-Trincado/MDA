import { useState, useEffect, useMemo } from "react";
import { useAuthSession } from "../lib/useAuthSession";
import {
  fetchComisionesConfig, setComisionesConfigRemote,
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

// Tabla de tramos de comisión, escalonada por N° de orden de venta del
// ejecutivo dentro del mes (la 1ª unidad vendida ese mes va al 0,50%, la
// 2ª al 0,60%, la 3ª en adelante al 0,75%) — confirmado explícitamente
// por el usuario, no es "todas las unidades al % del total".
function tramoPct(orden) {
  if (orden <= 1) return 0.5;
  if (orden === 2) return 0.6;
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
  const [config, setConfig] = useState({});
  const [ventas, setVentas] = useState({});
  const [loadingDatos, setLoadingDatos] = useState(false);
  const [errorDatos, setErrorDatos] = useState("");

  const { valorUF: valorUFHoy, loading: loadingUFHoy } = useValorUFHoy();

  useEffect(() => {
    if (!session) return;
    let cancelado = false;
    setLoadingDatos(true);
    setErrorDatos("");
    Promise.all([fetchComisionesConfig(), fetchComisionesVentas()])
      .then(([c, v]) => {
        if (cancelado) return;
        setConfig(c);
        setVentas(v);
      })
      .catch((e) => !cancelado && setErrorDatos(e.message || "No se pudieron cargar los datos de comisiones."))
      .finally(() => !cancelado && setLoadingDatos(false));
    return () => {
      cancelado = true;
    };
  }, [session]);

  const configMes = config[mes];
  const [valorUfInput, setValorUfInput] = useState("");
  const [retencionInput, setRetencionInput] = useState(String(RETENCION_DEFAULT));
  const [guardandoConfig, setGuardandoConfig] = useState(false);

  useEffect(() => {
    if (configMes) {
      setValorUfInput(String(configMes.valorUf ?? valorUFHoy ?? ""));
      setRetencionInput(String(configMes.retencionPct ?? RETENCION_DEFAULT));
    } else {
      setValorUfInput(valorUFHoy != null ? String(valorUFHoy) : "");
      setRetencionInput(String(RETENCION_DEFAULT));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mes, configMes, valorUFHoy]);

  const valorUfMes = Number(valorUfInput) || 0;
  const retencionPct = Number(retencionInput) || 0;

  async function guardarConfig() {
    setGuardandoConfig(true);
    try {
      await setComisionesConfigRemote(mes, { valorUf: valorUfMes, retencionPct });
      setConfig((c) => ({ ...c, [mes]: { mes, valorUf: valorUfMes, retencionPct } }));
    } catch (e) {
      setErrorDatos(e.message || "No se pudo guardar la configuración del mes.");
    } finally {
      setGuardandoConfig(false);
    }
  }

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
          <h2 className="font-display text-2xl text-[#0F3D66]">Comisiones</h2>
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
          <Field label="Valor UF a usar este mes">
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
            onClick={guardarConfig}
            disabled={guardandoConfig}
            className="bg-[#0F3D66] hover:bg-[#1E5AA8] disabled:opacity-50 text-white text-sm rounded-sm px-4 py-2"
          >
            {guardandoConfig ? "Guardando…" : "Guardar configuración del mes"}
          </button>
          {configMes ? (
            <span className="text-xs text-emerald-700">
              Guardado: UF ${currencyDecimal(configMes.valorUf)} · retención {configMes.retencionPct}%
            </span>
          ) : (
            <span className="text-xs text-stone-400">Aún no se ha guardado un valor de UF fijo para {mesLabel(mes)}.</span>
          )}
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
              valorUfMes={valorUfMes}
              retencionPct={retencionPct}
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

function EjecutivoComisionPanel({ ejecutivo, opps, ventas, db, mes, valorUfMes, retencionPct, onGuardarVenta, onQuitarVenta }) {
  const filas = opps.map((o, i) => {
    const venta = ventas[o.opp];
    const orden = i + 1;
    const pct = tramoPct(orden);
    let comisionUf = null, brutoClp = null, netoClp = null, precioNetoUf = null;
    if (venta) {
      precioNetoUf = Number(venta.precioUf) * (1 - (Number(venta.descuentoPct) || 0) / 100);
      comisionUf = precioNetoUf * (pct / 100);
      brutoClp = comisionUf * valorUfMes;
      netoClp = brutoClp * (1 - retencionPct / 100);
    }
    return { ...o, orden, pct, venta, precioNetoUf, comisionUf, brutoClp, netoClp };
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
      {faltanAsignar > 0 && (
        <p className="text-xs text-amber-700 mb-3">
          {faltanAsignar} unidad(es) sin asignar todavía — elige la unidad vendida para calcular su comisión.
        </p>
      )}
      <div className="hidden md:grid grid-cols-[1.5fr_1.6fr_0.8fr_0.9fr_0.6fr_0.9fr_1fr_1fr] gap-2 px-3 py-2 text-[10px] text-stone-500 uppercase tracking-wide font-medium bg-stone-100 border border-b-0 border-stone-200 rounded-t-sm">
        <span>Cliente</span>
        <span>Unidad</span>
        <span>Orden</span>
        <span>Tramo</span>
        <span>Desc.</span>
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
      await onGuardarVenta({
        opp: f.opp,
        rut: f.rut,
        cliente: f.cliente,
        ejecutivo,
        mes,
        unidadLabel,
        precioUf: Number(precioUfInput) || 0,
        descuentoPct: Number(descuentoInput) || 0,
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
      <div className="grid grid-cols-1 md:grid-cols-[1.5fr_1.6fr_0.8fr_0.9fr_0.6fr_0.9fr_1fr_1fr] gap-2 items-center px-3 py-2 text-sm">
        <span className="truncate">
          {f.cliente} <span className="text-xs text-stone-400">RUT {f.rut}</span>
        </span>
        <span className="text-stone-700">{f.venta.unidadLabel}</span>
        <span className="text-stone-500">{f.orden}ª</span>
        <span className="text-stone-500">{f.pct}%</span>
        <span className="text-stone-500">{f.venta.descuentoPct}%</span>
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

  return (
    <div className="px-3 py-3 bg-amber-50/40">
      <div className="flex flex-wrap items-center gap-2 mb-2 text-sm">
        <span className="font-medium">{f.cliente}</span>
        <span className="text-xs text-stone-400">RUT {f.rut} · Opp {f.opp} · {f.orden}ª unidad ({f.pct}%)</span>
      </div>
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
