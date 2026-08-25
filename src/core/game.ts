import type { Tree } from './tree.ts'

/**
 * Spiellogik. Kennt nur Baumindizes und Zahlen, kein DOM und keine Daten-URLs,
 * damit sie sich vollstaendig testen laesst.
 */

export const MAX_GUESSES = 20

/**
 * Waehlbare Versuchszahlen, Infinity heisst ohne Limit.
 *
 * Zwanzig war lange die einzige Zahl. Sie passt fuer die Stufe "Leicht", wird
 * in "Schwer" aber knapp, und wer den Baum in Ruhe erkunden will, braucht gar
 * kein Limit. Zehnerschritte reichen als Raster; feiner einzustellen bringt
 * niemandem etwas.
 */
export const GUESS_OPTIONS = [10, 20, 30, 40, 50, Infinity] as const
/**
 * Nach wie vielen Fehlversuchen ein Hinweis faellig wird, als Anteil am
 * Versuchsvorrat.
 *
 * Bei zehn Versuchen waere ein Hinweis nach vierzehn Fehlversuchen nie
 * gekommen, deshalb ueberhaupt der Anteil.
 */
const HINT_ANTEILE = [0.4, 0.7] as const

/**
 * Spaeter als das wird ein Hinweis nie faellig.
 *
 * Der Anteil allein zog in die andere Richtung falsch: Bei fuenfzig Versuchen
 * kam der erste Hinweis erst nach zwanzig Fehlversuchen, und wer eine Runde in
 * zehn Tipps loest, sah ihn nie. Wer sich mehr Versuche gibt, will Luft haben —
 * nicht die Hilfe nach hinten geschoben bekommen. Der Anteil darf die Schwelle
 * also nur senken, nie heben.
 */
export const HINT_AFTER = [8, 14] as const

/** Die Schwellen fuer einen konkreten Vorrat. Ohne Limit bleibt es bei 8 und 14. */
export function hintThresholds(maxGuesses: number): number[] {
  if (!Number.isFinite(maxGuesses)) return [...HINT_AFTER]
  return HINT_ANTEILE.map((anteil, i) =>
    Math.min(HINT_AFTER[i], Math.max(1, Math.round(maxGuesses * anteil))),
  )
}

/**
 * Ab wie vielen Fehlversuchen der naechste Hinweis bereitsteht.
 *
 * Null heisst: schon jetzt, oder gar nicht mehr. Die Oberflaeche schreibt die
 * Zahl an den gesperrten Knopf, damit niemand raten muss, warum er ausgegraut
 * ist.
 */
export function nextHintAt(state: GameState): number {
  if (state.zen) return 0
  return hintThresholds(state.maxGuesses)[state.hints.length] ?? 0
}

export type GameStatus = 'laeuft' | 'gewonnen' | 'verloren'

export interface GuessResult {
  /** Index des geratenen Tiers in der Tierliste. */
  animal: number
  /** Blattknoten des geratenen Tiers im Baum. */
  node: number
  /** Tiefster gemeinsamer Vorfahre von Tipp und Ziel. */
  lca: number
  /** Verbleibende Verzweigungen von der gemeinsamen Gruppe bis zum Ziel. */
  steps: number
  correct: boolean
  /**
   * Der Tipp liegt im Baum unterhalb der Loesung, ist also eine Unterart davon.
   * Praktisch nur bei Haustieren: der Hund unter dem Wolf. Ohne eigene Meldung
   * stuende hier "noch 0 Verzweigungen" bei falschem Tipp, was niemand versteht.
   */
  insideTarget: boolean
  /** War dieser Tipp der beste bis hierher? */
  isBest: boolean
}

export interface GameState {
  /** Index des Zieltiers in der Tierliste. */
  target: number
  targetNode: number
  guesses: GuessResult[]
  /** Knoten, die durch Hinweise aufgedeckt wurden. */
  hints: number[]
  /**
   * Aufgedeckte Merkmalshinweise, als Index in die Satzliste des Zieltiers.
   *
   * Getrennt von hints, weil die beiden verschiedene Dinge bezeichnen: Der eine
   * ist ein Knoten im Baum und faerbt ihn ein, der andere ein Satz. Beide
   * zusammen zehren am selben Vorrat.
   */
  textHints: number[]
  maxGuesses: number
  status: GameStatus
  /** Kein Versuchslimit, Baum frei einsehbar. */
  zen: boolean
}

export interface GameOptions {
  maxGuesses?: number
  zen?: boolean
}

