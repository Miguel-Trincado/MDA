import { useEffect, useMemo, useRef, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine, Cell } from "recharts";
import { Target, ChevronLeft, ChevronRight, Mail, Pencil, X, Plus, Trash2, Copy, Printer, Download, Check, AlertTriangle } from "lucide-react";
import { PageHeader, PAGE_CLASS, Panel, Field } from "./Shared";
import { fetchMetasCumplimiento, guardarMetasMesRemote } from "../lib/db";
import {
  TIPOS_META, promesasPorMes, proyectosDelAval, calcularMes, serieMeses, mesActual, mesMas, etiquetaMes, 
  pesos, pct1, informeHtml, informeTexto,
} from "../lib/metas";

const colorCumpl = (p) => (p >= 100 ? "#0f9d6b" : p >= 60 ? "#d98a00" : "#d6336c");

/* ------------------------------ Correo ------------------------------ */
const aHex = (c) => {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c || "");
  return m ? `#${[m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, "0")).join("")}` : c;
};
// Los correos (Outlook/Gmail) ignoran parte del CSS al pegar: repite colores como atributos bgcolor y <font color>.
function htmlCompatCorreo(html) {
  const doc = new DOMParser().parseFromString(`<div id="r">${html}</div>`, "text/html");
  doc.querySelectorAll("[style]").forEach((el) => {
    const bg = el.style.backgroundColor || (/background:\s*(#[0-9a-f]{3,6})/i.exec(el.getAttribute("style")) || [])[1];
    if (bg && !el.getAttribute("bgcolor") && !/gradient/.test(el.getAttribute("style"))) el.setAttribute("bgcolor", aHex(bg));
    if (el.tagName === "TR" && bg) el.querySelectorAll(":scope > td").forEach((td) => { if (!td.getAttribute("bgcolor")) td.setAttribute("bgcolor", aHex(bg)); });
    const col = el.style.color;
    if (col && el.childNodes.length && !["TABLE", "TR", "TBODY"].includes(el.tagName)) {
      const f = doc.createElement("font");
      f.setAttribute("color", aHex(col));
      while (el.firstChild) f.appendChild(el.firstChild);
      el.appendChild(f);
    }
  });
  return doc.getElementById("r").innerHTML;
}

function ModalCorreo({ r, serie, modo, onCerrar }) {
  const guardado = (() => { try { return localStorage.getItem("metas_destinatarios") || ""; } catch { return ""; } })();
  const [para, setPara] = useState(guardado);
  const [asunto, setAsunto] = useState(`${modo === "asignacion" ? "Asignación" : "Cumplimiento"} de metas ${etiquetaMes(r.mes)} - MDA Inmobiliaria`);
  const [intro, setIntro] = useState(modo === "asignacion" ? "Hola, te comparto la asignación de metas del período." : "Hola, te comparto el cumplimiento de metas del período.");
  const [aviso, setAviso] = useState("");
  const vistaRef = useRef(null);
  const html = useMemo(() => informeHtml(r, serie, modo), [r, serie, modo]);
  const texto = useMemo(() => informeTexto(r, serie, modo), [r, serie, modo]);

  useEffect(() => {
    const f = (e) => { if (e.key === "Escape") onCerrar(); };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [onCerrar]);
  const recordar = () => { try { localStorage.setItem("metas_destinatarios", para); } catch { /* sin almacenamiento */ } };

  async function generarPng() {
    const { default: html2canvas } = await import("html2canvas");
    const canvas = await html2canvas(vistaRef.current, { scale: 2, backgroundColor: "#ffffff", useCORS: true, logging: false });
    const blob = await new Promise((res) => canvas.toBlob(res, "image/png"));
    if (!blob) throw new Error("no se pudo generar la imagen");
    return blob;
  }
  // La promesa se pasa directo a ClipboardItem para conservar el permiso del clic mientras se genera la imagen.
  async function copiarImagen() {
    if (!window.ClipboardItem || !navigator.clipboard?.write) throw new Error("este navegador no permite copiar imágenes");
    await navigator.clipboard.write([new ClipboardItem({ "image/png": generarPng() })]);
  }
  async function descargarImagen() {
    try {
      const blob = await generarPng();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `Metas ${r.mes}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      setAviso("Imagen descargada. Insértala o adjúntala en tu correo.");
    } catch (e) { setAviso(`No se pudo generar la imagen: ${e.message}`); }
  }
  async function copiarHtml() {
    const completo = `<p style="font-family:Arial,sans-serif">${intro.replace(/</g, "&lt;")}</p>${htmlCompatCorreo(html)}`;
    if (window.ClipboardItem && navigator.clipboard?.write) {
      await navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([completo], { type: "text/html" }), "text/plain": new Blob([`${intro}\n\n${texto}`], { type: "text/plain" }) })]);
      return true;
    }
    return false;
  }
  async function abrirCorreo() {
    recordar();
    setAviso("Preparando informe…");
    let ok = false;
    let motivo = "";
    try { await copiarImagen(); ok = true; } catch (e) { motivo = e?.message || "error desconocido"; }
    const cuerpo = ok ? intro : `${intro}\n\n${texto.split("\n").slice(0, 14).join("\n")}`;
    setAviso(ok ? "Informe copiado como imagen con el diseño completo. En tu correo, haz clic en el mensaje y pega con Ctrl+V." : `No se pudo copiar la imagen (${motivo}). Usa "Descargar imagen" y adjúntala al correo.`);
    window.location.href = `mailto:${para.trim()}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`;
  }
  async function copiar() {
    recordar();
    try { await copiarImagen(); setAviso("Copiado como imagen. Pégalo en el correo con Ctrl+V: queda idéntico al diseño."); }
    catch (e) { setAviso(`No se pudo copiar la imagen (${e?.message || "error"}). Usa "Descargar imagen".`); }
  }
  async function copiarTablas() {
    recordar();
    try { setAviso((await copiarHtml()) ? "Tablas copiadas (editables). Algunos correos simplifican colores al pegar; para diseño exacto usa la imagen." : "Tu navegador no permite copiar con formato."); }
    catch { setAviso("No se pudo copiar automáticamente."); }
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
            <button onClick={copiar} className="inline-flex items-center justify-center gap-2 border border-[#1E5AA8] text-[#1E5AA8] hover:bg-[#1E5AA8] hover:text-white px-4 py-2.5 text-sm font-medium rounded-xl transition-colors"><Copy size={16} /> Copiar como imagen</button>
            <button onClick={copiarTablas} className="inline-flex items-center justify-center gap-2 border border-stone-300 text-stone-600 hover:bg-stone-50 px-4 py-2.5 text-sm rounded-xl"><Copy size={16} /> Copiar tablas (editable)</button>
            <button onClick={descargarImagen} className="inline-flex items-center justify-center gap-2 border border-stone-300 text-stone-600 hover:bg-stone-50 px-4 py-2.5 text-sm rounded-xl"><Download size={16} /> Descargar imagen</button>
            <button onClick={imprimir} className="inline-flex items-center justify-center gap-2 border border-stone-300 text-stone-600 hover:bg-stone-50 px-4 py-2.5 text-sm rounded-xl"><Printer size={16} /> Imprimir / guardar PDF</button>
            {aviso && <p className="text-xs text-emerald-700 bg-emerald-50 rounded-xl px-3 py-2">{aviso}</p>}
            <p className="text-[11px] text-stone-400">"Abrir en mi correo" copia el informe como imagen con el diseño exacto y abre tu correo con destinatario y asunto: solo pega (Ctrl+V).</p>
          </div>
          <div className="p-6 bg-stone-50 overflow-x-auto">
            <div className="text-[11px] uppercase tracking-wide text-stone-400 mb-2">Vista previa</div>
            <div ref={vistaRef} className="bg-white w-[760px] max-w-none border border-stone-200" dangerouslySetInnerHTML={{ __html: html }} />
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
  const [modo, setModo] = useState("asignacion");
  const asig = modo === "asignacion";

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
      <PageHeader title="Metas" subtitle="Asignación y cumplimiento de metas del Jefe de Ventas">
        <div className="flex items-center gap-2 flex-nowrap shrink-0">
          {esAdmin && (
            <button onClick={() => setEditando(true)} tabIndex={asig && !editando ? 0 : -1} aria-hidden={!(asig && !editando)} className={`h-11 inline-flex items-center gap-2 border border-[#1E5AA8] text-[#1E5AA8] hover:bg-[#1E5AA8] hover:text-white px-4 text-sm rounded-xl transition-colors whitespace-nowrap ${asig && !editando ? "" : "invisible pointer-events-none"}`}><Pencil size={15} /> {r.hayMeta ? "Editar metas" : "Asignar metas"}</button>
          )}
          <div className="h-11 flex items-center bg-white border border-[#EEF1F8] rounded-xl shadow-card">
            <button onClick={() => { setMes(mesMas(mes, -1)); setEditando(false); }} className="h-11 w-10 inline-flex items-center justify-center text-stone-500 hover:text-[#13234A]" aria-label="Mes anterior"><ChevronLeft size={16} /></button>
            <span className="px-2 text-sm font-medium text-[#13234A] w-[140px] text-center whitespace-nowrap">{etiquetaMes(mes)}</span>
            <button onClick={() => { setMes(mesMas(mes, 1)); setEditando(false); }} className="h-11 w-10 inline-flex items-center justify-center text-stone-500 hover:text-[#13234A]" aria-label="Mes siguiente"><ChevronRight size={16} /></button>
          </div>
          <button onClick={() => setCorreo(true)} disabled={!r.hayMeta} title={r.hayMeta ? "" : "Asigna las metas del mes para poder enviarlas"} className="h-11 inline-flex items-center gap-2 bg-[#0F3D66] hover:bg-[#1E5AA8] disabled:opacity-40 text-white px-4 text-sm font-medium rounded-xl shadow-sm whitespace-nowrap"><Mail size={15} /> Enviar por correo</button>
        </div>
      </PageHeader>

      {errorCarga && (
        <p className="mb-4 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
          No se pudieron leer las metas ({errorCarga}). Si es la primera vez, falta ejecutar la migración v204 en Supabase.
        </p>
      )}

      {editando && asig && (
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

      <div className="inline-flex p-1 mb-5 rounded-xl bg-white border border-[#EEF1F8] shadow-card">
        {[["asignacion", "1 · Asignación de metas"], ["cumplimiento", "2 · Cumplimiento de metas"]].map(([k, l]) => (
          <button key={k} onClick={() => { setModo(k); setEditando(false); }} className={`h-10 px-4 text-sm rounded-lg transition-colors ${modo === k ? "bg-[#0F3D66] text-white font-medium" : "text-stone-500 hover:text-[#13234A]"}`}>{l}</button>
        ))}
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
          <div className="mb-5">
            <div className="w-full rounded-2xl overflow-hidden shadow-card border border-[#EEF1F8]" dangerouslySetInnerHTML={{ __html: informeHtml(r, [], modo, true) }} />
          </div>
          {!r.pesoOk && <p className="text-xs text-amber-700 mb-3"><AlertTriangle size={12} className="inline" /> Los pesos suman {pct1(g.peso)}; deberían sumar 100%.</p>}
          {!asig && r.sinTipo > 0 && <p className="text-xs text-amber-700 mb-3"><AlertTriangle size={12} className="inline" /> {r.sinTipo} promesa(s) del mes no tienen tipo de unidad en el listado de precios y no se cuentan por tipo.</p>}
        </>
      )}

      {/* Mes a mes */}
      {!asig && <Panel title="Cumplimiento mes a mes">
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
      </Panel>}

      {correo && <ModalCorreo r={r} serie={serie} modo={modo} onCerrar={() => setCorreo(false)} />}
    </div>
  );
}
