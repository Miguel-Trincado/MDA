# Pilpilén CRM

Sistema de gestión comercial para el proyecto Pilpilén (MDA Inmobiliaria): carga del Maestro Aval, cartera por ejecutivo con alertas automáticas, panel de la Jefa de Ventas y un dashboard ejecutivo con gráficos.

Stack: **Vite + React** (frontend) + **Supabase** (Postgres + API) + **Vercel** (hosting).

---

## 1. Estructura del proyecto

```
pilpilen-crm/
├── supabase/
│   └── schema.sql          ← Esquema SQL completo (tablas, índices, RLS)
├── src/
│   ├── lib/
│   │   ├── constants.js    ← Listas desplegables y reglas de negocio
│   │   ├── helpers.js      ← Fechas, alertas, normalización
│   │   ├── parseMaestro.js ← Parser del Maestro Aval pegado desde Excel
│   │   └── db.js           ← Toda la comunicación con Supabase
│   ├── components/         ← Las 3 vistas (Dashboard, Ejecutivo, Jefa) + panel de subida de plantilla
│   ├── supabaseClient.js
│   ├── App.jsx
│   └── main.jsx
├── .env.example
├── vercel.json
└── package.json
```

---

## 2. Crear el proyecto en Supabase

1. Entra a [supabase.com/dashboard](https://supabase.com/dashboard) y crea un proyecto nuevo (elige una región cercana, por ejemplo São Paulo).
2. Cuando el proyecto esté listo, ve a **SQL Editor → New query**.
3. Copia y pega **todo** el contenido de [`supabase/schema.sql`](./supabase/schema.sql) y presiona **Run**.
4. Verifica en **Table Editor** que se crearon 6 tablas: `gestion`, `control_interno`, `cambios_ejecutivo`, `historial`, `cotizaciones`, `config`.
5. Ve a **Project Settings → API** y copia:
   - **Project URL** → será tu `VITE_SUPABASE_URL`
   - **anon public key** → será tu `VITE_SUPABASE_ANON_KEY`

> ⚠️ El esquema deja las políticas RLS abiertas (cualquiera con la `anon key` puede leer/escribir) porque la app todavía no implementa un login individual real por ejecutivo — la pantalla "¿Quién eres?" es solo una selección de nombre, no una autenticación. Es razonable para uso interno detrás de un link no indexado. Si más adelante quieres restringirlo, agrega Supabase Auth y reemplaza las políticas `allow_all_*` del final de `schema.sql` por reglas basadas en `auth.uid()`.

---

## 3. Probar localmente

Requisitos: Node.js 18 o superior.

```bash
npm install
cp .env.example .env
# edita .env y pega tu VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY
npm run dev
```

Abre `http://localhost:5173`.

---

## 4. Subir el proyecto a GitHub

```bash
cd pilpilen-crm
git init
git add .
git commit -m "Pilpilén CRM: primera versión"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/pilpilen-crm.git
git push -u origin main
```

(`.env` está en `.gitignore`, así que tus llaves nunca se suben al repositorio.)

---

## 5. Desplegar en Vercel

1. Entra a [vercel.com/new](https://vercel.com/new) e importa el repositorio recién creado en GitHub.
2. Vercel detectará automáticamente que es un proyecto **Vite** (gracias a `vercel.json`).
3. Antes de desplegar, agrega las **Environment Variables**:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   (los mismos valores de tu `.env` local)
4. Presiona **Deploy**. En un par de minutos tendrás la URL pública del sistema.
5. Cada vez que hagas `git push` a `main`, Vercel volverá a desplegar automáticamente.

---

## 6. Cómo funciona el flujo de datos

- **Dashboard → "Subir plantilla"**: sube el archivo Excel (.xlsx/.csv) del Maestro Aval directamente desde el botón del Dashboard (no requiere copiar/pegar). El navegador lee el archivo con la librería `xlsx` (SheetJS), el sistema filtra solo las filas del proyecto Pilpilén, compara por RUT contra lo que ya existe en Supabase (tabla `control_interno`) y sube los cambios: clientes nuevos, nuevas cotizaciones, y cambios de ejecutivo detectados.
- **Ejecutivo**: cada ejecutivo elige su nombre y ve su cartera (tabla `gestion`), con alertas automáticas calculadas en el cliente según reglas de negocio (acción vencida, sin revisar hoy, nuevo, etc.). Cada guardado también deja una línea en `historial`.
- **Jefa de Ventas**: ve KPIs agregados, resuelve los `cambios_ejecutivo` pendientes, define la meta mensual (tabla `config`) y puede buscar cualquier cliente.
- **Dashboard**: además de subir la plantilla, arma gráficos (tipología, región, evolución mensual/anual) a partir del detalle de `cotizaciones`.

---

## 7. Notas y próximos pasos sugeridos

- **Autenticación real**: hoy cualquiera puede escribir en cualquier cartera. Para producción, considera activar Supabase Auth (magic link o password) y una tabla `usuarios` con rol (`ejecutivo` / `coordinador` / `jefa`), y ajustar las políticas RLS para que cada ejecutivo solo pueda editar su propia cartera.
- **Concurrencia en la carga del Maestro**: la comparación se hace contra el estado cargado en el navegador en ese momento; si dos personas cargan el Maestro casi al mismo tiempo, gana la última escritura. Para un equipo pequeño esto no suele ser un problema, pero es bueno saberlo.
- **Realtime (opcional)**: Supabase permite suscripciones en tiempo real; se podría hacer que la cartera de un ejecutivo se actualice sola si la Jefa aprueba un cambio de ejecutivo mientras él tiene la pantalla abierta.
