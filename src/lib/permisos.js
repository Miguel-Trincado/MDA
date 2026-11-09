// Permisos por menú. Cada usuario puede tener una ficha con Sí/No por menú
// (columna perfiles_ejecutivas.permisos); si no la tiene, rige lo que
// corresponde a su perfil. El administrador siempre ve todo.
export const MENUS = [
  { key: "dashboard", label: "Dashboard" },
  { key: "ejecutivo", label: "Ejecutivo" },
  { key: "cotizador", label: "Simulador" },
  { key: "jefa", label: "Jefa de Ventas" },
  { key: "cuotas", label: "Cuotas y Pagos" },
  { key: "comisiones", label: "Comisiones" },
  { key: "miscomisiones", label: "Mis comisiones" },
  { key: "carga", label: "Cargar archivo" },
  { key: "usuarios", label: "Usuarios", soloAdmin: true },
];

const BASICOS = ["dashboard", "ejecutivo", "cotizador"];

export function permisosPorDefecto(rol) {
  const base = Object.fromEntries(MENUS.map((m) => [m.key, false]));
  if (rol === "admin") return Object.fromEntries(MENUS.map((m) => [m.key, true]));
  if (rol === "jefe") return { ...Object.fromEntries(MENUS.map((m) => [m.key, true])), miscomisiones: false, usuarios: false };
  if (rol === "ejecutiva") return { ...base, ...Object.fromEntries(BASICOS.map((k) => [k, true])), miscomisiones: true };
  return { ...base, ...Object.fromEntries(BASICOS.map((k) => [k, true])) };
}

// Permisos efectivos: lo guardado en la ficha manda sobre el perfil.
export function permisosEfectivos(rol, permisos) {
  const def = permisosPorDefecto(rol);
  if (rol === "admin" || !permisos || typeof permisos !== "object") return def;
  const out = { ...def };
  // "Usuarios" es exclusivo del administrador: la base solo deja gestionar usuarios a un admin.
  for (const m of MENUS) if (!m.soloAdmin && typeof permisos[m.key] === "boolean") out[m.key] = permisos[m.key];
  return out;
}

export function puedeVer(rol, permisos, key) {
  if (!rol) return false;
  return !!permisosEfectivos(rol, permisos)[key];
}
