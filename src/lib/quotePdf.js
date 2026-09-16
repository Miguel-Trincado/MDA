import { jsPDF } from "jspdf";

export const currency = (n) => new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 }).format(Number(n) || 0);

// El display_id se guarda como "COT-000001"; para mostrarlo como "N°1"
// solo hace falta sacar el prefijo y los ceros a la izquierda.
export const quoteNumber = (displayId) => (displayId || "").toString().replace(/^COT-0*/i, "") || "—";

// Genera el PDF de una cotización a partir de datos "planos" (no de estado
// de React), para poder usarse tanto al cotizar en vivo como al reabrir
// una cotización ya guardada. Cada bloque calcula su alto real antes de
// dibujar el siguiente, para que nunca se encimen ni corten.
export const buildQuotePdfDoc = (data) => {
  const {
    clientName, clientRut, clientPhone,
    units, // [{ label, tipologia, area, priceUF }]
    subtotal, discount, descuentoPct, precioFinalUF, valorUF,
    reservaUF, pieUF, contraEscrituraUF, hipotecarioRowUF, totalDistribuidoUF, distribucionValidada,
    observaciones,
    agentName,
    displayId,
  } = data;

  const toCLP = (uf) => (valorUF ? uf * valorUF : 0);

  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 18;
  const contentX = margin + 6;
  const contentW = pageWidth - contentX - margin;
  const bandW = 6;

  const PURPLE = [15, 61, 102]; // #0F3D66
  const BLUE = [30, 90, 168]; // #1E5AA8
  const PINK = [76, 141, 217]; // #4C8DD9 (acento claro)
  const INK = [30, 41, 59];
  const MUTED = [120, 113, 108];
  const LIGHT = [245, 245, 244];
  const GREEN = [16, 122, 87];

  const drawSideBand = () => {
    const third = pageHeight / 3;
    doc.setFillColor(...PURPLE);
    doc.rect(0, 0, bandW, third, "F");
    doc.setFillColor(...BLUE);
    doc.rect(0, third, bandW, third, "F");
    doc.setFillColor(...PINK);
    doc.rect(0, third * 2, bandW, third, "F");
  };
  drawSideBand();

  const FOOTER_RESERVE = 26;
  let y = 0;
  const ensureSpace = (neededH) => {
    if (y + neededH > pageHeight - FOOTER_RESERVE) {
      doc.addPage();
      drawSideBand();
      y = 20;
    }
  };

  // ---- Encabezado ----
  const logoTopY = 12;
  doc.setFillColor(...PURPLE);
  doc.rect(contentX, logoTopY - 2, 16, 16, "F");
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.setFont(undefined, "bold");
  doc.text("MDA", contentX + 8, logoTopY + 4.5, { align: "center" });
  doc.setFontSize(4.5);
  doc.text("INMOBILIARIA", contentX + 8, logoTopY + 8, { align: "center" });
  doc.setFont(undefined, "normal");

  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text(
    new Date().toLocaleDateString("es-CL", { day: "2-digit", month: "long", year: "numeric" }),
    pageWidth - margin,
    logoTopY + 4,
    { align: "right" }
  );
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text("COTIZACIÓN — PROYECTO PILPILÉN", pageWidth / 2, logoTopY + 4, { align: "center" });
  if (displayId) {
    doc.setFontSize(11);
    doc.setTextColor(...PURPLE);
    doc.setFont(undefined, "bold");
    doc.text(`N°${quoteNumber(displayId)}`, pageWidth / 2, logoTopY + 10.5, { align: "center" });
    doc.setFont(undefined, "normal");
  }
  y = logoTopY + 20;
  doc.setDrawColor(...LIGHT);
  doc.line(contentX, y, pageWidth - margin, y);
  y += 7;

  // ---- Cliente ----
  const clientLines = [clientRut, clientPhone].filter(Boolean);
  const cardInnerH = 17 + clientLines.length * 5;
  doc.setFillColor(...LIGHT);
  doc.roundedRect(contentX, y, contentW, cardInnerH, 3, 3, "F");
  let cy = y + 6.5;
  doc.setFontSize(7);
  doc.setTextColor(...MUTED);
  doc.text("CLIENTE", contentX + 6, cy);
  cy += 6.5;
  doc.setFontSize(11);
  doc.setTextColor(...INK);
  doc.setFont(undefined, "bold");
  doc.text(clientName || "-", contentX + 6, cy);
  doc.setFont(undefined, "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED);
  clientLines.forEach((line) => {
    cy += 5;
    doc.text(line, contentX + 6, cy);
  });
  y += cardInnerH + 8;

  // ---- Tabla de unidades ----
  doc.setFillColor(...PURPLE);
  doc.roundedRect(contentX, y, contentW, 8, 2, 2, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.setFont(undefined, "bold");
  doc.text("UNIDAD", contentX + 5, y + 5.5);
  doc.text("TIPOLOGÍA", contentX + contentW * 0.4, y + 5.5);
  doc.text("M²", contentX + contentW * 0.68, y + 5.5);
  doc.text("PRECIO (UF)", pageWidth - margin - 5, y + 5.5, { align: "right" });
  doc.setFont(undefined, "normal");
  y += 8;

  doc.setTextColor(...INK);
  (units || []).forEach((u, i) => {
    const rowH = 8;
    if (i % 2 === 1) {
      doc.setFillColor(...LIGHT);
      doc.rect(contentX, y, contentW, rowH, "F");
    }
    doc.setFontSize(8.5);
    doc.text(u.label || "-", contentX + 5, y + 5.5);
    doc.text(u.tipologia || "-", contentX + contentW * 0.4, y + 5.5);
    doc.text(u.area ? String(u.area) : "-", contentX + contentW * 0.68, y + 5.5);
    doc.text(currency(u.priceUF), pageWidth - margin - 5, y + 5.5, { align: "right" });
    y += rowH;
  });
  y += 9;

  // ---- Distribución del financiamiento ----
  ensureSpace(70);
  doc.setFontSize(9.5);
  doc.setFont(undefined, "bold");
  doc.setTextColor(...INK);
  doc.text("DISTRIBUCIÓN DEL FINANCIAMIENTO", contentX, y);
  doc.setFont(undefined, "normal");
  y += 6.5;

  const financData = [
    { label: "Reserva", uf: reservaUF, color: PURPLE },
    { label: "Pie", uf: pieUF, color: BLUE },
    { label: "Contra escritura", uf: contraEscrituraUF, color: PINK },
    { label: "Crédito hipotecario", uf: hipotecarioRowUF, color: [200, 210, 225] },
  ];
  const barTotal = Math.max(1, financData.reduce((s, f) => s + Math.max(0, f.uf), 0));
  const barH = 6;
  let bx = contentX;
  financData.forEach((f) => {
    const w = (Math.max(0, f.uf) / barTotal) * contentW;
    if (w > 0.3) {
      doc.setFillColor(...f.color);
      doc.rect(bx, y, w, barH, "F");
    }
    bx += w;
  });
  y += barH + 4;
  doc.setFontSize(7);
  let lx = contentX;
  financData.forEach((f) => {
    if (f.uf <= 0) return;
    doc.setFillColor(...f.color);
    doc.circle(lx + 1, y - 1, 1, "F");
    doc.setTextColor(...MUTED);
    const label = `${f.label} ${Math.round((f.uf / barTotal) * 100)}%`;
    doc.text(label, lx + 4, y);
    lx += doc.getTextWidth(label) + 10;
  });
  y += 7;

  doc.setFillColor(...LIGHT);
  doc.rect(contentX, y, contentW, 6.5, "F");
  doc.setFontSize(7);
  doc.setTextColor(...MUTED);
  doc.text("CONCEPTO", contentX + 4, y + 4.5);
  doc.text("UF", contentX + contentW * 0.55, y + 4.5);
  doc.text("CLP", pageWidth - margin - 4, y + 4.5, { align: "right" });
  y += 6.5;

  doc.setTextColor(...INK);
  financData.forEach(({ label, uf }, i) => {
    const rowH = 7.5;
    if (i % 2 === 1) {
      doc.setFillColor(...LIGHT);
      doc.rect(contentX, y, contentW, rowH, "F");
    }
    doc.setFontSize(8.5);
    doc.text(label, contentX + 4, y + 5.2);
    doc.text(`${currency(uf)} UF`, contentX + contentW * 0.55, y + 5.2);
    doc.text(`$${currency(toCLP(uf))}`, pageWidth - margin - 4, y + 5.2, { align: "right" });
    y += rowH;
  });

  y += 2;
  doc.setDrawColor(...LIGHT);
  doc.line(contentX, y, pageWidth - margin, y);
  y += 5.5;
  doc.setFontSize(8);
  doc.setFont(undefined, "bold");
  doc.setTextColor(...(distribucionValidada ? GREEN : PINK));
  doc.text(distribucionValidada ? "✓ Distribución validada al 100%" : "Distribución de referencia", contentX, y);
  doc.setFont(undefined, "normal");
  doc.setTextColor(...MUTED);
  doc.text(`${currency(totalDistribuidoUF)} UF de ${currency(precioFinalUF)} UF`, pageWidth - margin, y, { align: "right" });
  y += 10;

  // ---- Precio ----
  ensureSpace(24);
  doc.setFillColor(...LIGHT);
  doc.roundedRect(contentX, y, contentW, 18, 3, 3, "F");
  doc.setFontSize(7);
  doc.setTextColor(...MUTED);
  doc.text("PRECIO LISTA", contentX + 6, y + 6.5);
  doc.text(`DESCUENTO (${descuentoPct || 0}%)`, contentX + contentW * 0.38, y + 6.5);
  doc.text("PRECIO FINAL", pageWidth - margin - 6, y + 6.5, { align: "right" });
  doc.setFontSize(11);
  doc.setTextColor(...INK);
  doc.setFont(undefined, "bold");
  doc.text(`${currency(subtotal)} UF`, contentX + 6, y + 13.5);
  doc.setTextColor(...GREEN);
  doc.text(`-${currency(discount)} UF`, contentX + contentW * 0.38, y + 13.5);
  doc.setTextColor(...PURPLE);
  doc.text(`${currency(precioFinalUF)} UF`, pageWidth - margin - 6, y + 13.5, { align: "right" });
  doc.setFont(undefined, "normal");
  y += 26;

  // ---- Observaciones ----
  if (observaciones && observaciones.trim()) {
    doc.setFontSize(9);
    const obsLines = doc.splitTextToSize(observaciones.trim(), contentW - 12);
    const obsBoxH = obsLines.length * 4.6 + 8;
    ensureSpace(obsBoxH + 16);
    doc.setFontSize(9.5);
    doc.setFont(undefined, "bold");
    doc.setTextColor(...INK);
    doc.text("OBSERVACIONES", contentX, y);
    doc.setFont(undefined, "normal");
    y += 5.5;
    doc.setFontSize(9);
    doc.setTextColor(...INK);
    doc.setFillColor(...LIGHT);
    doc.roundedRect(contentX, y, contentW, obsBoxH, 3, 3, "F");
    doc.text(obsLines, contentX + 6, y + 6);
    y += obsBoxH + 10;
  }

  // ---- Próximos pasos ----
  ensureSpace(24);
  doc.setFontSize(9.5);
  doc.setFont(undefined, "bold");
  doc.setTextColor(...INK);
  doc.text("PRÓXIMOS PASOS", contentX, y);
  doc.setFont(undefined, "normal");
  y += 7;
  const steps = ["Reserva tu unidad", "Firma de promesa", "Firma de escritura"];
  const stepColors = [PURPLE, BLUE, PINK];
  const stepW = contentW / steps.length;
  steps.forEach((step, i) => {
    const cx = contentX + stepW * i + 5;
    doc.setFillColor(...stepColors[i]);
    doc.circle(cx + 3, y, 3.2, "F");
    doc.setFontSize(8.5);
    doc.setFont(undefined, "bold");
    doc.setTextColor(255, 255, 255);
    doc.text(String(i + 1), cx + 3, y + 1.1, { align: "center" });
    doc.setFont(undefined, "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...INK);
    doc.text(step, cx + 9, y + 1.1);
  });

  // ---- Footer ----
  const footerY = pageHeight - 22;
  doc.setDrawColor(...LIGHT);
  doc.line(contentX, footerY, pageWidth - margin, footerY);
  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED);
  doc.text("Cotización referencial, sujeta a disponibilidad y confirmación de precios al momento de la reserva.", contentX, footerY + 6);
  if (agentName) {
    doc.text(`Preparado por ${agentName} · MDA Inmobiliaria`, contentX, footerY + 11);
  }

  return doc;
};
