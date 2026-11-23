// "En línea" en tiempo real: cada usuario con la app abierta se anuncia en un canal
// de Supabase Realtime (Presence). No usa tablas ni migraciones; el panel Usuarios
// escucha el mismo canal y ve quién está conectado al instante.
import { supabase } from "../supabaseClient";

let canal = null;
let enLinea = new Set();
const oyentes = new Set();
const avisar = () => oyentes.forEach((fn) => fn(enLinea));

export function iniciarPresencia(userId, email) {
  if (!userId || canal) return () => {};
  const c = supabase.channel("presencia-crm", { config: { presence: { key: userId } } });
  canal = c;
  c.on("presence", { event: "sync" }, () => {
    enLinea = new Set(Object.keys(c.presenceState()));
    avisar();
  });
  c.subscribe(async (estado) => {
    if (estado === "SUBSCRIBED") await c.track({ email, desde: new Date().toISOString() });
  });
  return () => {
    try { c.untrack(); supabase.removeChannel(c); } catch { /* ya cerrado */ }
    if (canal === c) canal = null;
    enLinea = new Set();
    avisar();
  };
}

export function suscribirPresencia(fn) {
  oyentes.add(fn);
  fn(enLinea);
  return () => oyentes.delete(fn);
}
