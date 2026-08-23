import { useEffect, useRef } from 'react'

/**
 * Der Wurf beim Erraten.
 *
 * Kein Party-Konfetti in Regenbogenfarben — das wäre im Nachtkabinett ein
 * Fremdkörper. Geworfen werden Papierschnipsel und Haarlinien in den Farben des
 * Spiels: Zinnober für den Treffer, die Wärmeskala daneben, dazu Knochenweiß.
 * Die Formen sind dieselben, aus denen die Oberfläche besteht — beschriftete
 * Zettelchen und die Haarlinien des Stammbaums, hier einmal in Bewegung.
 *
 * Die Farben werden zur Laufzeit aus den CSS-Variablen gelesen, damit der Wurf
 * in der Tag- wie in der Nachtfassung stimmt.
 *
 * Gezeichnet wird auf ein Canvas über allem, ohne Bibliothek: Ein Dutzend Zeilen
 * Physik ist weniger als jede Abhängigkeit, die dafür in Frage käme.
 */

interface Props {
  /** Wie lange geworfen wird, in Millisekunden. */
  dauer?: number
}

interface Schnipsel {
  x: number
  y: number
  vx: number
  vy: number
  /** Drehwinkel und Drehgeschwindigkeit. */
  drehung: number
  drehTempo: number
  /** Phase des Flatterns: Der Schnipsel dreht sich auch um die eigene Achse. */
  flattern: number
  flatterTempo: number
  breite: number
  hoehe: number
  farbe: string
  strich: boolean
}

/** Liest eine Farbvariable als fertiges rgb(). */
function farbe(name: string, deckkraft = 1): string {
  const wert = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  // Die Variablen stehen als "217 81 43", damit Tailwind Abstufungen bilden kann.
  return wert ? `rgb(${wert} / ${deckkraft})` : `rgba(255 255 255 / ${deckkraft})`
}

export function Konfetti({ dauer = 2600 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    /*
     * Wer Bewegung reduziert haben möchte, bekommt keine. Ein Ratespiel darf
     * niemandem schlecht machen, und die Ergebniskarte sagt ohnehin schon alles.
     */
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let breite = window.innerWidth
    let hoehe = window.innerHeight

    const messen = (): void => {
      breite = window.innerWidth
      hoehe = window.innerHeight
      canvas.width = Math.floor(breite * dpr)
      canvas.height = Math.floor(hoehe * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    messen()
    window.addEventListener('resize', messen)

    /*
     * Zinnober trägt den Treffer und ist deshalb häufiger als der Rest. Die
     * Wärmeskala kommt dazu, weil sie im Spiel die Nähe zur Lösung bedeutet:
     * Am Ende sind alle Farben angekommen.
     */
    const palette = [
      farbe('--zinnober'),
      farbe('--zinnober'),
      farbe('--zinnober'),
      farbe('--nah'),
      farbe('--nah'),
      farbe('--mittel'),
      farbe('--weit'),
      farbe('--knochen'),
      farbe('--knochen'),
    ]
    const linienfarbe = farbe('--flechte')

    /*
     * Zwei Werfer in den unteren Ecken, schräg nach innen oben. Ein einzelner
     * Werfer in der Mitte lässt die Ränder leer, und gerade auf einem breiten
     * Fenster sieht das dünn aus.
     */
    const schnipsel: Schnipsel[] = []
    const anzahl = breite < 640 ? 70 : 110
    for (let i = 0; i < anzahl; i++) {
      const linkeSeite = i % 2 === 0
      // Von 25 bis 75 Grad über der Waagerechten, nach innen gerichtet.
      const winkel = (25 + Math.random() * 50) * (Math.PI / 180)
      const tempo = (0.95 + Math.random() * 0.55) * hoehe
      const strich = Math.random() < 0.28
      schnipsel.push({
        x: linkeSeite ? -20 : breite + 20,
        y: hoehe + 20,
        vx: Math.cos(winkel) * tempo * (linkeSeite ? 1 : -1),
        vy: -Math.sin(winkel) * tempo,
        drehung: Math.random() * Math.PI * 2,
        drehTempo: (Math.random() - 0.5) * 9,
        flattern: Math.random() * Math.PI * 2,
        flatterTempo: 5 + Math.random() * 6,
        breite: strich ? 1.4 : 5 + Math.random() * 6,
        hoehe: strich ? 12 + Math.random() * 10 : 8 + Math.random() * 8,
        farbe: strich ? linienfarbe : palette[Math.floor(Math.random() * palette.length)],
        strich,
      })
    }

    const schwerkraft = 1.75 * hoehe
    /** Luftwiderstand je Sekunde. Ohne ihn fliegen die Schnipsel wie Steine. */
    const bremse = 0.62

    let start = 0
    let vorher = 0
    let laeuft = true
    let anfrage = 0

    const schritt = (jetzt: number): void => {
      if (!laeuft) return
      if (start === 0) {
        start = jetzt
        vorher = jetzt
      }
      // Sekunden, und nach einem Tabwechsel gedeckelt, damit nichts wegspringt.
      const dt = Math.min((jetzt - vorher) / 1000, 0.05)
      vorher = jetzt
      const verstrichen = jetzt - start

      ctx.clearRect(0, 0, breite, hoehe)
      // Die letzten 700 Millisekunden blendet der ganze Wurf aus.
      ctx.globalAlpha = Math.max(0, Math.min(1, (dauer - verstrichen) / 700))

      for (const s of schnipsel) {
        s.vy += schwerkraft * dt
        const daempfung = Math.exp(-bremse * dt)
        s.vx *= daempfung
        s.vy *= daempfung
        s.x += s.vx * dt
        s.y += s.vy * dt
        s.drehung += s.drehTempo * dt
        s.flattern += s.flatterTempo * dt

        if (s.y > hoehe + 40) continue

        ctx.save()
        ctx.translate(s.x, s.y)
        ctx.rotate(s.drehung)
        // Das Flattern staucht den Schnipsel, als drehte er sich zur Seite weg.
        ctx.scale(Math.cos(s.flattern), 1)
        ctx.fillStyle = s.farbe
        ctx.fillRect(-s.breite / 2, -s.hoehe / 2, s.breite, s.hoehe)
        ctx.restore()
      }

      if (verstrichen < dauer) anfrage = requestAnimationFrame(schritt)
      else ctx.clearRect(0, 0, breite, hoehe)
    }
    anfrage = requestAnimationFrame(schritt)

    return () => {
      laeuft = false
      cancelAnimationFrame(anfrage)
      window.removeEventListener('resize', messen)
    }
  }, [dauer])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[60]"
    />
  )
}
