# Aval automático desde Vivet (v166)

Vivet no deja iniciar sesión desde un servidor (tiene reCAPTCHA), así que el envío lo hace un
script dentro de tu propio navegador, con tu sesión de Vivet ya abierta. Cada vez que entras a
Vivet (como máximo 1 vez cada 3 horas) envía el Aval completo al CRM y el Dashboard lo recibe solo.

## 1. En Vercel (una sola vez)
Proyecto → Settings → Environment Variables. Crea estas 3 y vuelve a desplegar:

| Nombre | Valor |
|---|---|
| `AVAL_SYNC_KEY` | una clave larga inventada por ti (ej. 40 letras y números al azar) |
| `SUPABASE_URL` | la dirección del proyecto en Supabase (la misma de `VITE_SUPABASE_URL`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → clave `service_role` (secreta: nunca en el código) |

## 2. En tu navegador (una sola vez)
1. Instala la extensión **Tampermonkey** (Edge/Chrome).
2. Tampermonkey → Crear un script nuevo → borra lo que trae y pega todo `vivet-aval-sync.user.js` → Guardar.
3. Edita las 3 líneas de arriba:
   - `CRM_URL`: la dirección de tu CRM + `/api/aval-sync`
   - `CLAVE`: la misma `AVAL_SYNC_KEY` de Vercel
   - `HORAS`: cada cuántas horas como máximo (3 por defecto)

## 3. Uso
- Entra a Vivet como siempre. Abajo a la izquierda aparece "Aval enviado al CRM (N filas)".
- Para forzar un envío: ícono de Tampermonkey → "Enviar el Aval al CRM ahora".
- Para ver qué entrega Vivet sin enviar nada al CRM: ícono de Tampermonkey → "Descargar el Aval a mi PC (diagnóstico)" (guarda un CSV en tu PC).
- Si falla, el aviso sale en rojo con el motivo (incluido si no se pudo anotar el registro de "Datos al día"). Subir el Aval a mano en Carga sigue funcionando.
- En el menú del CRM, "Datos al día" muestra la hora del último "Aval Vivet".

No requiere migración SQL.

---

## Actualización v1.7 del script (alimenta TODO el CRM, como cargar el Aval a mano)

Desde la v178 de la app, además del Aval para el Dashboard, el script envía el mismo Aval en formato
"Maestro" (solo Pilpilén) y el CRM lo procesa igual que cuando subes el archivo en Carga:
**Ejecutivo, Comisiones, Jefa, cambios de estado y gestión de clientes**.

1. Ejecuta `migration_v176_service_role_ingesta.sql` en el SQL Editor de Supabase.
2. Despliega la app (Vercel) con esta versión.
3. En Tampermonkey, abre el script "Vivet → CRM" y reemplázalo por `scripts/vivet-aval-sync.user.js`
   (versión 1.7). Vuelve a poner tu `CLAVE` y `CRM_URL`.
4. Abre Vivet → "Enviar el Aval al CRM ahora". El aviso termina con
   "Ejecutivo/Comisiones al día (N clientes · N cotizaciones)".

Nota para quien mantenga el código: la ingesta del servidor está empaquetada en `api/_maestro.mjs`
(se genera con `npm run build:api`). Si cambias `src/lib/db.js`, `parseMaestro.js` o `helpers.js`,
vuelve a correr ese comando y sube también el archivo generado.


## Actualización v1.9 del script (agrega la Cobranza / Cuotas y Pagos)

Además del Aval, el script ahora descarga el reporte "Detalle de cobranza" de Vivet y actualiza Cuotas y Pagos
con las mismas reglas que al subir el Excel a mano: solo clientes Promesados (los desistidos desaparecen),
sin SALF 3 ni Sendero del Monte, y reemplazando las cuotas por proyecto.

1. Despliega el ZIP (incluye la función `api/aval-sync.js` y `api/_maestro.mjs` actualizados).
2. En Tampermonkey, reemplaza el script por `scripts/vivet-aval-sync.user.js` (v1.9) y vuelve a poner `CLAVE` y `CRM_URL`.
3. Recarga Vivet. El aviso final dice: "Cobranza al día (N clientes · N cuotas)".


## Actualización v2.0 del script (agrega el Listado de precios)

El script ahora también descarga el Excel del Listado de precios de Vivet (el mismo del botón de descarga de
Comisiones → Listas → Cargar) y reemplaza el listado del CRM igual que al subirlo a mano (solo Pilpilén, y
actualiza los tipos de unidad). Tras desplegar el ZIP, reemplaza el script por `scripts/vivet-aval-sync.user.js`
(v2.0). El aviso final dice: "Precios al día (N unidades)".
