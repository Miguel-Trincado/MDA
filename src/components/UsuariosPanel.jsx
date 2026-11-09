import { useEffect, useState } from "react";
import {
  listarPerfilesRemote, crearUsuarioRemote, cambiarPerfilUsuarioRemote,
  resetearClaveUsuarioRemote, eliminarUsuarioRemote, establecerPermisosUsuarioRemote, establecerNombreUsuarioRemote,
} from "../lib/db";
import { MENUS, permisosPorDefecto, permisosEfectivos } from "../lib/permisos";
import { X, Plus, Search, ChevronRight } from "lucide-react";
import { normalizarBusqueda, fmtDateTime } from "../lib/helpers";
import { suscribirPresencia } from "../lib/presencia";
import { Panel, Field, PageHeader, Avatar } from "./Shared";

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

// Nombre que se muestra: nombre y apellido de la ficha; si no hay, el ejecutivo vinculado; si no, el correo.
const nombreDe = (u) => [u.nombre, u.apellido].filter((x) => x && String(x).trim()).join(" ") || u.ejecutivo || u.email;

function Seccion({ titulo, children, derecha }) {
  return (
    <div className="px-5 py-4 border-b border-stone-100 last:border-b-0">
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <div className="text-[11px] uppercase tracking-[0.12em] text-stone-400 font-medium">{titulo}</div>
        {derecha}
      </div>
      {children}
    </div>
  );
}

