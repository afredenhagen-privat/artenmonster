import { describe, it, expect } from 'vitest'
import { Tree } from './tree.ts'
import type { TreeData } from './types.ts'
import {
  createGame,
  applyGuess,
  alreadyGuessed,
  bestSteps,
  knownNode,
  hintsEarned,
  canTakeHint,
  nextHintNode,
  takeHint,
  revealedNodes,
} from './game.ts'

/** Derselbe Beispielbaum wie in tree.test.ts. */
function beispielbaum(): Tree {
  const data: TreeData = {
    ranks: ['kingdom', 'clade', 'family', 'species'],
    nodes: [
      [1, -1, 0, 'Metazoa', 'Tiere', 'animals'],
      [2, 0, 1, 'Vertebrata', 'Wirbeltiere', 'vertebrates'],
      [3, 0, 1, 'Insecta', 'Insekten', 'insects'],
      [4, 1, 2, 'Felidae', 'Katzen', 'cats'],
      [5, 1, 2, 'Canidae', 'Hunde', 'dogs'],
      [6, 3, 3, 'Panthera leo', 'Loewe', 'lion'],
      [7, 3, 3, 'Felis catus', 'Hauskatze', 'domestic cat'],
      [8, 2, 3, 'Formica rufa', 'Waldameise', 'wood ant'],
      [9, 4, 3, 'Canis lupus', 'Wolf', 'wolf'],
    ],
  }
  return new Tree(data)
}

// Tierindex -> Baumknoten. Im echten Spiel kommt das aus animals.json.
const TIERE = { loewe: 5, katze: 6, ameise: 7, wolf: 8 } as const

describe('Spiellogik', () => {
  const tree = beispielbaum()
  const neu = () => createGame(0, TIERE.loewe)

  it('meldet einen richtigen Tipp als Sieg', () => {
    const s = applyGuess(neu(), tree, 0, TIERE.loewe)
    expect(s.status).toBe('gewonnen')
    expect(s.guesses[0].correct).toBe(true)
    expect(s.guesses[0].steps).toBe(0)
  })

  it('nennt bei einem Fehltipp die gemeinsame Gruppe', () => {
    const s = applyGuess(neu(), tree, 1, TIERE.katze)
    expect(s.status).toBe('laeuft')
    expect(tree.scientificName(s.guesses[0].lca)).toBe('Felidae')
    expect(s.guesses[0].steps).toBe(1)
  })

  it('markiert nur echte Verbesserungen als besten Tipp', () => {
    let s = neu()
    s = applyGuess(s, tree, 2, TIERE.ameise) // Metazoa, 3 Schritte
    s = applyGuess(s, tree, 3, TIERE.wolf) // Vertebrata, 2 Schritte
    s = applyGuess(s, tree, 1, TIERE.katze) // Felidae, 1 Schritt
    expect(s.guesses.map((g) => g.isBest)).toEqual([true, true, true])
    expect(bestSteps(s)).toBe(1)
  })

  it('markiert einen Rueckschritt nicht als besten Tipp', () => {
    let s = neu()
    s = applyGuess(s, tree, 1, TIERE.katze) // Felidae, 1 Schritt
    s = applyGuess(s, tree, 2, TIERE.ameise) // Metazoa, 3 Schritte, schlechter
    expect(s.guesses.map((g) => g.isBest)).toEqual([true, false])
    expect(bestSteps(s)).toBe(1)
  })

  it('ignoriert doppelte Tipps', () => {
    let s = applyGuess(neu(), tree, 1, TIERE.katze)
    expect(alreadyGuessed(s, 1)).toBe(true)
    s = applyGuess(s, tree, 1, TIERE.katze)
    expect(s.guesses).toHaveLength(1)
  })

  it('verliert nach dem letzten Versuch', () => {
    let s = createGame(0, TIERE.loewe, { maxGuesses: 2 })
    s = applyGuess(s, tree, 1, TIERE.katze)
    expect(s.status).toBe('laeuft')
    s = applyGuess(s, tree, 2, TIERE.wolf)
    expect(s.status).toBe('verloren')
  })

  it('nimmt nach Spielende keine Tipps mehr an', () => {
    let s = applyGuess(neu(), tree, 0, TIERE.loewe)
    s = applyGuess(s, tree, 1, TIERE.katze)
    expect(s.guesses).toHaveLength(1)
  })

  it('kennt im Zen-Modus kein Versuchslimit', () => {
    let s = createGame(0, TIERE.loewe, { zen: true })
    for (let i = 1; i <= 30; i++) s = applyGuess(s, tree, i, TIERE.ameise)
    expect(s.status).toBe('laeuft')
  })
})

describe('Hinweise', () => {
  const tree = beispielbaum()

  it('gibt vor dem achten Fehlversuch keinen Hinweis', () => {
    let s = createGame(0, TIERE.loewe)
    for (let i = 1; i <= 7; i++) s = applyGuess(s, tree, i, TIERE.ameise)
    expect(hintsEarned(s)).toBe(0)
    expect(canTakeHint(s, tree)).toBe(false)
  })

  it('deckt genau eine Ebene unterhalb des Bekannten auf', () => {
    let s = createGame(0, TIERE.loewe)
    // Acht Fehlversuche mit der Ameise: bekannt ist damit nur Metazoa.
    for (let i = 1; i <= 8; i++) s = applyGuess(s, tree, i, TIERE.ameise)
    expect(hintsEarned(s)).toBe(1)
    expect(tree.scientificName(knownNode(s, tree))).toBe('Metazoa')

    const hinweis = nextHintNode(s, tree)
    expect(hinweis).not.toBeNull()
    expect(tree.scientificName(hinweis!)).toBe('Vertebrata')

    s = takeHint(s, tree)
    expect(s.hints).toHaveLength(1)
    expect(tree.scientificName(knownNode(s, tree))).toBe('Vertebrata')
  })

  it('verraet nie das Zieltier selbst', () => {
    let s = createGame(0, TIERE.loewe)
    for (let i = 1; i <= 20; i++) {
      if (s.status !== 'laeuft') break
      s = applyGuess(s, tree, i, TIERE.katze) // deckt Felidae auf
    }
    // Von Felidae aus waere der naechste Schritt der Loewe selbst, also kein Hinweis.
    const s2 = { ...s, status: 'laeuft' as const }
    expect(nextHintNode(s2, tree)).toBeNull()
  })
})

describe('Sichtbarer Baumausschnitt', () => {
  const tree = beispielbaum()

  it('zeigt waehrend des Spiels nur die Pfade der Tipps', () => {
    const s = applyGuess(createGame(0, TIERE.loewe), tree, 1, TIERE.ameise)
    const sichtbar = revealedNodes(s, tree)
    // Ameise, Insecta, Metazoa
    expect([...sichtbar].sort((a, b) => a - b)).toEqual([0, 2, 7])
    expect(sichtbar.has(TIERE.loewe)).toBe(false)
  })

  it('deckt nach Spielende den Zielpfad mit auf', () => {
    const s = applyGuess(createGame(0, TIERE.loewe), tree, 0, TIERE.loewe)
    expect(revealedNodes(s, tree).has(TIERE.loewe)).toBe(true)
  })

  it('zeigt im Zen-Modus den Zielpfad von Anfang an', () => {
    const s = createGame(0, TIERE.loewe, { zen: true })
    expect(revealedNodes(s, tree).has(TIERE.loewe)).toBe(true)
  })
})
