import { useAuthSession } from "../lib/useAuthSession";
import UploadCombinadoPanel from "./UploadCombinadoPanel";

export default function CargaPage({ onUploadMaestro, onUploadListaPrecios }) {
  const { session, email, setEmail, password, setPassword, loginError, loggingIn, handleLogin, handleLogout } = useAuthSession();

  return (
    <div className="max-w-3xl mx-auto px-5 py-8">
      <h2 className="font-display text-2xl text-[#0F3D66] mb-5">Carga</h2>

      {session === undefined ? (
        <p className="text-stone-400 text-sm">Verificando sesión…</p>
      ) : !session ? (
        <div className="border border-stone-300 bg-white p-5">
          <p className="text-stone-500 text-sm mb-4">
            Por seguridad, solo una persona autorizada puede subir el Maestro Aval y el listado de precios. Inicia
            sesión para continuar.
          </p>
          <form onSubmit={handleLogin} className="flex flex-col gap-3 max-w-xs">
            <input
              type="email"
              placeholder="Correo"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="border border-stone-300 rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-[#1E5AA8]"
            />
            <input
              type="password"
              placeholder="Contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="border border-stone-300 rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-[#1E5AA8]"
            />
            {loginError && <div className="text-rose-600 text-xs">{loginError}</div>}
            <button
              type="submit"
              disabled={loggingIn}
              className="bg-[#0F3D66] hover:bg-[#1E5AA8] disabled:opacity-50 text-white px-4 py-2 text-sm font-medium rounded-sm"
            >
              {loggingIn ? "Ingresando…" : "Ingresar"}
            </button>
          </form>
        </div>
      ) : (
        <>
          <div className="text-xs text-stone-400 mb-4">
            Sesión: {session.user.email} ·{" "}
            <button onClick={handleLogout} className="underline hover:text-stone-700">
              Cerrar sesión
            </button>
          </div>
          <div className="flex flex-col gap-4">
            <UploadCombinadoPanel onUploadMaestro={onUploadMaestro} onUploadListaPrecios={onUploadListaPrecios} />
          </div>
        </>
      )}
    </div>
  );
}
