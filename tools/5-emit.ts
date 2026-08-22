/**
 * Schritt 5: Spieldateien schreiben.
 *
 * Baut aus pool.json und tree.json die Dateien, die ausgeliefert werden, und
 * prueft sie. Schlaegt eine Zusicherung fehl, bricht der Lauf ab, statt kaputte
 * Daten ins Repo zu schreiben.
 *
 * Ergebnis: public/data/
 */
import path from 'node:path'
import zlib from 'node:zlib'
import fs from 'node:fs'
import { CONFIG, type TierId } from './config.ts'
import { PATHS, ensureDirs, readJson, writeJson } from './paths.ts'
import { THUMB_PREFIX } from './commons.ts'
import { indexVariants } from '../src/core/search.ts'
import type { PoolAnimal } from './3-enrich.ts'
import type { BuiltTree } from './4-build-tree.ts'
import type { NodeTuple } from '../src/core/types.ts'

function gzipSize(data: unknown): number {
  return zlib.gzipSync(Buffer.from(JSON.stringify(data), 'utf8')).length
}

function mb(bytes: number): string {
  return bytes >= 1e6 ? (bytes / 1e6).toFixed(2) + ' MB' : Math.round(bytes / 1024) + ' KB'
}

async function main(): Promise<void> {
  ensureDirs()
  console.log('Schritt 5: Spieldateien schreiben')

  const pool = readJson<PoolAnimal[]>(path.join(PATHS.work, 'pool.json'))
  const built = readJson<BuiltTree>(path.join(PATHS.work, 'tree.json'))

  // --- tree.json -----------------------------------------------------------
  const ranks: string[] = []
  const rankIndex = new Map<string, number>()
  const rankId = (r: string): number => {
    let i = rankIndex.get(r)
    if (i === undefined) {
      i = ranks.length
      ranks.push(r)
      rankIndex.set(r, i)
    }
    return i
  }

  const nodes: NodeTuple[] = built.nodes.map((n) => [n.taxid, n.parent, rankId(n.rank), n.sci, n.de, n.en])
  const hidden: Record<string, string[]> = {}
  built.nodes.forEach((n, i) => {
    if (n.collapsed.length > 0) hidden[String(i)] = n.collapsed
  })
  const treeData = { ranks, nodes, hidden }

  // --- animals.json --------------------------------------------------------
  const sorted = [...pool].sort((a, b) => a.tier - b.tier || b.score - a.score)
  const animals = sorted.map((p) => {
    const node = built.leafIndex[String(p.taxid)]
    if (node === undefined) throw new Error('Kein Baumknoten fuer ' + p.sci + ' (' + p.taxid + ')')
    return {
      node,
      score: p.score,
      tier: p.tier,
      image: p.image
        ? {
            url: p.image.thumb,
            author: p.image.author,
            license: p.image.license,
            licenseUrl: p.image.licenseUrl,
            page: p.image.descriptionUrl,
          }
        : undefined,
    }
  })

  const tierRanges: Record<string, { from: number; to: number }> = {}
  for (const t of [1, 2, 3] as TierId[]) {
    const from = animals.findIndex((a) => a.tier === t)
    const count = animals.filter((a) => a.tier === t).length
    tierRanges[String(t)] = { from: from < 0 ? 0 : from, to: from < 0 ? 0 : from + count }
  }
  const animalsData = { animals, tierRanges, thumbPrefix: THUMB_PREFIX }

  // --- search.json ---------------------------------------------------------
  const entries: Array<[string, number]> = []
  const seen = new Set<string>()
  sorted.forEach((p, i) => {
    for (const name of [p.nameDe, p.nameEn, p.sci]) {
      for (const variant of indexVariants(name)) {
        const key = variant + '#' + i
        if (seen.has(key)) continue
        seen.add(key)
        entries.push([variant, i])
      }
    }
  })
  const searchData = { entries }

  // --- Erklaerungen zu den Gruppen -----------------------------------------
  // Nach Knotenindex, nicht nach Taxon-ID: Das Spiel arbeitet mit Indizes, und
  // die Datei wird dadurch deutlich kleiner.
  const gruppenDe: Record<string, { text: string; url: string }> = {}
  const gruppenEn: Record<string, { text: string; url: string }> = {}
  built.nodes.forEach((n, i) => {
    if (n.blurbDe) gruppenDe[String(i)] = n.blurbDe
    if (n.blurbEn) gruppenEn[String(i)] = n.blurbEn
  })

  // --- blurbs --------------------------------------------------------------
  const blurbsDe: Record<string, { text: string; url: string }> = {}
  const blurbsEn: Record<string, { text: string; url: string }> = {}
  sorted.forEach((p, i) => {
    if (p.blurbDe) blurbsDe[String(i)] = p.blurbDe
    if (p.blurbEn) blurbsEn[String(i)] = p.blurbEn
  })

  // --- Zusicherungen -------------------------------------------------------
  const fehler: string[] = []

  built.nodes.forEach((n, i) => {
    if (i === 0 && n.parent !== -1) fehler.push('Der Wurzelknoten hat einen Elternknoten.')
    if (i > 0 && (n.parent < 0 || n.parent >= i)) {
      fehler.push('Knoten ' + i + ' (' + n.sci + ') hat einen ungueltigen Elternindex ' + n.parent + '.')
    }
    if (!n.sci) fehler.push('Knoten ' + i + ' hat keinen wissenschaftlichen Namen.')
  })

  sorted.forEach((p, i) => {
    if (!p.nameDe) fehler.push(p.sci + ' hat keinen deutschen Namen.')
    if (!p.nameEn) fehler.push(p.sci + ' hat keinen englischen Namen.')
    const a = animals[i]
    if (a.image && (!a.image.author || !a.image.license)) {
      fehler.push(p.nameDe + ': Bild ohne Urheber- oder Lizenzangabe.')
    }
  })

  const blattKnoten = new Set(animals.map((a) => a.node))
  if (blattKnoten.size !== animals.length) fehler.push('Zwei Tiere zeigen auf denselben Baumknoten.')

  for (const t of [1, 2, 3] as TierId[]) {
    const anzahl = animals.filter((a) => a.tier === t).length
    const soll = CONFIG.TIERS[t].size
    if (anzahl < soll * 0.5) {
      fehler.push('Stufe ' + t + ' hat nur ' + anzahl + ' Tiere, erwartet waren rund ' + soll + '.')
    }
  }

  if (fehler.length > 0) {
    console.error('\n  Die Daten haben ' + fehler.length + ' Probleme:')
    for (const f of fehler.slice(0, 25)) console.error('    ' + f)
    if (fehler.length > 25) console.error('    ... und ' + (fehler.length - 25) + ' weitere')
    throw new Error('Zusicherungen verletzt, es wird nichts geschrieben.')
  }

  // --- meta.json -----------------------------------------------------------
  const meta = {
    builtAt: new Date().toISOString().slice(0, 10),
    counts: {
      nodes: nodes.length,
      animals: animals.length,
      tiers: Object.fromEntries(([1, 2, 3] as TierId[]).map((t) => [t, animals.filter((a) => a.tier === t).length])),
    },
    sources: {
      ncbi: 'NCBI Taxonomy, gemeinfrei',
      wikidata: 'Wikidata, CC0',
      wikipedia: 'Wikipedia, CC BY-SA 4.0',
      commons: 'Wikimedia Commons, Lizenz je Bild einzeln angegeben',
    },
  }

  // --- schreiben -----------------------------------------------------------
  const dateien: Array<[string, unknown]> = [
    ['tree.json', treeData],
    ['animals.json', animalsData],
    ['search.json', searchData],
    ['blurbs.de.json', blurbsDe],
    ['blurbs.en.json', blurbsEn],
    ['gruppen.de.json', gruppenDe],
    ['gruppen.en.json', gruppenEn],
    ['meta.json', meta],
  ]

  let gesamtGz = 0
  console.log('')
  console.log('  Datei             roh        gepackt')
  for (const [name, data] of dateien) {
    const file = path.join(PATHS.out, name)
    writeJson(file, data)
    const roh = fs.statSync(file).size
    const gz = gzipSize(data)
    gesamtGz += gz
    console.log('  ' + name.padEnd(16) + mb(roh).padStart(8) + mb(gz).padStart(12))
  }
  console.log('  ' + 'Summe'.padEnd(16) + ''.padStart(8) + mb(gesamtGz).padStart(12))

  const precacheGz = dateien
    .filter(([n]) => !n.startsWith('blurbs') && !n.startsWith('gruppen'))
    .reduce((sum, [, d]) => sum + gzipSize(d), 0)
  console.log('  davon fest im Precache des Service Workers: ' + mb(precacheGz))

  console.log('')
  console.log('  Baumknoten: ' + nodes.length + ', Spieltiere: ' + animals.length)
  for (const t of [1, 2, 3] as TierId[]) {
    console.log('    Stufe ' + t + ' (' + CONFIG.TIERS[t].name.de + '): ' + meta.counts.tiers[t])
  }
  console.log('  Suchbegriffe: ' + entries.length)
  console.log('  Steckbriefe deutsch: ' + Object.keys(blurbsDe).length + ', englisch: ' + Object.keys(blurbsEn).length)
  console.log(
    '  Gruppenerklaerungen deutsch: ' +
      Object.keys(gruppenDe).length +
      ', englisch: ' +
      Object.keys(gruppenEn).length +
      ' von ' +
      nodes.length +
      ' Knoten',
  )
  console.log('Schritt 5 fertig.')
}

main().catch((err) => {
  console.error('\nSchritt 5 fehlgeschlagen:', err)
  process.exit(1)
})
