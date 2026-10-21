// Diseño editable (solo administrador): mover y redimensionar tarjetas,
// editar títulos y ajustar la tarjeta de la UF. Lo que guarda el admin queda
// en la tabla `ui_layout` y lo ven todos los usuarios.
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { GripVertical, Minus, Pencil, Plus, RotateCcw, Check } from "lucide-react";
import { supabase } from "../supabaseClient";

const KEY = "mda_layout_v1";
const VACIO = { bloques: {}, textos: {}, uf: { escala: 1, pos: "der" } };
const Ctx = createContext(null);

const slug = (s) =>
  String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function normalizar(d) {
  if (d && d.v !== 2 && d.bloques) {
    // v2: el alto pasó a ser de toda la fila; se descartan altos sueltos de versiones anteriores.
    const bl = {};
    Object.entries(d.bloques).forEach(([k, b]) => { const { h, ...resto } = b || {}; bl[k] = resto; }); // eslint-disable-line no-unused-vars
    d = { ...d, bloques: bl, v: 2 };
  }
  return { ...VACIO, ...(d || {}), uf: { ...VACIO.uf, ...((d && d.uf) || {}) }, bloques: (d && d.bloques) || {}, textos: (d && d.textos) || {} };
}
function leerLocal() {
  try {
    return normalizar(JSON.parse(localStorage.getItem(KEY)));
  } catch {
    return normalizar();
  }
}

export function LayoutProvider({ children }) {
  const [cfg, setCfg] = useState(leerLocal);
  const [editando, setEditando] = useState(false);
  const [puedeEditar, setPuedeEditar] = useState(false);
  const [estado, setEstado] = useState("");
  const [sel, setSel] = useState(null);
  const [zGrupo, setZGrupo] = useState({});
  const fitsRef = useRef({});
  const cfgRef = useRef(cfg);
  const timer = useRef(null);

  useEffect(() => {
    let vivo = true;
    supabase
      .from("ui_layout")
      .select("data")
      .eq("id", "global")
      .maybeSingle()
      .then(({ data }) => {
        if (!vivo || !data || !data.data) return;
        const c = normalizar(data.data);
        cfgRef.current = c;
        setCfg(c);
        try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { /* sin storage */ }
      });
    return () => { vivo = false; };
  }, []);

  const aplicar = (fn) => {
    const n = fn(cfgRef.current);
    cfgRef.current = n;
    setCfg(n);
    try { localStorage.setItem(KEY, JSON.stringify(n)); } catch { /* sin storage */ }
    setEstado("guardando");
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const { error } = await supabase.from("ui_layout").upsert({ id: "global", data: cfgRef.current, updated_at: new Date().toISOString() });
      setEstado(error ? "error" : "guardado");
    }, 700);
  };

  const api = {
    cfg,
    editando: editando && puedeEditar,
    setEditando,
    puedeEditar,
    setPuedeEditar,
    estado,
    sel,
    setSel,
    zGrupo,
    // Cada tarjeta informa a qué escala (0.5–1) le cabe su contenido; la fila usa la menor, para que todas queden parejas.
    setFit: (id, grupo, z) => {
      fitsRef.current[id] = { grupo, z };
      const min = Math.min(1, ...Object.values(fitsRef.current).filter((f) => f.grupo === grupo).map((f) => f.z));
      setZGrupo((prev) => (prev[grupo] === min ? prev : { ...prev, [grupo]: min }));
    },
    setSpans: (mapa) =>
      aplicar((c) => {
        const b = { ...c.bloques };
        Object.entries(mapa).forEach(([i, sp]) => { b[i] = { ...(b[i] || {}), span: sp }; });
        return { ...c, bloques: b };
      }),
    setMuchos: (ids, patch) =>
      aplicar((c) => {
        const b = { ...c.bloques };
        ids.forEach((i) => { b[i] = { ...(b[i] || {}), ...patch }; });
        return { ...c, bloques: b };
      }),
    setBloque: (id, patch) => aplicar((c) => ({ ...c, bloques: { ...c.bloques, [id]: { ...(c.bloques[id] || {}), ...patch } } })),
    quitarBloque: (id) =>
      aplicar((c) => {
        const b = { ...c.bloques };
        delete b[id];
        return { ...c, bloques: b };
      }),
    intercambiar: (a, ordA, b, ordB) =>
      aplicar((c) => ({ ...c, bloques: { ...c.bloques, [a]: { ...(c.bloques[a] || {}), orden: ordB }, [b]: { ...(c.bloques[b] || {}), orden: ordA } } })),
    setTexto: (key, def, valor) =>
      aplicar((c) => {
        const t = { ...c.textos };
        const v = String(valor || "").trim();
        if (!v || v === def) delete t[key];
        else t[key] = v;
        return { ...c, textos: t };
      }),
    setUf: (patch) => aplicar((c) => ({ ...c, uf: { ...c.uf, ...patch } })),
    restablecer: () => aplicar(() => normalizar()),
  };
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

