import { useMemo, useState } from "react";

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

  return (
    <div className="mb-4">
      <div className="grid lg:grid-cols-2 gap-4 mb-4">
        <div className="bg-white border border-stone-200 p-5">
          <div className="bg-[#0F3D66] text-white text-sm font-medium px-3 py-2 -mx-5 -mt-5 mb-4">
            CLIENTES ÚNICOS (RUT) POR TIPOLOGÍA
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-stone-400 border-b border-stone-200">
                <th className="py-2 pr-3">Tipología</th>
                <th className="py-2 pr-3">Clientes únicos</th>
              </tr>
            </thead>
            <tbody>
              {rutPorTipologia.map(([tip, count]) => (
                <tr key={tip} className="border-b border-stone-100">
                  <td className="py-1.5 pr-3">{tip}</td>
                  <td className="py-1.5 pr-3">{count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="bg-white border border-stone-200 p-5">
          <div className="bg-[#0F3D66] text-white text-sm font-medium px-3 py-2 -mx-5 -mt-5 mb-4">
            TOTAL DE COTIZACIONES POR RUT
          </div>
          <div className="flex flex-wrap gap-2 mb-3">
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por RUT o nombre…"
              className="text-xs border border-stone-300 px-2 py-1.5 focus:outline-none focus:border-[#0F3D66] flex-1 min-w-[160px]"
            />
            <select
              value={tipologiaFiltro}
              onChange={(e) => setTipologiaFiltro(e.target.value)}
              className="text-xs border border-stone-300 px-2 py-1.5 focus:outline-none focus:border-[#0F3D66]"
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
                <tr className="text-left text-stone-400 border-b border-stone-200">
                  <th className="py-1.5 pr-2">RUT</th>
                  <th className="py-1.5 pr-2">Cliente</th>
                  <th className="py-1.5 pr-2 text-right">Total cotizaciones</th>
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
        </div>
      </div>
    </div>
  );
}
