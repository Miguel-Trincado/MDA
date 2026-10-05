import { useState, useEffect, useCallback } from "react";
import Sidebar from "./components/Sidebar";
import SiteGate from "./components/SiteGate";
import EjecutivoView from "./components/EjecutivoView";
import JefaView from "./components/JefaView";
import ReporteEjecutivoView from "./components/ReporteEjecutivoView";
import CargaPage from "./components/CargaPage";
import Cotizador from "./components/Cotizador";
import Comisiones from "./components/Comisiones";
import { useAuthSession } from "./lib/useAuthSession";
import {
  fetchAllData, saveGestionRemote, markRevisadoRemote,
  uploadMaestroRemote, resolveCambioRemote, setMetaMensualRemote,
  uploadListaPreciosRemote,
} from "./lib/db";
import { parseListaPrecios } from "./lib/parseListaPrecios";

// El sitio está público en el link de Vercel, así que antes de mostrar
// cualquier pestaña se pide una clave de entrada compartida (ver
// SiteGate). Si alguien entra ahí con su correo y contraseña reales de
// administrador en vez de la clave general, la sesión de administrador
// queda activa igual que si hubiera iniciado sesión desde Comisiones o
// Carga — así se "reconoce" sin pedir el candado general aparte.
function siteYaDesbloqueado() {
  try {
    return localStorage.getItem("pilpilen_gate_unlocked") === "1" || sessionStorage.getItem("pilpilen_gate_unlocked") === "1";
  } catch {
    return false;
  }
}

export default function App() {
  const [desbloqueado, setDesbloqueado] = useState(siteYaDesbloqueado);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [view, setView] = useState("dashboard");
  const [db, setDb] = useState({ gestion: {}, control: {}, cambios: [], historial: [], metas: {}, cotizaciones: {}, listaPrecios: {}, cambiosEstadoOpp: [] });
  // Solo se usa para decidir si la pestaña "Comisiones" se muestra en el
  // menú (es privada: solo el administrador debe verla). El contenido de
  // esa pestaña vuelve a validar la sesión por su cuenta.
  const { session: authSession, handleLogout } = useAuthSession();

  // "Cerrar sesión" debe expulsar de verdad, no solo ocultar Comisiones:
  // además de cerrar la sesión de Supabase, se borra el candado general
  // (pilpilen_gate_unlocked) para que la próxima vez vuelva a pedir
  // usuario y contraseña en vez de dejar pasar directo al Dashboard.
  async function handleLogoutCompleto() {
    try {
      localStorage.removeItem("pilpilen_gate_unlocked");
      sessionStorage.removeItem("pilpilen_gate_unlocked");
    } catch {
      // Si el navegador bloquea el almacenamiento, no es grave.
    }
    await handleLogout();
    setDesbloqueado(false);
  }

  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchAllData();
      setDb(data);
    } catch (e) {
      console.error(e);
      setError(
        e.message ||
          "No se pudo conectar con Supabase. Verifica VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY y que el esquema esté creado."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (desbloqueado) reload();
  }, [desbloqueado, reload]);

  // Si la sesión de administrador se cierra (o nunca existió) mientras se
  // está en la pestaña privada, se vuelve al Dashboard en vez de dejar la
  // pantalla en blanco.
  useEffect(() => {
    if (view === "comisiones" && authSession === null) setView("dashboard");
  }, [view, authSession]);

  async function saveGestion(rut, updates) {
    const prev = db.gestion[rut];
    const { gestion: gUpdated, historialEntry } = await saveGestionRemote(prev, rut, updates);
    setDb((d) => ({
      ...d,
      gestion: { ...d.gestion, [rut]: gUpdated },
      historial: [historialEntry, ...d.historial].slice(0, 1500),
    }));
  }

  async function markRevisado(rut) {
    const prev = db.gestion[rut];
    const { gestion: gUpdated, historialEntry } = await markRevisadoRemote(prev, rut);
    setDb((d) => ({
      ...d,
      gestion: { ...d.gestion, [rut]: gUpdated },
      historial: [historialEntry, ...d.historial].slice(0, 1500),
    }));
  }

  async function uploadMaestro(text) {
    const { gestion, control, cotizaciones, cambiosNuevos, summary } = await uploadMaestroRemote(
      text, db.gestion, db.control, db.cotizaciones
    );
    setDb((d) => ({
      ...d,
      gestion,
      control,
      cotizaciones,
      cambios: [...cambiosNuevos, ...d.cambios],
    }));
    return summary;
  }

  async function uploadListaPrecios(text) {
    const unidades = parseListaPrecios(text);
    const listaPrecios = await uploadListaPreciosRemote(unidades);
    setDb((d) => ({ ...d, listaPrecios }));
    return Object.values(listaPrecios);
  }

  async function resolveCambio(cambio, decision) {
    const prevGestion = db.gestion[cambio.rut];
    const prevControl = db.control[cambio.rut];
    const { gestion, control, resolucion, fechaResolucion } = await resolveCambioRemote(cambio, decision, prevGestion, prevControl);
    setDb((d) => ({
      ...d,
      gestion: { ...d.gestion, [cambio.rut]: gestion },
      control: control ? { ...d.control, [cambio.rut]: control } : d.control,
      cambios: d.cambios.map((c) => (c.id === cambio.id ? { ...c, resolucion, fechaResolucion } : c)),
    }));
  }

  async function setMetaMensual(mes, valor) {
    await setMetaMensualRemote(mes, valor);
    setDb((d) => ({ ...d, metas: { ...d.metas, [mes]: valor } }));
  }

  if (!desbloqueado) {
    return <SiteGate onUnlock={() => setDesbloqueado(true)} />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white font-body text-stone-900 flex items-center justify-center h-screen">
        <div className="text-stone-500 font-body">Cargando datos del sistema…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-white font-body text-stone-900 flex items-center justify-center h-screen px-5">
        <div className="max-w-md border border-rose-300 bg-rose-50 text-rose-800 text-sm px-4 py-4 rounded-xl">
          <div className="font-medium mb-1">No se pudo cargar el sistema</div>
          <div>{error}</div>
          <button onClick={reload} className="mt-3 bg-rose-700 hover:bg-rose-800 text-white text-xs px-3 py-1.5 rounded-lg">
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F4F6FA] font-body text-stone-900 flex">
      <Sidebar
        active={view}
        onChange={setView}
        showComisiones={!!authSession}
        email={authSession?.user?.email}
        onLogout={handleLogoutCompleto}
      />
      <div className="flex-1 min-w-0">
        {view === "dashboard" && <ReporteEjecutivoView db={db} onUpload={uploadMaestro} />}
        {view === "ejecutivo" && <EjecutivoView db={db} onSave={saveGestion} onRevisado={markRevisado} />}
        {view === "carga" && <CargaPage onUploadMaestro={uploadMaestro} onUploadListaPrecios={uploadListaPrecios} />}
        {view === "cotizador" && <Cotizador db={db} />}
        {view === "comisiones" && authSession && <Comisiones db={db} />}
        {view === "jefa" && (
          <JefaView
            db={db}
            onResolveCambio={resolveCambio}
            onSetMeta={setMetaMensual}
            onSaveGestion={saveGestion}
            onRevisado={markRevisado}
          />
        )}
      </div>
    </div>
  );
}
