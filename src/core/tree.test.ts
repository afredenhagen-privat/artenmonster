import { describe, it, expect } from 'vitest'
import { Tree } from './tree.ts'
import type { NodeTuple, TreeData } from './types.ts'

/**
 * Kleiner Baum von Hand, damit die Baummathematik unabhaengig von den
 * generierten Daten geprueft werden kann.
 *
 *                 Tiere (0)
 *              /            \
 *      Wirbeltiere (1)     Insekten (2)
 *         /       \             |
 *   Katzen (3)  Hunde (4)   Ameise (7)
 *    /     \        |
 * Loewe(5) Katze(6) Wolf (8)
 */
function beispielbaum(): Tree {
  const n = (taxid: number, parent: number, rank: number, sci: string, de: string, en: string): NodeTuple => [
    taxid,
    parent,
    rank,
    sci,
    de,
    en,
  ]
  const data: TreeData = {
    ranks: ['kingdom', 'clade', 'family', 'species'],
    nodes: [
      n(1, -1, 0, 'Metazoa', 'Tiere', 'animals'),
      n(2, 0, 1, 'Vertebrata', 'Wirbeltiere', 'vertebrates'),
      n(3, 0, 1, 'Insecta', 'Insekten', 'insects'),
      n(4, 1, 2, 'Felidae', 'Katzen', 'cats'),
      n(5, 1, 2, 'Canidae', 'Hunde', 'dogs'),
      n(6, 3, 3, 'Panthera leo', 'Loewe', 'lion'),
      n(7, 3, 3, 'Felis catus', 'Hauskatze', 'domestic cat'),
      n(8, 2, 3, 'Formica rufa', 'Waldameise', 'wood ant'),
      n(9, 4, 3, 'Canis lupus', 'Wolf', 'wolf'),
    ],
  }
  return new Tree(data)
}

describe('Tree', () => {
  const t = beispielbaum()
  const LOEWE = 5
  const KATZE = 6
  const AMEISE = 7
  const WOLF = 8

  it('rechnet die Tiefen aus der Elternkette', () => {
    expect(t.depthOf(0)).toBe(0)
    expect(t.depthOf(1)).toBe(1)
    expect(t.depthOf(3)).toBe(2)
    expect(t.depthOf(LOEWE)).toBe(3)
  })

  it('findet den gemeinsamen Vorfahren zweier Geschwister', () => {
    expect(t.lca(LOEWE, KATZE)).toBe(3)
    expect(t.scientificName(t.lca(LOEWE, KATZE))).toBe('Felidae')
  })

  it('findet den gemeinsamen Vorfahren ueber Familiengrenzen', () => {
    expect(t.scientificName(t.lca(LOEWE, WOLF))).toBe('Vertebrata')
  })

  it('faellt bis zur Wurzel zurueck, wenn nichts naeher gemeinsam ist', () => {
    expect(t.scientificName(t.lca(LOEWE, AMEISE))).toBe('Metazoa')
  })

  it('behandelt den Knoten mit sich selbst', () => {
    expect(t.lca(LOEWE, LOEWE)).toBe(LOEWE)
    expect(t.stepsToTarget(LOEWE, LOEWE)).toBe(0)
  })

  it('zaehlt die verbleibenden Verzweigungen bis zum Ziel', () => {
    // Von Felidae bis zum Loewen ist es ein Schritt.
    expect(t.stepsToTarget(KATZE, LOEWE)).toBe(1)
    // Von Vertebrata sind es zwei.
    expect(t.stepsToTarget(WOLF, LOEWE)).toBe(2)
    // Von Metazoa sind es drei.
    expect(t.stepsToTarget(AMEISE, LOEWE)).toBe(3)
  })

  it('liefert Namen sprachabhaengig und faellt auf Latein zurueck', () => {
    expect(t.nameOf(LOEWE, 'de')).toBe('Loewe')
    expect(t.nameOf(LOEWE, 'en')).toBe('lion')

    const ohneTrivialname = new Tree({
      ranks: ['clade'],
      nodes: [[1, -1, 0, 'Bilateria', '', '']],
    })
    expect(ohneTrivialname.nameOf(0, 'de')).toBe('Bilateria')
    expect(ohneTrivialname.hasCommonName(0, 'de')).toBe(false)
  })

  it('erkennt Vorfahren auf dem Pfad', () => {
    expect(t.isAncestorOf(3, LOEWE)).toBe(true)
    expect(t.isAncestorOf(4, LOEWE)).toBe(false)
    expect(t.pathToRoot(LOEWE)).toEqual([5, 3, 1, 0])
  })

  it('weist einen Baum zurueck, dessen Eltern nach den Kindern stehen', () => {
    expect(
      () =>
        new Tree({
          ranks: ['clade'],
          nodes: [
            [1, 1, 0, 'Kind', '', ''],
            [2, -1, 0, 'Eltern', '', ''],
          ],
        }),
    ).toThrow()
  })
})
