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

export class SearchIndex {
  private readonly entries: readonly SearchEntry[]

  constructor(data: SearchData) {
    // Alphabetisch sortiert, damit gleichrangige Treffer stabil erscheinen.
    this.entries = [...data.entries].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
  }

  /**
   * Sucht Tiere zur Eingabe. Praefixtreffer schlagen Wortanfangstreffer, die
   * wiederum Teilstringtreffer schlagen. Bei ein paar tausend Eintraegen ist der
   * lineare Durchlauf schnell genug und spart eine Indexstruktur.
   */
  search(query: string, limit = 12): number[] {
    const q = normalize(query)
    if (!q) return []

    const best = new Map<number, number>()
    for (const [term, animal] of this.entries) {
      let rank: number
      if (term === q) rank = 0
      else if (term.startsWith(q)) rank = 1
      else if (term.includes(' ' + q)) rank = 2
      else if (term.includes(q)) rank = 3
      else continue

      const prev = best.get(animal)
      if (prev === undefined || rank < prev) best.set(animal, rank)
    }

    return [...best.entries()]
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
