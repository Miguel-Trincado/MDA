// Generador de ZIP sin compresión (sin dependencias). files: [{ name, data: Uint8Array }]
const CT = (() => {
  const t = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (b) => {
  let c = -1;
  for (let i = 0; i < b.length; i++) c = CT[(c ^ b[i]) & 255] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};

export function crearZip(files) {
  const enc = new TextEncoder();
  const partes = [];
  const central = [];
  let off = 0;
  for (const f of files) {
    const n = enc.encode(f.name);
    const c = crc32(f.data);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true);
    h.setUint32(14, c, true); h.setUint32(18, f.data.length, true); h.setUint32(22, f.data.length, true); h.setUint16(26, n.length, true);
    partes.push(h.buffer, n, f.data);
    const g = new DataView(new ArrayBuffer(46));
    g.setUint32(0, 0x02014b50, true); g.setUint16(4, 20, true); g.setUint16(6, 20, true); g.setUint16(8, 0x0800, true);
    g.setUint32(16, c, true); g.setUint32(20, f.data.length, true); g.setUint32(24, f.data.length, true); g.setUint16(28, n.length, true); g.setUint32(42, off, true);
    central.push(g.buffer, n);
    off += 30 + n.length + f.data.length;
  }
  const cs = central.reduce((a, b) => a + b.byteLength, 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, cs, true); e.setUint32(16, off, true);
  return new Blob([...partes, ...central, e.buffer], { type: "application/zip" });
}

export const nombreSeguro = (s) => String(s || "").replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim();

export function descargarBlob(blob, nombre) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
