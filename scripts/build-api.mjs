// Genera api/_maestro.mjs (la ingesta del Aval para la función de Vercel) a partir del código
// de la app. Volver a correr SIEMPRE que cambie src/lib/db.js, parseMaestro.js o helpers.js:
//   npm run build:api
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import path from "node:path";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
await build({
  entryPoints: [path.join(raiz, "scripts/maestro-server-entry.js")],
  outfile: path.join(raiz, "api/_maestro.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node18",
  logLevel: "info",
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  plugins: [{
    name: "supabase-servidor",
    setup(b) {
      b.onResolve({ filter: /supabaseClient$/ }, () => ({ path: path.join(raiz, "scripts/serverSupabase.js") }));
    },
  }],
});
