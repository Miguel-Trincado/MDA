import { useEffect, useMemo, useState } from "react";
import { Upload, Download, X, Plus, Trash2, Save, RefreshCw } from "lucide-react";
import { PageHeader, PAGE_CLASS } from "./Shared";
import { fetchEscrituracion, guardarEscrituracionConfigRemote, guardarCasoEscrituracionRemote, subirDocumentoRemote, descargarDocumentoRemote } from "../lib/db";
import { ETAPAS, RESP_TIPOS, GATE, cfgEfectiva, cfgParaGuardar, calcularCaso, estadoDoc, estadoFecha, quien, unidadesSendero, isoDe, hoyLocal, fmtCorta, fmtLarga, diasCorridos } from "../lib/escrituracion";
import { descargarBlob, nombreSeguro } from "../lib/zip";

const COL = { ok: "bg-emerald-50 text-emerald-700", warn: "bg-amber-50 text-amber-700", bad: "bg-rose-50 text-rose-600", done: "bg-emerald-50 text-emerald-700", pend: "bg-stone-100 text-stone-500", cur: "bg-sky-50 text-sky-700", late: "bg-orange-50 text-orange-600" };
const TXT = { ok: "En plazo", warn: "Por vencer", bad: "Vencido", done: "Terminado", pend: "Pendiente" };
const Pill = ({ k, children }) => <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap ${COL[k]}`}>{children ?? TXT[k]}</span>;
const Btn = ({ children, onClick, disabled, pri, className = "" }) => (
  <button onClick={onClick} disabled={disabled} className={`h-9 px-3 text-[12.5px] rounded-xl border inline-flex items-center gap-1.5 whitespace-nowrap disabled:opacity-40 ${pri ? "bg-[#0F3D66] border-[#0F3D66] text-white hover:bg-[#1E5AA8]" : "border-[#1E5AA8] text-[#1E5AA8] bg-white hover:bg-[#EAF1FF]"} ${className}`}>{children}</button>
);
const ipt = "h-9 px-2.5 rounded-lg border border-[#D5DDEE] text-sm bg-white";
const Card = ({ title, children, className = "" }) => (
  <div className={`bg-white border border-[#EEF1F8] rounded-2xl p-4 shadow-card ${className}`}>{title && <div className="text-[11px] font-extrabold tracking-wider text-[#13234A] mb-3">{title}</div>}{children}</div>
);