export function createGame(target: number, targetNode: number, options: GameOptions = {}): GameState {
  return {
    target,
    targetNode,
    guesses: [],
    hints: [],
    textHints: [],
    maxGuesses: options.zen ? Infinity : (options.maxGuesses ?? MAX_GUESSES),
    status: 'laeuft',
    zen: options.zen ?? false,
  }
}

export function alreadyGuessed(state: GameState, animal: number): boolean {
  return state.guesses.some((g) => g.animal === animal)
}

/**
 * Wertet einen Tipp aus. Gibt einen neuen Zustand zurueck, der alte bleibt
 * unveraendert, damit React den Wechsel sauber mitbekommt.
 */
export function applyGuess(state: GameState, tree: Tree, animal: number, node: number): GameState {
  if (state.status !== 'laeuft') return state
  if (alreadyGuessed(state, animal)) return state

  const lca = tree.lca(node, state.targetNode)
  const steps = tree.depthOf(state.targetNode) - tree.depthOf(lca)
  const correct = node === state.targetNode
  const bestSoFar = bestSteps(state)

  const result: GuessResult = {
    animal,
    node,
    lca,
    steps,
    correct,
    insideTarget: !correct && lca === state.targetNode,
    isBest: steps < bestSoFar,
  }

  const guesses = [...state.guesses, result]
  const status: GameStatus = correct
    ? 'gewonnen'
    : guesses.length >= state.maxGuesses
      ? 'verloren'
      : 'laeuft'

  return { ...state, guesses, status }
}

/** Wenigste verbleibende Schritte ueber alle bisherigen Tipps. */
export function bestSteps(state: GameState): number {
  let best = Infinity
  for (const g of state.guesses) if (g.steps < best) best = g.steps
  return best
}

/**
 * Der Knoten, den der Spieler bereits sicher kennt: der tiefste bisher
 * aufgedeckte gemeinsame Vorfahre, aus Tipps und Hinweisen zusammen.
 * Ohne jeden Tipp ist das die Wurzel.
 */
export function knownNode(state: GameState, tree: Tree): number {
  let best = -1
  let bestDepth = -1
  const candidates = [...state.guesses.map((g) => g.lca), ...state.hints]
  for (const node of candidates) {
    const d = tree.depthOf(node)
    if (d > bestDepth) {
      bestDepth = d
      best = node
    }
  }
  if (best === -1) {
    // Noch nichts bekannt: die Wurzel ist der Ausgangspunkt.
    const path = tree.pathToRoot(state.targetNode)
    return path[path.length - 1]
  }
  return best
}

/** Wie viele Hinweise stehen nach der bisherigen Zahl an Fehlversuchen zu? */
export function hintsEarned(state: GameState): number {
  if (state.zen) return Infinity
  const wrong = state.guesses.filter((g) => !g.correct).length
  return hintThresholds(state.maxGuesses).filter((n) => wrong >= n).length
}

/** Wie viele Hinweise sind schon abgerufen, gleich welcher Art? */
export function hintsTaken(state: GameState): number {
  return state.hints.length + state.textHints.length
}

/**
 * Ist noch ein Hinweis drin?
 *
 * `tipps` ist die Zahl der Merkmalssaetze, die zum Zieltier vorliegen. Ohne sie
 * bleibt nur der Gruppenhinweis, und wenn auch der erschoepft ist, gibt es
 * nichts mehr zu holen.
 */
export function canTakeHint(state: GameState, tree: Tree, tipps = 0): boolean {
  if (state.status !== 'laeuft') return false
  if (hintsTaken(state) >= hintsEarned(state)) return false
  return state.textHints.length < tipps || nextHintNode(state, tree) !== null
}

/**
 * Der naechste Hinweis ist genau eine Ebene tiefer als das, was der Spieler
 * schon weiss. Damit bringt jeder Hinweis einen echten Schritt und deckt nicht
 * gleich die halbe Loesung auf.
 */
export function nextHintNode(state: GameState, tree: Tree): number | null {
  const known = knownNode(state, tree)
  const path = tree.pathToRoot(state.targetNode)
  const idx = path.indexOf(known)
  if (idx <= 0) return null
  const next = path[idx - 1]
  // Das Zielblatt selbst waere die Loesung, das ist kein Hinweis.
  return next === state.targetNode ? null : next
}

/**
 * Nimmt den naechsten Hinweis.
 *
 * Der Merkmalssatz kommt zuerst, die Gruppe danach: Er ist der weichere
 * Hinweis, der zum Weiterraten einlaedt, waehrend das Aufdecken einer Ebene im
 * Stammbaum die Suche mechanisch zusammenschnurren laesst. Wer keinen
 * Merkmalssatz hat — rund ein Drittel der Tiere hat keinen, weil ihr
 * Wikipedia-Anriss aus einem einzigen Satz besteht — bekommt gleich die Gruppe.
 */
