import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Download, Upload, X, Search, FileSpreadsheet, FolderOpen, ArrowRight } from "lucide-react";
import { PageHeader, PAGE_CLASS } from "./Shared";
import { fetchNominacion, guardarNominacionRemote, guardarCasoEscrituracionRemote, subirDocumentoRemote, descargarDocumentoRemote } from "../lib/db";
import { unidadesSendero, rutClave, isoDe, hoyLocal, parseISO, fmtLarga } from "../lib/escrituracion";
import { crearZip, nombreSeguro, descargarBlob } from "../lib/zip";

const DOCS = [
  { c: "Comprobante RUKAN", nom: "Comprobante de postulación y/o reserva (RUKAN) con firmas de receptor y postulante", req: 1 },
  { c: "Cert. subsidio", nom: "Copia Certificado de Subsidio (anverso y reverso) debidamente firmado", req: 0 },
  { c: "Decl. jurada", nom: "Declaración jurada de postulación (debidamente firmada)", req: 1 },
  { c: "Núcleo familiar", nom: "Declaración de núcleo familiar y de no propiedad habitacional (firmada)", req: 1 },
  { c: "Cédula postulante", nom: "Copia cédula de identidad por ambos lados del postulante", req: 1 },
  { c: "Cédula cónyuge / núcleo", nom: "Copia cédula por ambos lados del cónyuge o mayor de 18 años del núcleo", req: 0 },
  { c: "Perm. extranjería", nom: "SI CORRESPONDE: Certificado de permanencia definitiva (Depto. de Extranjería)", req: 0 },
  { c: "Perm. PDI", nom: "SI CORRESPONDE: Certificado de permanencia definitiva (PDI)", req: 0 },
  { c: "Info. Rukan", nom: "Información Persona Rukan", req: 1 },
];
const IC = { ok: "✓", na: "–", pend: "●", venc: "✕", obs: "!" };
const TL = { ok: "Cargado", na: "No aplica", pend: "Pendiente", venc: "Vencido", obs: "Con observación" };
const CL = { ok: "bg-emerald-50 text-emerald-700", na: "bg-stone-100 text-stone-400", pend: "bg-amber-50 text-amber-700", venc: "bg-rose-50 text-rose-600", obs: "bg-orange-50 text-orange-600" };

function est(raw, req) {
  const v = String(raw || "").trim();
  const u = v.toUpperCase();
  if (!v) return req ? { t: "pend", note: "Sin cargar" } : { t: "na", note: "" };
  if (/^N\/?A$/.test(u) || u === "NO APLICA") return { t: "na", note: "" };
  if (u === "OK" || u === "OK AMBOS") return { t: "ok", note: "" };
  if (u.startsWith("PENDIENTE")) return { t: "pend", note: v };
  if (u.includes("VENCI")) return { t: "venc", note: v };
  return { t: "obs", note: v };
}
function info(r) {
  const ds = DOCS.map((d, i) => est(r.docs?.[i], d.req));
  const req = ds.filter((x) => x.t !== "na").length;
  const ok = ds.filter((x) => x.t === "ok" || x.t === "obs").length;
  const pend = ds.filter((x) => x.t === "pend" || x.t === "venc").length;
  const ren = String(r.estado || "").toUpperCase().includes("RENUNCIA");
  return { ds, req, ok, pend, pct: req ? Math.round((ok / req) * 100) : 100, comp: !pend && !ren, ren };
}
const Ic = ({ t, title }) => <span title={title} className={`inline-flex w-6 h-6 rounded-full items-center justify-center text-[12px] font-bold ${CL[t]}`}>{IC[t]}</span>;
const Btn = ({ children, onClick, disabled, pri, className = "" }) => (
  <button onClick={onClick} disabled={disabled} className={`h-9 px-3 text-[12.5px] rounded-xl border inline-flex items-center gap-1.5 whitespace-nowrap disabled:opacity-40 ${pri ? "bg-[#0F3D66] border-[#0F3D66] text-white hover:bg-[#1E5AA8]" : "border-[#1E5AA8] text-[#1E5AA8] bg-white hover:bg-[#EAF1FF]"} ${className}`}>{children}</button>
);

