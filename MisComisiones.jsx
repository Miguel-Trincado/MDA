import { useEffect, useState } from "react";
import { Calendar } from "lucide-react";
import { fetchComisionesVentas, fetchComisionesValidacion, fetchComisionesPeriodos, responderComisionRemote } from "../lib/db";
import { periodoDe, rangoTexto } from "../lib/comisionesPeriodo";
import { todayISO } from "../lib/helpers";
import { currencyDecimal } from "../lib/quotePdf";
import { MESES_ES } from "../lib/constants";
import { Panel, PageHeader } from "./Shared";

const ufFmt = (n) => new Intl.NumberFormat("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0);

function mesLabel(key) {
  const [y, m] = (key || "").split("-");
  return y && m ? `${MESES_ES[Number(m) - 1]} ${y}` : key;
}

function tramoPct(total) {
  if (total <= 1) return 0.5;
  if (total === 2) return 0.6;
  return 0.75;
}

// Vista de solo lectura para una ejecutiva: la base (RLS) solo le entrega
// sus propias ventas y su propia validación, así que aunque manipulara la
// consulta no vería a otras.
export default function MisComisiones({ ejecutivo }) {
  const [mes, setMes] = useState(todayISO().slice(0, 7));
  const [ventas, setVentas] = useState([]);
  const [validaciones, setValidaciones] = useState({});
  const [periodos, setPeriodos] = useState({});
  const [rechazando, setRechazando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [respondiendo, setRespondiendo] = useState(false);
  const [errorRespuesta, setErrorRespuesta] = useState("");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelado = false;
    Promise.all([fetchComisionesVentas(), fetchComisionesValidacion(), fetchComisionesPeriodos().catch(() => ({}))])
      .then(([v, val, pe]) => {
        if (cancelado) return;
        setVentas(Object.values(v));
        setValidaciones(val);
        setPeriodos(pe);
      })
      .catch((e) => !cancelado && setError(e.message || "No se pudieron cargar tus comisiones"))
      .finally(() => !cancelado && setCargando(false));
    return () => {
      cancelado = true;
    };
  }, []);

  const delMes = ventas.filter((v) => v.mes === mes).sort((a, b) => String(a.unidadLabel).localeCompare(String(b.unidadLabel)));
  const val = validaciones[`${mes}__${ejecutivo}`];
  const validado = !!val?.validado;
  const valorUf = Number(val?.valorUf) || 0;
  const retencion = Number(val?.retencionPct ?? 0);
  const pctAuto = tramoPct(delMes.length);
  const periodo = periodoDe(mes, periodos);
  const aceptacion = val?.aceptacion || "pendiente";

  async function responder(decision) {
    setRespondiendo(true);
    setErrorRespuesta("");
    try {
      const saved = await responderComisionRemote(mes, decision, motivo);
      setValidaciones((v) => ({ ...v, [`${mes}__${ejecutivo}`]: saved }));
      setRechazando(false);
      setMotivo("");
    } catch (e) {
      setErrorRespuesta(/responder_comision|does not exist|schema cache/i.test(e.message || "") ? "Falta activar esta función en el sistema (migración v177). Avisa al administrador." : (e.message || "No se pudo registrar tu respuesta"));
    } finally {
      setRespondiendo(false);
    }
  }

  const filas = delMes.map((v) => {
    const pct = v.tramoPct != null ? Number(v.tramoPct) : pctAuto;
    const precioNeto = Number(v.precioUf) - (Number(v.descuentoUf) || 0);
    const comisionUf = precioNeto * (pct / 100);
    const bruto = validado && valorUf ? comisionUf * valorUf : null;
    const neto = bruto != null ? bruto * (1 - retencion / 100) : null;
    return { ...v, pct, precioNeto, comisionUf, bruto, neto };
  });
  const totUf = filas.reduce((s, f) => s + f.comisionUf, 0);
  const totBruto = filas.reduce((s, f) => s + (f.bruto || 0), 0);
  const totNeto = filas.reduce((s, f) => s + (f.neto || 0), 0);

  return (
    <div className="max-w-6xl mx-auto px-5 pt-4 pb-6">
      <PageHeader title="Mis comisiones" subtitle={ejecutivo ? `Ejecutiva: ${ejecutivo}` : "Tu perfil no tiene ejecutiva asignada"}>
        <div className="bg-white border border-stone-200 rounded-xl shadow-sm px-4 py-2.5">
          <div className="text-xs text-stone-400 mb-1">Mes</div>
          <label className="flex items-center gap-2 cursor-pointer">
            <Calendar size={16} className="text-[#0F3D66]" />
            <input
              type="month"
              value={mes}
              onChange={(e) => setMes(e.target.value)}
              className="text-sm font-medium text-[#0F3D66] outline-none bg-transparent cursor-pointer"
            />
          </label>
        </div>
      </PageHeader>

      {cargando && <p className="text-stone-400 text-sm">Cargando…</p>}
      {error && <p className="text-rose-600 text-sm">{error}</p>}

      {!cargando && !error && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <Panel><div className="text-xs text-stone-400">Unidades promesadas</div><div className="text-2xl font-display text-[#0F3D66]">{filas.length}</div></Panel>
            <Panel><div className="text-xs text-stone-400">Comisión total</div><div className="text-2xl font-display text-[#0F3D66]">{ufFmt(totUf)} UF</div></Panel>
            <Panel><div className="text-xs text-stone-400">Bruto</div><div className="text-2xl font-display text-[#0F3D66]">{validado ? `$${currencyDecimal(totBruto)}` : "—"}</div></Panel>
            <Panel><div className="text-xs text-stone-400">Neto (tras retención)</div><div className="text-2xl font-display text-emerald-700">{validado ? `$${currencyDecimal(totNeto)}` : "—"}</div></Panel>
          </div>

          <Panel title={mesLabel(mes)}>
            <p className="text-xs text-stone-400 mb-3">Período de comisiones: {rangoTexto(periodo)}</p>
            {validado && (
              <div className={`mb-4 rounded-xl border px-4 py-3 text-sm ${aceptacion === "aceptada" ? "border-emerald-300 bg-emerald-50/60" : aceptacion === "rechazada" ? "border-rose-300 bg-rose-50/60" : "border-sky-300 bg-sky-50/60"}`}>
                {aceptacion === "aceptada" ? (
                  <p className="text-emerald-800">✓ Aceptaste esta comisión{val?.aceptadaAt ? ` el ${new Date(val.aceptadaAt).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" })}` : ""}. El ciclo de pago quedó cerrado.</p>
                ) : aceptacion === "rechazada" ? (
                  <p className="text-rose-800">✗ Rechazaste esta comisión{val?.motivoRechazo ? `: “${val.motivoRechazo}”` : ""}. El administrador la revisará y volverá a validarla; entonces podrás responder de nuevo.</p>
                ) : (
                  <>
                    <p className="text-sky-900 mb-2">Tu comisión de {mesLabel(mes)} fue validada. Revísala y <strong>acéptala o recházala</strong> para cerrar el ciclo de pago.</p>
                    {rechazando ? (
                      <div className="flex flex-col gap-2 max-w-lg">
                        <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} placeholder="Cuéntanos qué no coincide (obligatorio)" className="ipt" />
                        <div className="flex items-center gap-3">
                          <button onClick={() => responder("rechazada")} disabled={respondiendo || !motivo.trim()} className="bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-sm rounded-lg px-4 py-2 font-medium">{respondiendo ? "Enviando…" : "Confirmar rechazo"}</button>
                          <button onClick={() => { setRechazando(false); setMotivo(""); setErrorRespuesta(""); }} className="text-xs text-stone-500 underline">Cancelar</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        <button onClick={() => responder("aceptada")} disabled={respondiendo} className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm rounded-lg px-4 py-2 font-medium">{respondiendo ? "Enviando…" : "Aceptar comisión"}</button>
                        <button onClick={() => setRechazando(true)} disabled={respondiendo} className="border border-rose-300 text-rose-700 hover:bg-rose-50 text-sm rounded-lg px-4 py-2 font-medium">Rechazar</button>
                      </div>
                    )}
                    {errorRespuesta && <p className="text-xs text-rose-600 mt-2">{errorRespuesta}</p>}
                  </>
                )}
              </div>
            )}
            <div className="mb-3">
              {validado ? (
                <span className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2.5 py-1">
                  Validado · UF ${currencyDecimal(valorUf)} · retención {retencion}%
                </span>
              ) : (
                <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2.5 py-1">
                  Pendiente de validación — los montos en pesos se muestran al validarse
                </span>
              )}
            </div>
            {filas.length === 0 ? (
              <p className="text-sm text-stone-400">No tienes ventas registradas en este mes.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-stone-400 border-b border-stone-200">
                      <th className="py-2 pr-3">Cliente</th>
                      <th className="py-2 pr-3">Unidad</th>
                      <th className="py-2 pr-3 text-right">Precio neto (UF)</th>
                      <th className="py-2 pr-3 text-right">%</th>
                      <th className="py-2 pr-3 text-right">Comisión (UF)</th>
                      <th className="py-2 pr-3 text-right">Bruto ($)</th>
                      <th className="py-2 text-right">Neto ($)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map((f) => (
                      <tr key={f.opp} className="border-b border-stone-100">
                        <td className="py-2 pr-3">{f.cliente || f.opp}</td>
                        <td className="py-2 pr-3">{f.unidadLabel}</td>
                        <td className="py-2 pr-3 text-right">{ufFmt(f.precioNeto)}</td>
                        <td className="py-2 pr-3 text-right">{String(f.pct).replace(".", ",")}%</td>
                        <td className="py-2 pr-3 text-right font-medium text-[#0F3D66]">{ufFmt(f.comisionUf)}</td>
                        <td className="py-2 pr-3 text-right">{f.bruto != null ? `$${currencyDecimal(f.bruto)}` : "—"}</td>
                        <td className="py-2 text-right text-emerald-700 font-medium">{f.neto != null ? `$${currencyDecimal(f.neto)}` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}
