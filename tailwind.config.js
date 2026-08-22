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
      /*
       * Die Farben stehen als CSS-Variablen in index.css, einmal fuer Nacht und
       * einmal fuer Tag. Die rgb(...)-Schreibweise mit <alpha-value> ist noetig,
       * damit Abstufungen wie bg-kabinett/60 weiter funktionieren.
       */
      colors: {
        tinte: 'rgb(var(--tinte) / <alpha-value>)',
        kabinett: 'rgb(var(--kabinett) / <alpha-value>)',
        fach: 'rgb(var(--fach) / <alpha-value>)',
        linie: 'rgb(var(--linie) / <alpha-value>)',
        ast: 'rgb(var(--ast) / <alpha-value>)',
        knochen: 'rgb(var(--knochen) / <alpha-value>)',
        flechte: 'rgb(var(--flechte) / <alpha-value>)',

        // Wärmeskala nach verbleibenden Verzweigungen bis zur Lösung,
        // von kalt (weit weg) nach warm (fast dran).
        fern: 'rgb(var(--fern) / <alpha-value>)',
        weit: 'rgb(var(--weit) / <alpha-value>)',
        mittel: 'rgb(var(--mittel) / <alpha-value>)',
        nah: 'rgb(var(--nah) / <alpha-value>)',
        zinnober: 'rgb(var(--zinnober) / <alpha-value>)',
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
        // Ohne transform, ausdruecklich fuer SVG: Dort ueberschreibt eine
        // CSS-transform-Eigenschaft das transform-Attribut, mit dem der Knoten
        // positioniert wird. Ein animierter Knoten faellt sonst auf den
        // Nullpunkt zurueck und alle Tiere liegen uebereinander.
        einblenden: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
      },
      animation: {
        aufblenden: 'aufblenden 260ms ease-out both',
        einblenden: 'einblenden 300ms ease-out both',
      },
    },
  },
  plugins: [],
}
