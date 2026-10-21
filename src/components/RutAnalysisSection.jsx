import { useMemo, useState } from "react";
import { User, FileText } from "lucide-react";
import { DONUT_COLORS } from "../lib/constants";
import { Panel, CardTitle } from "./Shared";

export default function RutAnalysisSection({ filas, gestion, tipologiaOrdenada }) {
  const [busqueda, setBusqueda] = useState("");
  const [tipologiaFiltro, setTipologiaFiltro] = useState("Todas");

  const porRut = useMemo(() => {
    const map = {};
    filas.forEach((r) => {
      const rut = r.rut || "(sin RUT)";
      if (!map[rut]) map[rut] = { rut, total: 0, tipologias: new Set() };
      map[rut].total += 1;
      const tip = r.tipologia && r.tipologia.trim() ? r.tipologia.trim() : "(en blanco)";
      map[rut].tipologias.add(tip);
    });
    return Object.values(map)
      .map((o) => ({ ...o, tipologias: Array.from(o.tipologias), cliente: gestion?.[o.rut]?.cliente || "" }))
      .sort((a, b) => b.total - a.total);
  }, [filas, gestion]);

  const clientesUnicos = porRut.length;

  const rutPorTipologia = useMemo(() => {
    const map = {};
    filas.forEach((r) => {
      const tip = r.tipologia && r.tipologia.trim() ? r.tipologia.trim() : "(en blanco)";
      if (!map[tip]) map[tip] = new Set();
      map[tip].add(r.rut);
    });
    return Object.entries(map)
      .map(([tip, set]) => [tip, set.size])
      .sort((a, b) => b[1] - a[1]);
  }, [filas]);

  const listaFiltrada = porRut
    .filter((c) => tipologiaFiltro === "Todas" || c.tipologias.includes(tipologiaFiltro))
    .filter(
      (c) =>
        !busqueda ||
        c.rut.toLowerCase().includes(busqueda.toLowerCase()) ||
        c.cliente.toLowerCase().includes(busqueda.toLowerCase())
    );

  const maxClientes = Math.max(1, ...rutPorTipologia.map(([, c]) => c));

  return (
    <div className="mb-5">
      <div className="grid-60 gap-5 mb-5">
        <Panel bid="fila2-clientes-tipologia" grupo="dash-f2" orden={0}>
          <CardTitle icon={User}>Clientes únicos (RUT) por tipología</CardTitle>
          <div className="flex flex-col gap-2.5">
            {rutPorTipologia.map(([tip, count], i) => (
              <div key={tip} className="flex items-center gap-3 text-xs">
                <span className="w-24 shrink-0 text-right text-stone-600">{tip}</span>
                <span className="flex-1 h-3.5 rounded-full bg-stone-100 overflow-hidden">
                  <span
                    className="block h-full rounded-full"
                    style={{ width: `${(count / maxClientes) * 100}%`, background: DONUT_COLORS[i % DONUT_COLORS.length] }}
                  />
                </span>
                <span className="w-8 shrink-0 text-stone-600">{count}</span>
              </div>
            ))}
          </div>
          <div className="flex justify-between border-t border-stone-100 mt-4 pt-2 text-sm font-semibold text-[#13234A]">
            <span>Total</span>
            <span>{rutPorTipologia.reduce((sum, [, count]) => sum + count, 0)}</span>
          </div>
          <p className="text-[11px] text-stone-400 mt-2">
            La suma puede superar "Clientes únicos (RUT)" del resumen: un mismo cliente que cotizó más de una
            tipología se cuenta una vez en cada una.
          </p>
        </Panel>

        <Panel bid="fila2-rut" grupo="dash-f2" orden={1}>
          <CardTitle icon={FileText}>Total de cotizaciones por RUT</CardTitle>
          <div className="flex flex-wrap gap-2 mb-3">
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por RUT o nombre…"
              className="text-xs border border-stone-200 rounded-lg px-3 py-2 focus:outline-none focus:border-[#2563EB] flex-1 min-w-[160px]"
            />
            <select
              value={tipologiaFiltro}
              onChange={(e) => setTipologiaFiltro(e.target.value)}
              className="text-xs border border-stone-200 rounded-lg px-3 py-2 focus:outline-none focus:border-[#2563EB]"
            >
              <option value="Todas">Todas las tipologías</option>
              {tipologiaOrdenada.map(([name]) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div className="max-h-72 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-white">
                <tr className="text-left text-stone-400 border-b border-stone-100">
                  <th className="py-1.5 pr-2 font-normal">RUT</th>
                  <th className="py-1.5 pr-2 font-normal">Cliente</th>
                  <th className="py-1.5 pr-2 text-right font-normal">Total cotizaciones</th>
                </tr>
              </thead>
              <tbody>
                {listaFiltrada.slice(0, 200).map((c) => (
                  <tr key={c.rut} className="border-b border-stone-50">
                    <td className="py-1.5 pr-2">{c.rut}</td>
                    <td className="py-1.5 pr-2 truncate max-w-[160px]">{c.cliente || "—"}</td>
                    <td className="py-1.5 pr-2 text-right">{c.total}</td>
                  </tr>
                ))}
                {listaFiltrada.length === 0 && (
                  <tr>
                    <td colSpan={3} className="py-4 text-center text-stone-400">
                      Sin resultados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {listaFiltrada.length > 200 && (
            <p className="text-[11px] text-stone-400 mt-2">
              Mostrando los primeros 200 de {listaFiltrada.length} resultados. Usa el buscador para acotar.
            </p>
          )}
        </Panel>
      </div>
    </div>
  );
}
