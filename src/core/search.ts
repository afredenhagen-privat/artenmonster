import type { SearchData, SearchEntry } from './types.ts'

/**
 * Autovervollstaendigung ueber deutsche, englische und wissenschaftliche Namen.
 *
 * Der Index wird zur Bauzeit erzeugt und enthaelt pro Name zwei normalisierte
 * Varianten, damit sowohl "Loewe" als auch "Löwe" trifft: einmal mit
 * abgeschnittenen Diakritika ("lowe") und einmal mit ausgeschriebenen Umlauten
 * ("loewe"). Die Eingabe wird nur diakritikafrei normalisiert und findet so
 * beide Schreibweisen.
 */

/** "Löwe" wird zu "lowe". */
export function normalize(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** "Löwe" wird zu "loewe". Nur sinnvoll, wenn der Name Umlaute enthaelt. */
export function expandUmlauts(input: string): string | null {
  if (!/[äöüßÄÖÜ]/.test(input)) return null
  const expanded = input
    .replace(/Ä/g, 'Ae')
    .replace(/Ö/g, 'Oe')
    .replace(/Ü/g, 'Ue')
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
  return normalize(expanded)
}

/** Alle Indexvarianten eines Namens. Wird von der Pipeline benutzt. */
export function indexVariants(name: string): string[] {
  const out = new Set<string>()
  const base = normalize(name)
  if (base) out.add(base)
  const expanded = expandUmlauts(name)
  if (expanded) out.add(expanded)
  return [...out]
}

export interface SearchHit {
  animal: number
  /** Kleiner ist besser. */
  rank: number
}

/** Zahl der Guetestufen. Ein Treffer im Nebennamen wird um diesen Wert schlechter. */
const STUFEN = 4

/**
 * Wie gut passt ein Suchbegriff auf einen Namen? Kleiner ist besser, null heisst
 * kein Treffer.
 *
 * Praefix und Wortende zaehlen gleich viel, und das ist der Kern der Sache:
 * Im Deutschen steht das Grundwort einer Zusammensetzung hinten. Ein Bergzebra
 * ist ein Zebra, ein Zebrafink ist ein Fink. Wer "Zebra" eingibt, meint mit
 * grosser Wahrscheinlichkeit die Tiere hinten. Beide auf dieselbe Stufe zu
 * stellen und danach die Bekanntheit entscheiden zu lassen bringt die Zebras
 * nach oben, ohne die Zebrafinken zu verstecken.
 *
 * Das Wortende zaehlt erst ab drei Zeichen, sonst wird jede Endsilbe zum Treffer.
 */
export function matchRang(term: string, q: string): number | null {
  if (term === q) return 0
  if (term.startsWith(q)) return 1
  if (q.length >= 3 && term.endsWith(q)) return 1
  if (term.includes(' ' + q)) return 2
  if (term.includes(q)) return 3
  return null
}

export class SearchIndex {
  private readonly entries: readonly SearchEntry[]

  constructor(data: SearchData) {
    // Alphabetisch sortiert, damit gleichrangige Treffer stabil erscheinen.
    this.entries = [...data.entries].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
  }

  /**
   * Sucht Tiere zur Eingabe. Bei ein paar tausend Eintraegen ist der lineare
   * Durchlauf schnell genug und spart eine Indexstruktur.
   *
   * `anzeigeName` ist der Name, den die Oberflaeche gerade zeigt. Wird er
   * mitgegeben, schlaegt ein Treffer darin jeden Treffer in einem Nebennamen.
   * Ohne das steht bei der Eingabe "Zebra" auf Deutsch die Wandermuschel weit
   * oben, weil sie auf Englisch Zebra mussel heisst — ein Tier, dessen
   * angezeigter Name das Wort gar nicht enthaelt.
   */
  search(query: string, limit = 12, anzeigeName?: (animal: number) => string): number[] {
    const q = normalize(query)
    if (!q) return []

    const best = new Map<number, number>()
    for (const [term, animal] of this.entries) {
      const rank = matchRang(term, q)
      if (rank === null) continue
      const prev = best.get(animal)
      if (prev === undefined || rank < prev) best.set(animal, rank)
    }

    const bewertet = [...best.entries()].map(([animal, rank]) => {
      if (!anzeigeName) return [animal, rank] as const
      // Der angezeigte Name wird genauso normalisiert wie der Index, damit
      // "loewe" und "lowe" gleich behandelt werden.
      let imNamen: number | null = null
      for (const variante of indexVariants(anzeigeName(animal))) {
        const r = matchRang(variante, q)
        if (r !== null && (imNamen === null || r < imNamen)) imNamen = r
      }
      return [animal, imNamen ?? rank + STUFEN] as const
    })

    return bewertet
      .sort((a, b) => a[1] - b[1] || a[0] - b[0])
      .slice(0, limit)
      .map(([animal]) => animal)
  }

  /** Exakter Treffer, fuer das Absenden mit der Eingabetaste. */
  exact(query: string): number | null {
    const q = normalize(query)
    for (const [term, animal] of this.entries) {
      if (term === q) return animal
    }
    return null
  }
}
