import { useState } from "react";
import { User, Lock, Eye, EyeOff, ArrowRight, ShieldCheck } from "lucide-react";
import { supabase } from "../supabaseClient";

// Clave compartida para acceder al CRM en general (no es una cuenta real,
// solo un candado de entrada porque el sitio está público en el link de
// Vercel). Si en vez de esto se ingresa un correo y contraseña reales de
// Supabase, se intenta un login de administrador: si funciona, la sesión
// de administrador queda activa igual que si se hubiera iniciado sesión
// desde Comisiones o Carga (misma sesión de Supabase para toda la app), y
// de paso desbloquea el candado general.
const USUARIO_GENERAL = "MDA";
const CLAVE_GENERAL = "MDA1234";

export default function SiteGate({ onUnlock }) {
  const [usuario, setUsuario] = useState("");
  const [clave, setClave] = useState("");
  const [verClave, setVerClave] = useState(false);
  const [recordar, setRecordar] = useState(false);
  const [soyHumano, setSoyHumano] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  function desbloquear() {
    try {
      if (recordar) {
        localStorage.setItem("pilpilen_gate_unlocked", "1");
      } else {
        sessionStorage.setItem("pilpilen_gate_unlocked", "1");
      }
    } catch {
      // Si el navegador bloquea el almacenamiento, no es grave: solo
      // tendrá que volver a ingresar la clave en la próxima visita.
    }
    onUnlock();
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!soyHumano) {
      setError("Confirma que \"Soy un humano\" para continuar.");
      return;
    }
    const u = usuario.trim();
    if (u.toUpperCase() === USUARIO_GENERAL && clave === CLAVE_GENERAL) {
      desbloquear();
      return;
    }
    // No coincide con la clave general: puede ser un correo real de
    // administrador, así que se intenta como login de Supabase.
    setEnviando(true);
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({ email: u, password: clave });
      if (authError) throw authError;
      desbloquear();
    } catch {
      setError("Usuario o contraseña incorrectos.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center bg-gradient-to-br from-[#F4F8FA] via-[#EEF3F6] to-[#DCE9ED] px-6 py-10">
      <div className="max-w-md w-full mx-auto sm:ml-[12%]">
        <div className="bg-[#0F3D66] text-white w-16 h-16 flex flex-col items-center justify-center leading-none shrink-0 rounded-lg mb-8">
          <span className="font-display font-bold text-lg">MDA</span>
          <span className="text-[7px] tracking-wider mt-1">INMOBILIARIA</span>
        </div>

        <h1 className="font-display text-4xl font-bold text-[#0F3D66] leading-tight mb-2">¡Bienvenido a Pilpilén!</h1>
        <p className="text-stone-500 mb-8">Por favor, inicia sesión</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div>
            <label className="block text-sm font-semibold text-stone-700 mb-1.5">Usuario</label>
            <div className="relative">
              <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
              <input
                value={usuario}
                onChange={(e) => setUsuario(e.target.value)}
                placeholder="MDA"
                autoFocus
                required
                className="w-full bg-[#EEF2FB] border border-transparent rounded-lg pl-10 pr-3 py-2.5 text-sm focus:outline-none focus:border-[#1E5AA8] focus:bg-white transition-colors"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-sm font-semibold text-stone-700">Contraseña</label>
            </div>
            <div className="relative">
              <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
              <input
                type={verClave ? "text" : "password"}
                value={clave}
                onChange={(e) => setClave(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full bg-[#EEF2FB] border border-transparent rounded-lg pl-10 pr-10 py-2.5 text-sm focus:outline-none focus:border-[#1E5AA8] focus:bg-white transition-colors"
              />
              <button
                type="button"
                onClick={() => setVerClave((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
                tabIndex={-1}
              >
                {verClave ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-stone-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={recordar}
              onChange={(e) => setRecordar(e.target.checked)}
              className="w-4 h-4 rounded border-stone-300 text-[#0F3D66] focus:ring-[#1E5AA8]"
            />
            Recuérdame
          </label>

          <label className="flex items-center gap-2 text-sm text-stone-600 border border-stone-300 rounded-lg px-4 py-3 cursor-pointer select-none bg-white/60">
            <input
              type="checkbox"
              checked={soyHumano}
              onChange={(e) => setSoyHumano(e.target.checked)}
              className="w-4 h-4 rounded border-stone-300 text-[#0F3D66] focus:ring-[#1E5AA8]"
            />
            Soy un humano
          </label>

          {error && <p className="text-xs text-rose-600">{error}</p>}

          <button
            type="submit"
            disabled={enviando}
            className="flex items-center justify-center gap-2 bg-[#0F3D66] hover:bg-[#1E5AA8] disabled:opacity-50 text-white font-semibold rounded-lg px-4 py-3 text-sm transition-colors"
          >
            {enviando ? "Verificando…" : "Iniciar sesión"}
            {!enviando && <ArrowRight size={16} />}
          </button>

          <p className="flex items-center gap-1.5 justify-center text-xs text-stone-400">
            <ShieldCheck size={13} /> Protegemos tus credenciales en cada acceso.
          </p>
        </form>

        <div className="flex items-center justify-between text-[11px] text-stone-400 mt-10">
          <span>© {new Date().getFullYear()} Pilpilén</span>
          <span className="uppercase tracking-wide">Gestión comercial inmobiliaria</span>
        </div>
      </div>
    </div>
  );
}
