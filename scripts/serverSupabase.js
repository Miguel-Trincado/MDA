// Cliente de Supabase para el servidor (Vercel): reemplaza a src/supabaseClient.js al
// empaquetar la ingesta del Aval (api/_maestro.mjs). Usa la clave service_role.
import { createClient } from "@supabase/supabase-js";

const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "http://sin-configurar.invalid").replace(/\/$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "sin-configurar";
export const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
