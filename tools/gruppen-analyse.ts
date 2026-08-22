/**
 * Einmalige Auswertung: Wie viele spielbare Tiere gaebe es je Grossgruppe?
 *
 * Hintergrund: Die Auswahl nach reiner Bekanntheit fuehrt zu einem Spiel aus
 * Voegeln und Saeugetieren. Bevor eine Quote eingebaut wird, muss klar sein,
 * wie viel in den anderen Gruppen ueberhaupt zu holen ist.
 *
 * Aufruf: npx tsx tools/gruppen-analyse.ts
 */
import path from 'node:path'
import { PATHS, readJson } from './paths.ts'
import { loadTree, isDescendantOf } from './ncbi.ts'
import type { Candidate } from './2-fetch-wikidata.ts'

const GRUPPEN: Array<{ taxid: number; name: string }> = [
  { taxid: 8782, name: 'Vögel' },
  { taxid: 40674, name: 'Säugetiere' },
  { taxid: 8504, name: 'Schuppenkriechtiere' },
  { taxid: 8459, name: 'Schildkröten' },
  { taxid: 1294634, name: 'Krokodile' },
  { taxid: 8292, name: 'Amphibien' },
  { taxid: 7898, name: 'Strahlenflosser (Fische)' },
  { taxid: 7777, name: 'Knorpelfische (Haie, Rochen)' },
  { taxid: 50557, name: 'Insekten' },
  { taxid: 7399, name: '  davon Hautflügler (Bienen, Wespen, Ameisen)' },
  { taxid: 36668, name: '    davon Ameisen' },
  { taxid: 7041, name: '  davon Käfer' },
  { taxid: 7088, name: '  davon Schmetterlinge' },
  { taxid: 6961, name: '  davon Libellen' },
  { taxid: 7147, name: '  davon Zweiflügler (Fliegen, Mücken)' },
  { taxid: 6854, name: 'Spinnentiere' },
  { taxid: 6657, name: 'Krebstiere' },
  { taxid: 6447, name: 'Weichtiere' },
  { taxid: 6340, name: 'Ringelwürmer' },
  { taxid: 6073, name: 'Nesseltiere' },
  { taxid: 7586, name: 'Stachelhäuter' },
]

function ohneKlammer(name: string | undefined): string {
  return name ? name.replace(/\s*\([^)]*\)\s*$/, '').trim() : ''
}

function spielbar(c: Candidate): boolean {
  if (c.rank !== 'species' && c.rank !== 'subspecies') return false
  if (!c.image) return false
  const sci = (c.sci ?? '').toLowerCase()
  const de = ohneKlammer(c.titleDe) || ohneKlammer(c.nameDe) || ohneKlammer(c.labelDe)
  const en = ohneKlammer(c.titleEn) || ohneKlammer(c.nameEn) || ohneKlammer(c.labelEn)
  return Boolean(de && en && de.toLowerCase() !== sci && en.toLowerCase() !== sci)
}

async function main(): Promise<void> {
  const kandidaten = readJson<Candidate[]>(path.join(PATHS.work, 'candidates.json'))
  const tree = await loadTree()
  const pool = kandidaten.filter(spielbar).sort((a, b) => b.sitelinks - a.sitelinks)

  console.log('Spielbare Kandidaten gesamt: ' + pool.length)
  console.log('')
  console.log('Gruppe'.padEnd(46) + 'gesamt'.padStart(8) + 'in Top 3000'.padStart(13) + '  bekanntestes Tier')
  console.log('-'.repeat(100))

  const top3000 = new Set(pool.slice(0, 3000).map((c) => c.taxid))

  for (const g of GRUPPEN) {
    const drin = pool.filter((c) => isDescendantOf(c.taxid, g.taxid, tree))
    const imSpiel = drin.filter((c) => top3000.has(c.taxid)).length
    const bestes = drin[0]
    const name = bestes ? (ohneKlammer(bestes.titleDe) || bestes.sci) + ' (' + bestes.sitelinks + ')' : '-'
    console.log(g.name.padEnd(46) + String(drin.length).padStart(8) + String(imSpiel).padStart(13) + '  ' + name)
  }

  console.log('')
  console.log('Die 25 bekanntesten Insekten:')
  const insekten = pool.filter((c) => isDescendantOf(c.taxid, 50557, tree))
  for (const c of insekten.slice(0, 25)) {
    console.log('  ' + String(c.sitelinks).padStart(4) + '  ' + ohneKlammer(c.titleDe).padEnd(32) + c.sci)
  }

  console.log('')
  console.log('Die 15 bekanntesten Ameisen:')
  const ameisen = pool.filter((c) => isDescendantOf(c.taxid, 36668, tree))
  for (const c of ameisen.slice(0, 15)) {
    console.log('  ' + String(c.sitelinks).padStart(4) + '  ' + ohneKlammer(c.titleDe).padEnd(32) + c.sci)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
