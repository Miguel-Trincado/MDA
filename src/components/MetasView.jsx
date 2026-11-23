import { useEffect, useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine, Cell } from "recharts";
import { Target, ChevronLeft, ChevronRight, Mail, Pencil, X, Plus, Trash2, Copy, Printer, Check, Gift, Trophy, AlertTriangle } from "lucide-react";
import { PageHeader, PAGE_CLASS, Panel, Field } from "./Shared";
import { fetchMetasCumplimiento, guardarMetasMesRemote } from "../lib/db";
import {
  TIPOS_META, promesasPorMes, proyectosDelAval, calcularMes, serieMeses, mesActual, mesMas, etiquetaMes, periodoTexto,
  pesos, pct1, informeHtml, informeTexto,
} from "../lib/metas";

const colorCumpl = (p) => (p >= 100 ? "#0f9d6b" : p >= 60 ? "#d98a00" : "#d6336c");

function Chip({ icon: Icon, label, valor, sub, color = "#13234A" }) {
  return (
    <div className="bg-white border border-[#EEF1F8] rounded-2xl shadow-card p-4">
      <div className="flex items-center gap-2 text-xs text-stone-500">{Icon && <Icon size={14} />} {label}</div>
      <div className="font-display text-3xl mt-1" style={{ color }}>{valor}</div>
      {sub && <div className="text-xs text-stone-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function BarraCumpl({ valor }) {
  return (
    <div className="h-2 rounded-full bg-stone-100 overflow-hidden min-w-[60px]">
      <div className="h-full rounded-full" style={{ width: `${Math.min(valor, 100)}%`, background: colorCumpl(valor) }} />
    </div>
  );
}

/* ------------------------------ Correo ------------------------------ */
function ModalCorreo({ r, serie, onCerrar }) {
  const guardado = (() => { try { return localStorage.getItem("metas_destinatarios") || ""; } catch { return ""; } })();
  const [para, setPara] = useState(guardado);
  const [asunto, setAsunto] = useState(`Cumplimiento de metas ${etiquetaMes(r.mes)} - MDA Inmobiliaria`);
  const [intro, setIntro] = useState("Hola, te comparto el cumplimiento de metas del período.");
  const [aviso, setAviso] = useState("");
  const html = useMemo(() => informeHtml(r, serie), [r, serie]);
  const texto = useMemo(() => informeTexto(r, serie), [r, serie]);

  useEffect(() => {
    const f = (e) => { if (e.key === "Escape") onCerrar(); };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [onCerrar]);
  const recordar = () => { try { localStorage.setItem("metas_destinatarios", para); } catch { /* sin almacenamiento */ } };

  function abrirCorreo() {
    recordar();
    const cuerpo = `${intro}\n\n${texto}`;
    const url = `mailto:${encodeURIComponent(para.trim()).replace(/%2C/gi, ",").replace(/%40/g, "@")}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`;
    if (url.length > 1900) setAviso("El informe es largo para el correo directo: se abrió con el resumen. Para enviarlo con tablas, usa \"Copiar con formato\" y pégalo en el correo.");
    window.location.href = url.length > 1900 ? `mailto:${para.trim()}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(`${intro}\n\n${texto.split("\n").slice(0, 12).join("\n")}`)}` : url;
  }
  async function copiar() {
    recordar();
    try {
      const completo = `<p style="font-family:Arial,sans-serif">${intro.replace(/</g, "&lt;")}</p>${html}`;
      if (window.ClipboardItem && navigator.clipboard?.write) {
        await navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([completo], { type: "text/html" }), "text/plain": new Blob([`${intro}\n\n${texto}`], { type: "text/plain" }) })]);
      } else {
        await navigator.clipboard.writeText(`${intro}\n\n${texto}`);
      }
      setAviso("Copiado. Pégalo en el cuerpo del correo (Ctrl+V): se mantiene el formato con las tablas.");
    } catch {
      setAviso("No se pudo copiar automáticamente. Selecciona la vista previa y cópiala con Ctrl+C.");
    }
  }
  function imprimir() {
    const w = window.open("", "_blank");
    if (!w) { setAviso("El navegador bloqueó la ventana. Permite las ventanas emergentes e inténtalo de nuevo."); return; }
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${asunto.replace(/</g, "&lt;")}</title></head><body style="margin:24px">${html}</body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-3" onClick={onCerrar}>
      <div role="dialog" aria-label="Enviar informe por correo" className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100">
          <div>
            <div className="font-display text-base text-[#13234A]">Enviar por correo</div>
            <div className="text-xs text-stone-500">Informe de {etiquetaMes(r.mes)} con el cumplimiento del Jefe de Ventas</div>
          </div>
          <button onClick={onCerrar} className="p-1 rounded-md hover:bg-stone-100 text-stone-500" aria-label="Cerrar"><X size={18} /></button>
        </div>
        <div className="overflow-y-auto grid grid-cols-1 lg:grid-cols-[320px_1fr]">
          <div className="p-6 border-b lg:border-b-0 lg:border-r border-stone-100 flex flex-col gap-3">
            <Field label="Para (separa con coma)">
              <input className="ipt" value={para} onChange={(e) => setPara(e.target.value)} placeholder="correo@empresa.cl" />
            </Field>
            <Field label="Asunto">
              <input className="ipt" value={asunto} onChange={(e) => setAsunto(e.target.value)} />
            </Field>
            <Field label="Mensaje">
              <textarea className="ipt" rows={3} value={intro} onChange={(e) => setIntro(e.target.value)} />
            </Field>
            <button onClick={abrirCorreo} className="inline-flex items-center justify-center gap-2 bg-[#0F3D66] hover:bg-[#1E5AA8] text-white px-4 py-2.5 text-sm font-medium rounded-xl"><Mail size={16} /> Abrir en mi correo</button>
            <button onClick={copiar} className="inline-flex items-center justify-center gap-2 border border-[#1E5AA8] text-[#1E5AA8] hover:bg-[#1E5AA8] hover:text-white px-4 py-2.5 text-sm font-medium rounded-xl transition-colors"><Copy size={16} /> Copiar con formato</button>
            <button onClick={imprimir} className="inline-flex items-center justify-center gap-2 border border-stone-300 text-stone-600 hover:bg-stone-50 px-4 py-2.5 text-sm rounded-xl"><Printer size={16} /> Imprimir / guardar PDF</button>
            {aviso && <p className="text-xs text-emerald-700 bg-emerald-50 rounded-xl px-3 py-2">{aviso}</p>}
            <p className="text-[11px] text-stone-400">"Abrir en mi correo" arma el mensaje en texto. Para enviar las tablas con formato, copia el informe y pégalo en el correo, o adjunta el PDF.</p>
          </div>
          <div className="p-6 bg-stone-50 overflow-x-auto">
            <div className="text-[11px] uppercase tracking-wide text-stone-400 mb-2">Vista previa</div>
            <div className="bg-white rounded-xl p-3 border border-stone-200" dangerouslySetInnerHTML={{ __html: html }} />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ Editor de metas ------------------------------ */
function EditorMetas({ mes, proyectos, inicial, onCancelar, onGuardar, guardando, error, copiarDe }) {
  const [filas, setFilas] = useState(inicial.filas);
  const [jefe, setJefe] = useState(inicial.jefe);
  const [bono100, setBono100] = useState(inicial.bono100);
  const [escala, setEscala] = useState(inicial.escala);
  const clave = (p, t) => `${p}|${t}`;
  const set = (p, t, campo, v) => setFilas((f) => ({ ...f, [clave(p, t)]: { ...(f[clave(p, t)] || { unidades: "", peso: "" }), [campo]: v } }));
  const sumaPeso = proyectos.reduce((s, p) => s + TIPOS_META.reduce((t, ti) => t + (Number(filas[clave(p, ti)]?.peso) || 0), 0), 0);

  function guardar() {
    const asignaciones = [];
    proyectos.forEach((p) => TIPOS_META.forEach((t) => {
      const f = filas[clave(p, t)];
      const unidades = Math.max(0, Math.round(Number(f?.unidades) || 0));
      const peso = Math.min(100, Math.max(0, Number(f?.peso) || 0));
      if (unidades > 0 || peso > 0) asignaciones.push({ proyecto: p, tipo: t, unidades, peso });
    }));
    onGuardar({
      asignaciones,
      config: {
        jefe: jefe.trim(), bono100: Math.max(0, Number(bono100) || 0),
        escala: escala.map((e) => ({ unidades: Math.round(Number(e.unidades) || 0), bono: Math.max(0, Number(e.bono) || 0) })).filter((e) => e.unidades > 0),
      },
    });
  }

  return (
    <Panel className="mb-5" title={`Asignar metas de ${etiquetaMes(mes)}`}>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <p className="text-xs text-stone-500 max-w-xl">Define las unidades meta y el peso (%) de cada tipo de unidad. Los pesos de todo el mes deben sumar 100%; un tipo con peso 0% cuenta como secundario.</p>
        {copiarDe && <button onClick={() => { setFilas(copiarDe.filas); setJefe(copiarDe.jefe); setBono100(copiarDe.bono100); setEscala(copiarDe.escala); }} className="text-xs text-[#1E5AA8] hover:underline">Copiar del mes anterior</button>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[480px]">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-stone-400 border-b border-stone-200">
              <th className="text-left font-medium py-2">Proyecto / tipo</th><th className="font-medium w-28">Unidades</th><th className="font-medium w-28">Peso %</th>
            </tr>
          </thead>
          <tbody>
            {proyectos.map((p) => (
              <FragmentoProyecto key={p} p={p} filas={filas} set={set} clave={clave} />
            ))}
          </tbody>
        </table>
      </div>
      <div className={`mt-2 text-xs ${Math.abs(sumaPeso - 100) < 0.01 ? "text-emerald-700" : "text-amber-700"}`}>
        {Math.abs(sumaPeso - 100) < 0.01 ? <><Check size={12} className="inline" /> Los pesos suman 100%</> : <><AlertTriangle size={12} className="inline" /> Los pesos suman {pct1(sumaPeso)} (deben sumar 100%)</>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5">
        <div className="flex flex-col gap-3">
          <Field label="Jefe de ventas del período">
            <input className="ipt" value={jefe} onChange={(e) => setJefe(e.target.value)} placeholder="Nombre y apellido" />
          </Field>
          <Field label="Bono por el 100% del cumplimiento ($)">
            <input className="ipt" type="number" min="0" value={bono100} onChange={(e) => setBono100(e.target.value)} />
          </Field>
        </div>
        <div>
          <div className="text-xs text-stone-500 mb-1.5">Escala de bonos por unidades vendidas</div>
          <div className="flex flex-col gap-2">
            {escala.map((e, i) => (
              <div key={i} className="flex items-center gap-2">
                <input className="ipt !w-24" type="number" min="1" placeholder="unid." value={e.unidades} onChange={(ev) => setEscala((l) => l.map((x, j) => (j === i ? { ...x, unidades: ev.target.value } : x)))} />
                <span className="text-xs text-stone-400">unidades →</span>
                <input className="ipt" type="number" min="0" placeholder="bono $" value={e.bono} onChange={(ev) => setEscala((l) => l.map((x, j) => (j === i ? { ...x, bono: ev.target.value } : x)))} />
                <button onClick={() => setEscala((l) => l.filter((_, j) => j !== i))} className="p-1.5 text-stone-400 hover:text-rose-600" aria-label="Quitar"><Trash2 size={15} /></button>
              </div>
            ))}
            <button onClick={() => setEscala((l) => [...l, { unidades: "", bono: "" }])} className="self-start inline-flex items-center gap-1 text-xs text-[#1E5AA8] hover:underline"><Plus size={13} /> Agregar tramo</button>
          </div>
        </div>
      </div>
      {error && <p className="text-xs text-rose-700 bg-rose-50 rounded-xl px-3 py-2 mt-3">{error}</p>}
      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onCancelar} disabled={guardando} className="px-4 py-2 text-sm rounded-xl border border-stone-200 text-stone-600 hover:bg-stone-50">Cancelar</button>
        <button onClick={guardar} disabled={guardando} className="px-5 py-2 text-sm rounded-xl bg-[#0F3D66] hover:bg-[#1E5AA8] text-white font-medium disabled:opacity-50">{guardando ? "Guardando…" : "Guardar metas"}</button>
      </div>
    </Panel>
  );
}

function FragmentoProyecto({ p, filas, set, clave }) {
  return (
    <>
      <tr><td colSpan={3} className="pt-3 pb-1 text-[13px] font-semibold text-[#1E5AA8]">{p}</td></tr>
      {TIPOS_META.map((t) => (
        <tr key={t} className="border-b border-stone-50">
          <td className="py-1 pl-3 text-stone-700">{t}</td>
          <td className="py-1 px-1"><input className="ipt !py-1.5 text-center" type="number" min="0" value={filas[clave(p, t)]?.unidades ?? ""} onChange={(e) => set(p, t, "unidades", e.target.value)} /></td>
          <td className="py-1 px-1"><input className="ipt !py-1.5 text-center" type="number" min="0" max="100" value={filas[clave(p, t)]?.peso ?? ""} onChange={(e) => set(p, t, "peso", e.target.value)} /></td>
        </tr>
      ))}
    </>
  );
}

/* ------------------------------ Pantalla ------------------------------ */
export default function MetasView({ db, esAdmin }) {
  const [datos, setDatos] = useState(null);
  const [errorCarga, setErrorCarga] = useState("");
  const [mes, setMes] = useState(mesActual());
  const [editando, setEditando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [errorGuardar, setErrorGuardar] = useState("");
  const [correo, setCorreo] = useState(false);

  async function cargar() {
    try {
      setDatos(await fetchMetasCumplimiento());
      setErrorCarga("");
    } catch (e) {
      setErrorCarga(e.message || "No se pudieron cargar las metas.");
      setDatos({ asignaciones: [], config: {} });
    }
  }
  useEffect(() => { cargar(); }, []);

  const promesas = useMemo(() => promesasPorMes(db.avalCompleto, db.tiposUnidad), [db.avalCompleto, db.tiposUnidad]);
  const asignaciones = datos?.asignaciones || [];
  const config = datos?.config || {};
  const r = useMemo(() => calcularMes({ mes, asignaciones, config, ventasMes: promesas[mes] }), [mes, asignaciones, config, promesas]);
  const mesesSerie = useMemo(() => Array.from({ length: 12 }, (_, i) => mesMas(mes, i - 11)), [mes]);
  const serie = useMemo(() => serieMeses({ meses: mesesSerie, asignaciones, config, promesas }), [mesesSerie, asignaciones, config, promesas]);
  const proyectosAval = useMemo(() => proyectosDelAval(db.avalCompleto), [db.avalCompleto]);
  const proyectosEditor = useMemo(() => [...new Set([...proyectosAval, ...asignaciones.filter((a) => a.mes === mes).map((a) => a.proyecto)])].sort(), [proyectosAval, asignaciones, mes]);

  const aBorrador = (m) => {
    const filas = {};
    asignaciones.filter((a) => a.mes === m).forEach((a) => { filas[`${a.proyecto}|${a.tipo}`] = { unidades: a.unidades, peso: a.peso }; });
    const c = config[m] || { jefe: "", bono100: 0, escala: [] };
    return { filas, jefe: c.jefe || "", bono100: c.bono100 || 0, escala: (c.escala || []).map((e) => ({ unidades: e.unidades, bono: e.bono })) };
  };
  const mesPrevioConMeta = [...new Set(asignaciones.map((a) => a.mes))].filter((m) => m < mes).sort().pop();

  async function guardar(payload) {
    setGuardando(true);
    setErrorGuardar("");
    try {
      await guardarMetasMesRemote(mes, payload);
      await cargar();
      setEditando(false);
    } catch (e) {
      setErrorGuardar(e.message || "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  }

  const g = r.general;
  return (
    <div className={PAGE_CLASS}>
      <PageHeader title="Metas" subtitle="Cumplimiento de metas del Jefe de Ventas, mes a mes">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center bg-white border border-[#EEF1F8] rounded-xl shadow-card">
            <button onClick={() => { setMes(mesMas(mes, -1)); setEditando(false); }} className="p-2.5 text-stone-500 hover:text-[#13234A]" aria-label="Mes anterior"><ChevronLeft size={16} /></button>
            <span className="px-2 text-sm font-medium text-[#13234A] min-w-[130px] text-center">{etiquetaMes(mes)}</span>
            <button onClick={() => { setMes(mesMas(mes, 1)); setEditando(false); }} className="p-2.5 text-stone-500 hover:text-[#13234A]" aria-label="Mes siguiente"><ChevronRight size={16} /></button>
          </div>
          {esAdmin && !editando && (
            <button onClick={() => setEditando(true)} className="inline-flex items-center gap-2 border border-[#1E5AA8] text-[#1E5AA8] hover:bg-[#1E5AA8] hover:text-white px-3.5 py-2.5 text-sm rounded-xl transition-colors"><Pencil size={15} /> {r.hayMeta ? "Editar metas" : "Asignar metas"}</button>
          )}
          <button onClick={() => setCorreo(true)} disabled={!r.hayMeta} title={r.hayMeta ? "" : "Asigna las metas del mes para poder enviarlas"} className="inline-flex items-center gap-2 bg-[#0F3D66] hover:bg-[#1E5AA8] disabled:opacity-40 text-white px-4 py-2.5 text-sm font-medium rounded-xl shadow-sm"><Mail size={15} /> Enviar por correo</button>
        </div>
      </PageHeader>

      {errorCarga && (
        <p className="mb-4 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
          No se pudieron leer las metas ({errorCarga}). Si es la primera vez, falta ejecutar la migración v204 en Supabase.
        </p>
      )}

      {editando && (
        <EditorMetas
          key={mes}
          mes={mes}
          proyectos={proyectosEditor}
          inicial={aBorrador(mes)}
          copiarDe={mesPrevioConMeta && !r.hayMeta ? aBorrador(mesPrevioConMeta) : null}
          onCancelar={() => { setEditando(false); setErrorGuardar(""); }}
          onGuardar={guardar}
          guardando={guardando}
          error={errorGuardar}
        />
      )}

      {/* Encabezado tipo planilla */}
      <div className="rounded-2xl overflow-hidden mb-5 text-white shadow-card" style={{ background: "linear-gradient(110deg,#141414 0%,#0B2547 55%,#0A3A78 100%)" }}>
        <div className="flex items-center gap-4 flex-wrap px-5 py-4">
          <img src="/logo-mda.jpg" alt="MDA Inmobiliaria" className="w-14 h-14 rounded-xl" />
          <div className="flex-1 min-w-[200px]">
            <div className="font-display text-2xl leading-tight">Asignación de metas</div>
            <div className="text-sm text-white/80 mt-0.5">Período: {periodoTexto(mes)}</div>
          </div>
          <div className="flex items-center gap-5 text-center">
            <div><div className="text-[11px] text-white/70">Unidades principales</div><div className="font-display text-2xl text-sky-300">{String(r.principales).padStart(2, "0")}</div></div>
            <div><div className="text-[11px] text-white/70">Unidades secundarias</div><div className="font-display text-2xl text-sky-300">{String(r.secundarias).padStart(2, "0")}</div></div>
            <div><div className="text-[11px] text-white/70">Total unidades</div><div className="font-display text-2xl text-sky-300">{String(g.unidades).padStart(2, "0")}</div></div>
          </div>
        </div>
      </div>

      {datos && !r.hayMeta ? (
        <Panel className="mb-5">
          <div className="text-center py-8">
            <Target size={28} className="mx-auto text-stone-300 mb-2" />
            <div className="text-stone-600 text-sm">No hay metas asignadas para {etiquetaMes(mes)}.</div>
            {r.totalPromesas > 0 && <div className="text-xs text-stone-500 mt-1">Ese mes hubo {r.totalPromesas} promesas registradas.</div>}
            {esAdmin ? <button onClick={() => setEditando(true)} className="mt-3 text-sm text-[#1E5AA8] hover:underline">Asignar las metas del mes</button> : <div className="text-xs text-stone-400 mt-1">El administrador las asigna.</div>}
          </div>
        </Panel>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-5 mb-5">
            <Panel>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[460px]">
                  <thead>
                    <tr className="bg-[#0B2E3F] text-white text-xs">
                      <th className="text-left font-semibold px-3 py-2 rounded-tl-lg">PROYECTOS</th><th className="font-semibold px-2">UNIDADES</th><th className="font-semibold px-2">PESO</th><th className="font-semibold px-2">VENDIDAS</th><th className="font-semibold px-2 rounded-tr-lg">CUMPLIMIENTO</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.bloques.map((b) => (
                      <FragmentoTabla key={b.proyecto} b={b} />
                    ))}
                    <tr className="bg-[#0B2E3F] text-white font-semibold">
                      <td className="px-3 py-2 rounded-bl-lg">TOTAL GENERAL</td>
                      <td className="text-center">{g.unidades}</td><td className="text-center">{pct1(g.peso)}</td><td className="text-center">{g.vendidas}</td><td className="text-center rounded-br-lg">{pct1(g.cumpl)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              {!r.pesoOk && <p className="text-xs text-amber-700 mt-2"><AlertTriangle size={12} className="inline" /> Los pesos suman {pct1(g.peso)}; deberían sumar 100%.</p>}
              {r.sinTipo > 0 && <p className="text-xs text-amber-700 mt-1"><AlertTriangle size={12} className="inline" /> {r.sinTipo} promesa(s) del mes no tienen tipo de unidad en el listado de precios y no se cuentan por tipo.</p>}
            </Panel>

            <div className="flex flex-col gap-4">
              <Chip icon={Trophy} label={`Cumplimiento del Jefe de Ventas${r.jefe ? ` · ${r.jefe}` : ""}`} valor={pct1(g.cumpl)} color={colorCumpl(g.cumpl)} sub={`${g.vendidas} vendidas de ${g.unidades} unidades de meta`} />
              <Panel title="Meta del mes">
                {r.escala.length === 0 ? <p className="text-xs text-stone-500">Sin escala de bonos definida.</p> : (
                  <div className="flex flex-col gap-1.5">
                    {r.escala.map((e) => {
                      const ok = r.vendidasPrincipales >= e.unidades;
                      return (
                        <div key={e.unidades} className={`flex items-center justify-between rounded-lg px-3 py-1.5 text-sm ${ok ? "bg-emerald-50 text-emerald-800" : "bg-stone-50 text-stone-600"}`}>
                          <span>{ok && <Check size={13} className="inline mr-1" />}{e.unidades} unidades</span><span className="font-semibold">{pesos(e.bono)}</span>
                        </div>
                      );
                    })}
                    <div className="text-xs text-stone-500 mt-1">Unidades principales vendidas: <b>{r.vendidasPrincipales}</b> · bono por escala: <b>{pesos(r.bonoEscala)}</b></div>
                  </div>
                )}
              </Panel>
              <Panel>
                <div className="flex items-center gap-3">
                  <span className="w-10 h-10 rounded-xl bg-[#EAF1FF] text-[#2563EB] inline-flex items-center justify-center"><Gift size={19} /></span>
                  <div className="flex-1">
                    <div className="text-xs text-stone-500">Bono por el 100% del cumplimiento</div>
                    <div className="font-display text-2xl text-[#1E5AA8]">{pesos(r.bono100Valor)}</div>
                  </div>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${r.logro100 ? "bg-emerald-50 text-emerald-700" : "bg-stone-100 text-stone-500"}`}>{r.logro100 ? "Logrado" : "No alcanzado"}</span>
                </div>
              </Panel>
            </div>
          </div>
        </>
      )}

      {/* Mes a mes */}
      <Panel title="Cumplimiento mes a mes">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-5 items-start">
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={serie.map((s) => ({ etiqueta: s.etiqueta, mes: s.mes, cumpl: s.hayMeta ? Math.round(s.general.cumpl * 10) / 10 : null }))} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#EEF1F8" />
                <XAxis dataKey="etiqueta" tick={{ fontSize: 11 }} interval={0} angle={-30} textAnchor="end" height={46} />
                <YAxis tick={{ fontSize: 11 }} unit="%" domain={[0, (m) => Math.max(110, Math.ceil(m / 10) * 10)]} />
                <Tooltip formatter={(v) => (v == null ? "sin meta" : `${v}%`)} />
                <ReferenceLine y={100} stroke="#0f9d6b" strokeDasharray="4 3" />
                <Bar dataKey="cumpl" radius={[5, 5, 0, 0]} onClick={(d) => d?.mes && setMes(d.mes)}>
                  {serie.map((s) => <Cell key={s.mes} fill={s.mes === mes ? "#1E5AA8" : colorCumpl(s.general.cumpl)} fillOpacity={s.mes === mes ? 1 : 0.75} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[360px]">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-stone-400 border-b border-stone-200"><th className="text-left font-medium py-2">Mes</th><th className="font-medium">Meta</th><th className="font-medium">Vendidas</th><th className="font-medium">Cumpl.</th><th className="font-medium text-right">Bono</th></tr>
              </thead>
              <tbody>
                {[...serie].reverse().map((s) => (
                  <tr key={s.mes} onClick={() => setMes(s.mes)} className={`border-b border-stone-50 cursor-pointer hover:bg-sky-50/60 ${s.mes === mes ? "bg-sky-50" : ""}`}>
                    <td className="py-1.5">{etiquetaMes(s.mes)}</td>
                    <td className="text-center">{s.hayMeta ? s.general.unidades : "—"}</td>
                    <td className="text-center">{s.hayMeta ? s.general.vendidas : s.totalPromesas || "—"}</td>
                    <td className="text-center font-semibold" style={{ color: s.hayMeta ? colorCumpl(s.general.cumpl) : "#a8a29e" }}>{s.hayMeta ? pct1(s.general.cumpl) : "sin meta"}</td>
                    <td className="text-right">{s.hayMeta ? pesos(s.bonoEscala + s.bono100) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Panel>

      {correo && <ModalCorreo r={r} serie={serie} onCerrar={() => setCorreo(false)} />}
    </div>
  );
}

function FragmentoTabla({ b }) {
  const filas = b.filas.filter((f) => f.unidades > 0 || f.vendidas > 0 || f.peso > 0);
  return (
    <>
      <tr><td colSpan={5} className="pt-3 pb-1 px-3 text-[13px] font-semibold text-[#1E5AA8]">{b.proyecto}</td></tr>
      {filas.map((f) => (
        <tr key={f.tipo} className="border-b border-stone-50">
          <td className="py-1.5 pl-6 text-stone-700">{f.tipo}</td>
          <td className="text-center">{f.unidades}</td>
          <td className="text-center">{pct1(f.peso)}</td>
          <td className="text-center">{f.vendidas}</td>
          <td className="px-2"><div className="flex items-center gap-2"><div className="flex-1"><BarraCumpl valor={f.unidades > 0 ? (f.vendidas / f.unidades) * 100 : 0} /></div><span className="w-12 text-right text-xs font-semibold" style={{ color: f.peso > 0 ? colorCumpl(f.unidades > 0 ? (f.vendidas / f.unidades) * 100 : 0) : "#a8a29e" }}>{pct1(f.cumpl)}</span></div></td>
        </tr>
      ))}
      <tr className="bg-stone-50 font-semibold text-[#1E5AA8]">
        <td className="py-1.5 pl-3">Total {b.proyecto}</td><td className="text-center text-[#13234A]">{b.total.unidades}</td><td className="text-center text-[#13234A]">{pct1(b.total.peso)}</td><td className="text-center text-[#13234A]">{b.total.vendidas}</td><td className="text-center text-[#13234A]">{pct1(b.total.cumpl)}</td>
      </tr>
    </>
  );
}
