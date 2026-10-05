import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Stat } from "./Shared";

export default function UploadListaPreciosPanel({ onUpload }) {
  const fileInputRef = useRef(null);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  function pickFile() {
    fileInputRef.current?.click();
  }

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
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
      const tsv = XLSX.utils.sheet_to_csv(sheet, { FS: "\t", blankrows: false });
      const unidades = await onUpload(tsv);
      setResult({ total: unidades.length, disponibles: unidades.filter((u) => u.estado === "Disponible").length });
    } catch (err) {
      setError(err.message || "No se pudo procesar el archivo. Verifica que tenga las columnas correctas.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border border-stone-300 bg-white p-5">
      <h3 className="font-display text-lg text-[#0F3D66] mb-2">Listado de precios</h3>
      <p className="text-stone-500 text-sm mb-4">
        Sube el Excel con las unidades disponibles (Unidad, Tipología, Orientación, m², Precio en UF, Descuento
        máximo, Estado). Reemplaza por completo el listado anterior — es siempre la foto actual de lo disponible.
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
        <div className="mt-5 border-t border-stone-200 pt-4 grid grid-cols-2 gap-4 text-sm">
          <Stat label="Unidades cargadas" value={result.total} />
          <Stat label="Disponibles" value={result.disponibles} accent="text-emerald-700" />
        </div>
      )}
    </div>
  );
}
