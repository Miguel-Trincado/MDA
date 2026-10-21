import { useState } from "react";
import { User, Lock, Eye, EyeOff, ArrowRight, ShieldCheck, Bot } from "lucide-react";
import { supabase } from "../supabaseClient";

// Pantalla de acceso: solo entra quien tenga un usuario real (correo y
// contraseña) creado por el administrador en la pestaña Usuarios. La app
// detecta la sesión sola, así que aquí no hace falta avisar nada al entrar.
export default function SiteGate() {
  const [usuario, setUsuario] = useState("");
  const [clave, setClave] = useState("");
  const [verClave, setVerClave] = useState(false);
  const [soyHumano, setSoyHumano] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!soyHumano) {
      setError("Confirma la casilla para continuar.");
      return;
    }
    const u = usuario.trim();
    setEnviando(true);
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({ email: u, password: clave });
      if (authError) throw authError;
    } catch {
      setError("Correo o contraseña incorrectos.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="min-h-screen flex bg-gradient-to-br from-[#F4F8FA] via-[#EEF3F6] to-[#DCE9ED]">
     <div className="flex-1 flex items-center justify-center px-6 py-10">
      <div className="max-w-md w-full mx-auto">
        {/* Logo: reemplaza este comentario por <img src="/logo.png" alt="MDA"
            className="h-16 mb-8" /> cuando tengas el archivo de la imagen —
            ponla en la carpeta "public" del proyecto como "logo.png" (o el
            nombre que uses, ajustando el src). */}

        <h1 className="font-display text-4xl font-bold text-[#0F3D66] leading-tight mb-2">¡Bienvenido a MDA Gestión Comercial!</h1>
        <p className="text-stone-500 mb-8">Por favor, inicia sesión</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div>
            <label className="block text-sm font-semibold text-stone-700 mb-1.5">Correo</label>
            <div className="relative">
              <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
              <input
                value={usuario}
                onChange={(e) => setUsuario(e.target.value)}
                placeholder="correo@mdai.cl"
                autoFocus
                type="email"
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


          <label className="flex items-center gap-2 text-sm text-stone-600 border border-stone-300 rounded-lg px-4 py-3 cursor-pointer select-none bg-white/60">
            <input
              type="checkbox"
              checked={soyHumano}
              onChange={(e) => setSoyHumano(e.target.checked)}
              className="w-4 h-4 rounded border-stone-300 text-[#0F3D66] focus:ring-[#1E5AA8]"
            />
            <span className="flex items-center gap-1.5">
              Soy un humano y a veces un Bot <Bot size={16} className="text-[#0F3D66]" />
            </span>
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
          <span>© {new Date().getFullYear()} ByMats</span>
          <span className="uppercase tracking-wide">Gestión comercial inmobiliaria</span>
        </div>
      </div>
     </div>
     {/* Panel de marca: el fondo es el mismo azul del logo para que se
         funda con la imagen en cualquier tamaño de pantalla. */}
     <div className="hidden md:flex w-[40%] max-w-[720px] bg-[#002F7B] items-center justify-center">
       <img src="/logo-mda.jpg" alt="MDA Inmobiliaria" className="w-full h-full object-contain" />
     </div>
    </div>
  );
}
