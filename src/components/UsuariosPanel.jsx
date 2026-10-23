import { useEffect, useState } from "react";
import {
  listarPerfilesRemote, crearUsuarioRemote, cambiarPerfilUsuarioRemote,
  resetearClaveUsuarioRemote, eliminarUsuarioRemote,
} from "../lib/db";
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
      <span className="flex items-center gap-2 text-xs text-stone-400 w-[230px]">
        <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0" /> Nunca ha ingresado
      </span>
    );
  }
  const ms = ultima ? Math.max(0, ahora - new Date(ultima).getTime()) : 0;
  const activo = enLinea || ms <= MIN_ACTIVO_MS;
  return (
    <span className="flex items-center gap-2 text-xs w-[230px]" title={`Última conexión: ${fmtDateTime(ultima)}`}>
      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${activo ? "bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.2)]" : "bg-rose-500"}`} />
      <span className={activo ? "text-emerald-700 font-medium" : "text-stone-500"}>
        {activo ? (enLinea ? "En línea" : "Activo ahora") : `Inactivo · ${haceTexto(ms)}`}
      </span>
      {!activo && <span className="text-stone-400">({fmtDateTime(ultima)})</span>}
    </span>
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
  const [rol, setRol] = useState("ejecutiva");
  const [ejecutivo, setEjecutivo] = useState("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [trabajando, setTrabajando] = useState(false);

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
    <div className="max-w-6xl mx-auto px-5 pt-4 pb-6">
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
        <div className="text-sm divide-y divide-stone-100">
          {usuarios.map((u) => {
            const esYo = u.userId === miUserId;
            return (
              <div key={u.userId} className="flex flex-wrap items-center gap-3 py-2.5">
                <span className="flex-1 min-w-[180px] truncate">
                  {u.email} {esYo && <span className="text-xs text-stone-400">(tú)</span>}
                </span>
                <EstadoConexion ultima={esYo ? new Date(ahora).toISOString() : u.ultimaConexion} ahora={ahora} enLinea={esYo || enLinea.has(u.userId)} />
                <select
                  className="ipt !w-40"
                  disabled={esYo || trabajando}
                  value={u.rol === "sin perfil" ? "" : u.rol}
                  onChange={(e) => cambiarPerfil(u, e.target.value, u.ejecutivo)}
                >
                  {u.rol === "sin perfil" && <option value="">Sin perfil</option>}
                  {PERFILES.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
                {u.rol === "ejecutiva" && u.ejecutivo && (() => {
                  const c = cruce(u.ejecutivo);
                  return c.clientes === 0 ? (
                    <span className="text-xs text-rose-600">Sin cruce: ningún cliente con ese nombre</span>
                  ) : (
                    <span className="text-xs text-emerald-700">{c.clientes} clientes · {c.cotizaciones} cotizaciones</span>
                  );
                })()}
                {u.rol === "ejecutiva" && (
                  <select
                    className="ipt !w-44"
                    disabled={trabajando}
                    value={u.ejecutivo || ""}
                    onChange={(e) => cambiarPerfil(u, "ejecutiva", e.target.value)}
                  >
                    {!ejecutivos.includes(u.ejecutivo) && u.ejecutivo && <option value={u.ejecutivo}>{u.ejecutivo}</option>}
                    {ejecutivos.map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                )}
                <button onClick={() => resetear(u)} className="text-xs text-[#1E5AA8] hover:underline">Cambiar clave</button>
                {!esYo && (
                  <button onClick={() => eliminar(u)} className="text-xs text-rose-600 hover:underline">Eliminar</button>
                )}
              </div>
            );
          })}
          {usuarios.length === 0 && <p className="text-stone-400 text-sm py-2">Sin usuarios.</p>}
        </div>
      </Panel>
    </div>
  );
}