const SIN_PROVIDER = {
  cfg: VACIO, editando: false, puedeEditar: false, estado: "",
  sel: null, setSel() {}, zGrupo: {}, setFit() {}, setSpans() {}, setMuchos() {}, setBloque() {}, quitarBloque() {}, intercambiar() {}, setTexto() {}, setUf() {}, restablecer() {}, setEditando() {}, setPuedeEditar() {},
};
export const useLayout = () => useContext(Ctx) || SIN_PROVIDER;

// Texto editable: el admin, en modo edición, lo modifica con un clic.
export function T({ id, children }) {
  const L = useLayout();
  const def = String(children ?? "");
  const key = id || "t:" + slug(def);
  const val = L.cfg.textos[key] ?? def;
  if (!L.editando) return <>{val}</>;
  return (
    <span
      key={val}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      title="Clic para editar el texto"
      className="outline-dashed outline-1 outline-[#2563EB] outline-offset-2 rounded cursor-text"
      onBlur={(e) => L.setTexto(key, def, e.currentTarget.textContent)}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); }
      }}
    >
      {val}
    </span>
  );
}

// Tarjeta movible y redimensionable dentro de un contenedor `.grid-60`
// (grilla de 60 columnas). `orden`, `span` y la altura se guardan.
export function Bloque({ id, grupo, orden = 0, span = 30, spanM = 60, children }) {
  const L = useLayout();
  const ref = useRef(null);
  const innerRef = useRef(null);
  const [, refrescar] = useState(0);
  const b = L.cfg.bloques[id] || {};
  const ord = b.orden ?? orden;
  const sp = b.span ?? span;
  const z = (grupo && L.zGrupo[grupo]) || 1;
  const style = { order: ord, "--span": sp, "--span-m": spanM };
  if (b.h) style.height = b.h;
  const datos = { "data-bid": id, "data-span": sp };

  useEffect(() => {
    const f = () => refrescar((n) => n + 1);
    window.addEventListener("resize", f);
    return () => window.removeEventListener("resize", f);
  }, []);
  useEffect(() => { if (L.editando) refrescar((n) => n + 1); }, [L.editando]); // eslint-disable-line react-hooks/exhaustive-deps

  // Escala a la que le cabe el contenido en el alto elegido (sin barras ni cortes).
  useLayoutEffect(() => {
    const box = ref.current, inner = innerRef.current;
    if (!box || !inner) return;
    const prev = { w: inner.style.width, h: inner.style.height, t: inner.style.transform };
    const medir = (zz) => {
      inner.style.width = `${100 / zz}%`;
      inner.style.height = "auto";
      inner.style.transform = "none";
      return inner.offsetHeight * zz;
    };
    let fit = 1;
    if (b.h) {
      const disp = box.clientHeight;
      if (medir(1) > disp + 1) {
        let lo = 0.5, hi = 1;
        for (let i = 0; i < 6; i++) {
          const mid = (lo + hi) / 2;
          if (medir(mid) > disp + 1) hi = mid; else lo = mid;
        }
        fit = Math.max(0.5, Math.floor(lo * 100) / 100);
      }
    }
    if (L.editando) box.dataset.minfit = Math.ceil(medir(0.5));
    inner.style.width = prev.w;
    inner.style.height = prev.h;
    inner.style.transform = prev.t;
    if (grupo) L.setFit(id, grupo, fit);
  });

  const envuelto = (
    <div
      ref={innerRef}
      className="origin-top-left [&>*:first-child]:h-full"
      style={{ width: `${100 / z}%`, height: `${100 / z}%`, transform: z < 1 ? `scale(${z})` : undefined }}
    >
      {children}
    </div>
  );

  if (!L.editando) {
    return <div ref={ref} className="bloque" style={style} {...datos}>{envuelto}</div>;
  }

  const sel = L.sel === id;
  const fila = () => [...(ref.current?.parentElement?.querySelectorAll(":scope > [data-bid]") || [])];
  const idsFila = () => fila().map((el) => el.dataset.bid);
  const pisoFila = () => Math.max(40, ...fila().map((el) => Number(el.dataset.minfit) || 0));
  const sumaFila = () => fila().reduce((t, el) => t + Number(el.dataset.span || 0), 0) || 60;

  const altoActual = Math.round(ref.current?.offsetHeight || 0);
  const pct = Math.round((sp / sumaFila()) * 100);

  // Cambia el ancho de esta tarjeta y reparte el resto entre las demás: la fila siempre suma 100%.
  const ajustarAncho = (nuevo) => {
    const otros = fila().filter((el) => el.dataset.bid !== id).map((el) => ({ id: el.dataset.bid, sp: Number(el.dataset.span) }));
    const mapa = {};
    if (!otros.length) {
      mapa[id] = 60;
    } else {
      const n = Math.max(3, Math.min(60 - 3 * otros.length, Math.round(nuevo / 3) * 3));
      mapa[id] = n;
      const resto = 60 - n;
      const tot = otros.reduce((t, o) => t + o.sp, 0) || 1;
      let usado = 0;
      otros.forEach((o, i) => {
        const quedan = otros.length - 1 - i;
        let v = i === otros.length - 1 ? resto - usado : Math.round((resto * o.sp) / tot / 3) * 3;
        v = Math.max(3, Math.min(v, resto - usado - 3 * quedan));
        mapa[o.id] = v;
        usado += v;
      });
    }
    L.setSpans(mapa);
  };
  const setAncho = (p) => ajustarAncho(((Number(p) || 0) / 100) * 60);
  const setAlto = (h) => L.setMuchos(idsFila(), { h: Math.max(pisoFila(), Math.round(Number(h) || 0)) });

  const iniciarResize = (e) => {
    e.preventDefault();
    e.stopPropagation();
    L.setSel(id);
    const el = ref.current;
    const padre = el.parentElement.clientWidth;
    const sx = e.clientX, sy = e.clientY, w0 = el.offsetWidth, h0 = el.offsetHeight;
    const mover = (ev) => {
      ajustarAncho(((w0 + ev.clientX - sx) / padre) * 60);
      L.setMuchos(idsFila(), { h: Math.max(pisoFila(), Math.round((h0 + ev.clientY - sy) / 4) * 4) });
    };
    const fin = () => {
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", fin);
    };
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", fin);
  };

  const btn = "px-1.5 py-1 rounded hover:bg-stone-100";
  const num = "w-14 text-center text-xs border border-stone-200 rounded py-0.5";
  const confirmar = (fn) => (e) => {
    if (e.type === "blur" || e.key === "Enter") fn(e.currentTarget.value);
  };

  return (
    <div
      ref={ref}
      {...datos}
      className={`bloque relative rounded-2xl outline-dashed outline-2 ${sel ? "outline-[#2563EB]" : "outline-[#2563EB]/40"} outline-offset-2`}
      style={style}
      onPointerDownCapture={() => L.setSel(id)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        try {
          const o = JSON.parse(e.dataTransfer.getData("text/plain"));
          if (o.grupo === grupo && o.id !== id) L.intercambiar(o.id, o.ord, id, ord);
        } catch { /* arrastre ajeno */ }
      }}
    >
      {envuelto}
      <span
        draggable
        title="Arrastrar para mover"
        className="absolute -top-3 left-4 z-20 cursor-grab active:cursor-grabbing bg-[#2563EB] text-white rounded-full p-1 shadow"
        onDragStart={(e) => {
          e.dataTransfer.setData("text/plain", JSON.stringify({ id, grupo, ord }));
          e.dataTransfer.effectAllowed = "move";
          if (ref.current) e.dataTransfer.setDragImage(ref.current, 20, 20);
        }}
      >
        <GripVertical size={14} />
      </span>
      <span
        title="Arrastrar para cambiar ancho y alto"
        onPointerDown={iniciarResize}
        className="absolute -bottom-2 -right-2 z-20 w-4 h-4 rounded-full bg-[#2563EB] border-2 border-white shadow cursor-nwse-resize touch-none"
      />
      {sel && (
        <div className="absolute top-full mt-3 left-4 z-40 bg-white shadow-card border border-stone-200 rounded-lg p-1.5 flex items-center gap-1 text-[#13234A] text-xs whitespace-nowrap">
          <span className="text-stone-400 px-1">Ancho %</span>
          <button className={btn} onClick={() => setAncho(pct - 5)}><Minus size={13} /></button>
          <input key={"w" + pct} type="number" defaultValue={pct} className={num} onBlur={confirmar(setAncho)} onKeyDown={confirmar(setAncho)} />
          <button className={btn} onClick={() => setAncho(pct + 5)}><Plus size={13} /></button>
          <span className="w-px h-5 bg-stone-200 mx-1" />
          <span className="text-stone-400 px-1" title="El alto cambia en toda la fila, para que queden parejas">Alto fila px</span>
          <button className={btn} onClick={() => setAlto(altoActual - 8)}><Minus size={13} /></button>
          <input key={"h" + altoActual} type="number" defaultValue={altoActual} className={num} onBlur={confirmar(setAlto)} onKeyDown={confirmar(setAlto)} />
          <button className={btn} onClick={() => setAlto(altoActual + 8)}><Plus size={13} /></button>
          <span className="w-px h-5 bg-stone-200 mx-1" />
          <button className={btn} title="Restablecer esta fila al tamaño y orden originales" onClick={() => idsFila().forEach((i) => L.quitarBloque(i))}><RotateCcw size={13} /></button>
        </div>
      )}
    </div>
  );
}

