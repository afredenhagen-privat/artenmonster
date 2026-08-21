import type { Lang, NodeTuple, TreeData } from './types.ts'

/**
 * Der Stammbaum als abfragbare Struktur.
 *
 * Das Spiel braucht davon im Kern nur eines: den tiefsten gemeinsamen Vorfahren
 * zweier Tiere. Bei ein paar tausend Knoten ist das eine Handvoll Array-Zugriffe,
 * dafuer braucht es weder Datenbank noch Server.
 */
export class Tree {
  readonly nodes: readonly NodeTuple[]
  readonly ranks: readonly string[]
  private readonly depths: Int32Array
  private readonly byTaxid: Map<number, number>

  constructor(data: TreeData) {
    this.nodes = data.nodes
    this.ranks = data.ranks
    this.depths = new Int32Array(data.nodes.length)
    this.byTaxid = new Map()

    // Die Knoten stehen in Elternreihenfolge, jeder Elternindex ist also kleiner
    // als der des Kindes. Damit reicht ein Durchlauf fuer alle Tiefen.
    for (let i = 0; i < data.nodes.length; i++) {
      const parent = data.nodes[i][1]
      if (parent >= i && parent !== -1) {
        throw new Error(`Knoten ${i} verweist auf einen spaeteren Elternknoten ${parent}.`)
      }
      this.depths[i] = parent === -1 ? 0 : this.depths[parent] + 1
      this.byTaxid.set(data.nodes[i][0], i)
    }
  }

  get size(): number {
    return this.nodes.length
  }

  indexOfTaxid(taxid: number): number | undefined {
    return this.byTaxid.get(taxid)
  }

  parentOf(i: number): number {
    return this.nodes[i][1]
  }

  depthOf(i: number): number {
    return this.depths[i]
  }

  rankOf(i: number): string {
    return this.ranks[this.nodes[i][2]] ?? ''
  }

  scientificName(i: number): string {
    return this.nodes[i][3]
  }

  /** Trivialname in der gewuenschten Sprache, sonst der wissenschaftliche Name. */
  nameOf(i: number, lang: Lang): string {
    const node = this.nodes[i]
    const common = lang === 'de' ? node[4] : node[5]
    return common || node[3]
  }

  /** Gibt es fuer den Knoten einen echten Trivialnamen, oder nur Latein? */
  hasCommonName(i: number, lang: Lang): boolean {
    return Boolean(lang === 'de' ? this.nodes[i][4] : this.nodes[i][5])
  }

  /** Pfad von einem Knoten bis zur Wurzel, beginnend beim Knoten selbst. */
  pathToRoot(i: number): number[] {
    const out: number[] = []
    let cur = i
    while (cur !== -1) {
      out.push(cur)
      cur = this.nodes[cur][1]
    }
    return out
  }

  /**
   * Tiefster gemeinsamer Vorfahre. Beide Knoten werden auf gleiche Tiefe
   * gebracht und dann parallel nach oben gelaufen.
   */
  lca(a: number, b: number): number {
    let x = a
    let y = b
    while (this.depths[x] > this.depths[y]) x = this.nodes[x][1]
    while (this.depths[y] > this.depths[x]) y = this.nodes[y][1]
    while (x !== y) {
      x = this.nodes[x][1]
      y = this.nodes[y][1]
      if (x === -1 || y === -1) {
        throw new Error('Kein gemeinsamer Vorfahre. Der Baum ist nicht zusammenhaengend.')
      }
    }
    return x
  }

  /**
   * Wie viele Verzweigungen liegen zwischen der gemeinsamen Gruppe und dem Ziel?
   * Null heisst: gefunden. Diese Zahl treibt die Warm-Kalt-Anzeige.
   */
  stepsToTarget(guess: number, target: number): number {
    return this.depths[target] - this.depths[this.lca(guess, target)]
  }

  /** Liegt `node` auf dem Pfad von `leaf` zur Wurzel? */
  isAncestorOf(node: number, leaf: number): boolean {
    let cur = leaf
    while (cur !== -1) {
      if (cur === node) return true
      cur = this.nodes[cur][1]
    }
    return false
  }
}
