import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Stat } from "./Shared";

export default function UploadMaestroPanel({ onUpload, open, onClose }) {
  const fileInputRef = useRef(null);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  if (!open) return null;

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
      const tsv = XLSX.utils.sheet_to_csv(sheet, { FS: "\t", blankrows: false, dateNF: "dd-mm-yyyy" });
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
      <p className="text-stone-500 text-sm mb-4">
        Sube el archivo Excel (.xlsx o .csv) del Maestro Aval tal como lo exportas, con el encabezado incluido. El
        sistema toma solo las filas del proyecto <strong>Pilpilén</strong> y las compara por RUT contra lo que ya
        existe en la base de datos.
      </p>

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
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <Stat label="Filas de Pilpilén" value={result.filas} />
            <Stat label="Clientes procesados" value={result.clientes} />
            <Stat label="Nuevos" value={result.nuevos} accent="text-emerald-700" />
            <Stat label="Cambios de ejecutivo" value={result.cambiosEjecutivo} accent="text-violet-700" />
          </div>
          {result.filasOtrosProyectos > 0 && (
            <p className="text-xs text-stone-400 mt-3">
              Se ignoraron {result.filasOtrosProyectos} filas de otros proyectos del Maestro Aval.
            </p>
          )}
          {result.cambiosEjecutivo > 0 && (
            <p className="text-xs text-stone-500 mt-3">
              La Jefa de Ventas tiene {result.cambiosEjecutivo} cambio(s) de ejecutivo pendiente(s) de resolver en su
              panel.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
