import { useState, useEffect, useCallback } from "react";
import TopNav from "./components/TopNav";
import EjecutivoView from "./components/EjecutivoView";
import JefaView from "./components/JefaView";
import ReporteEjecutivoView from "./components/ReporteEjecutivoView";
import CargaPage from "./components/CargaPage";
import Cotizador from "./components/Cotizador";
import {
  fetchAllData, saveGestionRemote, markRevisadoRemote,
  uploadMaestroRemote, resolveCambioRemote, setMetaRemote,
  uploadListaPreciosRemote,
  marcarPerdidosMasivoRemote,
} from "./lib/db";
import { parseListaPrecios } from "./lib/parseListaPrecios";

export default function App() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [view, setView] = useState("dashboard");
  const [db, setDb] = useState({ gestion: {}, control: {}, cambios: [], historial: [], meta: { value: 5 }, cotizaciones: {}, listaPrecios: {} });

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
    reload();
  }, [reload]);

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

  async function setMeta(value) {
    const meta = await setMetaRemote(value);
    setDb((d) => ({ ...d, meta }));
  }

  async function marcarPerdidosMasivo(candidatos, motivo) {
    const actualizados = await marcarPerdidosMasivoRemote(candidatos, motivo);
    setDb((d) => ({ ...d, gestion: { ...d.gestion, ...actualizados } }));
  }

  return (
    <div className="min-h-screen bg-white font-body text-stone-900">
      {loading ? (
        <div className="flex items-center justify-center h-screen">
          <div className="text-stone-500 font-body">Cargando datos del sistema…</div>
        </div>
      ) : error ? (
        <div className="flex items-center justify-center h-screen px-5">
          <div className="max-w-md border border-rose-300 bg-rose-50 text-rose-800 text-sm px-4 py-4">
            <div className="font-medium mb-1">No se pudo cargar el sistema</div>
            <div>{error}</div>
            <button onClick={reload} className="mt-3 bg-rose-700 hover:bg-rose-800 text-white text-xs px-3 py-1.5">
              Reintentar
            </button>
          </div>
        </div>
      ) : (
        <div>
          <TopNav active={view} onChange={setView} />
          {view === "dashboard" && <ReporteEjecutivoView db={db} onUpload={uploadMaestro} />}
          {view === "ejecutivo" && <EjecutivoView db={db} onSave={saveGestion} onRevisado={markRevisado} />}
          {view === "carga" && <CargaPage onUploadMaestro={uploadMaestro} onUploadListaPrecios={uploadListaPrecios} />}
          {view === "cotizador" && <Cotizador db={db} />}
          {view === "jefa" && <JefaView db={db} onResolveCambio={resolveCambio} onSetMeta={setMeta} onMarcarPerdidosMasivo={marcarPerdidosMasivo} />}
        </div>
      )}
    </div>
  );
}
