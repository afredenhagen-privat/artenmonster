import { describe, it, expect } from 'vitest'
import { normalize, expandUmlauts, indexVariants, SearchIndex } from './search.ts'
import { dayKey, hashString, dailyIndex, puzzleNumber } from './daily.ts'

describe('Normalisierung', () => {
  it('schneidet Diakritika ab', () => {
    expect(normalize('Löwe')).toBe('lowe')
    expect(normalize('Äffchen')).toBe('affchen')
  })

  it('schreibt Umlaute als zweite Variante aus', () => {
    expect(expandUmlauts('Löwe')).toBe('loewe')
    expect(expandUmlauts('Große Strandschnecke')).toBe('grosse strandschnecke')
    expect(expandUmlauts('Lion')).toBeNull()
  })

  it('indexiert beide Schreibweisen', () => {
    expect(indexVariants('Löwe').sort()).toEqual(['loewe', 'lowe'])
    expect(indexVariants('Lion')).toEqual(['lion'])
  })

  it('raeumt Bindestriche und Punkte weg', () => {
    expect(normalize('Panthera leo')).toBe('panthera leo')
    expect(normalize('Rot-Fuchs')).toBe('rot fuchs')
    expect(normalize('  Blau   Wal ')).toBe('blau wal')
  })
})

describe('Suchindex', () => {
  const index = new SearchIndex({
    entries: [
      ['lowe', 0],
      ['loewe', 0],
      ['lion', 0],
      ['panthera leo', 0],
      ['hauskatze', 1],
      ['domestic cat', 1],
      ['felis catus', 1],
      ['waldameise', 2],
      ['wood ant', 2],
    ],
  })

  it('findet ueber die deutsche Schreibweise mit Umlaut', () => {
    expect(index.search('Löwe')).toContain(0)
  })

  it('findet ueber die ausgeschriebene Schreibweise', () => {
    expect(index.search('loewe')).toContain(0)
  })

  it('findet ueber den englischen und den wissenschaftlichen Namen', () => {
    expect(index.search('lion')).toContain(0)
    expect(index.search('panthera')).toContain(0)
  })

  it('bevorzugt Praefixtreffer vor Treffern mitten im Wort', () => {
    // "cat" steht in "domestic cat" am Wortanfang und in "felis catus" ebenfalls.
    expect(index.search('cat')[0]).toBe(1)
  })

  it('stellt das Grundwort am Wortende dem Wortanfang gleich', () => {
    /*
     * Im Deutschen steht das Grundwort hinten: Ein Bergzebra ist ein Zebra, ein
     * Zebrafink ist ein Fink. Wer "Zebra" eingibt, will beide sehen, und danach
     * soll die Bekanntheit entscheiden — nicht die Frage, an welcher Stelle des
     * Wortes der Begriff steht.
     */
    const tiere = new SearchIndex({
      entries: [
        ['zebrafink', 5],
        ['bergzebra', 9],
        ['zebramanguste', 12],
      ],
    })
    const treffer = tiere.search('zebra')
    expect(treffer).toContain(9)
    // Alle drei auf derselben Stufe, also nach Bekanntheit sortiert.
    expect(treffer).toEqual([5, 9, 12])
  })

  it('nimmt das Wortende erst ab drei Zeichen', () => {
    /*
     * Sonst zaehlt jede Endsilbe als Volltreffer: "ra" wuerde "Bergzebra" auf
     * dieselbe Stufe heben wie "Rabe" und wegen der hoeheren Bekanntheit sogar
     * davorziehen.
     */
    const tiere = new SearchIndex({ entries: [['bergzebra', 0], ['rabe', 1]] })
    expect(tiere.search('ra')[0]).toBe(1)
  })

  it('stellt einen Treffer im angezeigten Namen vor einen im Nebennamen', () => {
    /*
     * Die Wandermuschel heisst auf Englisch "Zebra mussel". Wer auf Deutsch
     * spielt und "Zebra" eingibt, sieht in der Liste "Wandermuschel" — ein Name
     * ohne jeden Bezug zur Eingabe. Solche Treffer gehoeren nach hinten.
     */
    const namen: Record<number, string> = { 0: 'Wandermuschel', 1: 'Bergzebra' }
    const tiere = new SearchIndex({
      entries: [
        ['wandermuschel', 0],
        ['zebra mussel', 0],
        ['bergzebra', 1],
      ],
    })
    expect(tiere.search('zebra', 12, (a) => namen[a])).toEqual([1, 0])
    // Ohne den angezeigten Namen bleibt es bei der reinen Trefferguete.
    expect(tiere.search('zebra')).toEqual([0, 1])
  })

  it('findet den Loewen in jeder Schreibweise zuerst', () => {
    const namen: Record<number, string> = { 0: 'Löwe', 1: 'Höhlenlöwe' }
    const tiere = new SearchIndex({
      entries: [
        ['lowe', 0],
        ['loewe', 0],
        ['hohlenlowe', 1],
        ['hoehlenloewe', 1],
      ],
    })
    for (const eingabe of ['Löwe', 'loewe', 'lowe']) {
      expect(tiere.search(eingabe, 12, (a) => namen[a])[0], eingabe).toBe(0)
    }
  })

  it('gibt bei leerer Eingabe nichts zurueck', () => {
    expect(index.search('')).toEqual([])
    expect(index.search('   ')).toEqual([])
  })

  it('liefert jedes Tier hoechstens einmal', () => {
    const treffer = index.search('l')
    expect(new Set(treffer).size).toBe(treffer.length)
  })

  it('findet exakte Treffer fuer die Eingabetaste', () => {
    expect(index.exact('Löwe')).toBe(0)
    expect(index.exact('Loe')).toBeNull()
  })
})