// Posición y tamaño de la tarjeta de la UF; vale para todos los menús.
export function UfSlot({ children }) {
  const L = useLayout();
  const { escala, pos } = L.cfg.uf;
  const cls = pos === "der" ? "relative" : `relative basis-full order-first flex ${pos === "centro" ? "justify-center" : "justify-start"}`;
  const btn = "px-2 py-1 rounded hover:bg-stone-100 text-xs";
  return (
    <div className={cls}>
      <div style={{ zoom: escala }} className={L.editando ? "outline-dashed outline-2 outline-[#2563EB]/50 outline-offset-2 rounded-2xl" : ""}>
        {children}
      </div>
      {L.editando && (
        <div className={`absolute top-full mt-2 z-30 bg-white shadow-card border border-stone-200 rounded-lg p-1 flex items-center gap-0.5 text-[#13234A] ${pos === "der" ? "right-0" : pos === "centro" ? "left-1/2 -translate-x-1/2" : "left-0"}`}>
          <button className={btn} title="Más chica" onClick={() => L.setUf({ escala: Math.max(0.6, +(escala - 0.1).toFixed(2)) })}><Minus size={13} /></button>
          <span className="text-xs w-9 text-center">{Math.round(escala * 100)}%</span>
          <button className={btn} title="Más grande" onClick={() => L.setUf({ escala: Math.min(1.6, +(escala + 0.1).toFixed(2)) })}><Plus size={13} /></button>
          <span className="w-px h-5 bg-stone-200 mx-1" />
          {[["izq", "Izq."], ["centro", "Centro"], ["der", "Der."]].map(([p, t]) => (
            <button key={p} className={`${btn} ${pos === p ? "bg-[#EEF3FF] text-[#2563EB] font-semibold" : ""}`} onClick={() => L.setUf({ pos: p })}>{t}</button>
          ))}
        </div>
      )}
    </div>
  );
}