// ---- lectura de la planilla de nominación (xlsx) ----
const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const CLAVES_DOC = ["comprobante de postulacion", "copia certificado de subsidio", "declaracion jurada", "declaracion de nucleo", "copia cedula de identidad por ambos lados del postulante", "copia cedula de identidad por ambos lados del conyuge", "permanencia definitiva (emitido por el departamento", "permanencia definitiva (emitido pdi", "informacion persona rukan"];
function leerPlanilla(buf) {
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const filas = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  const h = (filas[0] || []).map(norm);
  const col = (...ks) => h.findIndex((x) => ks.some((k) => x.startsWith(k) || x.includes(k)));
  const iRut = col("rut cliente"), iNom = col("nombre completo");
  if (iRut < 0 || iNom < 0) throw new Error("No encuentro las columnas “RUT Cliente” y “Nombre completo” en la primera fila.");
  const iDocs = CLAVES_DOC.map((k) => h.findIndex((x) => x.includes(k)));
  const g = (r, i) => (i >= 0 ? String(r[i] ?? "").trim() : "");
  const iObs = h.lastIndexOf("observacion");
  const out = [];
  for (const r of filas.slice(1)) {
    const rut = rutClave(String(r[iRut] ?? ""));
    if (!rut || !g(r, iNom)) continue;
    out.push({
      rut, proyecto: g(r, col("proyecto")) || "SENDERO DEL MONTE", n: Number(g(r, col("n°", "n "))) || null, nombre: g(r, iNom), modelo: g(r, col("modelo")), estado: g(r, h.indexOf("estado")),
      programa: g(r, col("programa subsidio")), marca: g(r, col("marca")), estadoCivil: g(r, col("estado civil")), telefono: g(r, col("telefonos")), email: g(r, col("email")),
      docs: Object.fromEntries(iDocs.map((ci, k) => [k, g(r, ci)])), carpeta: g(r, col("carpeta")), subcategoria: g(r, col("subcategoria")), obs2: g(r, col("obs 2")),
      carton: g(r, col("carton fisico")), credito: g(r, col("aprobacion de credito")), serv: g(r, col("ingresado a serviu")), observacion: iObs >= 0 ? g(r, iObs) : "",
    });
  }
  return out;
}