describe('Tagesraetsel', () => {
  it('bildet das Datum als YYYY-MM-DD ab', () => {
    expect(dayKey(new Date(2026, 7, 22))).toBe('2026-08-22')
    expect(dayKey(new Date(2026, 0, 1))).toBe('2026-01-01')
  })

  it('hasht stabil und plattformunabhaengig', () => {
    expect(hashString('2026-08-22')).toBe(hashString('2026-08-22'))
    expect(hashString('2026-08-22')).not.toBe(hashString('2026-08-23'))
  })

  it('waehlt fuer denselben Tag immer dasselbe Tier', () => {
    const a = dailyIndex('2026-08-22', 300)
    const b = dailyIndex('2026-08-22', 300)
    expect(a).toBe(b)
    expect(a).toBeGreaterThanOrEqual(0)
    expect(a).toBeLessThan(300)
  })

  it('trennt die Serien je Schwierigkeitsstufe', () => {
    const leicht = dailyIndex('2026-08-22', 1000, 'stufe1')
    const schwer = dailyIndex('2026-08-22', 1000, 'stufe3')
    expect(leicht).not.toBe(schwer)
  })

  it('verteilt ueber ein Jahr einigermassen gleichmaessig', () => {
    const pool = 50
    const zaehler = new Array<number>(pool).fill(0)
    for (let tag = 0; tag < 365; tag++) {
      const d = new Date(2026, 0, 1 + tag)
      zaehler[dailyIndex(dayKey(d), pool)]++
    }
    // Bei 365 Tagen auf 50 Plaetze sind rund 7 Treffer je Platz zu erwarten.
    // Kein Platz darf leer bleiben oder alles abbekommen.
    expect(Math.min(...zaehler)).toBeGreaterThan(0)
    expect(Math.max(...zaehler)).toBeLessThan(20)
  })

  it('zaehlt die Raetselnummer hoch', () => {
    expect(puzzleNumber('2026-01-01')).toBe(1)
    expect(puzzleNumber('2026-01-02')).toBe(2)
  })
})
