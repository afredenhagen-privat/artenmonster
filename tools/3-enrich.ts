/**
 * Schritt 3: Pool festlegen und anreichern.
 *
 * Aus den Kandidaten wird der eigentliche Rateraum: Arten mit deutschem und
 * englischem Namen und einem Bild, nach Bekanntheit sortiert und in drei
 * Schwierigkeitsstufen geschnitten. Danach werden Steckbriefe und Bildrechte
 * dazugeholt.
 *
 * Ergebnis: data/work/pool.json
 */
import path from 'node:path'
import { CONFIG, type TierId } from './config.ts'
import { PATHS, ensureDirs, readJson, writeJson, readOverride } from './paths.ts'
import { mapLimit, progress } from './http.ts'
import { fetchSummary } from './wikipedia.ts'
import { fetchImageInfo, type CommonsInfo } from './commons.ts'
import { loadTree, isDescendantOf, type TaxTree } from './ncbi.ts'
import type { Candidate } from './2-fetch-wikidata.ts'

export interface PoolAnimal {
  taxid: number
  qid: string
  sci: string
  nameDe: string
  nameEn: string
  score: number
  tier: TierId
  titleDe: string
  titleEn?: string
  image?: CommonsInfo
  blurbDe?: { text: string; url: string }
  blurbEn?: { text: string; url: string }
}

interface AnimalOverride {
  taxid: number
  nameDe?: string
  nameEn?: string
  /** true blendet das Tier aus, auch wenn es sonst durchkaeme. */
  drop?: boolean
  tier?: TierId
}

function pickName(c: Candidate, lang: 'de' | 'en'): string {
  const trivial = lang === 'de' ? c.nameDe : c.nameEn
  const label = lang === 'de' ? c.labelDe : c.labelEn
  const name = trivial ?? label ?? ''
  // Ein Label, das nur der wissenschaftliche Name ist, taugt nicht als Trivialname.
  if (!name || name === c.sci) return ''
  return name
}

/**
 * Waehlt den Rateraum aus. Regeln der Reihe nach:
 * Rang Art oder Unterart, deutscher und englischer Trivialname, Bild vorhanden.
 * Bei doppelter Taxon-ID gewinnt der bekanntere Eintrag.
 */
function buildPool(candidates: Candidate[], tree: TaxTree): { pool: PoolAnimal[]; stats: Record<string, number> } {
  const overrides = new Map<number, AnimalOverride>(
    readOverride<{ animals: AnimalOverride[] }>('animals.json', { animals: [] }).animals.map((o) => [o.taxid, o]),
  )

  const stats = { falscherRang: 0, keinNameDe: 0, keinNameEn: 0, keinBild: 0, doppelt: 0, verworfen: 0 }
  const byTaxid = new Map<number, PoolAnimal>()

  for (const c of candidates) {
    const ov = overrides.get(c.taxid)
    if (ov?.drop) {
      stats.verworfen++
      continue
    }

    const rangPasst = c.rank === 'species' || c.rank === 'subspecies'
    // Ein Override darf ein Taxon auch oberhalb der Artebene hereinholen,
    // etwa wenn ein Tier im Deutschen nur als Gattung bekannt ist.
    if (!rangPasst && !ov) {
      stats.falscherRang++
      continue
    }

    const nameDe = ov?.nameDe ?? pickName(c, 'de')
    const nameEn = ov?.nameEn ?? pickName(c, 'en')
    if (!nameDe) {
      stats.keinNameDe++
      continue
    }
    if (!nameEn) {
      stats.keinNameEn++
      continue
    }
    if (!c.image) {
      stats.keinBild++
      continue
    }

    const vorhanden = byTaxid.get(c.taxid)
    if (vorhanden) {
      stats.doppelt++
      if (c.sitelinks <= vorhanden.score) continue
    }

    byTaxid.set(c.taxid, {
      taxid: c.taxid,
      qid: c.qid,
      sci: c.sci ?? '',
      nameDe,
      nameEn,
      score: c.sitelinks,
      tier: 3,
      titleDe: c.titleDe,
      titleEn: c.titleEn,
      image: { file: c.image } as CommonsInfo,
    })
  }

  let pool = [...byTaxid.values()].sort((a, b) => b.score - a.score || a.sci.localeCompare(b.sci))

  // Kein spielbares Tier darf Vorfahre eines anderen sein. Sonst waere ein Tipp
  // gleichzeitig Loesung und Gruppe, und die Rueckmeldung waere widerspruechlich.
  const inPool = new Set(pool.map((p) => p.taxid))
  const konflikte: string[] = []
  for (const p of pool) {
    let cur = tree.parent[p.taxid]
    let guard = 0
    while (cur > 1 && guard++ < 200) {
      if (inPool.has(cur)) {
        konflikte.push(p.sci + ' (' + p.taxid + ') liegt unterhalb von ' + cur)
        break
      }
      const next = tree.parent[cur]
      if (!next || next === cur) break
      cur = next
    }
  }
  if (konflikte.length > 0) {
    throw new Error(
      'Spielbare Tiere duerfen nicht ineinander liegen. Betroffen:\n  ' + konflikte.slice(0, 20).join('\n  '),
    )
  }

  // Stufen schneiden.
  const grenzen = [CONFIG.TIERS[1].size, CONFIG.TIERS[1].size + CONFIG.TIERS[2].size]
  const gesamt = grenzen[1] + CONFIG.TIERS[3].size
  pool = pool.slice(0, gesamt)
  pool.forEach((p, i) => {
    const ov = overrides.get(p.taxid)
    p.tier = ov?.tier ?? (i < grenzen[0] ? 1 : i < grenzen[1] ? 2 : 3)
  })

  // Sicherheitsnetz gegen einen kaputten Filter weiter oben.
  for (const p of pool) {
    if (!isDescendantOf(p.taxid, CONFIG.METAZOA_TAXID, tree)) {
      throw new Error(p.sci + ' (' + p.taxid + ') liegt nicht unterhalb von Metazoa.')
    }
  }

  return { pool, stats }
}