export function takeHint(state: GameState, tree: Tree, tipps = 0): GameState {
  if (!canTakeHint(state, tree, tipps)) return state
  const node = nextHintNode(state, tree)

  /*
   * Genau der erste Hinweis ist ein Merkmal, jeder weitere deckt eine Ebene im
   * Stammbaum auf. Ist im Baum nichts mehr aufzudecken, springt ein weiterer
   * Merkmalssatz ein, statt gar nichts zu geben.
   */
  const nimmMerkmal = state.textHints.length < tipps && (state.textHints.length === 0 || node === null)
  if (nimmMerkmal) {
    return { ...state, textHints: [...state.textHints, state.textHints.length] }
  }
  if (node === null) return state
  return { ...state, hints: [...state.hints, node] }
}

/**
 * Die Tiere, die unterhalb der bereits bekannten Gruppe liegen.
 *
 * Bei einem Pool von mehreren tausend Tieren reicht es nicht, die Gruppe zu
 * kennen: Wer nicht auf den Namen kommt, kann ihn auch nicht eintippen. Ist die
 * Gruppe klein genug, wird sie deshalb zur Auswahl angeboten. Das verraet nichts,
 * was der Spieler nicht ohnehin schon weiss, erspart ihm aber das Erraten der
 * Schreibweise.
 *
 * Gibt null zurueck, wenn die Gruppe groesser als `limit` ist. Die Zaehlung
 * bricht dann vorzeitig ab, statt tausende Pfade zu Ende zu laufen.
 */
export function animalsInGroup(
  tree: Tree,
  animalNodes: readonly number[],
  group: number,
  limit = 30,
): number[] | null {
  const treffer: number[] = []
  for (let animal = 0; animal < animalNodes.length; animal++) {
    if (!tree.isAncestorOf(group, animalNodes[animal])) continue
    treffer.push(animal)
    if (treffer.length > limit) return null
  }
  return treffer
}

/**
 * Wie viel vom Stammbaum gezeigt wird.
 *
 * `gruppe` zeigt nur, was tatsaechlich erspielt wurde: die gemeinsamen Gruppen
 * der Tipps, die aufgedeckten Hinweise und die geratenen Tiere. Alle
 * Zwischenebenen faellt die Darstellung zusammen. Damit liest der Baum die
 * Geschichte der Eingrenzung, statt die vollstaendige Systematik zu buchstabieren.
 *
 * `voll` zeigt jede Abstammungsebene jedes Tipps. Mehr Systematik zum Nachlesen,
 * aber auch deutlich mehr Rauschen.
 */
export type BaumModus = 'gruppe' | 'voll'

/**
 * Alle Knoten, die im Baum sichtbar sein duerfen. Im Zen-Modus und nach
 * Spielende ist zusaetzlich der Zielpfad dabei.
 */
export function revealedNodes(state: GameState, tree: Tree, modus: BaumModus = 'gruppe'): Set<number> {
  const out = new Set<number>()

  // Die Wurzel ist immer da, damit der Baum einen Ansatzpunkt hat.
  const wurzel = tree.pathToRoot(state.targetNode).at(-1)
  if (wurzel !== undefined) out.add(wurzel)

  for (const g of state.guesses) {
    if (modus === 'voll') {
      for (const n of tree.pathToRoot(g.node)) out.add(n)
    } else {
      out.add(g.lca)
      out.add(g.node)
    }
  }

  for (const h of state.hints) {
    if (modus === 'voll') for (const n of tree.pathToRoot(h)) out.add(n)
    else out.add(h)
  }

  if (state.status !== 'laeuft' || state.zen) {
    for (const n of tree.pathToRoot(state.targetNode)) out.add(n)
  }

  /*
   * Im Gruppenmodus zusaetzlich die gemeinsamen Gruppen der Tipps untereinander.
   *
   * Ohne sie haengen alle Tiere mit derselben Distanz zur Loesung nebeneinander
   * an einem Knoten, und man sieht nicht, dass Bienenfresser und Schwarzspecht
   * naeher miteinander verwandt sind als mit dem Wanderfalken. Das verraet
   * nichts ueber die Loesung: Es ist Wissen ueber die eigenen Tipps, das sich
   * ohnehin nachschlagen liesse.
   */
  if (modus === 'gruppe' && state.guesses.length > 1) {
    const blaetter = state.guesses.map((g) => g.node)
    for (let i = 0; i < blaetter.length; i++) {
      for (let j = i + 1; j < blaetter.length; j++) {
        out.add(tree.lca(blaetter[i], blaetter[j]))
      }
    }
  }

  return out
}
