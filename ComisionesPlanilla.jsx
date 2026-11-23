import { useMemo } from "react";
import { FileSpreadsheet } from "lucide-react";
import * as XLSX from "xlsx";
import { fmtDate } from "../lib/helpers";
import { tramoPctPorTotal, rangoTexto } from "../lib/comisionesPeriodo";

const nf2 = new Intl.NumberFormat("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf0 = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 });
const uf = (n) => (n === null || n === undefined ? "" : nf2.format(n));
const clp = (n) => (n === null || n === undefined ? "" : `$ ${nf0.format(Math.round(n))}`);

function estadoDe(val) {
  if (!val?.validado) return ["Sin validar", "text-amber-700 bg-amber-50"];
  if (val.aceptacion === "aceptada") return ["Aceptada", "text-emerald-700 bg-emerald-50"];
  if (val.aceptacion === "rechazada") return ["Rechazada", "text-rose-700 bg-rose-50"];
  return ["Validada · espera respuesta", "text-sky-700 bg-sky-50"];
}

// Vista tipo planilla (Excel): todas las ejecutivas y sus ventas del período en una sola grilla.
export default function ComisionesPlanilla({ grupos, ventas, validaciones, mes, periodo, mesTexto }) {
  const { filas, total } = useMemo(() => {
    const out = [];
    const tot = { n: 0, comisionUf: 0, bruto: 0, neto: 0 };
    Object.keys(grupos).sort((a, b) => a.localeCompare(b)).forEach((ejecutivo) => {
      const opps = grupos[ejecutivo];
      const val = validaciones[`${mes}__${ejecutivo}`];
      const valorUf = Number(val?.valorUf) || 0;
      const ret = Number(val?.retencionPct) || 0;
      const pctAuto = tramoPctPorTotal(opps.length);
      const sub = { n: 0, comisionUf: 0, bruto: 0, neto: 0 };
      opps.forEach((o, i) => {
        const v = ventas[o.opp];
        const pct = v?.tramoPct != null ? Number(v.tramoPct) : pctAuto;
        let precioNeto = null, comUf = null, bruto = null, neto = null;
        if (v) {
          precioNeto = Number(v.precioUf) - (Number(v.descuentoUf) || 0);
          comUf = precioNeto * (pct / 100);
          if (valorUf) { bruto = comUf * valorUf; neto = bruto * (1 - ret / 100); }
        }
        out.push({
          tipo: "fila", ejecutivo, cliente: o.cliente, opp: o.opp, unidad: v?.unidadLabel || "",
          fecha: o.fecha ? o.fecha.toISOString().slice(0, 10) : "", precio: v ? Number(v.precioUf) : null, desc: v ? Number(v.descuentoUf) || 0 : null,
          precioNeto, orden: i + 1, pct, comUf, valorUf: valorUf || null, bruto, ret: val ? ret : null, neto, estado: estadoDe(val),
        });
        sub.n += 1; sub.comisionUf += comUf || 0; sub.bruto += bruto || 0; sub.neto += neto || 0;
      });
      out.push({ tipo: "sub", ejecutivo, ...sub });
      tot.n += sub.n; tot.comisionUf += sub.comisionUf; tot.bruto += sub.bruto; tot.neto += sub.neto;
    });
    return { filas: out, total: tot };
  }, [grupos, ventas, validaciones, mes]);

  function descargar() {
    const datos = filas.filter((f) => f.tipo === "fila").map((f) => ({
      Ejecutiva: f.ejecutivo, Cliente: f.cliente, Opp: f.opp, Unidad: f.unidad, "Fecha promesa": fmtDate(f.fecha),
      "Precio UF": f.precio, "Descuento UF": f.desc, "Precio neto UF": f.precioNeto, Orden: f.orden, "Tramo %": f.pct,
      "Comisión UF": f.comUf, "UF entregada": f.valorUf, "Bruto $": f.bruto === null ? "" : Math.round(f.bruto),
      "Retención %": f.ret, "Neto $": f.neto === null ? "" : Math.round(f.neto), Estado: f.estado[0],
    }));
    const ws = XLSX.utils.json_to_sheet(datos);
    ws["!cols"] = [28, 32, 8, 22, 13, 11, 12, 13, 7, 8, 12, 12, 14, 11, 14, 24].map((wch) => ({ wch }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Comisiones");
    XLSX.writeFile(wb, `Comisiones_${mes}.xlsx`);
  }

  const TH = "border border-stone-300 bg-stone-100 px-2 py-1.5 text-[11px] font-semibold text-stone-600 text-left whitespace-nowrap sticky top-0 z-10";
  const THR = `${TH} !text-right`;
  const TD = "border border-stone-200 px-2 py-1 text-xs text-[#13234A] whitespace-nowrap";
  const TDR = `${TD} text-right tabular-nums`;

  return (
    <div className="bg-white border border-stone-200 rounded-xl shadow-sm">
      <div className="flex items-center justify-between gap-3 flex-wrap px-4 py-3 border-b border-stone-200">
        <div className="text-sm text-stone-600">
          <span className="font-semibold text-[#0F3D66]">{mesTexto}</span> · período {rangoTexto(periodo)} · {total.n} unidad(es)
        </div>
        <button onClick={descargar} className="flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-50">
          <FileSpreadsheet size={15} className="text-emerald-600" /> Descargar Excel
        </button>
      </div>
      <div className="overflow-auto max-h-[70vh]">
        <table className="border-collapse w-full min-w-[1250px]">
          <thead>
            <tr>
              <th className={`${TH} w-9 !text-center`}>#</th>
              <th className={TH}>Ejecutiva</th><th className={TH}>Cliente</th><th className={TH}>Opp</th><th className={TH}>Unidad</th>
              <th className={TH}>F. promesa</th><th className={THR}>Precio UF</th><th className={THR}>Desc. UF</th><th className={THR}>Precio neto UF</th>
              <th className={THR}>Orden</th><th className={THR}>Tramo %</th><th className={THR}>Comisión UF</th><th className={THR}>UF entregada</th>
              <th className={THR}>Bruto $</th><th className={THR}>Ret. %</th><th className={THR}>Neto $</th><th className={TH}>Estado</th>
            </tr>
          </thead>
          <tbody>
            {(() => {
              let n = 0;
              return filas.map((f, i) => {
                if (f.tipo === "sub") {
                  return (
                    <tr key={`s${i}`} className="bg-stone-100 font-semibold">
                      <td className={TD} /><td className={TD} colSpan={4}>Subtotal {f.ejecutivo}</td><td className={TD} />
                      <td className={TDR} /><td className={TDR} /><td className={TDR} /><td className={TDR}>{f.n}</td><td className={TDR} />
                      <td className={TDR}>{uf(f.comisionUf)}</td><td className={TDR} />
                      <td className={TDR}>{f.bruto ? clp(f.bruto) : ""}</td><td className={TDR} /><td className={TDR}>{f.neto ? clp(f.neto) : ""}</td><td className={TD} />
                    </tr>
                  );
                }
                n += 1;
                return (
                  <tr key={`${f.opp}`} className="hover:bg-sky-50/60">
                    <td className={`${TD} text-center text-stone-400 bg-stone-50`}>{n}</td>
                    <td className={TD}>{f.ejecutivo}</td><td className={TD}>{f.cliente}</td><td className={TD}>{f.opp}</td>
                    <td className={TD}>{f.unidad || <span className="text-amber-700">sin cruzar</span>}</td>
                    <td className={TD}>{fmtDate(f.fecha)}</td>
                    <td className={TDR}>{uf(f.precio)}</td><td className={TDR}>{uf(f.desc)}</td><td className={TDR}>{uf(f.precioNeto)}</td>
                    <td className={TDR}>{f.orden}</td><td className={TDR}>{f.pct !== null ? nf2.format(f.pct) : ""}</td>
                    <td className={`${TDR} font-medium`}>{uf(f.comUf)}</td><td className={TDR}>{uf(f.valorUf)}</td>
                    <td className={TDR}>{clp(f.bruto)}</td><td className={TDR}>{f.ret !== null ? nf2.format(f.ret) : ""}</td><td className={`${TDR} font-medium`}>{clp(f.neto)}</td>
                    <td className={TD}><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${f.estado[1]}`}>{f.estado[0]}</span></td>
                  </tr>
                );
              });
            })()}
            <tr className="bg-[#0F3D66] text-white font-semibold">
              <td className={`${TD} !border-[#0F3D66]`} /><td className={`${TD} !border-[#0F3D66]`} colSpan={4}>TOTAL</td><td className={`${TD} !border-[#0F3D66]`} />
              <td className={`${TDR} !border-[#0F3D66]`} /><td className={`${TDR} !border-[#0F3D66]`} /><td className={`${TDR} !border-[#0F3D66]`} />
              <td className={`${TDR} !border-[#0F3D66]`}>{total.n}</td><td className={`${TDR} !border-[#0F3D66]`} />
              <td className={`${TDR} !border-[#0F3D66]`}>{uf(total.comisionUf)}</td><td className={`${TDR} !border-[#0F3D66]`} />
              <td className={`${TDR} !border-[#0F3D66]`}>{total.bruto ? clp(total.bruto) : ""}</td><td className={`${TDR} !border-[#0F3D66]`} />
              <td className={`${TDR} !border-[#0F3D66]`}>{total.neto ? clp(total.neto) : ""}</td><td className={`${TD} !border-[#0F3D66]`} />
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
