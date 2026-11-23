import { useEffect, useState } from "react";
import { fetchMiPerfil } from "./db";

// Rol del usuario con sesión: "admin", "jefe", "ejecutiva", "sinperfil" (sesión sin
// perfil vinculado: falla cerrada, sin acceso a comisiones) o null si no
// hay sesión. "cargando" evita mostrar/ocultar pestañas a destiempo.
export function useMiPerfil(session) {
  const [estado, setEstado] = useState({ rol: null, ejecutivo: null, permisos: null, cargando: false });
  const userId = session?.user?.id;
  useEffect(() => {
    if (!userId) {
      setEstado({ rol: null, ejecutivo: null, permisos: null, cargando: false });
      return;
    }
    let cancelado = false;
    setEstado((e) => ({ ...e, cargando: true }));
    fetchMiPerfil(userId)
      .then((p) => {
        if (cancelado) return;
        if (!p) setEstado({ rol: "sinperfil", ejecutivo: null, permisos: null, cargando: false });
        else setEstado({ rol: p.rol, ejecutivo: p.ejecutivo || null, permisos: p.permisos || null, cargando: false });
      })
      .catch((e) => {
        console.error("No se pudo leer el perfil", e);
        if (!cancelado) setEstado({ rol: "sinperfil", ejecutivo: null, permisos: null, cargando: false });
      });
    return () => {
      cancelado = true;
    };
  }, [userId]);
  return estado;
}