// Botón flotante (solo admin) para entrar y salir del modo edición.
export function EditorDiseno({ puedeEditar }) {
  const L = useLayout();
  useEffect(() => { L.setPuedeEditar(!!puedeEditar); }, [puedeEditar]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!puedeEditar) return null;
  if (!L.editando) {
    return (
      <button
        onClick={() => L.setEditando(true)}
        className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full bg-[#13234A] text-white text-sm px-4 py-2.5 shadow-lg hover:bg-[#1b3270]"
      >
        <Pencil size={15} /> Editar diseño
      </button>
    );
  }
  const msg = { guardando: "Guardando…", guardado: "Guardado ✓", error: "No se pudo guardar (¿corriste el SQL v138?)" }[L.estado] || "";
  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm bg-white rounded-2xl shadow-lg border border-stone-200 p-3 text-xs text-stone-600 flex flex-col gap-2">
      <div className="font-semibold text-[#13234A] text-sm">Modo edición</div>
      <div>Mover: arrastra el ícono ⠿ de la tarjeta. Tamaño: arrastra el punto de la esquina o haz clic en la tarjeta y usa los números. El ancho siempre reparte el 100% de la fila; el alto vale para toda la fila y el contenido se ajusta solo (espacios y letras) para que quede parejo. Títulos: clic en el texto. UF: botones bajo la tarjeta.</div>
      <div className="flex items-center justify-between gap-2">
        <span className={L.estado === "error" ? "text-rose-600" : "text-stone-400"}>{msg}</span>
        <span className="flex gap-2">
          <button
            onClick={() => { if (window.confirm("¿Restablecer todo el diseño (tarjetas, títulos y UF) al original?")) L.restablecer(); }}
            className="px-2.5 py-1.5 rounded-lg border border-stone-200 hover:bg-stone-50"
          >
            Restablecer todo
          </button>
          <button onClick={() => L.setEditando(false)} className="px-3 py-1.5 rounded-lg bg-[#2563EB] text-white flex items-center gap-1">
            <Check size={13} /> Listo
          </button>
        </span>
      </div>
    </div>
  );
}
