// ==UserScript==
// @name         Vivet → CRM Pilpilén (Aval completo)
// @namespace    mda.pilpilen
// @version      1.0
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
    "region", "fechacotizacion", "fechareserva", "fechacierre", "fechapromesa", "fechaescritura", "Fechadesistimiento",
  ];

  const meta = document.querySelector('meta[name="csrf-token"]');
  if (!meta) return; // página de login u otra sin sesión

  let caja = null;
  function aviso(texto, error) {
    if (!caja) {
      caja = document.createElement("div");
      caja.style.cssText =
        "position:fixed;left:16px;bottom:16px;z-index:999999;padding:10px 14px;border-radius:10px;font:13px sans-serif;color:#fff;box-shadow:0 4px 14px rgba(0,0,0,.25)";
      document.body.appendChild(caja);
    }
    caja.style.background = error ? "#b91c1c" : "#0F3D66";
    caja.textContent = texto;
    clearTimeout(caja._t);
    caja._t = setTimeout(() => { if (caja) { caja.remove(); caja = null; } }, error ? 20000 : 6000);
  }

  function enviar(payload) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "POST",
        url: CRM_URL,
        headers: { "Content-Type": "application/json", "x-sync-key": CLAVE },
        data: JSON.stringify(payload),
        timeout: 120000,
        onload: (r) => (r.status >= 200 && r.status < 300 ? resolve() : reject(new Error(`CRM ${r.status}: ${String(r.responseText).slice(0, 200)}`))),
        onerror: () => reject(new Error("No se pudo conectar con el CRM (revisa CRM_URL)")),
        ontimeout: () => reject(new Error("El CRM tardó demasiado en responder")),
      });
    });
  }

  async function sincronizar(forzar) {
    const ahora = Date.now();
    if (!forzar) {
      if (ahora - Number(GM_getValue("ultima", 0)) < HORAS * 3600 * 1000) return;
    }
    if (ahora - Number(GM_getValue("corriendo", 0)) < 10 * 60 * 1000) return; // ya corre en otra pestaña
    GM_setValue("corriendo", ahora);
    try {
      aviso("Enviando el Aval de Vivet al CRM…");
      const resp = await fetch(DATA_URL, {
        method: "POST",
        credentials: "include",
        headers: {
          "X-CSRF-TOKEN": meta.content,
          "X-Requested-With": "XMLHttpRequest",
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        },
        body: "id_pro=0&id_eta=0&id_usr=0&id_tci=0&id_cll=0&id_sme=0&id_eop=&fecha_desde=&fecha_hasta=&search=",
      });
      if (!resp.ok) throw new Error(`Vivet respondió ${resp.status}`);
      const json = await resp.json();
      if (json.status !== 1 || !Array.isArray(json.data)) throw new Error("Vivet no entregó datos");
      const filas = json.data.map((d) => {
        const o = {};
        CAMPOS.forEach((c) => { o[c] = d[c]; });
        return o;
      });
      if (filas.length === 0) throw new Error("El reporte vino vacío");
      for (let i = 0; i < filas.length; i += TROZO) {
        const rows = filas.slice(i, i + TROZO);
        const fin = i + TROZO >= filas.length;
        aviso(`Enviando al CRM… ${Math.min(i + TROZO, filas.length)} de ${filas.length}`);
        await enviar({ rows, fin, total: filas.length });
      }
      GM_setValue("ultima", Date.now());
      aviso(`Aval enviado al CRM (${filas.length} filas)`);
    } catch (e) {
      aviso("No se pudo enviar el Aval al CRM: " + (e.message || e), true);
    } finally {
      GM_setValue("corriendo", 0);
    }
  }

  GM_registerMenuCommand("Enviar el Aval al CRM ahora", () => sincronizar(true));
  sincronizar(false);
})();
