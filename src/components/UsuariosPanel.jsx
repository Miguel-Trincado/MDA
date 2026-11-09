import { useEffect, useState } from "react";
import {
  listarPerfilesRemote, crearUsuarioRemote, cambiarPerfilUsuarioRemote,
  resetearClaveUsuarioRemote, eliminarUsuarioRemote, establecerPermisosUsuarioRemote,
} from "../lib/db";
import { MENUS, permisosPorDefecto, permisosEfectivos } from "../lib/permisos";
import { X } from "lucide-react";
import { normalizarBusqueda, fmtDateTime } from "../lib/helpers";
import { suscribirPresencia } from "../lib/presencia";
import { Panel, Field, PageHeader } from "./Shared";

const PERFILES = [
  { value: "ejecutiva", label: "Ejecutivo" },
  { value: "jefe", label: "Jefe de ventas" },
  { value: "admin", label: "Administrador" },
];
// Activo = tuvo actividad en los últimos 5 minutos (la app avisa cada 2).
const MIN_ACTIVO_MS = 5 * 60 * 1000;
function haceTexto(ms) {
  const m = Math.floor(ms / 60000);
  if (m < 1) return "hace menos de 1 min";
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return `hace ${d} ${d === 1 ? "día" : "días"}`;
}
function EstadoConexion({ ultima, ahora, enLinea }) {
  if (!ultima && !enLinea) {
    return (
      <span className="flex items-center gap-2 text-xs text-stone-400">
        <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0" /> Nunca ha ingresado
      </span>
    );
  }
  const ms = ultima ? Math.max(0, ahora - new Date(ultima).getTime()) : 0;
  const activo = enLinea || ms <= MIN_ACTIVO_MS;
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs" title={`Última conexión: ${fmtDateTime(ultima)}`}>
      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${activo ? "bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.2)]" : "bg-rose-500"}`} />
      <span className={activo ? "text-emerald-700 font-medium" : "text-stone-500"}>
        {activo ? (enLinea ? "En línea" : "Activo ahora") : `Inactivo · ${haceTexto(ms)}`}
      </span>
      {!activo && <span className="text-stone-400 basis-full pl-[18px]">{fmtDateTime(ultima)}</span>}
    </span>
  );
}

function Interruptor({ valor, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={valor}
      disabled={disabled}
      onClick={() => onChange(!valor)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-60 ${valor ? "bg-emerald-500" : "bg-stone-300"}`}
    >
      <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${valor ? "translate-x-[22px]" : "translate-x-0.5"}`} />
    </button>
  );
}

// Ficha del usuario: Sí/No por cada menú. Solo la modifica el administrador
// (la base rechaza el cambio de cualquier otro usuario).
function FichaUsuario({ usuario, onCerrar, onGuardar, guardando, error }) {
  const esAdminU = usuario.rol === "admin";
  const def = permisosPorDefecto(usuario.rol);
  const [vals, setVals] = useState(() => permisosEfectivos(usuario.rol, usuario.permisos));
  useEffect(() => {
    const f = (e) => { if (e.key === "Escape") onCerrar(); };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [onCerrar]);
  const personalizado = MENUS.some((m) => vals[m.key] !== def[m.key]);
  const nSi = MENUS.filter((m) => vals[m.key]).length;
  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-3" onClick={onCerrar}>
      <div role="dialog" aria-label={`Ficha de ${usuario.email}`} className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[92vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 border-b border-stone-100">
          <div className="min-w-0">
            <div className="font-display text-base text-[#0F3D66]">Ficha de usuario</div>
            <div className="text-sm text-stone-700 truncate">{usuario.email}</div>
            <div className="text-xs text-stone-400">
              {etiquetaPerfil(usuario.rol)}{usuario.ejecutivo ? ` · ${usuario.ejecutivo}` : ""}
            </div>
          </div>
          <button onClick={onCerrar} className="p-1 rounded-md hover:bg-stone-100 text-stone-500" aria-label="Cerrar"><X size={18} /></button>
        </div>
        <div className="px-5 py-3 overflow-y-auto">
          <div className="text-[11px] uppercase tracking-wide text-stone-400 mb-1">Menús que puede ver</div>
          {esAdminU && <p className="text-xs text-stone-500 mb-2">El administrador siempre tiene acceso a todo; esta ficha no se modifica.</p>}
          <div className="divide-y divide-stone-100">
            {MENUS.map((m) => (
              <div key={m.key} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <div className="text-sm text-stone-800">{m.label}</div>
                  {!esAdminU && vals[m.key] !== def[m.key] && <div className="text-[10px] text-amber-600">Distinto al perfil ({def[m.key] ? "Sí" : "No"})</div>}
                </div>
                <div className="flex items-center gap-2.5">
                  <span className={`text-xs w-6 text-right font-medium ${vals[m.key] ? "text-emerald-700" : "text-stone-400"}`}>{vals[m.key] ? "Sí" : "No"}</span>
                  <Interruptor valor={vals[m.key]} disabled={esAdminU || guardando} onChange={(v) => setVals((x) => ({ ...x, [m.key]: v }))} />
                </div>
              </div>
            ))}
          </div>
          {error && <p className="text-rose-600 text-xs mt-3">{error}</p>}
          <p className="text-[11px] text-stone-400 mt-3">
            Esto controla qué menús se muestran. Los datos siguen protegidos según el perfil (un ejecutivo solo ve lo suyo aunque se le active un menú).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 px-5 py-3 border-t border-stone-100">
          <span className="text-xs text-stone-500 mr-auto">{nSi} de {MENUS.length} menús{personalizado ? " · personalizado" : " · según perfil"}</span>
          {!esAdminU && (
            <button disabled={guardando || !personalizado && !usuario.permisos} onClick={() => onGuardar(usuario, null)} className="px-3 py-2 text-xs rounded-lg border border-stone-200 text-stone-600 hover:bg-stone-50 disabled:opacity-40">
              Volver al perfil
            </button>
          )}
          {!esAdminU && (
            <button disabled={guardando} onClick={() => onGuardar(usuario, personalizado ? vals : null)} className="px-4 py-2 text-xs rounded-lg bg-[#0F3D66] hover:bg-[#1E5AA8] text-white font-medium disabled:opacity-50">
              {guardando ? "Guardando…" : "Guardar"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Columnas de la lista de usuarios (escritorio); en móvil cada usuario es una tarjeta apilada.
const COLS = "lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1.2fr)_150px_minmax(0,1.3fr)_100px_auto]";
const etiquetaPerfil = (rol) => PERFILES.find((p) => p.value === rol)?.label || "Sin perfil";

// Panel de administrador: alta y mantención de usuarios sin entrar a
// Supabase. Las operaciones corren como funciones seguras en la base
// (migración v121) que solo acepta si quien llama es administrador.
export default function UsuariosPanel({ ejecutivos, miUserId, db }) {
  // Cruce usuario ↔ operaciones: se cuenta, por nombre de ejecutivo (el de la
  // columna "Ejecutivo" del Aval), cuántos clientes y cotizaciones tiene.
  const cruce = (nombre) => {
    const k = normalizarBusqueda(nombre);
    const ruts = new Set(
      Object.values(db?.gestion || {}).filter((g) => normalizarBusqueda(g.ejecutivo) === k).map((g) => g.rut)
    );
    const cots = Object.values(db?.cotizaciones || {}).filter((c) => ruts.has(c.rut)).length;
    return { clientes: ruts.size, cotizaciones: cots };
  };

  const [usuarios, setUsuarios] = useState([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rol, setRol] = useState("ejecutiva");
  const [ejecutivo, setEjecutivo] = useState("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [trabajando, setTrabajando] = useState(false);
  const [fichaDe, setFichaDe] = useState(null);

  async function cargar() {
    try {
      setUsuarios(await listarPerfilesRemote());
    } catch (e) {
      setError(e.message || "No se pudo cargar la lista (¿corriste la migración v121?)");
    }
  }
  const [ahora, setAhora] = useState(Date.now());
  const [enLinea, setEnLinea] = useState(() => new Set());
  useEffect(() => suscribirPresencia((s) => setEnLinea(new Set(s))), []);
  useEffect(() => {
    cargar();
    // Se refresca cada minuto para que los puntos verde/rojo estén al día.
    const t = setInterval(() => { cargar(); setAhora(Date.now()); }, 60 * 1000);
    return () => clearInterval(t);
  }, []);

  async function ejecutar(fn, okMsg) {
    setError("");
    setMsg("");
    setTrabajando(true);
    try {
      await fn();
      setMsg(okMsg);
      await cargar();
      return true;
    } catch (e) {
      setError(e.message || "No se pudo completar la acción");
      return false;
    } finally {
      setTrabajando(false);
    }
  }

  async function crear(e) {
    e.preventDefault();
    const ok = await ejecutar(
      () => crearUsuarioRemote({ email, password, rol, ejecutivo }),
      `Usuario ${email} creado como ${etiquetaPerfil(rol)}.`
    );
    if (ok) {
      setEmail("");
      setPassword("");
      setEjecutivo("");
    }
  }

  function cambiarPerfil(u, nuevoRol, nuevoEjecutivo) {
    if (nuevoRol === "ejecutiva" && !nuevoEjecutivo) {
      setError("Para el perfil Ejecutivo elige a qué ejecutiva corresponde.");
      return;
    }
    ejecutar(() => cambiarPerfilUsuarioRemote(u.userId, nuevoRol, nuevoEjecutivo), `Perfil de ${u.email} actualizado.`);
  }

  async function guardarFicha(u, permisos) {
    const ok = await ejecutar(() => establecerPermisosUsuarioRemote(u.userId, permisos), `Ficha de ${u.email} actualizada.`);
    if (ok) setFichaDe(null);
  }

  function resetear(u) {
    const nueva = window.prompt(`Nueva contraseña para ${u.email} (mínimo 8 caracteres):`);
    if (!nueva) return;
    ejecutar(() => resetearClaveUsuarioRemote(u.userId, nueva), `Contraseña de ${u.email} actualizada.`);
  }

  function eliminar(u) {
    if (!window.confirm(`¿Eliminar definitivamente el usuario ${u.email}?`)) return;
    ejecutar(() => eliminarUsuarioRemote(u.userId), `Usuario ${u.email} eliminado.`);
  }

  return (
    <div className="max-w-7xl mx-auto px-5 pt-4 pb-6">
      <PageHeader title="Usuarios" subtitle="Crea usuarios, asígnales un perfil y revisa su última conexión" />

      <Panel title="Nuevo usuario">
        <form onSubmit={crear} className="grid grid-cols-1 md:grid-cols-2 gap-3 items-end">
          <Field label="Correo">
            <input className="ipt" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Contraseña (mín. 8 caracteres)">
            <input className="ipt" type="text" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" />
          </Field>
          <Field label="Perfil">
            <select className="ipt" value={rol} onChange={(e) => setRol(e.target.value)}>
              {PERFILES.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </Field>
          {rol === "ejecutiva" ? (
            <Field label="Ejecutivo (nombre de la columna Ejecutivo)">
              <select className="ipt" required value={ejecutivo} onChange={(e) => setEjecutivo(e.target.value)}>
                <option value="">Selecciona…</option>
                {ejecutivos.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </Field>
          ) : (
            <div />
          )}
          <button
            type="submit"
            disabled={trabajando}
            className="md:col-span-2 bg-[#0F3D66] hover:bg-[#1E5AA8] disabled:opacity-50 text-white px-4 py-2.5 text-sm font-medium rounded-lg"
          >
            {trabajando ? "Procesando…" : "Crear usuario"}
          </button>
        </form>
        {msg && <p className="text-emerald-700 text-xs mt-3">{msg}</p>}
        {error && <p className="text-rose-600 text-xs mt-3">{error}</p>}
      </Panel>

      {usuarios.length > 0 && !("ultimaConexion" in usuarios[0]) && (
        <p className="mt-6 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Falta ejecutar la migración v171 en Supabase: sin ella solo se ve quién está en línea ahora, no la última conexión.
        </p>
      )}
      <Panel title="Usuarios del sistema" className="mt-6">
        <div className="text-sm">
          <div className={`hidden lg:grid ${COLS} gap-x-4 px-1 pb-2 text-[11px] uppercase tracking-wide text-stone-400 border-b border-stone-200`}>
            <span>Usuario</span><span>Conexión</span><span>Perfil</span><span>Ejecutivo vinculado</span><span>Menús</span><span className="text-right">Acciones</span>
          </div>
          <div className="divide-y divide-stone-100">
            {usuarios.map((u) => {
              const esYo = u.userId === miUserId;
              const efec = permisosEfectivos(u.rol, u.permisos);
              const nSi = MENUS.filter((m) => efec[m.key]).length;
              const def = permisosPorDefecto(u.rol);
              const pers = u.rol !== "admin" && MENUS.some((m) => efec[m.key] !== def[m.key]);
              const c = u.rol === "ejecutiva" && u.ejecutivo ? cruce(u.ejecutivo) : null;
              return (
                <div key={u.userId} className={`grid grid-cols-1 ${COLS} gap-x-4 gap-y-2 py-3 px-1 items-center`}>
                  <div className="min-w-0">
                    <div className="truncate text-stone-800" title={u.email}>{u.email} {esYo && <span className="text-xs text-stone-400">(tú)</span>}</div>
                  </div>
                  <EstadoConexion ultima={esYo ? new Date(ahora).toISOString() : u.ultimaConexion} ahora={ahora} enLinea={esYo || enLinea.has(u.userId)} />
                  <select
                    className="ipt"
                    disabled={esYo || trabajando}
                    value={u.rol === "sin perfil" ? "" : u.rol}
                    onChange={(e) => cambiarPerfil(u, e.target.value, u.ejecutivo)}
                  >
                    {u.rol === "sin perfil" && <option value="">Sin perfil</option>}
                    {PERFILES.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                  <div className="min-w-0">
                    {u.rol === "ejecutiva" ? (
                      <>
                        <select className="ipt" disabled={trabajando} value={u.ejecutivo || ""} onChange={(e) => cambiarPerfil(u, "ejecutiva", e.target.value)}>
                          {!ejecutivos.includes(u.ejecutivo) && u.ejecutivo && <option value={u.ejecutivo}>{u.ejecutivo}</option>}
                          {ejecutivos.map((n) => (
                            <option key={n} value={n}>{n}</option>
                          ))}
                        </select>
                        {c && (c.clientes === 0
                          ? <div className="text-[11px] text-rose-600 mt-1">Sin cruce: ningún cliente con ese nombre</div>
                          : <div className="text-[11px] text-emerald-700 mt-1">{c.clientes} clientes · {c.cotizaciones} cotizaciones</div>)}
                      </>
                    ) : (
                      <span className="text-stone-300">—</span>
                    )}
                  </div>
                  <div className="text-xs text-stone-600">
                    <span className="font-medium">{nSi} de {MENUS.length}</span>
                    {pers && <span className="ml-1 text-amber-600">· personalizado</span>}
                  </div>
                  <div className="flex items-center lg:justify-end gap-3 flex-wrap">
                    <button onClick={() => setFichaDe(u.userId)} disabled={u.rol === "sin perfil"} className="px-3 py-1.5 text-xs rounded-lg border border-[#1E5AA8] text-[#1E5AA8] hover:bg-[#1E5AA8] hover:text-white transition-colors disabled:opacity-40">Ficha</button>
                    <button onClick={() => resetear(u)} className="text-xs text-[#1E5AA8] hover:underline">Cambiar clave</button>
                    {!esYo ? (
                      <button onClick={() => eliminar(u)} className="text-xs text-rose-600 hover:underline">Eliminar</button>
                    ) : (
                      <span className="w-[46px]" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {usuarios.length === 0 && <p className="text-stone-400 text-sm py-2">Sin usuarios.</p>}
        </div>
      </Panel>
      {fichaDe && (() => {
        const u = usuarios.find((x) => x.userId === fichaDe);
        return u ? <FichaUsuario key={u.userId} usuario={u} onCerrar={() => setFichaDe(null)} onGuardar={guardarFicha} guardando={trabajando} error={error} /> : null;
      })()}
    </div>
  );
}
