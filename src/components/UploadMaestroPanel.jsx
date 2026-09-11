import { useRef, useState, useEffect } from "react";
import * as XLSX from "xlsx";
import { supabase } from "../supabaseClient";
import { Stat } from "./Shared";

export default function UploadMaestroPanel({ onUpload, open, onClose }) {
  const fileInputRef = useRef(null);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const [session, setSession] = useState(undefined); // undefined = aún cargando
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => listener.subscription.unsubscribe();
  }, []);

  if (!open) return null;

  async function handleLogin(e) {
    e.preventDefault();
    setLoginError("");
    setLoggingIn(true);
    try {
      const { error: err } = await supabase.auth.signInWithPassword({ email, password });
      if (err) throw err;
    } catch (err) {
      setLoginError(err.message === "Invalid login credentials" ? "Correo o contraseña incorrectos." : err.message);
    } finally {
      setLoggingIn(false);
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
  }

  function pickFile() {
    fileInputRef.current?.click();
  }

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite volver a elegir el mismo archivo si hace falta
    if (!file) return;

    setFileName(file.name);
    setError("");
    setResult(null);
    setBusy(true);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) throw new Error("El archivo no tiene hojas legibles.");
      const sheet = workbook.Sheets[sheetName];

      // Algunas columnas de fecha traen su propio formato numérico de Excel
      // (ej. "M/D/YY"), que gana por sobre cualquier dateNF que le pidamos
      // a la librería al convertir a texto. Para no depender de eso, cada
      // celda de tipo fecha se reescribe acá mismo como texto ISO sin
      // ambigüedad (AAAA-MM-DD), antes de convertir la hoja a texto.
      Object.keys(sheet).forEach((addr) => {
        if (addr[0] === "!") return;
        const cell = sheet[addr];
        if (cell && cell.t === "d" && cell.v instanceof Date) {
          const d = cell.v;
          const iso = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
          cell.t = "s";
          cell.v = iso;
          cell.w = iso;
          delete cell.z;
        }
      });

      const tsv = XLSX.utils.sheet_to_csv(sheet, { FS: "\t", blankrows: false });
      const summary = await onUpload(tsv);
      setResult(summary);
    } catch (err) {
      setError(err.message || "No se pudo procesar el archivo. Verifica que sea el Maestro Aval exportado desde Excel.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border border-stone-300 bg-white p-5 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-display text-lg text-[#0F3D66]">Subir plantilla del Maestro Aval</h3>
        <button onClick={onClose} className="text-xs text-stone-400 hover:text-stone-700">
          Cerrar
        </button>
      </div>

      {session === undefined ? (
        <p className="text-stone-400 text-sm">Verificando sesión…</p>
      ) : !session ? (
        <div>
          <p className="text-stone-500 text-sm mb-4">
            Por seguridad, solo una persona autorizada puede subir el Maestro Aval. Inicia sesión para continuar.
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
          <div className="flex items-center justify-between mb-4">
            <p className="text-stone-500 text-sm">
              Sube el archivo Excel (.xlsx o .csv) del Maestro Aval tal como lo exportas, con el encabezado incluido.
              El sistema toma solo las filas del proyecto <strong>Pilpilén</strong> y las compara por RUT contra lo
              que ya existe en la base de datos.
            </p>
          </div>
          <div className="text-xs text-stone-400 mb-3">
            Sesión: {session.user.email} ·{" "}
            <button onClick={handleLogout} className="underline hover:text-stone-700">
              Cerrar sesión
            </button>
          </div>

          <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileChange} />

          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={pickFile}
              disabled={busy}
              className="bg-[#0F3D66] hover:bg-[#1E5AA8] disabled:opacity-50 text-white px-5 py-2.5 text-sm font-medium"
            >
              {busy ? "Procesando…" : "Elegir archivo y subir"}
            </button>
            {fileName && !busy && <span className="text-xs text-stone-500">Último archivo: {fileName}</span>}
          </div>

          {error && <div className="mt-4 border border-rose-300 bg-rose-50 text-rose-800 text-sm px-3 py-2">{error}</div>}

          {result && (
            <div className="mt-5 border-t border-stone-200 pt-4">
              <div className="font-display text-base text-[#0F3D66] mb-3">Actualización completa</div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 text-sm">
                <Stat label="Filas de Pilpilén" value={result.filas} />
                <Stat label="Clientes procesados" value={result.clientes} />
                <Stat label="Nuevos" value={result.nuevos} accent="text-emerald-700" />
                <Stat label="Cambios de Estado (Opp)" value={result.cambiosEstado} accent="text-indigo-700" />
                <Stat label="Cambios de ejecutivo" value={result.cambiosEjecutivo} accent="text-violet-700" />
              </div>
              {result.filasOtrosProyectos > 0 && (
                <p className="text-xs text-stone-400 mt-3">
                  Se ignoraron {result.filasOtrosProyectos} filas de otros proyectos del Maestro Aval.
                </p>
              )}
              {result.cambiosEjecutivo > 0 && (
                <p className="text-xs text-stone-500 mt-3">
                  La Jefa de Ventas tiene {result.cambiosEjecutivo} cambio(s) de ejecutivo pendiente(s) de resolver en
                  su panel.
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
