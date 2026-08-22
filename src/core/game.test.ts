import { describe, it, expect } from 'vitest'
import { Tree } from './tree.ts'
import type { TreeData } from './types.ts'
import {
  createGame,
  applyGuess,
  alreadyGuessed,
  animalsInGroup,
  bestSteps,
  knownNode,
  hintsEarned,
  hintThresholds,
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

  it('laesst sich ohne Versuchslimit spielen, auch ausserhalb des Zen-Modus', () => {
    /*
     * Unbegrenzt und Zen sind zweierlei: Zen deckt zusaetzlich den Zielpfad auf.
     * Wer nur ohne Limit raten will, soll den Baum trotzdem erst aufdecken
     * muessen.
     */
    let s = createGame(0, TIERE.loewe, { maxGuesses: Infinity })
    expect(s.zen).toBe(false)
    for (let i = 1; i <= 40; i++) s = applyGuess(s, tree, i, TIERE.ameise)
    expect(s.status).toBe('laeuft')
  })

  it('verliert genau beim eingestellten Limit', () => {
    let s = createGame(0, TIERE.loewe, { maxGuesses: 10 })
    for (let i = 1; i <= 9; i++) s = applyGuess(s, tree, i, TIERE.ameise)
    expect(s.status).toBe('laeuft')
    s = applyGuess(s, tree, 10, TIERE.ameise)
    expect(s.status).toBe('verloren')
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

  it('zieht die Hinweisschwellen mit dem Versuchsvorrat mit', () => {
    /*
     * Bei zehn Versuchen waere ein Hinweis erst nach vierzehn Fehlversuchen
     * unerreichbar. Die Schwellen sind deshalb Anteile; bei zwanzig Versuchen
     * kommen weiterhin 8 und 14 heraus.
     */
    expect(hintThresholds(20)).toEqual([8, 14])
    expect(hintThresholds(10)).toEqual([4, 7])
    expect(hintThresholds(50)).toEqual([20, 35])
    expect(hintThresholds(Infinity)).toEqual([8, 14])

    let s = createGame(0, TIERE.loewe, { maxGuesses: 10 })
    for (let i = 1; i <= 3; i++) s = applyGuess(s, tree, i, TIERE.ameise)
    expect(hintsEarned(s)).toBe(0)
    s = applyGuess(s, tree, 4, TIERE.ameise)
    expect(hintsEarned(s)).toBe(1)
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

  it('zeigt im Gruppenmodus nur Wurzel, gemeinsame Gruppe und Tipp', () => {
    // Ziel Loewe, geraten Hauskatze: gemeinsam ist Felidae (Index 3).
    const s = applyGuess(createGame(0, TIERE.loewe), tree, 1, TIERE.katze)
    const sichtbar = revealedNodes(s, tree, 'gruppe')
    // Metazoa als Wurzel, Felidae als gemeinsame Gruppe, die Katze als Tipp.
    // Vertebrata dazwischen faellt weg, es wurde nicht erspielt.
    expect([...sichtbar].sort((a, b) => a - b)).toEqual([0, 3, TIERE.katze])
    expect(sichtbar.has(TIERE.loewe)).toBe(false)
    expect(sichtbar.has(1)).toBe(false)
  })

  it('laesst im Gruppenmodus die eigene Verwandtschaft des Tipps weg', () => {
    // Ziel Loewe, geraten Wolf: gemeinsam ist erst Vertebrata. Canidae gehoert
    // zur Verwandtschaft des Wolfs und sagt ueber den Loewen nichts aus.
    const s = applyGuess(createGame(0, TIERE.loewe), tree, 1, TIERE.wolf)
    const sichtbar = revealedNodes(s, tree, 'gruppe')
    const canidae = 4
    expect(sichtbar.has(canidae)).toBe(false)
    expect(sichtbar.has(TIERE.wolf)).toBe(true)
  })

  it('zeigt im Gruppenmodus auch die Verwandtschaft der Tipps untereinander', () => {
    /*
     * Ziel ist die Waldameise. Loewe und Hauskatze liegen mit ihr nur bei
     * Metazoa zusammen, sind untereinander aber beide Katzen. Ohne die
     * paarweisen Gruppen haengen sie beide direkt an Metazoa, und man sieht
     * nicht, dass sie naeher miteinander verwandt sind.
     */
    let s = createGame(0, TIERE.ameise)
    s = applyGuess(s, tree, 1, TIERE.loewe)
    s = applyGuess(s, tree, 2, TIERE.katze)
    const felidae = 3
    expect(s.guesses.every((g) => g.lca === 0)).toBe(true)
    expect(revealedNodes(s, tree, 'gruppe').has(felidae)).toBe(true)
  })

  it('braucht fuer die Verwandtschaft mindestens zwei Tipps', () => {
    const s = applyGuess(createGame(0, TIERE.ameise), tree, 1, TIERE.loewe)
    const felidae = 3
    expect(revealedNodes(s, tree, 'gruppe').has(felidae)).toBe(false)
  })

  it('laesst die Verwandtschaft der Tipps im vollen Modus ohnehin sehen', () => {
    let s = createGame(0, TIERE.ameise)
    s = applyGuess(s, tree, 1, TIERE.loewe)
    s = applyGuess(s, tree, 2, TIERE.katze)
    expect(revealedNodes(s, tree, 'voll').has(3)).toBe(true)
  })

  it('sammelt im Gruppenmodus die Gruppen mehrerer Tipps', () => {
    let s = createGame(0, TIERE.loewe)
    s = applyGuess(s, tree, 1, TIERE.ameise) // gemeinsam Metazoa
    s = applyGuess(s, tree, 2, TIERE.wolf) // gemeinsam Vertebrata
    s = applyGuess(s, tree, 3, TIERE.katze) // gemeinsam Felidae
    const sichtbar = revealedNodes(s, tree, 'gruppe')
    // Metazoa, Vertebrata und Felidae als Kette der Eingrenzung, plus die drei
    // Tipps. Die paarweisen Verwandtschaften fallen hier auf dieselben Knoten,
    // deshalb kommt nichts dazu.
    expect(sichtbar.has(0)).toBe(true)
    expect(sichtbar.has(1)).toBe(true)
    expect(sichtbar.has(3)).toBe(true)
    expect(sichtbar.size).toBe(6)
  })

  it('zeigt im vollen Modus jede Ebene des Tipps', () => {
    const s = applyGuess(createGame(0, TIERE.loewe), tree, 1, TIERE.wolf)
    const sichtbar = revealedNodes(s, tree, 'voll')
    const canidae = 4
    expect(sichtbar.has(canidae)).toBe(true)
  })

  it('deckt nach Spielende den Zielpfad mit auf', () => {
    const s = applyGuess(createGame(0, TIERE.loewe), tree, 0, TIERE.loewe)
    expect(revealedNodes(s, tree, 'gruppe').has(TIERE.loewe)).toBe(true)
  })

  it('zeigt im Zen-Modus den Zielpfad von Anfang an', () => {
    const s = createGame(0, TIERE.loewe, { zen: true })
    expect(revealedNodes(s, tree, 'gruppe').has(TIERE.loewe)).toBe(true)
  })

  it('zeigt auch ohne jeden Tipp die Wurzel', () => {
    const s = createGame(0, TIERE.loewe)
    expect(revealedNodes(s, tree, 'gruppe')).toEqual(new Set([0]))
  })

  it('nimmt Hinweise in beiden Modi auf', () => {
    let s = createGame(0, TIERE.loewe)
    for (let i = 1; i <= 8; i++) s = applyGuess(s, tree, i, TIERE.ameise)
    s = takeHint(s, tree)
    for (const modus of ['gruppe', 'voll'] as const) {
      expect(revealedNodes(s, tree, modus).has(s.hints[0])).toBe(true)
    }
  })
})

describe('Tiere einer Gruppe', () => {
  const tree = beispielbaum()
  // Reihenfolge der Tierliste: Loewe, Hauskatze, Waldameise, Wolf
  const animalNodes = [TIERE.loewe, TIERE.katze, TIERE.ameise, TIERE.wolf]

  it('findet die Tiere unterhalb einer Familie', () => {
    const felidae = 3
    expect(animalsInGroup(tree, animalNodes, felidae)).toEqual([0, 1])
  })

  it('zaehlt den Knoten selbst mit, wenn er ein Tier ist', () => {
    expect(animalsInGroup(tree, animalNodes, TIERE.loewe)).toEqual([0])
  })

  it('gibt null zurueck, wenn die Gruppe zu gross ist', () => {
    const wurzel = 0
    expect(animalsInGroup(tree, animalNodes, wurzel, 30)).toHaveLength(4)
    expect(animalsInGroup(tree, animalNodes, wurzel, 2)).toBeNull()
  })

  it('liefert fuer eine leere Gruppe eine leere Liste', () => {
    const hunde = 4
    expect(animalsInGroup(tree, [TIERE.loewe, TIERE.katze], hunde)).toEqual([])
  })
})

describe('Verschachtelte Tiere', () => {
  /*
   * Der Sonderfall Hund und Wolf: In der NCBI-Systematik ist Canis lupus
   * familiaris eine Unterart von Canis lupus. Beide sind spielbar, weil beide
   * jeder kennt. Raet man den Hund, waehrend der Wolf gesucht ist, ist die
   * gemeinsame Gruppe der Wolf selbst.
   */
  const tree = new Tree({
    ranks: ['clade', 'family', 'species', 'subspecies'],
    nodes: [
      [1, -1, 0, 'Metazoa', 'Tiere', 'animals'],
      [2, 0, 1, 'Canidae', 'Hunde', 'dogs'],
      [3, 1, 2, 'Canis lupus', 'Wolf', 'wolf'],
      [4, 1, 2, 'Vulpes vulpes', 'Rotfuchs', 'red fox'],
      [5, 2, 3, 'Canis lupus familiaris', 'Haushund', 'dog'],
    ],
  })
  const WOLF = 2
  const FUCHS = 3
  const HUND = 4

  it('meldet den Tipp als Unterart, statt null Verzweigungen anzuzeigen', () => {
    const s = applyGuess(createGame(0, WOLF), tree, 1, HUND)
    expect(s.guesses[0].correct).toBe(false)
    expect(s.guesses[0].insideTarget).toBe(true)
    expect(s.guesses[0].steps).toBe(0)
    expect(s.status).toBe('laeuft')
  })

  it('behandelt die Gegenrichtung ganz normal', () => {
    // Ziel ist der Hund, geraten wird der Wolf: eine Verzweigung nach unten.
    const s = applyGuess(createGame(0, HUND), tree, 1, WOLF)
    expect(s.guesses[0].insideTarget).toBe(false)
    expect(s.guesses[0].steps).toBe(1)
  })

  it('setzt insideTarget nicht beim richtigen Tipp', () => {
    const s = applyGuess(createGame(0, WOLF), tree, 1, WOLF)
    expect(s.guesses[0].correct).toBe(true)
    expect(s.guesses[0].insideTarget).toBe(false)
  })

  it('bleibt bei unverwandten Tieren unauffaellig', () => {
    const s = applyGuess(createGame(0, WOLF), tree, 1, FUCHS)
    expect(s.guesses[0].insideTarget).toBe(false)
    expect(tree.scientificName(s.guesses[0].lca)).toBe('Canidae')
  })
})