export default function NominacionView({ db, esAdmin, onIrEscrituracion }) {
  const [filas, setFilas] = useState(null);
  const [error, setError] = useState("");
  const [F, setF] = useState({ q: "", chip: "todos", prog: "", marca: "" });
  const [sel, setSel] = useState(new Set());
  const [ficha, setFicha] = useState(null);
  const [menu, setMenu] = useState(false);
  const [aviso, setAviso] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const impRef = useRef(null);

  const avisar = (m) => { setAviso(m); clearTimeout(window.__nomT); window.__nomT = setTimeout(() => setAviso(""), 4000); };
  async function cargar() {
    try { setFilas(await fetchNominacion()); setError(""); }
    catch (e) { setError(e.message || "No se pudo leer Nominación."); setFilas([]); }
  }
  useEffect(() => { cargar(); }, []);
  useEffect(() => { const c = () => setMenu(false); window.addEventListener("click", c); return () => window.removeEventListener("click", c); }, []);

  const unidades = useMemo(() => unidadesSendero(db.avalCompleto), [db.avalCompleto]);
  // Clientes guardados + clientes promesados del Aval que aún no tienen carpeta
  const lista = useMemo(() => {
    const base = (filas || []).map((r) => ({ ...r, docs: r.docs || {}, archivos: r.archivos || {} }));
    const ruts = new Set(base.map((r) => r.rut));
    const nuevos = [];
    unidades.forEach((u) => {
      if (!u.rut || ruts.has(u.rut)) return;
      ruts.add(u.rut);
      nuevos.push({ rut: u.rut, proyecto: u.proyecto, nombre: u.cliente, estado: "Promesada", docs: {}, archivos: {}, _nuevo: true });
    });
    return [...base, ...nuevos].map((r, i) => ({ ...r, n: r.n || base.length + i + 1 }));
  }, [filas, unidades]);

  const A = useMemo(() => lista.map((r) => ({ r, x: info(r) })), [lista]);
  const L = A.filter(({ r, x }) => (!F.q || `${r.nombre} ${r.rut}`.toLowerCase().includes(F.q.toLowerCase())) && (!F.prog || r.programa === F.prog) && (!F.marca || r.marca === F.marca)
    && (F.chip === "todos" || (F.chip === "comp" && x.comp) || (F.chip === "pend" && x.pend > 0 && !x.ren) || (F.chip === "cred" && r.credito) || (F.chip === "serv" && r.serv) || (F.chip === "ren" && x.ren)));
  const activos = A.filter((o) => !o.x.ren);
  const progs = [...new Set(lista.map((r) => r.programa).filter(Boolean))].sort();
  const marcas = [...new Set(lista.map((r) => r.marca).filter(Boolean))].sort();
  const nArch = (r) => Object.keys(r.archivos || {}).length;

  async function guardar(row) {
    const { _nuevo, ...limpio } = row;
    setFilas((f) => { const k = (f || []).filter((x) => x.rut !== row.rut); return [...k, { ...limpio }]; });
    try { await guardarNominacionRemote([limpio]); } catch (e) { avisar(`No se pudo guardar: ${e.message}`); await cargar(); }
  }
  async function subir(r, k, file) {
    if (!file) return;
    setOcupado(true);
    try {
      const path = `nominacion/${r.rut}/${k}_${Date.now()}_${nombreSeguro(file.name)}`;
      await subirDocumentoRemote(path, file);
      const archivos = { ...(r.archivos || {}), [k]: { path, name: file.name, ...(k === "c" ? { emision: isoDe(hoyLocal()) } : {}) } };
      const nuevo = k === "c" ? { ...r, archivos, credito: "APROBADO" } : { ...r, archivos, docs: { ...r.docs, [k]: est(r.docs?.[k], 1).t === "ok" ? r.docs[k] : "OK" } };
      await guardar(nuevo);
      setFicha(nuevo.rut);
      avisar("Documento subido");
    } catch (e) { avisar(`No se pudo subir: ${e.message}`); }
    setOcupado(false);
  }
  async function bajar(r, k) {
    const a = r.archivos?.[k];
    if (!a) return;
    try { descargarBlob(await descargarDocumentoRemote(a.path), a.name); } catch (e) { avisar(`No se pudo descargar: ${e.message}`); }
  }
  async function zipDe(rows, nombre) {
    setMenu(false);
    const archivos = rows.flatMap((r) => Object.entries(r.archivos || {}).map(([k, a]) => ({ r, k, a })));
    if (!archivos.length) { avisar("No hay documentos subidos para descargar"); return; }
    setOcupado(true);
    avisar(`Preparando ZIP de ${archivos.length} archivos…`);
    try {
      const fs = [];
      for (const { r, k, a } of archivos) {
        const blob = await descargarDocumentoRemote(a.path);
        const tag = k === "c" ? "10 Aprobación de crédito" : `${String(+k + 1).padStart(2, "0")} ${DOCS[+k].c}`;
        fs.push({ name: `${String(r.n).padStart(3, "0")} - ${nombreSeguro(r.nombre)}/${nombreSeguro(tag)} - ${nombreSeguro(a.name)}`, data: new Uint8Array(await blob.arrayBuffer()) });
      }
      descargarBlob(crearZip(fs), nombre || `Nominación (${rows.length} clientes).zip`);
      avisar(`ZIP listo: ${fs.length} archivos`);
    } catch (e) { avisar(`No se pudo generar el ZIP: ${e.message}`); }
    setOcupado(false);
  }
  async function importar(file) {
    if (!file) return;
    try {
      const datos = leerPlanilla(await file.arrayBuffer());
      if (!datos.length) { avisar("La planilla no tiene clientes"); return; }
      if (!window.confirm(`Se cargarán ${datos.length} clientes desde la planilla. Los que ya existen se actualizan (se conservan sus archivos). ¿Continuar?`)) return;
      const prev = new Map((filas || []).map((r) => [r.rut, r]));
      await guardarNominacionRemote(datos.map((d) => ({ ...d, archivos: prev.get(d.rut)?.archivos || {} })));
      await cargar();
      avisar(`${datos.length} clientes cargados`);
    } catch (e) { avisar(`No se pudo leer la planilla: ${e.message}`); }
    if (impRef.current) impRef.current.value = "";
  }
  async function iniciarEscrituracion(r) {
    const u = unidades.find((x) => x.rut === r.rut);
    if (!u) { avisar("No encuentro la unidad de este cliente en el Aval (Sendero, promesada)"); return; }
    try {
      await guardarCasoEscrituracionRemote({ clave: u.clave, proyecto: u.proyecto, rut: u.rut, cliente: u.cliente, unidad: u.unidad, ejecutivo: u.ejecutivo, banco: "", datos: { inicio: isoDe(hoyLocal()), rep: false, pasos: {}, docs: {} } });
      avisar("Escrituración iniciada. Búscala en el menú Escrituración.");
    } catch (e) { avisar(`No se pudo iniciar: ${e.message}`); }
  }

  const fr = ficha ? lista.find((r) => r.rut === ficha) : null;
  const kpi = (v, t, c, ch) => (
    <button key={t} onClick={() => setF({ ...F, chip: ch })} className={`text-left bg-white border rounded-2xl p-4 h-[92px] shadow-card ${F.chip === ch ? "border-[#1E5AA8] ring-2 ring-[#1E5AA8]/20" : "border-[#EEF1F8]"}`}>
      <div className="font-display text-3xl leading-none" style={{ color: c }}>{v}</div><div className="text-[10.5px] tracking-wider font-semibold text-stone-500 mt-2">{t}</div>
    </button>
  );

  return (
    <div className={PAGE_CLASS}>
      <PageHeader title="Nominación" subtitle="Sendero del Monte · clientes promesados con su carpeta de documentos para la nominación SERVIU">
        {esAdmin && (
          <>
            <input ref={impRef} type="file" accept=".xlsx,.xls" hidden onChange={(e) => importar(e.target.files[0])} />
            <button onClick={() => impRef.current?.click()} className="h-11 px-4 inline-flex items-center gap-2 text-sm rounded-xl border border-[#1E5AA8] text-[#1E5AA8] bg-white hover:bg-[#EAF1FF]"><FileSpreadsheet size={15} /> Cargar planilla</button>
          </>
        )}
      </PageHeader>
      {error && <p className="mb-4 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">No se pudo leer Nominación ({error}). Si es la primera vez, falta ejecutar la migración v205 en Supabase.</p>}
      {aviso && <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[90] bg-[#0B1F4A] text-white text-sm px-4 py-3 rounded-xl shadow-lg">{aviso}</div>}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
        {kpi(activos.length, "CLIENTES PROMESADOS", "#13234A", "todos")}
        {kpi(activos.filter((o) => o.x.comp).length, "CARPETAS COMPLETAS", "#12B886", "comp")}
        {kpi(activos.filter((o) => o.x.pend > 0).length, "CON PENDIENTES", "#F59F00", "pend")}
        {kpi(lista.filter((r) => r.credito).length, "CRÉDITO APROBADO", "#1E5AA8", "cred")}
        {kpi(lista.filter((r) => r.serv).length, "INGRESADOS A SERVIU", "#6B7A99", "serv")}
      </div>

      <div className="flex items-center gap-2.5 flex-wrap mb-3">
        <div className="relative"><Search size={14} className="absolute left-3 top-3.5 text-stone-400" /><input className="h-11 w-60 pl-9 pr-3 rounded-xl border border-[#D5DDEE] text-sm bg-white" placeholder="Buscar cliente o RUT" value={F.q} onChange={(e) => setF({ ...F, q: e.target.value })} /></div>
        <select className="h-11 px-3 rounded-xl border border-[#D5DDEE] text-sm bg-white" value={F.prog} onChange={(e) => setF({ ...F, prog: e.target.value })}><option value="">Todos los programas</option>{progs.map((p) => <option key={p}>{p}</option>)}</select>
        <select className="h-11 px-3 rounded-xl border border-[#D5DDEE] text-sm bg-white" value={F.marca} onChange={(e) => setF({ ...F, marca: e.target.value })}><option value="">Todas las marcas</option>{marcas.map((p) => <option key={p}>{p}</option>)}</select>
        <button onClick={() => setF({ ...F, chip: F.chip === "ren" ? "todos" : "ren" })} className={`h-11 px-4 rounded-xl border text-sm ${F.chip === "ren" ? "bg-[#13234A] text-white border-[#13234A]" : "bg-white border-[#D5DDEE] text-stone-500"}`}>Renuncias</button>
        <span className="text-xs text-stone-500">{L.length} clientes · {sel.size} seleccionados</span>
        <div className="ml-auto relative" onClick={(e) => e.stopPropagation()}>
          <button onClick={() => setMenu((m) => !m)} disabled={ocupado} className="h-11 px-4 inline-flex items-center gap-2 text-sm font-medium rounded-xl bg-[#0F3D66] hover:bg-[#1E5AA8] text-white disabled:opacity-50"><Download size={15} /> Descargar documentos ▾</button>
          {menu && (
            <div className="absolute right-0 top-12 z-30 w-[310px] bg-white border border-[#EEF1F8] rounded-xl shadow-xl p-1.5">
              {[["Todos los documentos de todos los clientes", lista, `${lista.reduce((a, r) => a + nArch(r), 0)} archivos · una carpeta por cliente (ZIP)`], ["Solo los clientes filtrados", L.map((o) => o.r), `${L.reduce((a, o) => a + nArch(o.r), 0)} archivos`], ["Solo los seleccionados", lista.filter((r) => sel.has(r.rut)), `${sel.size} clientes`]].map(([t, rows, s2]) => (
                <button key={t} onClick={() => zipDe(rows)} disabled={!rows.length} className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-[#F4F7FD] text-sm disabled:opacity-40">{t}<br /><span className="text-xs text-stone-500">{s2}</span></button>
              ))}
            </div>
          )}
        </div>
      </div>

      {filas === null ? <p className="text-sm text-stone-500 py-10 text-center">Cargando…</p> : (
        <div className="bg-white border border-[#EEF1F8] rounded-2xl shadow-card overflow-auto max-h-[62vh]">
          <table className="text-sm min-w-[1500px] w-full border-collapse">
            <thead>
              <tr className="text-[10px] tracking-wider text-stone-500 font-bold">
                {["", "N°", "CLIENTE", "RUT", "MODELO", "PROGRAMA", "MARCA", ...DOCS.map((d) => d.c.toUpperCase()), "CARTÓN FÍSICO", "CRÉDITO", "NOMINACIÓN", "AVANCE"].map((t, i) => (
                  <th key={i} className={`sticky top-0 bg-white z-[3] text-left px-2 py-2.5 border-b border-[#EEF1F8] align-bottom ${i === 0 ? "left-0 z-[4] w-9 min-w-[36px]" : i === 1 ? "left-9 z-[4] w-11 min-w-[44px]" : i === 2 ? "left-[80px] z-[4] min-w-[230px]" : ""} ${i >= 7 && i < 7 + DOCS.length ? "text-center min-w-[70px]" : ""}`}>
                    {i === 0 ? <input type="checkbox" checked={L.length > 0 && L.every((o) => sel.has(o.r.rut))} onChange={(e) => setSel((s) => { const n = new Set(s); L.forEach((o) => (e.target.checked ? n.add(o.r.rut) : n.delete(o.r.rut))); return n; })} /> : t}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {L.map(({ r, x }) => (
                <tr key={r.rut} onClick={() => setFicha(r.rut)} className={`cursor-pointer hover:bg-[#F8FAFF] ${x.ren ? "opacity-55" : ""}`}>
                  <td onClick={(e) => e.stopPropagation()} className="sticky left-0 bg-white z-[2] px-2 py-2 border-b border-[#F0F3FA]"><input type="checkbox" checked={sel.has(r.rut)} onChange={(e) => setSel((s) => { const n = new Set(s); e.target.checked ? n.add(r.rut) : n.delete(r.rut); return n; })} /></td>
                  <td className="sticky left-9 bg-white z-[2] px-2 border-b border-[#F0F3FA]">{r.n}</td>
                  <td className="sticky left-[80px] bg-white z-[2] px-2 border-b border-[#F0F3FA] font-semibold text-[#13234A] shadow-[2px_0_0_#E6ECF7]">{r.nombre}{x.ren && <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full bg-rose-50 text-rose-600">Renuncia</span>}{r._nuevo && <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full bg-sky-50 text-sky-600">Nuevo (Aval)</span>}</td>
                  <td className="px-2 border-b border-[#F0F3FA] whitespace-nowrap">{r.rut}</td>
                  <td className="px-2 border-b border-[#F0F3FA]">{r.modelo}</td>
                  <td className="px-2 border-b border-[#F0F3FA] text-xs">{r.programa}</td>
                  <td className="px-2 border-b border-[#F0F3FA]">{r.marca}</td>
                  {x.ds.map((d, i) => <td key={i} className="text-center px-2 border-b border-[#F0F3FA]"><Ic t={d.t} title={`${TL[d.t]}${d.note ? ": " + d.note : ""}`} /></td>)}
                  <td className="text-center px-2 border-b border-[#F0F3FA] text-xs">{r.carton || "—"}</td>
                  <td className="text-center px-2 border-b border-[#F0F3FA]">{r.credito ? <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700">{r.credito}</span> : <span className="text-[11px] px-2.5 py-1 rounded-full bg-stone-100 text-stone-400">—</span>}</td>
                  <td className="px-2 border-b border-[#F0F3FA] text-xs leading-tight">{r.carpeta}<br />{r.obs2}{r.serv ? ` · ${r.serv}` : ""}</td>
                  <td className="px-2 border-b border-[#F0F3FA] min-w-[90px]"><div className="h-1.5 w-[70px] rounded-full bg-stone-100 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${x.pct}%`, background: x.pct === 100 ? "#12B886" : x.pct >= 80 ? "#F59F00" : "#E03131" }} /></div><span className="text-[11px] text-stone-500">{x.ok}/{x.req}</span></td>
                </tr>
              ))}
              {!L.length && <tr><td colSpan={20} className="text-center text-stone-400 py-10">{lista.length ? "Sin resultados" : "Aún no hay clientes. Carga la planilla de nominación o promesa unidades de Sendero en el Aval."}</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      <div className="text-[11.5px] text-stone-500 mt-2 flex gap-4 flex-wrap items-center"><span><Ic t="ok" /> Cargado</span><span><Ic t="obs" /> Con observación</span><span><Ic t="pend" /> Pendiente</span><span><Ic t="venc" /> Vencido</span><span><Ic t="na" /> No aplica</span></div>

      {fr && <Ficha r={fr} x={info(fr)} esAdmin={esAdmin} ocupado={ocupado} onCerrar={() => setFicha(null)} onGuardar={guardar} onSubir={subir} onBajar={bajar} onZip={() => zipDe([fr], `${String(fr.n).padStart(3, "0")} - ${nombreSeguro(fr.nombre)}.zip`)} onIniciar={() => iniciarEscrituracion(fr)} onIr={onIrEscrituracion} />}
    </div>
  );
}

function Ficha({ r, x, ocupado, onCerrar, onGuardar, onSubir, onBajar, onZip, onIniciar, onIr }) {
  const [obs, setObs] = useState(r.observacion || "");
  useEffect(() => { setObs(r.observacion || ""); }, [r.rut]);
  useEffect(() => { const f = (e) => e.key === "Escape" && onCerrar(); window.addEventListener("keydown", f); return () => window.removeEventListener("keydown", f); }, [onCerrar]);
  const setDoc = (k, v) => onGuardar({ ...r, docs: { ...r.docs, [k]: v } });
  const campo = (k, label) => (
    <label className="block text-xs text-stone-500">{label}
      <input className="mt-1 w-full h-9 px-2.5 rounded-lg border border-[#D5DDEE] text-sm text-[#13234A] bg-white" defaultValue={r[k] || ""} key={r.rut + k} onBlur={(e) => e.target.value !== (r[k] || "") && onGuardar({ ...r, [k]: e.target.value })} />
    </label>
  );
  const cred = r.archivos?.c;
  const vence = cred?.emision ? new Date(parseISO(cred.emision).getTime() + 90 * 864e5) : null;
  const restoCred = vence ? Math.round((vence - hoyLocal()) / 864e5) : null;
  return (
    <div className="fixed inset-0 z-[70] bg-[#F4F7FD] overflow-auto">
      <div className="sticky top-0 z-10 bg-white border-b border-[#EEF1F8] px-7 py-4 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-display text-2xl text-[#13234A]">{r.nombre}</h2>
          <div className="text-sm text-stone-500">N° {r.n} · {r.programa || "—"} · {r.marca || "—"} · Modelo {r.modelo || "—"} <span className={`ml-1 text-[11px] px-2 py-0.5 rounded-full ${x.ren ? "bg-rose-50 text-rose-600" : "bg-stone-100 text-stone-500"}`}>{x.ren ? "Renuncia" : r.estado || "Promesada"}</span></div>
        </div>
        <div className="flex items-center gap-2.5">
          <Btn onClick={onIniciar}><ArrowRight size={14} /> Iniciar escrituración</Btn>
          <Btn pri onClick={onZip} disabled={ocupado}><Download size={14} /> Descargar carpeta completa</Btn>
          <Btn onClick={onCerrar}><X size={14} /> Cerrar</Btn>
        </div>
      </div>
      <div className="max-w-[1500px] mx-auto px-7 py-5 grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-5 items-start">
        <div className="flex flex-col gap-3">
          <div className="bg-white border border-[#EEF1F8] rounded-2xl p-4 shadow-card">
            <div className="text-[11px] font-extrabold tracking-wider text-[#13234A] mb-2">DATOS DEL CLIENTE</div>
            <div className="text-[13px] leading-7"><span className="text-stone-500">RUT:</span> {r.rut}<br /><span className="text-stone-500">Estado civil:</span> {r.estadoCivil || "—"}<br /><span className="text-stone-500">Teléfono:</span> {r.telefono || "—"}<br /><span className="text-stone-500">Correo:</span> {r.email || "—"}</div>
            <div className="flex items-center gap-3 mt-3"><div className="h-1.5 w-28 rounded-full bg-stone-100 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${x.pct}%`, background: x.pct === 100 ? "#12B886" : "#F59F00" }} /></div><b className="text-sm">{x.ok}/{x.req}</b><span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${x.comp ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{x.comp ? "Carpeta completa" : `${x.pend} pendiente${x.pend > 1 ? "s" : ""}`}</span></div>
          </div>
          <div className="bg-white border border-[#EEF1F8] rounded-2xl p-4 shadow-card">
            <div className="text-[11px] font-extrabold tracking-wider text-[#13234A] mb-2">CRÉDITO Y NOMINACIÓN</div>
            <div className="border border-[#EEF1F8] rounded-xl p-3 mb-3">
              <div className="flex justify-between gap-2"><div><b className="text-sm">Aprobación de crédito</b><div className="text-xs text-stone-500">Vigencia habitual de 3 meses{vence ? ` · vence ${fmtLarga(vence)} (${restoCred < 0 ? `venció hace ${-restoCred} d` : `${restoCred} d`})` : ""}</div></div><span className={`text-[11px] font-bold h-fit px-2.5 py-1 rounded-full ${r.credito ? "bg-emerald-50 text-emerald-700" : "bg-stone-100 text-stone-400"}`}>{r.credito || "Sin aprobación"}</span></div>
              <div className="flex gap-1.5 mt-2 items-center flex-wrap">
                <label className="h-8 px-3 text-xs rounded-xl border border-[#1E5AA8] text-[#1E5AA8] bg-white hover:bg-[#EAF1FF] inline-flex items-center gap-1.5 cursor-pointer"><Upload size={13} /> {cred ? "Reemplazar" : "Subir"}<input type="file" hidden onChange={(e) => onSubir(r, "c", e.target.files[0])} /></label>
                <button disabled={!cred} onClick={() => onBajar(r, "c")} className="h-8 px-3 text-xs rounded-xl border border-[#1E5AA8] text-[#1E5AA8] bg-white disabled:opacity-40 inline-flex items-center gap-1.5"><Download size={13} /> Descargar</button>
                {cred && <span className="text-[11px] text-stone-500 truncate max-w-[150px]">{cred.name}</span>}
              </div>
              {cred && <label className="block text-xs text-stone-500 mt-2">Fecha de emisión<input type="date" className="ml-2 h-8 px-2 rounded-lg border border-[#D5DDEE] text-xs" value={cred.emision || ""} onChange={(e) => onGuardar({ ...r, archivos: { ...r.archivos, c: { ...cred, emision: e.target.value } } })} /></label>}
            </div>
            <div className="grid grid-cols-2 gap-2.5">{campo("carpeta", "Carpeta")}{campo("subcategoria", "Subcategoría")}{campo("obs2", "Parte")}{campo("carton", "Cartón físico oficina")}{campo("serv", "Ingresado a SERVIU")}</div>
          </div>
          <div className="bg-white border border-[#EEF1F8] rounded-2xl p-4 shadow-card">
            <div className="text-[11px] font-extrabold tracking-wider text-[#13234A] mb-2">OBSERVACIONES</div>
            <textarea className="w-full min-h-[110px] rounded-xl border border-[#D5DDEE] p-2.5 text-sm" value={obs} onChange={(e) => setObs(e.target.value)} onBlur={() => obs !== (r.observacion || "") && onGuardar({ ...r, observacion: obs })} />
          </div>
        </div>
        <div>
          <div className="flex justify-between items-baseline mb-2.5"><div className="text-[11px] font-extrabold tracking-wider text-[#13234A]">DOCUMENTOS DE LA POSTULACIÓN</div><div className="text-xs text-stone-500">{x.ok} de {x.req} cargados</div></div>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-2.5">
            {DOCS.map((d, k) => {
              const e = x.ds[k], a = r.archivos?.[k], tiene = !!a;
              return (
                <div key={k} className="bg-white border border-[#EEF1F8] rounded-xl p-3">
                  <div className="flex justify-between gap-2"><div className="text-[13px] font-semibold text-[#13234A]">{k + 1}. {d.nom}{e.note && <div className={`text-xs font-normal ${e.t === "venc" ? "text-rose-600" : "text-amber-700"}`}>{e.note}</div>}</div><Ic t={e.t} /></div>
                  <div className="flex gap-1.5 mt-2 items-center flex-wrap">
                    <select className="h-8 px-2 text-xs rounded-lg border border-[#D5DDEE] bg-white" value={e.t === "ok" ? "OK" : e.t === "pend" && !e.note.startsWith("Sin") ? "PENDIENTE" : e.t === "na" ? "N/A" : e.t === "pend" ? "PENDIENTE" : "__"} onChange={(ev) => ev.target.value !== "__" && setDoc(k, ev.target.value)}>
                      <option value="OK">OK · cargado</option><option value="PENDIENTE">Pendiente</option><option value="N/A">No aplica</option>
                      {(e.t === "obs" || e.t === "venc") && <option value="__">{e.note}</option>}
                    </select>
                    <label className="h-8 px-3 text-xs rounded-xl border border-[#1E5AA8] text-[#1E5AA8] bg-white hover:bg-[#EAF1FF] inline-flex items-center gap-1.5 cursor-pointer"><Upload size={13} /> {tiene ? "Reemplazar" : "Subir"}<input type="file" hidden onChange={(ev) => onSubir(r, k, ev.target.files[0])} /></label>
                    <button disabled={!tiene} onClick={() => onBajar(r, k)} className="h-8 px-3 text-xs rounded-xl border border-[#1E5AA8] text-[#1E5AA8] bg-white disabled:opacity-40 inline-flex items-center gap-1.5"><Download size={13} /> Descargar</button>
                    {tiene && <span className="text-[11px] text-stone-500 truncate max-w-[160px]">{a.name}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
