// ==UserScript==
// @name         Vivet → CRM Pilpilén (Aval completo)
// @namespace    mda.pilpilen
// @version      1.7
// @description  Cuando entras a Vivet, envía el Aval completo al CRM (como máximo 1 vez cada N horas).
// @match        https://mda.vivetsoft.cl/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @connect      *
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  // ===== EDITA ESTAS TRES LÍNEAS =====
  const CRM_URL = "https://TU-DOMINIO.vercel.app/api/aval-sync"; // dirección de tu CRM + /api/aval-sync
  const CLAVE = "PON_AQUI_LA_MISMA_AVAL_SYNC_KEY";              // la misma que pusiste en Vercel
  const HORAS = 3;                                              // cada cuántas horas se envía como máximo
  // ====================================

  const DATA_URL = "https://mda.vivetsoft.cl/comercial/report/maestro/v7/data";
  const TROZO = 3000; // filas por envío (Vercel acepta hasta ~4,5 MB por petición)
  const CAMPOS = [
    "Id_Oportunidad", "Nombre_Proyecto", "Ejecutivo", "FechaOportunidad", "lote_uni", "Tipologiareporte",
    "Estado", "Rut_cliente", "Nombre_cliente", "cliente_segundo_nombre", "Apellido_Cliente", "Apellido_Materno",
    "region", "fechacotizacion", "fechareserva", "fechacierre", "fechapromesa", "fechaescritura", "Fechadesistimiento", "CuponPagoContraEscritura",
  ];

  // Columnas del "Maestro Aval" (CSV de Vivet) que usa el CRM para Ejecutivo, Comisiones, Jefa, etc.
  // [encabezado del CSV, campo del reporte de Vivet, tipo]  (d = fecha dd/mm/aaaa, dt = fecha y hora)
  const MAESTRO = [
    ["Opp", "Id_Oportunidad"], ["Proyecto", "Nombre_Proyecto"], ["Ejecutivo", "Ejecutivo"], ["Fecha Opp", "FechaOportunidad", "dt"],
    ["Lote", "lote_uni"], ["Tipología", "Tipologiareporte"], ["Estado", "Estado"], ["Precio Lista Opp", "Precio_Lista_Oportunidad"],
    ["Descuento Uni. Principal", "Descuento_Unidad_Principal"], ["Descuento Estacionamiento", "Descuento_Estacionamiento"],
    ["RUT Cliente", "Rut_cliente"], ["Nombre Cliente", "Nombre_cliente"], ["Segundo Nombre", "cliente_segundo_nombre"],
    ["Apellido Paterno", "Apellido_Cliente"], ["Apellido Materno", "Apellido_Materno"], ["Teléfonos", "Telefonos"],
    ["Renta Cliente", "Rentacliente"], ["Región Cliente", "region"],
    ["Fecha Cotización", "fechacotizacion", "d"], ["Fecha Reserva", "fechareserva", "d"], ["Fecha Cierre", "fechacierre", "d"],
    ["Fecha Promesa", "fechapromesa", "d"], ["Fecha Escritura", "fechaescritura", "d"], ["Fecha Desistimiento", "Fechadesistimiento", "d"],
    ["Cupon Uni. Principal", "CuponUnidadPrincipal"], ["Cupon Estacionamiento", "CuponEstacionamiento"], ["Cupon Bodega", "CuponBodega"],
    ["Cupon Ahorro Previo", "CuponAhorroPrevio"], ["Cupon Pago Contra Escritura", "CuponPagoContraEscritura"],
  ];

  // Deja las fechas como las entrega el CSV manual: dd/mm/aaaa, o aaaa-mm-dd hh:mm:ss para la fecha de la Opp.
  function fechaCsv(v, tipo) {
    const s = String(v === null || v === undefined ? "" : v).trim();
    if (!s) return "";
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
    if (m) return tipo === "dt" ? `${m[1]}-${m[2]}-${m[3]} ${m[4] || "00"}:${m[5] || "00"}:${m[6] || "00"}` : `${m[3]}/${m[2]}/${m[1]}`;
    m = s.match(/^(\d{2})[-/](\d{2})[-/](\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
    if (m) return tipo === "dt" ? `${m[3]}-${m[2]}-${m[1]} ${m[4] || "00"}:${m[5] || "00"}:${m[6] || "00"}` : `${m[1]}/${m[2]}/${m[3]}`;
    return s;
  }

  // Arma el texto (separado por tabulaciones) que el CRM lee igual que el Aval pegado a mano. Solo Pilpilén.
  function armarMaestro(data) {
    const pil = data.filter((d) => /pilpil/i.test(String(d.Nombre_Proyecto || "")));
    const usaCupon = pil.some((d) => String(d.CuponPagoContraEscritura === null || d.CuponPagoContraEscritura === undefined ? "" : d.CuponPagoContraEscritura).trim() !== "");
    const cols = MAESTRO.filter((c) => usaCupon || c[0] !== "Cupon Pago Contra Escritura");
    const celda = (d, c) => {
      const v = d[c[1]];
      const t = c[2] ? fechaCsv(v, c[2]) : String(v === null || v === undefined ? "" : v);
      return t.replace(/[\t\r\n]+/g, " ").trim();
    };
    const lineas = [cols.map((c) => c[0]).join("\t")].concat(pil.map((d) => cols.map((c) => celda(d, c)).join("\t")));
    return { texto: lineas.join("\n"), filas: pil.length };
  }

  const meta = document.querySelector('meta[name="csrf-token"]');
  if (!meta) return; // página de login u otra sin sesión

  let caja = null;
  function aviso(texto, error, fijo) {
    if (!caja) {
      caja = document.createElement("div");
      caja.style.cssText =
        "position:fixed;left:16px;bottom:16px;z-index:999999;padding:10px 14px;border-radius:10px;font:13px sans-serif;color:#fff;box-shadow:0 4px 14px rgba(0,0,0,.25)";
      document.body.appendChild(caja);
    }
    caja.style.background = error ? "#b91c1c" : "#0F3D66";
    caja.textContent = texto;
    clearTimeout(caja._t);
    console.log("[Vivet→CRM]", texto);
    if (!fijo) caja._t = setTimeout(() => { if (caja) { caja.remove(); caja = null; } }, error ? 30000 : 8000);
  }

  function enviar(payload) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "POST",
        url: CRM_URL,
        headers: { "Content-Type": "application/json", "x-sync-key": CLAVE },
        data: JSON.stringify(payload),
        timeout: 180000,
        onload: (r) => {
          if (r.status < 200 || r.status >= 300) return reject(new Error(`CRM ${r.status}: ${String(r.responseText).slice(0, 300)}`));
          try { resolve(JSON.parse(r.responseText)); } catch (e) { resolve({}); }
        },
        onerror: () => reject(new Error("No se pudo conectar con el CRM (revisa CRM_URL)")),
        ontimeout: () => reject(new Error("El CRM tardó demasiado en responder")),
      });
    });
  }

  // Pide a Vivet el reporte completo (la misma petición que hace la página al aplicar).
  async function traerReporte() {
    const t0 = Date.now();
    const reloj = setInterval(() => {
      aviso(`Descargando el reporte de Vivet… ${Math.round((Date.now() - t0) / 1000)} s (puede tardar 1–3 minutos, no cierres esta pestaña)`, false, true);
    }, 1000);
    aviso("Descargando el reporte de Vivet…", false, true);
    const ctl = new AbortController();
    const corte = setTimeout(() => ctl.abort(), 6 * 60 * 1000);
    let json;
    try {
      const resp = await fetch(DATA_URL, {
        method: "POST",
        credentials: "include",
        signal: ctl.signal,
        headers: {
          "X-CSRF-TOKEN": meta.content,
          "X-Requested-With": "XMLHttpRequest",
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        },
        body: "id_pro=0&id_eta=0&id_usr=0&id_tci=0&id_cll=0&id_sme=0&id_eop=&fecha_desde=&fecha_hasta=&search=",
      });
      if (!resp.ok) throw new Error(`Vivet respondió ${resp.status}`);
      aviso("Reporte recibido, procesando…", false, true);
      json = await resp.json();
    } catch (e) {
      throw new Error(e && e.name === "AbortError" ? "Vivet tardó más de 6 minutos en responder" : (e.message || e));
    } finally {
      clearInterval(reloj);
      clearTimeout(corte);
    }
    // Vivet compara con == (flexible): status puede venir como 1, "1" o true.
    if (!json || json.status != 1 || !Array.isArray(json.data)) {
      const claves = json && typeof json === "object" ? Object.keys(json).slice(0, 8).join(", ") : typeof json;
      const mensaje = json && (json.message || json.msg || json.error);
      throw new Error(
        `Vivet no entregó datos (status=${json && json.status}, tipo de data=${Array.isArray(json && json.data) ? "lista" : typeof (json && json.data)}, campos=[${claves}]${mensaje ? ", mensaje=" + String(mensaje).slice(0, 120) : ""})`
      );
    }
    return json.data;
  }

  function opMasAltas(data, n) {
    return data.map((d) => Number(d.Id_Oportunidad)).filter((x) => x > 0).sort((a, b) => b - a).slice(0, n);
  }

  async function sincronizar(forzar) {
    const ahora = Date.now();
    if (!forzar) {
      if (ahora - Number(GM_getValue("ultima", 0)) < HORAS * 3600 * 1000) return;
    }
    if (ahora - Number(GM_getValue("corriendo", 0)) < 10 * 60 * 1000) return; // ya corre en otra pestaña
    GM_setValue("corriendo", ahora);
    try {
      const data = await traerReporte();
      const maxOpp = opMasAltas(data, 1)[0] || 0;
      aviso(`Vivet entregó ${data.length} filas · Opp más alta: ${maxOpp}. Enviando al CRM…`, false, true);
      const filas = data.map((d) => {
        const o = {};
        CAMPOS.forEach((c) => { o[c] = d[c]; });
        return o;
      });
      if (filas.length === 0) throw new Error("El reporte vino vacío");
      let guardadas = 0;
      let cargaError = "";
      for (let i = 0; i < filas.length; i += TROZO) {
        const rows = filas.slice(i, i + TROZO);
        const fin = i + TROZO >= filas.length;
        aviso(`Enviando al CRM… ${Math.min(i + TROZO, filas.length)} de ${filas.length}`, false, true);
        const r = await enviar({ rows, fin, total: filas.length });
        guardadas += Number(r.guardadas) || 0;
        if (r.cargaError) cargaError = r.cargaError;
      }
      // Segundo envío: el mismo Aval en formato "Maestro", para que alimente Ejecutivo, Comisiones, etc.
      let maestroError = "";
      let maestroResumen = "";
      const mae = armarMaestro(data);
      if (mae.filas > 0) {
        try {
          aviso(`Actualizando Ejecutivo y Comisiones en el CRM (${mae.filas} filas de Pilpilén)…`, false, true);
          const rm = await enviar({ maestro: mae.texto });
          maestroResumen = rm.resumen || "";
        } catch (e) {
          maestroError = e.message || String(e);
        }
      }
      // Si el segundo envío falló, se reintenta en ~15 minutos en vez de esperar las horas completas.
      GM_setValue("ultima", maestroError ? Date.now() - (HORAS * 3600 * 1000 - 15 * 60 * 1000) : Date.now());
      if (maestroError) {
        aviso(`Aval guardado, pero NO se pudo actualizar Ejecutivo/Comisiones: ${maestroError}`, true);
      } else if (cargaError) {
        aviso(`Aval guardado (${guardadas} filas, Opp más alta ${maxOpp}), pero no se pudo anotar en "Datos al día": ${cargaError}`, true);
      } else {
        aviso(`Aval guardado en el CRM: ${guardadas} de ${filas.length} filas · Opp más alta de Vivet: ${maxOpp}${maestroResumen ? " · Ejecutivo/Comisiones al día (" + maestroResumen + ")" : ""}`);
      }
    } catch (e) {
      aviso("No se pudo enviar el Aval al CRM: " + (e.message || e), true);
    } finally {
      GM_setValue("corriendo", 0);
    }
  }

  // Diagnóstico: guarda en tu PC lo mismo que el script le enviaría al CRM (sin enviar nada).
  async function descargarAPc() {
    try {
      const data = await traerReporte();
      const celda = (v) => {
        const t = v === null || v === undefined ? "" : String(v).replace(/\r?\n/g, " ");
        return /[";]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
      };
      const lineas = [CAMPOS.join(";")].concat(data.map((d) => CAMPOS.map((c) => celda(d[c])).join(";")));
      const blob = new Blob(["\ufeff" + lineas.join("\r\n")], { type: "text/csv;charset=utf-8" });
      const d = new Date();
      const p2 = (n) => String(n).padStart(2, "0");
      const nombre = `aval_vivet_script_${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}_${p2(d.getHours())}${p2(d.getMinutes())}.csv`;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = nombre;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 5000);
      aviso(`Archivo guardado en tu PC: ${nombre} · ${data.length} filas · Opp más altas: ${opMasAltas(data, 5).join(", ")}`);
    } catch (e) {
      aviso("No se pudo descargar el Aval: " + (e.message || e), true);
    }
  }

  GM_registerMenuCommand("Enviar el Aval al CRM ahora", () => sincronizar(true));
  GM_registerMenuCommand("Descargar el Aval a mi PC (diagnóstico)", () => descargarAPc());
  sincronizar(false);
})();
