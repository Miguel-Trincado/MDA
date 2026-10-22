import { useAuthSession } from "../lib/useAuthSession";
import { PageHeader, PAGE_CLASS } from "./Shared";
import UploadMaestroPanel from "./UploadMaestroPanel";
import UploadListaPreciosPanel from "./UploadListaPreciosPanel";
import UploadDescuentosUnidadesPanel from "./UploadDescuentosUnidadesPanel";
import UploadCuotasPanel from "./UploadCuotasPanel";

export default function CargaPage({ onUploadMaestro, onUploadListaPrecios, onUploadDescuentosUnidades, onUploadCuotas }) {
  // El logout vive centralizado en el menú de Cuenta del sidebar (cierra
  // sesión Y borra el candado general de entrada); acá solo se usa la
  // sesión para decidir si mostrar el login o el formulario de carga.
  const { session, email, setEmail, password, setPassword, loginError, loggingIn, handleLogin } = useAuthSession();

  return (
    <div className={PAGE_CLASS}>
      <PageHeader title="Carga" subtitle="Sube el Maestro Aval, el listado de precios y el reporte de cobranza" />

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
          <div className="text-xs text-stone-400 mb-4">Sesión: {session.user.email}</div>
          <div className="flex flex-col gap-4">
            <UploadMaestroPanel onUpload={onUploadMaestro} />
            <UploadListaPreciosPanel onUpload={onUploadListaPrecios} />
            <UploadDescuentosUnidadesPanel onUpload={onUploadDescuentosUnidades} />
            {onUploadCuotas && <UploadCuotasPanel onUpload={onUploadCuotas} />}
          </div>
        </>
      )}
    </div>
  );
}
