import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import { PATHS } from './paths.ts'

/**
 * Zugriff auf den NCBI-Taxonomiebaum aus nodes.dmp und names.dmp.
 *
 * Der Baum hat rund 2,5 Mio. Knoten. Eltern und Raenge liegen deshalb in
 * typisierten Arrays, indiziert ueber die Taxon-ID: das sind etwa 20 MB statt
 * mehrerer hundert MB als Objektgraph. Namen werden nur fuer die Taxa geladen,
 * die tatsaechlich gebraucht werden.
 */

export const NODES_FILE = path.join(PATHS.raw, 'nodes.dmp')
export const NAMES_FILE = path.join(PATHS.raw, 'names.dmp')

export interface TaxTree {
  /** parent[taxid] = Eltern-Taxon-ID. 0 heisst: Taxon existiert nicht. */
  parent: Int32Array
  /** rank[taxid] = Index in rankNames. */
  rank: Uint8Array
  rankNames: string[]
  maxTaxid: number
  count: number
}

function splitDmp(line: string): string[] {
  // Format: feld\t|\tfeld\t|\t...\t|
  return line.split('\t|')
}

export async function loadTree(): Promise<TaxTree> {
  if (!fs.existsSync(NODES_FILE)) {
    throw new Error(`nodes.dmp fehlt. Erst "npm run data:ncbi" laufen lassen.`)
  }

  // Erster Durchlauf entfaellt: NCBI-Taxon-IDs liegen aktuell unter 4 Mio.,
  // das Array waechst bei Bedarf.
  let capacity = 4_000_000
  let parent = new Int32Array(capacity)
  let rank = new Uint8Array(capacity)
  const rankNames: string[] = ['no rank']
  const rankIndex = new Map<string, number>([['no rank', 0]])
  let maxTaxid = 0
  let count = 0

  const rl = readline.createInterface({
    input: fs.createReadStream(NODES_FILE, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  })

  for await (const line of rl) {
    if (!line) continue
    const f = splitDmp(line)
    const taxid = Number(f[0])
    if (!Number.isFinite(taxid) || taxid <= 0) continue

    if (taxid >= capacity) {
      capacity = Math.max(taxid + 1, capacity * 2)
      const p2 = new Int32Array(capacity)
      p2.set(parent)
      parent = p2
      const r2 = new Uint8Array(capacity)
      r2.set(rank)
      rank = r2
    }

    const parentId = Number(f[1].trim())
    const rankName = f[2].trim()
    let ri = rankIndex.get(rankName)
    if (ri === undefined) {
      ri = rankNames.length
      rankNames.push(rankName)
      rankIndex.set(rankName, ri)
    }

    parent[taxid] = taxid === 1 ? 0 : parentId
    rank[taxid] = ri
    if (taxid > maxTaxid) maxTaxid = taxid
    count++
  }

  return { parent, rank, rankNames, maxTaxid, count }
}

export interface TaxNames {
  scientific: string
  /** Von NCBI gepflegter englischer Trivialname, falls vorhanden. */
  common?: string
}

/**
 * Laedt Namen, wahlweise nur fuer eine Teilmenge von Taxon-IDs.
 * Ohne `wanted` werden alle Namen geladen, was mehrere hundert MB kostet.
 */
export async function loadNames(wanted?: Set<number>): Promise<Map<number, TaxNames>> {
  if (!fs.existsSync(NAMES_FILE)) {
    throw new Error(`names.dmp fehlt. Erst "npm run data:ncbi" laufen lassen.`)
  }

  const out = new Map<number, TaxNames>()
  const rl = readline.createInterface({
    input: fs.createReadStream(NAMES_FILE, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  })

  for await (const line of rl) {
    if (!line) continue
    const f = splitDmp(line)
    const taxid = Number(f[0])
    if (!Number.isFinite(taxid) || taxid <= 0) continue
    if (wanted && !wanted.has(taxid)) continue

    const name = f[1].trim()
    const nameClass = f[3].trim()

    let entry = out.get(taxid)
    if (!entry) {
      entry = { scientific: '' }
      out.set(taxid, entry)
    }

    if (nameClass === 'scientific name') {
      entry.scientific = name
    } else if (nameClass === 'genbank common name') {
      // Der GenBank-Trivialname ist der gepflegtere von beiden und gewinnt.
      entry.common = name
    } else if (nameClass === 'common name' && !entry.common) {
      entry.common = name
    }
  }

  return out
}

/** Baut einen Index von wissenschaftlichem Namen auf Taxon-ID (Rueckfallebene fuer den Join). */
export async function loadScientificIndex(): Promise<Map<string, number>> {
  const index = new Map<string, number>()
  const rl = readline.createInterface({
    input: fs.createReadStream(NAMES_FILE, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  })
  for await (const line of rl) {
    if (!line) continue
    const f = splitDmp(line)
    if (f[3]?.trim() !== 'scientific name') continue
    const taxid = Number(f[0])
    if (!Number.isFinite(taxid) || taxid <= 0) continue
    const name = f[1].trim().toLowerCase()
    if (!index.has(name)) index.set(name, taxid)
  }
  return index
}

/** Pfad von `taxid` bis zur Wurzel, beginnend beim Taxon selbst. */
export function lineage(taxid: number, tree: TaxTree): number[] {
  const out: number[] = []
  let cur = taxid
  const seen = new Set<number>()
  while (cur > 0 && !seen.has(cur)) {
    seen.add(cur)
    out.push(cur)
    const next = tree.parent[cur]
    if (!next || next === cur) break
    cur = next
  }
  return out
}

/** Liegt `taxid` unterhalb von `ancestorId` (oder ist es selbst)? */
export function isDescendantOf(taxid: number, ancestorId: number, tree: TaxTree): boolean {
  let cur = taxid
  let guard = 0
  while (cur > 0 && guard++ < 200) {
    if (cur === ancestorId) return true
    const next = tree.parent[cur]
    if (!next || next === cur) return false
    cur = next
  }
  return false
}

export function rankOf(taxid: number, tree: TaxTree): string {
  return tree.rankNames[tree.rank[taxid]] ?? 'no rank'
}