async function main(): Promise<void> {
  ensureDirs()
  console.log('Schritt 3: Pool festlegen und anreichern')

  const candidates = readJson<Candidate[]>(path.join(PATHS.work, 'candidates.json'))
  console.log('  ' + candidates.length + ' Kandidaten gelesen')

  const tree = await loadTree()
  const { pool, stats } = buildPool(candidates, tree)

  console.log('  Aussortiert:')
  console.log('    Rang weder Art noch Unterart: ' + stats.falscherRang)
  console.log('    ohne deutschen Trivialnamen:  ' + stats.keinNameDe)
  console.log('    ohne englischen Trivialnamen: ' + stats.keinNameEn)
  console.log('    ohne Bild:                    ' + stats.keinBild)
  console.log('    per Override verworfen:       ' + stats.verworfen)
  console.log('  Pool: ' + pool.length + ' Tiere')
  for (const t of [1, 2, 3] as TierId[]) {
    console.log('    Stufe ' + t + ' (' + CONFIG.TIERS[t].name.de + '): ' + pool.filter((p) => p.tier === t).length)
  }

  console.log('  Bildrechte von Commons holen ...')
  const infos = await fetchImageInfo(
    pool.map((p) => p.image!.file),
    progress('Bilder'),
  )
  let ohneBildinfo = 0
  for (const p of pool) {
    const info = infos.get(p.image!.file)
    if (info) p.image = info
    else {
      p.image = undefined
      ohneBildinfo++
    }
  }
  if (ohneBildinfo > 0) console.log('  ' + ohneBildinfo + ' Bilder ohne verwertbare Info, werden weggelassen')

  console.log('  Steckbriefe von Wikipedia holen ...')
  await mapLimit(
    pool,
    CONFIG.HTTP.concurrency,
    async (p) => {
      const de = await fetchSummary('de', p.titleDe)
      if (de) p.blurbDe = de
      if (p.titleEn) {
        const en = await fetchSummary('en', p.titleEn)
        if (en) p.blurbEn = en
      }
    },
    progress('Steckbriefe'),
  )

  const mitDe = pool.filter((p) => p.blurbDe).length
  const mitEn = pool.filter((p) => p.blurbEn).length
  console.log('  Steckbriefe deutsch: ' + mitDe + ', englisch: ' + mitEn)

  writeJson(path.join(PATHS.work, 'pool.json'), pool)
  console.log('  Geschrieben: data/work/pool.json')
  console.log('Schritt 3 fertig.')
}

main().catch((err) => {
  console.error('\nSchritt 3 fehlgeschlagen:', err)
  process.exit(1)
})