export default function EscrituracionView({ db, esAdmin }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("seg");
  const [ficha, setFicha] = useState(null);
  const [F, setF] = useState({ q: "", est: "", etapa: "" });
  const [aviso, setAviso] = useState("");
  const hoy = useMemo(() => hoyLocal(), []);
  const avisar = (m) => { setAviso(m); clearTimeout(window.__escT); window.__escT = setTimeout(() => setAviso(""), 4000); };

  async function cargar() {
    try { setData(await fetchEscrituracion()); setError(""); } catch (e) { setError(e.message || "Error"); setData({ config: {}, casos: [] }); }
  }
  useEffect(() => { cargar(); }, []);

  const cfg = useMemo(() => cfgEfectiva(data?.config), [data]);
  const unidades = useMemo(() => unidadesSendero(db.avalCompleto), [db.avalCompleto]);
  const casos = useMemo(() => (data?.casos || []).map((c) => ({ ...c, datos: c.datos || {} })), [data]);
  const filas = useMemo(() => casos.map((c) => ({ c, k: calcularCaso(c.datos, cfg, hoy) })), [casos, cfg, hoy]);
  const faltan = unidades.filter((u) => !casos.some((c) => c.clave === u.clave));

  async function guardarCaso(c) {
    setData((d) => ({ ...d, casos: [...d.casos.filter((x) => x.clave !== c.clave), c] }));
    try { await guardarCasoEscrituracionRemote(c); } catch (e) { avisar(`No se pudo guardar: ${e.message}`); cargar(); }
  }
  async function agregarAval() {
    for (const u of faltan) await guardarCasoEscrituracionRemote({ ...u, banco: "", datos: { inicio: isoDe(hoy), rep: false, pasos: {}, docs: {} } }).catch((e) => avisar(e.message));
    await cargar(); avisar(`${faltan.length} unidades agregadas`);
  }
  async function guardarCfg(nueva) {
    try { await guardarEscrituracionConfigRemote(cfgParaGuardar(nueva)); setData((d) => ({ ...d, config: cfgParaGuardar(nueva) })); avisar("Configuración guardada"); } catch (e) { avisar(`No se pudo guardar: ${e.message}`); }
  }

  const L = filas.filter(({ c, k }) => (!F.q || `${c.cliente} ${c.unidad} ${c.rut}`.toLowerCase().includes(F.q.toLowerCase())) && (!F.est || k.estado === F.est) && (F.etapa === "" || k.etapa === +F.etapa));
  const cnt = (e) => filas.filter((f) => f.k.estado === e).length;
  const fr = ficha ? filas.find((f) => f.c.clave === ficha) : null;
  const kpi = (v, t, col, est) => (
    <button key={t} onClick={() => setF({ ...F, est: F.est === est ? "" : est })} className={`text-left bg-white border rounded-2xl p-4 h-[92px] shadow-card ${F.est === est && est ? "border-[#1E5AA8] ring-2 ring-[#1E5AA8]/20" : "border-[#EEF1F8]"}`}>
      <div className="font-display text-3xl leading-none" style={{ color: col }}>{v}</div><div className="text-[10.5px] tracking-wider font-semibold text-stone-500 mt-2">{t}</div></button>
  );

  return (
    <div className={PAGE_CLASS}>
      <PageHeader title="Escrituración" subtitle="Sendero del Monte · seguimiento por unidad con alertas de SLA">
        <button onClick={cargar} className="h-11 px-4 inline-flex items-center gap-2 text-sm rounded-xl border border-[#1E5AA8] text-[#1E5AA8] bg-white hover:bg-[#EAF1FF]"><RefreshCw size={15} /> Actualizar</button>
      </PageHeader>
      {error && <p className="mb-4 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">No se pudo leer Escrituración ({error}). Si es la primera vez, falta ejecutar la migración v205 en Supabase.</p>}
      {aviso && <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[90] bg-[#0B1F4A] text-white text-sm px-4 py-3 rounded-xl shadow-lg">{aviso}</div>}

      <div className="flex gap-1 mb-4 border-b border-[#EEF1F8]">
        {[["seg", "Seguimiento"], ["venc", "Vencimientos y documentos"], ...(esAdmin ? [["cfg", "Configurar SLA"]] : [])].map(([k, t]) => (
          <button key={k} onClick={() => setTab(k)} className={`h-11 px-4 text-sm -mb-px border-b-2 ${tab === k ? "border-[#0F3D66] text-[#0F3D66] font-semibold" : "border-transparent text-stone-500"}`}>{t}</button>
        ))}
      </div>

      {data === null ? <p className="text-sm text-stone-500 py-10 text-center">Cargando…</p> : tab === "seg" ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
            {kpi(filas.length, "UNIDADES EN PROCESO", "#13234A", "")}{kpi(cnt("ok"), "EN PLAZO", "#12B886", "ok")}{kpi(cnt("warn"), "POR VENCER", "#F59F00", "warn")}{kpi(cnt("bad"), "VENCIDAS", "#E03131", "bad")}{kpi(cnt("done"), "TERMINADAS", "#6B7A99", "done")}
          </div>
          <div className="flex items-center gap-2.5 flex-wrap mb-3">
            <input className="h-11 w-60 px-3 rounded-xl border border-[#D5DDEE] text-sm bg-white" placeholder="Buscar cliente, unidad o RUT" value={F.q} onChange={(e) => setF({ ...F, q: e.target.value })} />
            <select className="h-11 px-3 rounded-xl border border-[#D5DDEE] text-sm bg-white" value={F.etapa} onChange={(e) => setF({ ...F, etapa: e.target.value })}><option value="">Todas las etapas</option>{ETAPAS.map((e, i) => <option key={i} value={i}>{e[0]} · {e[1]}</option>)}</select>
            {faltan.length > 0 && <Btn pri className="!h-11 !px-4 !text-sm" onClick={agregarAval}><Plus size={14} /> Agregar {faltan.length} unidades del Aval</Btn>}
          </div>
          <div className="bg-white border border-[#EEF1F8] rounded-2xl shadow-card overflow-auto">
            <table className="w-full text-sm min-w-[980px] border-collapse">
              <thead><tr className="text-[10px] tracking-wider text-stone-500 font-bold text-left">{["UNIDAD", "CLIENTE", "ETAPA", "PASO ACTUAL", "RESPONSABLE", "INICIO", "VENCE", "DÍAS / SLA", "AVANCE", "ESTADO"].map((t) => <th key={t} className="px-3 py-2.5 border-b border-[#EEF1F8]">{t}</th>)}</tr></thead>
              <tbody>
                {L.map(({ c, k }) => {
                  const [rol, nom] = quien(k.actual, c, cfg);
                  return (
                    <tr key={c.clave} onClick={() => setFicha(c.clave)} className="cursor-pointer hover:bg-[#F8FAFF]">
                      <td className="px-3 py-2.5 border-b border-[#F0F3FA] font-semibold">{c.unidad || c.clave}</td>
                      <td className="px-3 border-b border-[#F0F3FA]">{c.cliente}</td>
                      <td className="px-3 border-b border-[#F0F3FA] text-xs">{ETAPAS[k.etapa][0]}</td>
                      <td className="px-3 border-b border-[#F0F3FA] text-xs max-w-[220px]">{k.estado === "done" ? "Proceso completo" : `${k.actual.e + 1}.${k.actual.n} ${k.actual.nom}`}</td>
                      <td className="px-3 border-b border-[#F0F3FA] text-xs">{k.estado === "done" ? "—" : <>{nom}<div className="text-stone-400">{rol}</div></>}</td>
                      <td className="px-3 border-b border-[#F0F3FA] text-xs">{fmtCorta(k.ini)}</td>
                      <td className="px-3 border-b border-[#F0F3FA] text-xs">{k.estado === "done" ? "—" : fmtCorta(k.venc)}</td>
                      <td className="px-3 border-b border-[#F0F3FA] text-xs">{k.estado === "done" ? "—" : `${k.dias} / ${k.sla} d`}</td>
                      <td className="px-3 border-b border-[#F0F3FA] text-xs">{k.hechos}/{k.total}</td>
                      <td className="px-3 border-b border-[#F0F3FA]"><Pill k={k.estado} /></td>
                    </tr>
                  );
                })}
                {!L.length && <tr><td colSpan={10} className="text-center text-stone-400 py-10">{casos.length ? "Sin resultados" : faltan.length ? "Aún no hay unidades en seguimiento. Usa “Agregar unidades del Aval” o “Iniciar escrituración” desde Nominación." : "No hay unidades promesadas de Sendero en el Aval."}</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      ) : tab === "venc" ? (
        <Vencimientos filas={filas} cfg={cfg} hoy={hoy} onAbrir={setFicha} />
      ) : (
        <Config cfg={cfg} onGuardar={guardarCfg} />
      )}

      {fr && <Ficha caso={fr.c} k={fr.k} cfg={cfg} hoy={hoy} onCerrar={() => setFicha(null)} onGuardar={guardarCaso} avisar={avisar} />}
    </div>
  );
}

function Vencimientos({ filas, cfg, hoy, onAbrir }) {
  const fl = cfg.fechas;
  return (
    <div className="bg-white border border-[#EEF1F8] rounded-2xl shadow-card overflow-auto">
      <table className="w-full text-sm min-w-[900px] border-collapse">
        <thead><tr className="text-[10px] tracking-wider text-stone-500 font-bold text-left"><th className="px-3 py-2.5 border-b">UNIDAD</th><th className="px-3 border-b">CLIENTE</th>{cfg.docs.map((d) => <th key={d.id} className="px-3 border-b">{d.nom.toUpperCase()}</th>)}</tr></thead>
        <tbody>
          {filas.map(({ c }) => (
            <tr key={c.clave} onClick={() => onAbrir(c.clave)} className="cursor-pointer hover:bg-[#F8FAFF]">
              <td className="px-3 py-2.5 border-b border-[#F0F3FA] font-semibold">{c.unidad || c.clave}</td><td className="px-3 border-b border-[#F0F3FA]">{c.cliente}</td>
              {cfg.docs.map((d) => { const e = estadoDoc(d, c.datos.docs?.[d.id], cfg, hoy); return <td key={d.id} className="px-3 border-b border-[#F0F3FA]"><Pill k={e.est}>{e.est === "pend" ? "Sin cargar" : e.venc ? (e.rest < 0 ? `Vencido ${-e.rest} d` : `${e.rest} d`) : "Cargado"}</Pill></td>; })}
            </tr>
          ))}
          {!filas.length && <tr><td colSpan={8} className="text-center text-stone-400 py-10">Sin unidades en seguimiento</td></tr>}
        </tbody>
      </table>
      {fl.length > 0 && <div className="p-4 border-t border-[#EEF1F8] text-xs text-stone-500">Fechas límite del proyecto: {fl.map((f) => { const e = estadoFecha(f, hoy); return <span key={f.id} className="mr-4"><b className="text-[#13234A]">{f.nom}</b> {e.d ? `${fmtLarga(e.d)} (${e.rest < 0 ? `venció hace ${-e.rest} d` : `en ${e.rest} d`})` : "sin fecha"}</span>; })}</div>}
    </div>
  );
}

function Ficha({ caso, k, cfg, hoy, onCerrar, onGuardar, avisar }) {
  const d = caso.datos;
  useEffect(() => { const f = (e) => e.key === "Escape" && onCerrar(); window.addEventListener("keydown", f); return () => window.removeEventListener("keydown", f); }, [onCerrar]);
  const setDatos = (fn) => onGuardar({ ...caso, datos: fn(d) });
  const setPaso = (id, patch) => setDatos((x) => ({ ...x, pasos: { ...(x.pasos || {}), [id]: { ...(x.pasos?.[id] || {}), ...patch } } }));
  const setBanco = (banco) => onGuardar({ ...caso, banco });
  async function subir(doc, file) {
    if (!file) return;
    try {
      const path = `escrituracion/${caso.clave}/${doc.id}_${Date.now()}_${nombreSeguro(file.name)}`;
      await subirDocumentoRemote(path, file);
      const prev = d.docs?.[doc.id] || {};
      setDatos((x) => ({ ...x, docs: { ...(x.docs || {}), [doc.id]: { ...prev, emision: prev.emision || isoDe(hoy), path, name: file.name } } }));
      avisar("Documento subido");
    } catch (e) { avisar(`No se pudo subir: ${e.message}`); }
  }
  async function bajar(rec) { try { descargarBlob(await descargarDocumentoRemote(rec.path), rec.name); } catch (e) { avisar(`No se pudo descargar: ${e.message}`); } }
  const docs = cfg.docs.map((doc) => estadoDoc(doc, d.docs?.[doc.id], cfg, hoy));
  const gate = GATE.map(([t, ids]) => ({ t, ok: ids ? ids.every((i) => docs[i].est === "ok") : !!d.gateOk?.[t] }));
  return (
    <div className="fixed inset-0 z-[70] bg-[#F4F7FD] overflow-auto">
      <div className="sticky top-0 z-10 bg-white border-b border-[#EEF1F8] px-7 py-4 flex items-center justify-between gap-4 flex-wrap">
        <div><h2 className="font-display text-2xl text-[#13234A]">{caso.cliente}</h2><div className="text-sm text-stone-500">Unidad {caso.unidad || caso.clave} · {caso.rut} · Ejecutivo {caso.ejecutivo || "sin asignar"}</div></div>
        <div className="flex items-center gap-2.5"><Pill k={k.estado} /><Btn onClick={onCerrar}><X size={14} /> Cerrar</Btn></div>
      </div>
      <div className="max-w-[1500px] mx-auto px-7 py-5 grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-5 items-start">
        <div className="flex flex-col gap-3">
          <Card title="DATOS DE LA UNIDAD">
            <label className="block text-xs text-stone-500">Banco con el que se aprobó
              <select className={`${ipt} mt-1 w-full`} value={caso.banco || ""} onChange={(e) => setBanco(e.target.value)}><option value="">Por definir</option>{cfg.bancos.map((b) => <option key={b}>{b}</option>)}</select></label>
            <label className="block text-xs text-stone-500 mt-3">Inicio del proceso<input type="date" className={`${ipt} mt-1 w-full`} value={d.inicio || ""} onChange={(e) => setDatos((x) => ({ ...x, inicio: e.target.value }))} /></label>
            <label className="flex items-center gap-2 text-sm mt-3"><input type="checkbox" checked={!!d.rep} onChange={(e) => setDatos((x) => ({ ...x, rep: e.target.checked }))} /> El CBR emitió reparos (activa pasos 16 y 17)</label>
          </Card>
          <Card title="FECHAS LÍMITE DEL PROYECTO">
            {cfg.fechas.map((f) => { const e = estadoFecha(f, hoy); const hol = e.d && k.fin ? diasCorridos(k.fin, e.d) : null; return (
              <div key={f.id} className="flex justify-between gap-2 text-sm py-1.5"><span>{f.nom}<div className="text-xs text-stone-400">{e.d ? fmtLarga(e.d) : "sin fecha"}{hol !== null ? ` · holgura proyectada ${hol} d` : ""}</div></span>{e.d ? <Pill k={e.est}>{e.rest < 0 ? `Venció` : `${e.rest} d`}</Pill> : <Pill k="pend">—</Pill>}</div>); })}
          </Card>
          <Card title="CONTROL PREVIO A NOTARÍA">
            {gate.map((g) => <div key={g.t} className="flex items-center gap-2 text-sm py-1">{g.ok ? <span className="text-emerald-600">✓</span> : <span className="text-amber-600">●</span>}<span className={g.ok ? "" : "text-stone-500"}>{g.t}</span></div>)}
          </Card>
        </div>
        <div className="flex flex-col gap-4">
          <Card title="DOCUMENTOS Y VIGENCIA">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-2.5">
              {docs.map((x) => (
                <div key={x.id} className="border border-[#EEF1F8] rounded-xl p-3">
                  <div className="flex justify-between gap-2"><div className="text-[13px] font-semibold text-[#13234A]">{x.nom}<div className="text-xs font-normal text-stone-400">{x.dias ? `Vigencia ${x.dias} d` : "Sin vencimiento"}{x.em ? ` · emitido ${fmtLarga(x.em)}` : ""}{x.venc ? ` · vence ${fmtLarga(x.venc)}` : ""}</div></div><Pill k={x.est}>{x.est === "pend" ? "Sin cargar" : x.venc ? (x.rest < 0 ? "Vencido" : `${x.rest} d`) : "Cargado"}</Pill></div>
                  <div className="flex gap-1.5 mt-2 items-center flex-wrap">
                    <input type="date" className="h-8 px-2 text-xs rounded-lg border border-[#D5DDEE]" title="Fecha de emisión" value={d.docs?.[x.id]?.emision || ""} onChange={(e) => setDatos((y) => ({ ...y, docs: { ...(y.docs || {}), [x.id]: { ...(y.docs?.[x.id] || {}), emision: e.target.value } } }))} />
                    <label className="h-8 px-3 text-xs rounded-xl border border-[#1E5AA8] text-[#1E5AA8] bg-white hover:bg-[#EAF1FF] inline-flex items-center gap-1.5 cursor-pointer"><Upload size={13} /> {x.file ? "Reemplazar" : "Subir"}<input type="file" hidden onChange={(e) => subir(x, e.target.files[0])} /></label>
                    <button disabled={!x.file} onClick={() => bajar(x.file)} className="h-8 px-3 text-xs rounded-xl border border-[#1E5AA8] text-[#1E5AA8] bg-white disabled:opacity-40 inline-flex items-center gap-1.5"><Download size={13} /> Descargar</button>
                  </div>
                  {x.file && <div className="text-[11px] text-stone-500 mt-1 truncate">{x.file.name}</div>}
                </div>
              ))}
            </div>
          </Card>
          <Card title="PASOS DEL PROCESO">
            {ETAPAS.map(([cod, nom], ei) => { const ps = k.pasos.filter((p) => p.s.e === ei); if (!ps.length) return null; return (
              <div key={cod} className="mb-3">
                <div className="text-xs font-bold text-[#1E5AA8] mb-1">{cod} · {nom}</div>
                {ps.map((p) => { const [rol, nom2] = quien(p.s, caso, cfg); const rec = d.pasos?.[p.s.id] || {}; return (
                  <div key={p.s.id} className="grid grid-cols-[1fr_auto] md:grid-cols-[minmax(0,1fr)_170px_120px_120px_96px] gap-2 items-center py-1.5 border-b border-[#F0F3FA] text-[13px]">
                    <div><span className="text-stone-400">{p.s.n}.</span> {p.s.nom}{p.par && <span className="ml-1 text-[10px] text-sky-600">en paralelo</span>}<div className="text-[11px] text-stone-400">{nom2} · {rol} · SLA {p.s.sla} d</div></div>
                    <div className="text-[11px] text-stone-500 hidden md:block">vence {fmtCorta(p.venc)}</div>
                    <input type="date" title="Inicio" className="h-8 px-1.5 text-xs rounded-lg border border-[#D5DDEE] hidden md:block" value={rec.ini || ""} onChange={(e) => setPaso(p.s.id, { ini: e.target.value })} />
                    <input type="date" title="Término" className="h-8 px-1.5 text-xs rounded-lg border border-[#D5DDEE] hidden md:block" value={rec.fin || ""} onChange={(e) => setPaso(p.s.id, { fin: e.target.value })} />
                    <div className="text-right">{p.est === "ok" ? <Pill k="ok">{p.dur} d</Pill> : p.est === "late" ? <Pill k="late">{p.dur} d · tarde</Pill> : p.est === "pend" ? <Pill k="pend">Pendiente</Pill> : <Pill k={p.riesgo}>{p.dur}/{p.s.sla} d</Pill>}</div>
                  </div>); })}
              </div>); })}
          </Card>
        </div>
      </div>
    </div>
  );
}

function Config({ cfg, onGuardar }) {
  const [c, setC] = useState(cfg);
  useEffect(() => setC(cfg), [cfg]);
  const setPaso = (id, patch) => setC((x) => ({ ...x, pasos: x.pasos.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));
  return (
    <div className="flex flex-col gap-4">
      <Card title="REGLAS GENERALES">
        <div className="flex flex-wrap gap-4 items-end text-sm">
          <label className="text-xs text-stone-500">Días de los SLA<select className={`${ipt} mt-1 block`} value={c.habiles ? "h" : "c"} onChange={(e) => setC({ ...c, habiles: e.target.value === "h" })}><option value="h">Hábiles (lun–vie)</option><option value="c">Corridos</option></select></label>
          <label className="text-xs text-stone-500">Aviso “por vencer” (días antes)<input type="number" min="0" className={`${ipt} mt-1 block w-28`} value={c.aviso} onChange={(e) => setC({ ...c, aviso: +e.target.value })} /></label>
          <label className="text-xs text-stone-500">Aviso de documentos (días)<input type="number" min="0" className={`${ipt} mt-1 block w-28`} value={c.docAviso} onChange={(e) => setC({ ...c, docAviso: +e.target.value })} /></label>
          <Btn pri className="!h-9 ml-auto" onClick={() => onGuardar(c)}><Save size={14} /> Guardar configuración</Btn>
        </div>
      </Card>
      <Card title="SLA Y RESPONSABLE POR PASO">
        <div className="overflow-auto"><table className="w-full text-sm min-w-[760px]"><thead><tr className="text-[10px] tracking-wider text-stone-500 font-bold text-left"><th className="py-2">PASO</th><th>RESPONSABLE</th><th>SLA (días)</th><th>INICIA CON (id paso)</th></tr></thead>
          <tbody>{c.pasos.map((p) => (
            <tr key={p.id} className="border-t border-[#F0F3FA]"><td className="py-1.5 pr-2 text-[13px]"><span className="text-stone-400">{ETAPAS[p.e][0]}.{p.n}</span> {p.nom}{p.cond && <span className="ml-1 text-[10px] text-stone-400">(condicional)</span>}</td>
              <td><select className={ipt} value={p.resp} onChange={(e) => setPaso(p.id, { resp: e.target.value })}>{RESP_TIPOS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></td>
              <td><input type="number" min="0" className={`${ipt} w-20`} value={p.sla} onChange={(e) => setPaso(p.id, { sla: +e.target.value })} /></td>
              <td><input type="number" min="0" className={`${ipt} w-20`} placeholder="—" value={p.par} onChange={(e) => setPaso(p.id, { par: e.target.value === "" ? "" : +e.target.value })} /></td></tr>))}</tbody></table></div>
      </Card>
      <Card title="VIGENCIA DE DOCUMENTOS (DÍAS)">
        <div className="flex flex-wrap gap-4">{c.docs.map((d) => <label key={d.id} className="text-xs text-stone-500">{d.nom}{d.dias === null ? <div className="mt-1 text-sm text-stone-400 h-9 flex items-center">Sin vencimiento</div> : <input type="number" min="1" className={`${ipt} mt-1 block w-24`} value={d.dias} onChange={(e) => setC({ ...c, docs: c.docs.map((x) => (x.id === d.id ? { ...x, dias: +e.target.value } : x)) })} />}</label>)}</div>
      </Card>
      <Card title="FECHAS LÍMITE DEL PROYECTO">
        {c.fechas.map((f, i) => (
          <div key={f.id} className="flex flex-wrap gap-2 items-center mb-2">
            <input className={`${ipt} w-64`} value={f.nom} onChange={(e) => setC({ ...c, fechas: c.fechas.map((x, j) => (j === i ? { ...x, nom: e.target.value } : x)) })} />
            <input type="date" className={ipt} value={f.f || ""} onChange={(e) => setC({ ...c, fechas: c.fechas.map((x, j) => (j === i ? { ...x, f: e.target.value } : x)) })} />
            <label className="text-xs text-stone-500">avisar <input type="number" min="0" className={`${ipt} w-20`} value={f.aviso} onChange={(e) => setC({ ...c, fechas: c.fechas.map((x, j) => (j === i ? { ...x, aviso: +e.target.value } : x)) })} /> d antes</label>
            <button onClick={() => setC({ ...c, fechas: c.fechas.filter((_, j) => j !== i) })} className="text-rose-500 p-2"><Trash2 size={15} /></button>
          </div>))}
        <Btn onClick={() => setC({ ...c, fechas: [...c.fechas, { id: Date.now(), nom: "Nueva fecha", f: "", aviso: 30 }] })}><Plus size={14} /> Agregar fecha</Btn>
      </Card>
      <Card title="BANCOS Y ENTIDADES">
        <label className="text-xs text-stone-500 block">Bancos (separados por coma)<input className={`${ipt} mt-1 w-full`} value={c.bancos.join(", ")} onChange={(e) => setC({ ...c, bancos: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} /></label>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">{Object.keys(c.catalogo).map((k) => <label key={k} className="text-xs text-stone-500">{k}<input className={`${ipt} mt-1 w-full`} value={c.catalogo[k]} placeholder={k} onChange={(e) => setC({ ...c, catalogo: { ...c.catalogo, [k]: e.target.value } })} /></label>)}</div>
      </Card>
      <div><Btn pri onClick={() => onGuardar(c)}><Save size={14} /> Guardar configuración</Btn></div>
    </div>
  );
}
