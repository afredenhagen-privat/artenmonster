/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Warm/Kalt-Skala der Rueckmeldung
        naeher: '#0d9488',
        ferner: '#64748b',
      },
    },
  },
  plugins: [],
}
