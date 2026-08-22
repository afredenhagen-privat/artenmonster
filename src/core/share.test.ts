import { describe, it, expect } from 'vitest'
import { Tree } from './tree.ts'
import { createGame, applyGuess } from './game.ts'
import { buildShareText, feldFuer } from './share.ts'

/** Kleiner Baum, damit sich Abstaende gezielt erzeugen lassen. */
function baum(): Tree {
  return new Tree({
    ranks: ['clade', 'family', 'genus', 'species'],
    nodes: [
      [1, -1, 0, 'Metazoa', 'Tiere', 'animals'],
      [2, 0, 1, 'Felidae', 'Katzen', 'cats'],
      [3, 0, 1, 'Canidae', 'Hunde', 'dogs'],
      [4, 1, 2, 'Panthera', 'Großkatzen', 'big cats'],
      [5, 3, 3, 'Panthera leo', 'Löwe', 'lion'],
      [6, 3, 3, 'Panthera tigris', 'Tiger', 'tiger'],
      [7, 2, 3, 'Canis lupus', 'Wolf', 'wolf'],
    ],
  })
}

const LOEWE = 4
const TIGER = 5
const WOLF = 6

describe('Ergebnis teilen', () => {
  const tree = baum()

  it('ordnet den Feldern eine Skala von kalt nach warm zu', () => {
    expect(feldFuer(0)).toBe('🟩')
    expect(feldFuer(1)).toBe('🟧')
    expect(feldFuer(2)).toBe('🟨')
    expect(feldFuer(3)).toBe('🟦')
    expect(feldFuer(9)).toBe('⬜')
  })

  it('baut einen Block fuer eine gewonnene Runde', () => {
    let s = createGame(0, LOEWE)
    s = applyGuess(s, tree, 1, WOLF) // gemeinsam erst Metazoa, also drei Schritte
    s = applyGuess(s, tree, 2, TIGER) // gemeinsam Panthera, ein Schritt
    s = applyGuess(s, tree, 0, LOEWE) // getroffen

    const text = buildShareText(s, { lang: 'de', tier: 1, puzzle: 234 })
    expect(text).toBe('Artenmonster #234 · Stufe 1  3/20\n🟦🟧🟩')
  })

  it('markiert eine verlorene Runde mit X', () => {
    let s = createGame(0, LOEWE, { maxGuesses: 2 })
    s = applyGuess(s, tree, 1, WOLF)
    s = applyGuess(s, tree, 2, TIGER)
    expect(s.status).toBe('verloren')
    expect(buildShareText(s, { lang: 'de', tier: 2, puzzle: 5 })).toContain('X/2')
  })

  it('laesst die Raetselnummer weg, wenn es keine gibt', () => {
    const s = applyGuess(createGame(0, LOEWE), tree, 0, LOEWE)
    expect(buildShareText(s, { lang: 'de', tier: 3 }).startsWith('Artenmonster · Stufe 3')).toBe(true)
  })

  it('schreibt die Stufe auf Englisch, wenn Englisch eingestellt ist', () => {
    const s = applyGuess(createGame(0, LOEWE), tree, 0, LOEWE)
    expect(buildShareText(s, { lang: 'en', tier: 2 })).toContain('Level 2')
  })

  it('bricht lange Reihen nach fuenf Feldern um', () => {
    let s = createGame(0, LOEWE, { maxGuesses: 20 })
    for (let i = 1; i <= 6; i++) s = applyGuess(s, tree, i, i % 2 === 0 ? WOLF : TIGER)
    const zeilen = buildShareText(s, { lang: 'de', tier: 1 }).split('\n')
    // Kopfzeile plus zwei Feldzeilen, weil doppelte Tipps verworfen werden.
    expect(zeilen[1].length / 2).toBeLessThanOrEqual(5)
  })

  it('schreibt ohne Limit das Unendlichzeichen in den Nenner', () => {
    const s = applyGuess(createGame(0, LOEWE, { maxGuesses: Infinity }), tree, 0, LOEWE)
    expect(buildShareText(s, { lang: 'de', tier: 1 })).toContain('1/∞')
  })

  it('haengt die Adresse an, wenn eine mitgegeben wird', () => {
    const s = applyGuess(createGame(0, LOEWE), tree, 0, LOEWE)
    const text = buildShareText(s, { lang: 'de', tier: 1, url: 'https://example.org/artenmonster' })
    expect(text.endsWith('https://example.org/artenmonster')).toBe(true)
  })
})
