/**
 * Tagesraetsel ohne Server.
 *
 * Das Datum ist der Zufallsseed. Jedes Geraet rechnet dieselbe Zahl aus, also
 * bekommen alle dasselbe Tier, ohne dass irgendwo ein Dienst befragt werden
 * muss. Das ist der Grund, warum das Tagesraetsel auch im Flugmodus geht.
 */

/** Ortszeit-Datum als YYYY-MM-DD. Bewusst lokal, damit der Tag beim Spieler wechselt. */
export function dayKey(date: Date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * FNV-1a, 32 Bit. Klein, stabil und ohne Abhaengigkeiten. Wichtig ist nur, dass
 * jede Plattform dieselbe Zahl liefert, nicht kryptografische Guete.
 */
export function hashString(input: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

/**
 * Waehlt das Tier des Tages aus dem uebergebenen Bereich.
 * `salt` erlaubt getrennte Serien, etwa je Schwierigkeitsstufe.
 */
export function dailyIndex(day: string, poolSize: number, salt = ''): number {
  if (poolSize <= 0) throw new Error('Der Pool fuer das Tagesraetsel ist leer.')
  return hashString(salt + '#' + day) % poolSize
}

/** Fortlaufende Nummer des Raetsels, gerechnet ab dem Starttag des Spiels. */
export function puzzleNumber(day: string, epoch = '2026-01-01'): number {
  const ms = Date.parse(day + 'T00:00:00Z') - Date.parse(epoch + 'T00:00:00Z')
  return Math.floor(ms / 86_400_000) + 1
}
