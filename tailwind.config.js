// Los espacios (padding, márgenes, gaps, anchos/altos de la escala) se multiplican por --d.
// Fuera de las tarjetas movibles --d no existe y vale 1 (todo queda igual); dentro, al achicar
// una fila, los espacios se reducen y las letras NO cambian de tamaño.
const claves = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 60, 64, 72, 80, 96];
const espacios = Object.fromEntries(claves.map((n) => [String(n), `calc(${n * 0.25}rem * var(--d, 1))`]));

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      spacing: espacios,
      boxShadow: {
        card: "0 4px 18px rgba(31, 64, 140, 0.07)",
      },
      fontFamily: {
        display: ["Roboto Slab", "serif"],
        body: ["IBM Plex Sans", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
