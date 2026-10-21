import { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from "react";
import { normalizarBusqueda } from "./lib/helpers";
import { EJECUTIVOS } from "./lib/constants";
import Sidebar from "./components/Sidebar";
import SiteGate from "./components/SiteGate";
import EjecutivoView from "./components/EjecutivoView";
import JefaView from "./components/JefaView";
import ReporteEjecutivoView from "./components/ReporteEjecutivoView";
const CargaPage = lazy(() => import("./components/CargaPage"));
const Cotizador = lazy(() => import("./components/Cotizador"));
const Comisiones = lazy(() => import("./components/Comisiones"));
const MisComisiones = lazy(() => import("./components/MisComisiones"));
const UsuariosPanel = lazy(() => import("./components/UsuariosPanel"));
import { useMiPerfil } from "./lib/useMiPerfil";
import { useAuthSession } from "./lib/useAuthSession";
import { UfProvider } from "./lib/uf";
import { LayoutProvider, EditorDiseno } from "./lib/layout";
import { cacheLeer, cacheGuardar, cacheBorrar } from "./lib/cacheLocal";
import {
  fetchDatosBase, fetchDatosAval, saveGestionRemote, markRevisadoRemote,
  uploadMaestroRemote, resolveCambioRemote, setMetaMensualRemote,
  uploadListaPreciosRemote, guardarDescuentosUnidades, registrarCargaRemote, guardarTiposUnidadRemote,
} from "./lib/db";
import { parseListaPrecios } from "./lib/parseListaPrecios";

// El sitio está público en el link de Vercel, así que no se muestra nada
// sin una sesión real de usuario (correo y contraseña creados en la
// pestaña Usuarios). Ya no existe una clave compartida.

function AppInner() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [view, setView] = useState("dashboard");
  const [db, setDb] = useState({ gestion: {}, control: {}, cambios: [], historial: [], metas: {}, cotizaciones: {}, listaPrecios: {}, cambiosEstadoOpp: [], avalCompleto: [], tiposUnidad: {}, cargandoAval: true });
  // Solo se usa para decidir si la pestaña "Comisiones" se muestra en el
  // menú (es privada: solo el administrador debe verla). El contenido de
  // esa pestaña vuelve a validar la sesión por su cuenta.
  const { session: authSession, handleLogout } = useAuthSession();
  const desbloqueado = !!authSession;
  // Rol: "admin" ve todo; "ejecutiva" solo ve sus comisiones (y no Jefa ni
  // Carga); "sinperfil" (usuario creado pero sin vincular) queda limitado.
  const { rol, ejecutivo: miEjecutivo, cargando: cargandoPerfil } = useMiPerfil(authSession);
  const esAdmin = rol === "admin";
  const esEjecutiva = rol === "ejecutiva";
  const esJefe = rol === "jefe";
  // Comisiones (editar, aceptar/validar): solo administrador y jefe de ventas.
  const puedeComisiones = esAdmin || esJefe;
  // Con sesión iniciada pero sin ser admin: no carga archivos. Jefa de
  // Ventas la ven admin y jefe; la ejecutiva (y quien no tiene perfil) no.
  const logueadoSinAdmin = !!authSession && !cargandoPerfil && !esAdmin;
  // Carga de Aval y listado de precios: administrador y jefe de ventas.
  const sinCarga = logueadoSinAdmin && !esJefe;
  const sinJefa = logueadoSinAdmin && !esJefe;

  // Una ejecutiva con su propia cuenta solo ve SUS leads y clientes: se
  // recorta la base en memoria por el nombre de ejecutivo de su perfil
  // (el mismo que trae el Maestro Aval). Admin y jefe ven todo.
  // Nombres de ejecutivo disponibles para vincular usuarios: los que ya
  // aparecen en la columna Ejecutivo del Aval + la lista fija del sistema,
  // sin duplicar por tildes/mayúsculas (se prefiere la grafía del Aval).
  const nombresEjecutivos = useMemo(() => {
    const mapa = new Map();
    Object.values(db.gestion || {}).forEach((g) => {
      if (g.ejecutivo) mapa.set(normalizarBusqueda(g.ejecutivo), g.ejecutivo);
    });
    EJECUTIVOS.forEach((n) => {
      if (!mapa.has(normalizarBusqueda(n))) mapa.set(normalizarBusqueda(n), n);
    });
    return [...mapa.values()].sort((a, b) => a.localeCompare(b));
  }, [db.gestion]);

  const dbVista = useMemo(() => {
    if (!esEjecutiva || !miEjecutivo) return db;
    const mio = normalizarBusqueda(miEjecutivo);
    const gestion = {};
    Object.entries(db.gestion || {}).forEach(([rut, g]) => {
      if (normalizarBusqueda(g.ejecutivo) === mio) gestion[rut] = g;
    });
    const filtrarPorRut = (obj) => Object.fromEntries(Object.entries(obj || {}).filter(([rut]) => gestion[rut]));
    const cotizaciones = Object.fromEntries(
      Object.entries(db.cotizaciones || {}).filter(([, c]) => gestion[c.rut])
    );
    return {
      ...db,
      gestion,
      control: filtrarPorRut(db.control),
      cotizaciones,
      avalCompleto: (db.avalCompleto || []).filter((r) => normalizarBusqueda(r.ejecutivo) === mio),
      cambios: (db.cambios || []).filter((c) => gestion[c.rut]),
      historial: (db.historial || []).filter((h) => gestion[h.rut]),
      cambiosEstadoOpp: (db.cambiosEstadoOpp || []).filter((c) => gestion[c.rut]),
    };
  }, [db, esEjecutiva, miEjecutivo]);
  // Ejecutiva sin ejecutiva asignada en su perfil: no se le muestra nada
  // en vez de mostrarle todo.
  const dbParaVista = esEjecutiva && !miEjecutivo
    ? { ...db, gestion: {}, control: {}, cotizaciones: {}, avalCompleto: [], cambios: [], historial: [], cambiosEstadoOpp: [] }
    : dbVista;

  // "Cerrar sesión" debe expulsar de verdad, no solo ocultar Comisiones:
  // además de cerrar la sesión de Supabase, se borra el candado general
  // (pilpilen_gate_unlocked) para que la próxima vez vuelva a pedir
  // usuario y contraseña en vez de dejar pasar directo al Dashboard.
  async function handleLogoutCompleto() {
    cacheBorrar("avalCompleto");
    cacheBorrar("tiposUnidad");
    await handleLogout();
  }

  // Aval completo y listado Tipo Unidad (pesados, solo para el Dashboard):
  // se muestran primero desde la caché del navegador y se actualizan por detrás.
  const cargarAval = useCallback(async () => {
    const aval = await fetchDatosAval();
    setDb((d) => ({
      ...d,
      ...(aval.avalCompleto ? { avalCompleto: aval.avalCompleto } : {}),
      ...(aval.tiposUnidad ? { tiposUnidad: aval.tiposUnidad } : {}),
      cargandoAval: false,
    }));
    if (aval.avalCompleto) cacheGuardar("avalCompleto", aval.avalCompleto);
    if (aval.tiposUnidad) cacheGuardar("tiposUnidad", aval.tiposUnidad);
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    // Lo pesado parte en paralelo, sin retrasar la pantalla inicial.
    (async () => {
      const [av, tu] = await Promise.all([cacheLeer("avalCompleto"), cacheLeer("tiposUnidad")]);
      if (av && av.length) setDb((d) => (d.cargandoAval ? { ...d, avalCompleto: av, tiposUnidad: tu || d.tiposUnidad, cargandoAval: false } : d));
      try { await cargarAval(); } catch (e) {
        console.warn("No se pudo cargar el Aval", e);
        setDb((d) => ({ ...d, cargandoAval: false }));
      }
    })();
    try {
      const data = await fetchDatosBase();
      setDb((d) => ({ ...d, ...data }));
    } catch (e) {
      console.error(e);
      setError(
        e.message ||
          "No se pudo conectar con Supabase. Verifica VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY y que el esquema esté creado."
      );
    } finally {
      setLoading(false);
    }
  }, [cargarAval]);

  useEffect(() => {
    if (desbloqueado) reload();
  }, [desbloqueado, reload]);

  // Los datos son compartidos (viven en la base), pero cada navegador los
  // lee al abrir: si otra persona carga un archivo después, esta pantalla
  // quedaba desactualizada hasta recargar. Se refresca sola, sin pantalla
  // de carga, al volver a la pestaña (si pasó más de 1 min) y cada 5 min.
  const ultimaLectura = useRef(Date.now());
  useEffect(() => {
    if (!desbloqueado) return undefined;
    ultimaLectura.current = Date.now();
    async function refrescar() {
      try {
        const [data] = await Promise.all([fetchDatosBase(), cargarAval()]);
        ultimaLectura.current = Date.now();
        setDb((d) => ({ ...d, ...data }));
      } catch (e) {
        console.warn("No se pudo actualizar en segundo plano", e);
      }
    }
    function alVolver() {
      if (document.visibilityState === "visible" && Date.now() - ultimaLectura.current > 60000) refrescar();
    }
    document.addEventListener("visibilitychange", alVolver);
    const t = setInterval(() => {
      if (document.visibilityState === "visible") refrescar();
    }, 300000);
    return () => {
      document.removeEventListener("visibilitychange", alVolver);
      clearInterval(t);
    };
  }, [desbloqueado, cargarAval]);

  // Si la sesión de administrador se cierra (o nunca existió) mientras se
  // está en la pestaña privada, se vuelve al Dashboard en vez de dejar la
  // pantalla en blanco.
  useEffect(() => {
    if (view === "comisiones" && (authSession === null || (!cargandoPerfil && !puedeComisiones))) setView("dashboard");
    if (view === "miscomisiones" && !cargandoPerfil && !esEjecutiva) setView("dashboard");
    if (view === "jefa" && sinJefa) setView("dashboard");
    if (view === "usuarios" && logueadoSinAdmin) setView("dashboard");
    if (view === "carga" && sinCarga) setView("dashboard");
  }, [view, authSession, cargandoPerfil, esAdmin, puedeComisiones, esEjecutiva, sinJefa, sinCarga, logueadoSinAdmin]);

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

  // Deja constancia (para todos los usuarios) de quién cargó qué y cuándo.
  async function anotarCarga(tipo, archivo, resumen) {
    try {
      const reg = await registrarCargaRemote({ tipo, archivo, usuario: authSession?.user?.email, resumen });
      setDb((d) => ({ ...d, cargas: { ...(d.cargas || {}), [tipo]: reg } }));
    } catch (e) {
      console.warn("No se pudo registrar la carga (¿migración v128?):", e.message);
    }
  }

  async function uploadMaestro(text, archivo) {
    const { gestion, control, cotizaciones, cambiosNuevos, avalCompleto, summary } = await uploadMaestroRemote(
      text, db.gestion, db.control, db.cotizaciones
    );
    setDb((d) => ({
      ...d,
      gestion,
      control,
      cotizaciones,
      avalCompleto: avalCompleto || d.avalCompleto,
      cambios: [...cambiosNuevos, ...d.cambios],
    }));
    anotarCarga("aval", archivo, null);
    return summary;
  }

  async function uploadListaPrecios(text, archivo) {
    const { unidades, filasOtrosProyectos } = parseListaPrecios(text);
    const listaPrecios = await uploadListaPreciosRemote(unidades);
    const tu = await guardarTiposUnidadRemote(text);
    setDb((d) => ({ ...d, listaPrecios, tiposUnidad: tu.tipos ? { ...d.tiposUnidad, ...tu.tipos } : d.tiposUnidad }));
    anotarCarga("lista_precios", archivo, `${Object.keys(listaPrecios).length} unidades`);
    return { unidades: Object.values(listaPrecios), filasOtrosProyectos, tiposUnidad: { filas: tu.filas, error: tu.error } };
  }

  async function uploadDescuentosUnidades(filas) {
    await guardarDescuentosUnidades(filas);
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

  if (authSession === undefined) {
    return (
      <div className="min-h-screen bg-white font-body flex items-center justify-center">
        <div className="text-stone-500">Cargando…</div>
      </div>
    );
  }

  if (!desbloqueado) {
    return <SiteGate />;
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
    <div className="min-h-screen app-bg app-surface font-body text-stone-900 flex">
      <Sidebar
        active={view}
        onChange={setView}
        showComisiones={puedeComisiones}
        esEjecutiva={esEjecutiva}
        esAdmin={esAdmin}
        sinJefa={sinJefa}
        sinCarga={sinCarga}
        email={authSession?.user?.email}
        perfilLabel={esAdmin ? "Administrador" : esJefe ? "Jefe de ventas" : esEjecutiva ? `Ejecutivo${miEjecutivo ? " · " + miEjecutivo : ""}` : ""}
        onLogout={handleLogoutCompleto}
        cargas={db.cargas}
      />
      <div className="flex-1 min-w-0">
        <Suspense fallback={<div className="p-10 text-sm text-stone-500">Cargando…</div>}>
        {view === "dashboard" && <ReporteEjecutivoView db={dbParaVista} onUpload={uploadMaestro} />}
        {view === "ejecutivo" && <EjecutivoView db={dbParaVista} onSave={saveGestion} onRevisado={markRevisado} ejecutivoFijo={esEjecutiva ? miEjecutivo : undefined} />}
        {view === "carga" && !sinCarga && (
          <CargaPage
            onUploadMaestro={uploadMaestro}
            onUploadListaPrecios={uploadListaPrecios}
            onUploadDescuentosUnidades={uploadDescuentosUnidades}
          />
        )}
        {view === "cotizador" && <Cotizador db={dbParaVista} puedeEliminar={!esEjecutiva} />}
        {view === "comisiones" && authSession && puedeComisiones && <Comisiones db={db} />}
        {view === "usuarios" && esAdmin && (
          <UsuariosPanel
            miUserId={authSession?.user?.id}
            db={db}
            ejecutivos={nombresEjecutivos}
          />
        )}
        {view === "miscomisiones" && esEjecutiva && <MisComisiones ejecutivo={miEjecutivo} />}
        {view === "jefa" && !sinJefa && (
          <JefaView
            db={db}
            onResolveCambio={resolveCambio}
            onSetMeta={setMetaMensual}
            onSaveGestion={saveGestion}
            onRevisado={markRevisado}
          />
        )}
        </Suspense>
      </div>
      <EditorDiseno puedeEditar={esAdmin} />
    </div>
  );
}

// El valor de la UF se carga una sola vez al abrir la app (aun antes del
// login) y queda disponible para todas las pantallas.
export default function App() {
  return (
    <UfProvider>
      <LayoutProvider>
        <AppInner />
      </LayoutProvider>
    </UfProvider>
  );
}
