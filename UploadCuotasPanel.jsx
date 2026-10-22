import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Stat } from "./Shared";
import { parseCuotasPago } from "../lib/parseCuotas";

const pausa = () => new Promise((r) => setTimeout(r, 60));

// Texto de un .csv: UTF-8 y, si trae caracteres rotos, latin-1 (como exporta Vivet).
function decodificar(buffer) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder("latin1").decode(buffer);
  }
}

// Primera hoja que tenga las columnas del reporte de cobranza.
function matrizDelArchivo(workbook) {
  for (const nombre of workbook.SheetNames) {
    const hoja = workbook.Sheets[nombre];
    if (!hoja || !hoja["!ref"]) continue;
    const cabecera = XLSX.utils.sheet_to_json(hoja, { header: 1, range: "A1:Z15", raw: true, blankrows: false });
    const sinTildes = (v) => String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
    const esReporte = cabecera.some((f) => (f || []).map(sinTildes).includes("tipofinanciamiento") && (f || []).map(sinTildes).includes("opp"));
    if (esReporte) return { nombre, matriz: XLSX.utils.sheet_to_json(hoja, { header: 1, raw: true, cellDates: true, blankrows: false }) };
  }
  return null;
}

export default function UploadCuotasPanel({ onUpload }) {
  const fileInputRef = useRef(null);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setFileName(file.name);
    setError("");
    setResult(null);
    try {
      setBusy("Leyendo el archivo… (los reportes grandes pueden tardar un momento)");
      await pausa();
      const buffer = await file.arrayBuffer();
      let workbook;
      if (/\.csv$/i.test(file.name)) {
        const texto = decodificar(buffer);
        const primera = texto.split(/\r?\n/, 1)[0] || "";
        const FS = primera.includes("\t") ? "\t" : (primera.match(/;/g) || []).length >= (primera.match(/,/g) || []).length ? ";" : ",";
        workbook = XLSX.read(texto, { type: "string", raw: true, FS });
      } else {
        workbook = XLSX.read(buffer, { type: "array", cellDates: true });
      }
      setBusy("Buscando los clientes promesados…");
      await pausa();
      const hoja = matrizDelArchivo(workbook);
      if (!hoja) throw new Error("No encontré el reporte de cobranza: ninguna hoja trae las columnas Opp y Tipo Financiamiento.");
      const parsed = parseCuotasPago(hoja.matriz);
      if (!parsed.ok) throw new Error(parsed.error);
      if (parsed.filas.length === 0) throw new Error("El archivo no trae clientes promesados con cuotas, así que no se cambió nada.");
      setBusy("Guardando las cuotas…");
      await pausa();
      const r = await onUpload(parsed, file.name);
      setResult({ ...r, hoja: hoja.nombre, filasArchivo: parsed.totalFilasArchivo, proyectos: parsed.proyectosEnArchivo.length });
    } catch (err) {
      setError(err.message || "No se pudo procesar el archivo.");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="border border-stone-300 bg-white p-5">
      <h3 className="font-display text-lg text-[#0F3D66] mb-2">Cuotas y pagos (reporte de cobranza)</h3>
      <p className="text-stone-500 text-sm mb-4">
        Sube el reporte "detalle de cobranza" de Vivet (una fila por cuota: Opp, Cliente, Tipo Financiamiento, Fecha de
        Vencimiento, Monto Cuota, Monto Pagado…). Se guardan solo los clientes Promesados. Cada carga reemplaza las
        cuotas de los proyectos que trae el archivo, así que siempre es la foto actual de lo pagado y lo pendiente.
      </p>

      <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileChange} />
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={!!busy}
          className="bg-[#0F3D66] hover:bg-[#1E5AA8] disabled:opacity-50 text-white px-5 py-2.5 text-sm font-medium"
        >
          {busy ? "Procesando…" : "Elegir archivo y subir"}
        </button>
        {busy && <span className="text-xs text-stone-500">{busy}</span>}
        {fileName && !busy && <span className="text-xs text-stone-500">Último archivo: {fileName}</span>}
      </div>

      {error && <div className="mt-4 border border-rose-300 bg-rose-50 text-rose-800 text-sm px-3 py-2">{error}</div>}

      {result && (
        <div className="mt-5 border-t border-stone-200 pt-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <Stat label="Clientes promesados" value={result.clientes} />
            <Stat label="Cuotas cargadas" value={result.guardadas} accent="text-emerald-700" />
            <Stat label="Cuotas retiradas" value={result.borradas} accent="text-stone-500" />
            <Stat label="Proyectos en el archivo" value={result.proyectos} />
          </div>
          <p className="text-xs text-stone-400 mt-3">
            Hoja leída: {result.hoja} · {result.filasArchivo} filas en total. "Cuotas retiradas" son cuotas guardadas antes que ya no
            vienen en el reporte (por ejemplo, clientes que dejaron de estar promesados).
          </p>
        </div>
      )}
    </div>
  );
}
