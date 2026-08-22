/**
 * Nachtkabinett: die naturkundliche Sammlung bei Nacht.
 *
 * Kein Schwarz, sondern tiefes Tintengrün wie das Innere einer Präparateschublade.
 * Kein Reinweiß, sondern Knochen. Und statt eines Akzents eine Wärmeskala, die die
 * taxonomische Distanz trägt: Die Farbe kommt hier aus dem Inhalt, nicht aus der
 * Dekoration.
 *
 * @type {import('tailwindcss').Config}
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        tinte: '#0D1A18',
        kabinett: '#14231F',
        fach: '#1C2F29',
        linie: '#263A35',
        knochen: '#EDE6D6',
        flechte: '#8A9A92',

        // Wärmeskala nach verbleibenden Verzweigungen bis zur Lösung,
        // von kalt (weit weg) nach warm (fast dran).
        fern: '#3F5A66',
        weit: '#5C7A6B',
        mittel: '#A38B3E',
        nah: '#C9743A',
        zinnober: '#D9512B',
      },
      fontFamily: {
        // Wissenschaftliche Namen und Überschriften. Georgia ist auf jedem System
        // vorhanden und liest sich kursiv wie eine Tafelbeschriftung.
        tafel: ['Georgia', 'Iowan Old Style', 'Palatino Linotype', 'ui-serif', 'serif'],
        sans: [
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        // Ränge, Zahlen, Etikettenfelder: alles, was gemessen ist.
        etikett: ['ui-monospace', 'Cascadia Mono', 'Consolas', 'SFMono-Regular', 'monospace'],
      },
      letterSpacing: {
        etikett: '0.14em',
      },
      keyframes: {
        aufblenden: {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        aufblenden: 'aufblenden 260ms ease-out both',
      },
    },
  },
  plugins: [],
}
