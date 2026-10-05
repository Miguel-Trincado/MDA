import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Stat } from "./Shared";

const normalizeHeader = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u00b2\u00b3]/g, (c) => (c === "\u00b2" ? "2" : "3"))
    .trim()
    .toUpperCase();

// Convierte una hoja a TSV, forzando cualquier celda de fecha a texto ISO
// sin ambigüedad (mismo fix que ya usábamos para el Aval solo).
function sheetToTsv(sheet) {
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
  return XLSX.utils.sheet_to_csv(sheet, { FS: "\t", blankrows: false });
}

// Detecta qué es cada hoja mirando sus encabezados, no su nombre — así no
// importa cómo se llamen las hojas ni en qué orden vengan. Usa la misma
// lista de columnas candidatas que parseListaPrecios.js, para no volver
// a desincronizarse entre los dos archivos.
function detectarTipoHoja(tsv) {
  const headerLine = (tsv.split("\n")[0] || "").split("\t").map(normalizeHeader);
  const esAval = headerLine.includes("RUT CLIENTE") && headerLine.includes("EJECUTIVO");
  if (esAval) return "aval";
  const tieneUnidad = ["DIRECCION NUMERO", "UNIDAD", "N°", "N", "NUMERO", "LOTE"].some((h) => headerLine.includes(h));
  const tienePrecio = ["PRECIO LISTA", "VALOR (UF)", "VALOR", "PRECIO", "VALOR FINAL (UF)", "VALOR FINAL"].some((h) => headerLine.includes(h));
  if (tieneUnidad && tienePrecio) return "precios";
  return null;
}

export default function UploadCombinadoPanel({ onUploadMaestro, onUploadListaPrecios }) {
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
      if (workbook.SheetNames.length === 0) throw new Error("El archivo no tiene hojas legibles.");

      const resumen = { aval: null, precios: null, hojasIgnoradas: [] };
      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const tsv = sheetToTsv(sheet);
        const tipo = detectarTipoHoja(tsv);
        if (tipo === "aval") {
          resumen.aval = await onUploadMaestro(tsv);
        } else if (tipo === "precios") {
          const unidades = await onUploadListaPrecios(tsv);
          resumen.precios = { total: unidades.length, disponibles: unidades.filter((u) => u.estado === "Disponible").length };
        } else {
          resumen.hojasIgnoradas.push(sheetName);
        }
      }

      if (!resumen.aval && !resumen.precios) {
        throw new Error(
          "No reconocí ninguna hoja del archivo. La hoja del Aval debe tener las columnas 'RUT Cliente' y 'Ejecutivo'; la del listado de precios debe tener una columna de unidad (Dirección Número/Unidad/N°/Lote) y una de precio (Precio Lista/Valor/Precio)."
        );
      }
      setResult(resumen);
    } catch (err) {
      setError(err.message || "No se pudo procesar el archivo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border border-stone-300 bg-white p-5">
      <h3 className="font-display text-lg text-[#0F3D66] mb-2">Maestro Aval y listado de precios</h3>
      <p className="text-stone-500 text-sm mb-4">
        Sube un solo Excel con dos hojas: una con el Maestro Aval y otra con el listado de precios. El sistema
        reconoce automáticamente cuál es cuál por sus columnas — no importa cómo se llamen las hojas ni en qué orden
        vengan.
      </p>

      <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileChange} />

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
        <div className="mt-5 border-t border-stone-200 pt-4 flex flex-col gap-5">
          {result.aval && (
            <div>
              <div className="font-display text-base text-[#0F3D66] mb-3">Maestro Aval actualizado</div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 text-sm">
                <Stat label="Filas de Pilpilén" value={result.aval.filas} />
                <Stat label="Clientes procesados" value={result.aval.clientes} />
                <Stat label="Nuevos" value={result.aval.nuevos} accent="text-emerald-700" />
                <Stat label="Cambios de Estado (Opp)" value={result.aval.cambiosEstado} accent="text-indigo-700" />
                <Stat label="Cambios de ejecutivo" value={result.aval.cambiosEjecutivo} accent="text-violet-700" />
              </div>
              {result.aval.filasOtrosProyectos > 0 && (
                <p className="text-xs text-stone-400 mt-3">
                  Se ignoraron {result.aval.filasOtrosProyectos} filas de otros proyectos del Maestro Aval.
                </p>
              )}
              {result.aval.filasSinOpp > 0 && (
                <div className="mt-3 border border-rose-300 bg-rose-50 text-rose-800 text-xs px-3 py-2">
                  ⚠ Se rechazaron {result.aval.filasSinOpp} fila(s) de Pilpilén por no traer número de Opp.
                </div>
              )}
              {result.aval.oppsDuplicadosEnCarga?.length > 0 && (
                <div className="mt-3 border border-rose-300 bg-rose-50 text-rose-800 text-xs px-3 py-2">
                  <div className="font-medium mb-1">⚠ {result.aval.oppsDuplicadosEnCarga.length} número(s) de Opp repetidos en el archivo:</div>
                  <ul className="list-disc list-inside">
                    {result.aval.oppsDuplicadosEnCarga.slice(0, 10).map((d, i) => (
                      <li key={i}>Opp {d.opp} (RUT {d.rut})</li>
                    ))}
                  </ul>
                </div>
              )}
              {result.aval.cambiosEjecutivo > 0 && (
                <p className="text-xs text-stone-500 mt-3">
                  La Jefa de Ventas tiene {result.aval.cambiosEjecutivo} cambio(s) de ejecutivo pendiente(s) de resolver.
                </p>
              )}
            </div>
          )}

          {result.precios && (
            <div>
              <div className="font-display text-base text-[#0F3D66] mb-3">Listado de precios actualizado</div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <Stat label="Unidades cargadas" value={result.precios.total} />
                <Stat label="Disponibles" value={result.precios.disponibles} accent="text-emerald-700" />
              </div>
            </div>
          )}

          {result.hojasIgnoradas.length > 0 && (
            <p className="text-xs text-stone-400">
              Hoja(s) sin reconocer, se ignoraron: {result.hojasIgnoradas.join(", ")}.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