// Ficha completa del usuario (ventana flotante): datos, perfil, acceso a menús y
// seguridad. Solo la modifica el administrador (la base rechaza a cualquier otro).
function FichaUsuario({ usuario, esYo, ejecutivos, cruce, ultima, ahora, enLinea, trabajando, msg, error, onCerrar, onGuardarMenus, onGuardarNombre, onCambiarPerfil, onResetear, onEliminar }) {
  const esAdminU = usuario.rol === "admin";
  const def = permisosPorDefecto(usuario.rol);
  const [vals, setVals] = useState(() => permisosEfectivos(usuario.rol, usuario.permisos));
  const [nombre, setNombre] = useState(usuario.nombre || "");
  const [apellido, setApellido] = useState(usuario.apellido || "");
  useEffect(() => {
    const f = (e) => { if (e.key === "Escape") onCerrar(); };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [onCerrar]);
  const personalizado = MENUS.some((m) => vals[m.key] !== def[m.key]);
  const nSi = MENUS.filter((m) => vals[m.key]).length;
  const c = usuario.rol === "ejecutiva" && usuario.ejecutivo ? cruce(usuario.ejecutivo) : null;
  const nombreCambiado = nombre.trim() !== (usuario.nombre || "") || apellido.trim() !== (usuario.apellido || "");
  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-3" onClick={onCerrar}>
      <div role="dialog" aria-label={`Ficha de ${nombreDe(usuario)}`} className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-4 px-6 pt-5 pb-4 border-b border-stone-100">
          <Avatar name={nombreDe(usuario)} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="font-display text-lg text-[#13234A] leading-tight truncate">{nombreDe(usuario)}</div>
            <div className="text-xs text-stone-500 truncate">{usuario.email}</div>
            <div className="mt-1.5 flex items-center gap-x-3 gap-y-1 flex-wrap">
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-sky-50 text-[#1E5AA8] font-medium">{etiquetaPerfil(usuario.rol)}</span>
              <EstadoConexion ultima={ultima} ahora={ahora} enLinea={enLinea} />
            </div>
          </div>
          <button onClick={onCerrar} className="p-1 rounded-md hover:bg-stone-100 text-stone-500" aria-label="Cerrar"><X size={18} /></button>
        </div>

        <div className="overflow-y-auto">
          {(msg || error) && (
            <p className={`mx-6 mt-3 text-xs rounded-xl px-3.5 py-2.5 ${error ? "text-rose-700 bg-rose-50" : "text-emerald-700 bg-emerald-50"}`}>{error || msg}</p>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2">
            <div className="md:border-r border-stone-100">
              <Seccion titulo="Datos personales">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Nombre">
                    <input className="ipt" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Camila" />
                  </Field>
                  <Field label="Apellido">
                    <input className="ipt" value={apellido} onChange={(e) => setApellido(e.target.value)} placeholder="Ej. Finschi" />
                  </Field>
                  <Field label="Correo" className="sm:col-span-2">
                    <div className="ipt !bg-stone-50 !text-stone-600 truncate">{usuario.email}</div>
                  </Field>
                </div>
                {nombreCambiado && (
                  <div className="flex justify-end mt-3">
                    <button disabled={trabajando} onClick={() => onGuardarNombre(usuario, nombre, apellido)} className="px-4 py-2 text-xs rounded-lg bg-[#0F3D66] hover:bg-[#1E5AA8] text-white font-medium disabled:opacity-50">Guardar nombre</button>
                  </div>
                )}
              </Seccion>

              <Seccion titulo="Perfil">
                <div className="grid grid-cols-1 gap-3">
                  <Field label="Perfil">
                    <select className="ipt" disabled={esYo || trabajando} value={usuario.rol === "sin perfil" ? "" : usuario.rol} onChange={(e) => onCambiarPerfil(usuario, e.target.value, usuario.ejecutivo)}>
                      {usuario.rol === "sin perfil" && <option value="">Sin perfil</option>}
                      {PERFILES.map((p) => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </select>
                  </Field>
                  {usuario.rol === "ejecutiva" && (
                    <Field label="Ejecutivo vinculado">
                      <select className="ipt" disabled={trabajando} value={usuario.ejecutivo || ""} onChange={(e) => onCambiarPerfil(usuario, "ejecutiva", e.target.value)}>
                        {!ejecutivos.includes(usuario.ejecutivo) && usuario.ejecutivo && <option value={usuario.ejecutivo}>{usuario.ejecutivo}</option>}
                        {ejecutivos.map((n) => (
                          <option key={n} value={n}>{n}</option>
                        ))}
                      </select>
                      {c && (c.clientes === 0
                        ? <span className="text-[11px] text-rose-600">Sin cruce: ningún cliente con ese nombre</span>
                        : <span className="text-[11px] text-emerald-700">{c.clientes} clientes · {c.cotizaciones} cotizaciones</span>)}
                    </Field>
                  )}
                </div>
              </Seccion>

              <Seccion titulo="Seguridad">
                <div className="flex items-center gap-2 flex-wrap">
                  <button onClick={() => onResetear(usuario)} className="px-3.5 py-2 text-xs rounded-lg border border-[#1E5AA8] text-[#1E5AA8] hover:bg-[#1E5AA8] hover:text-white transition-colors">Cambiar contraseña</button>
                  {!esYo && <button onClick={() => onEliminar(usuario)} className="px-3.5 py-2 text-xs rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 transition-colors">Eliminar usuario</button>}
                </div>
              </Seccion>
            </div>

            <div>
              <Seccion titulo={`Acceso a menús · ${nSi} de ${MENUS.length}${!esAdminU && personalizado ? " · personalizado" : ""}`}>
                {esAdminU && <p className="text-xs text-stone-500 mb-2">El administrador siempre tiene acceso a todo; esta ficha no se modifica.</p>}
                <div className="divide-y divide-stone-100">
                  {MENUS.map((m) => {
                    const bloqueado = esAdminU || (m.soloAdmin && !esAdminU);
                    return (
                      <div key={m.key} className="flex items-center justify-between gap-3 py-2">
                        <div className="min-w-0">
                          <div className="text-sm text-stone-800">{m.label}</div>
                          {m.soloAdmin && !esAdminU && <div className="text-[10px] text-stone-400">Solo administradores</div>}
                          {!m.soloAdmin && !esAdminU && vals[m.key] !== def[m.key] && <div className="text-[10px] text-amber-600">Distinto al perfil ({def[m.key] ? "Sí" : "No"})</div>}
                        </div>
                        <div className="flex items-center gap-2.5">
                          <span className={`text-xs w-6 text-right font-medium ${vals[m.key] ? "text-emerald-700" : "text-stone-400"}`}>{vals[m.key] ? "Sí" : "No"}</span>
                          <Interruptor valor={vals[m.key]} disabled={bloqueado || trabajando} onChange={(v) => setVals((x) => ({ ...x, [m.key]: v }))} />
                        </div>
                      </div>
                    );
                  })}
                </div>
                {!esAdminU && (
                  <div className="flex items-center justify-end gap-2 mt-3">
                    <button disabled={trabajando || (!personalizado && !usuario.permisos)} onClick={() => onGuardarMenus(usuario, null)} className="px-3 py-2 text-xs rounded-lg border border-stone-200 text-stone-600 hover:bg-stone-50 disabled:opacity-40">Volver al perfil</button>
                    <button disabled={trabajando} onClick={() => onGuardarMenus(usuario, personalizado ? vals : null)} className="px-4 py-2 text-xs rounded-lg bg-[#0F3D66] hover:bg-[#1E5AA8] text-white font-medium disabled:opacity-50">{trabajando ? "Guardando…" : "Guardar accesos"}</button>
                  </div>
                )}
                <p className="text-[11px] text-stone-400 mt-2.5">
                  Esto controla qué menús se muestran. Los datos siguen protegidos según el perfil (un ejecutivo solo ve lo suyo aunque se le active un menú).
                </p>
              </Seccion>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

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
  const [nombreN, setNombreN] = useState("");
  const [apellidoN, setApellidoN] = useState("");
  const [rol, setRol] = useState("ejecutiva");
  const [ejecutivo, setEjecutivo] = useState("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [trabajando, setTrabajando] = useState(false);
  const [fichaDe, setFichaDe] = useState(null);
  const [mostrarNuevo, setMostrarNuevo] = useState(false);
  const [busqueda, setBusqueda] = useState("");

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
      async () => {
        const id = await crearUsuarioRemote({ email, password, rol, ejecutivo });
        if (id && (nombreN.trim() || apellidoN.trim())) await establecerNombreUsuarioRemote(id, nombreN.trim(), apellidoN.trim());
      },
      `Usuario ${email} creado como ${etiquetaPerfil(rol)}.`
    );
    if (ok) {
      setEmail("");
      setNombreN("");
      setApellidoN("");
      setPassword("");
      setEjecutivo("");
      setMostrarNuevo(false);
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
    await ejecutar(() => establecerPermisosUsuarioRemote(u.userId, permisos), `Accesos de ${u.email} actualizados.`);
  }

  async function guardarNombre(u, nombre, apellido) {
    await ejecutar(() => establecerNombreUsuarioRemote(u.userId, nombre.trim(), apellido.trim()), `Nombre de ${u.email} actualizado.`);
  }

  function resetear(u) {
    const nueva = window.prompt(`Nueva contraseña para ${u.email} (mínimo 8 caracteres):`);
    if (!nueva) return;
    ejecutar(() => resetearClaveUsuarioRemote(u.userId, nueva), `Contraseña de ${u.email} actualizada.`);
  }

  async function eliminar(u) {
    if (!window.confirm(`¿Eliminar definitivamente el usuario ${u.email}?`)) return false;
    return ejecutar(() => eliminarUsuarioRemote(u.userId), `Usuario ${u.email} eliminado.`);
  }

  return (
    <div className="max-w-7xl mx-auto px-5 pt-4 pb-6">
      <PageHeader title="Usuarios" subtitle="Crea usuarios, asígnales un perfil y define qué menús puede ver cada uno">
        <button
          onClick={() => setMostrarNuevo((v) => !v)}
          className="inline-flex items-center gap-2 bg-[#0F3D66] hover:bg-[#1E5AA8] text-white px-4 py-2.5 text-sm font-medium rounded-xl shadow-sm transition-colors"
        >
          {mostrarNuevo ? <X size={16} /> : <Plus size={16} />} {mostrarNuevo ? "Cerrar" : "Nuevo usuario"}
        </button>
      </PageHeader>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {[
          ["Usuarios", usuarios.length, "text-[#13234A]"],
          ["En línea ahora", usuarios.filter((u) => u.userId === miUserId || enLinea.has(u.userId)).length, "text-emerald-600"],
          ["Ejecutivos", usuarios.filter((u) => u.rol === "ejecutiva").length, "text-[#13234A]"],
          ["Jefes y administradores", usuarios.filter((u) => u.rol === "jefe" || u.rol === "admin").length, "text-[#13234A]"],
        ].map(([l, v, c]) => (
          <div key={l} className="bg-white border border-[#EEF1F8] rounded-2xl shadow-card px-4 py-3">
            <div className="text-[11px] uppercase tracking-wide text-stone-400">{l}</div>
            <div className={`text-2xl font-semibold tabular-nums mt-0.5 ${c}`}>{v}</div>
          </div>
        ))}
      </div>

      {(msg || error) && !fichaDe && (
        <p className={`mb-4 text-xs rounded-xl px-3.5 py-2.5 ${error ? "text-rose-700 bg-rose-50" : "text-emerald-700 bg-emerald-50"}`}>{error || msg}</p>
      )}

      {mostrarNuevo && (
        <Panel title="Nuevo usuario" className="mb-5">
          <form onSubmit={crear} className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-3 items-end">
            <Field label="Nombre">
              <input className="ipt" value={nombreN} onChange={(e) => setNombreN(e.target.value)} />
            </Field>
            <Field label="Apellido">
              <input className="ipt" value={apellidoN} onChange={(e) => setApellidoN(e.target.value)} />
            </Field>
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
              className="md:col-span-2 bg-[#0F3D66] hover:bg-[#1E5AA8] disabled:opacity-50 text-white px-4 py-2.5 text-sm font-medium rounded-xl"
            >
              {trabajando ? "Procesando…" : "Crear usuario"}
            </button>
          </form>
        </Panel>
      )}

      {usuarios.length > 0 && !("ultimaConexion" in usuarios[0]) && (
        <p className="mb-4 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
          Falta ejecutar la migración v171 en Supabase: sin ella solo se ve quién está en línea ahora, no la última conexión.
        </p>
      )}
      <Panel
        title={
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span>Usuarios del sistema</span>
            <div className="relative w-full sm:w-64 font-body normal-case">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
              <input className="ipt !pl-8 !py-2 !text-[13px]" placeholder="Buscar usuario…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
            </div>
          </div>
        }
      >
        <div className="text-sm">
          <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_16px] gap-x-4 px-3 pb-2 text-[11px] uppercase tracking-wide text-stone-400 border-b border-stone-200">
            <span>Usuario</span><span>Conexión</span><span />
          </div>
          <div className="divide-y divide-stone-100">
            {usuarios
              .filter((u) => !busqueda.trim() || normalizarBusqueda(nombreDe(u) + " " + u.email).includes(normalizarBusqueda(busqueda)))
              .map((u) => {
                const esYo = u.userId === miUserId;
                return (
                  <button
                    key={u.userId}
                    onClick={() => setFichaDe(u.userId)}
                    className="w-full grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_16px] gap-x-4 items-center text-left px-3 py-3 rounded-xl hover:bg-sky-50/60 transition-colors"
                    title="Ver ficha"
                  >
                    <span className="flex items-center gap-3 min-w-0">
                      <Avatar name={nombreDe(u)} />
                      <span className="truncate font-medium text-stone-800">{nombreDe(u)} {esYo && <span className="text-xs font-normal text-stone-400">(tú)</span>}</span>
                    </span>
                    <EstadoConexion ultima={esYo ? new Date(ahora).toISOString() : u.ultimaConexion} ahora={ahora} enLinea={esYo || enLinea.has(u.userId)} />
                    <ChevronRight size={16} className="text-stone-300" />
                  </button>
                );
              })}
          </div>
          {usuarios.length === 0 && <p className="text-stone-400 text-sm py-2">Sin usuarios.</p>}
        </div>
      </Panel>
      {fichaDe && (() => {
        const u = usuarios.find((x) => x.userId === fichaDe);
        if (!u) return null;
        const esYo = u.userId === miUserId;
        return (
          <FichaUsuario
            key={u.userId + u.rol}
            usuario={u} esYo={esYo} ejecutivos={ejecutivos} cruce={cruce}
            ultima={esYo ? new Date(ahora).toISOString() : u.ultimaConexion} ahora={ahora} enLinea={esYo || enLinea.has(u.userId)}
            trabajando={trabajando} msg={msg} error={error}
            onCerrar={() => setFichaDe(null)}
            onGuardarMenus={guardarFicha}
            onGuardarNombre={guardarNombre}
            onCambiarPerfil={cambiarPerfil}
            onResetear={resetear}
            onEliminar={async (x) => { if (await eliminar(x)) setFichaDe(null); }}
          />
        );
      })()}
    </div>
  );
}
