/**
 * Schritt 2: Kandidaten beschaffen.
 *
 * Zwei Stufen, weil ein Vollscan ueber alle 1,5 Mio. Taxa den Wikidata Query
 * Service zuverlaessig in den 60-Sekunden-Timeout treibt:
 *
 *   2a  Die deutsche Wikipedia liefert ueber die Taxobox-Vorlage eine begrenzte
 *       Liste aller Artikel ueber Lebewesen samt Wikidata-ID (~60.000).
 *   2b  Wikidata wird dann gezielt nach genau diesen Items gefragt (VALUES statt
 *       Vollscan). Das dauert je 400 Items rund vier Sekunden.
 *   2c  Der lokale NCBI-Baum filtert auf Tiere und wirft Pflanzen und Pilze raus.
 *
 * Dass die deutsche Wikipedia das Nadeloehr ist, passt zum Spiel: ein Tier ohne
 * deutschen Artikel wollen wir ohnehin nicht als Rateziel.
 *
 * Ergebnis: data/work/candidates.json
 */
import path from 'node:path'
import { sparql, val, qid, type SparqlBinding } from './sparql.ts'
import { CONFIG } from './config.ts'
import { PATHS, ensureDirs, writeJson, readOverride } from './paths.ts'
import { loadTree, isDescendantOf, rankOf, type TaxTree } from './ncbi.ts'
import { harvestTaxoboxPages } from './wikipedia.ts'

export interface Candidate {
  qid: string
  taxid: number
  sitelinks: number
  /** Titel des deutschen Wikipedia-Artikels, kommt aus der Taxobox-Ernte. */
  titleDe: string
  titleEn?: string
  sci?: string
  nameDe?: string
  nameEn?: string
  labelDe?: string
  labelEn?: string
  image?: string
  rank?: string
}

const BATCH = 400

function buildQuery(qids: readonly string[]): string {
  return [
    'SELECT ?item ?ncbi ?sitelinks ?sci ?nameDe ?nameEn ?labelDe ?labelEn ?img ?enTitle WHERE {',
    '  VALUES ?item { ' + qids.map((q) => 'wd:' + q).join(' ') + ' }',
    '  ?item wikibase:sitelinks ?sitelinks .',
    '  OPTIONAL { ?item wdt:P685 ?ncbi }',
    '  OPTIONAL { ?item wdt:P225 ?sci }',
    '  OPTIONAL { ?item wdt:P1843 ?nameDe . FILTER(LANG(?nameDe) = "de") }',
    '  OPTIONAL { ?item wdt:P1843 ?nameEn . FILTER(LANG(?nameEn) = "en") }',
    '  OPTIONAL { ?item rdfs:label ?labelDe . FILTER(LANG(?labelDe) = "de") }',
    '  OPTIONAL { ?item rdfs:label ?labelEn . FILTER(LANG(?labelEn) = "en") }',
    '  OPTIONAL { ?item wdt:P18 ?img }',
    '  OPTIONAL {',
    '    ?enArticle schema:about ?item ;',
    '               schema:isPartOf <https://en.wikipedia.org/> ;',
    '               schema:name ?enTitle .',
    '  }',
    '}',
  ].join('\n')
}

/**
 * Faltet die Zeilen zusammen. Mehrere OPTIONAL-Werte erzeugen ein Kreuzprodukt,
 * pro Item wird deshalb der jeweils erste vorhandene Wert genommen. Bei
 * Trivialnamen gewinnt der kuerzeste, weil "Loewe" besser passt als
 * "Afrikanischer Steppenloewe".
 */
function mergeRows(rows: SparqlBinding[], titles: Map<string, string>): Map<string, Candidate> {
  const byQid = new Map<string, Candidate>()

  for (const row of rows) {
    const q = qid(val(row, 'item'))
    if (!q) continue
    const taxidRaw = val(row, 'ncbi')
    if (!taxidRaw) continue
    const taxid = Number(taxidRaw)
    if (!Number.isFinite(taxid) || taxid <= 0) continue

    let c = byQid.get(q)
    if (!c) {
      c = {
        qid: q,
        taxid,
        sitelinks: Number(val(row, 'sitelinks') ?? 0),
        titleDe: titles.get(q) ?? '',
      }
      byQid.set(q, c)
    }

    c.sci ??= val(row, 'sci')
    c.labelDe ??= val(row, 'labelDe')
    c.labelEn ??= val(row, 'labelEn')
    c.titleEn ??= val(row, 'enTitle')

    const de = val(row, 'nameDe')
    if (de && (!c.nameDe || de.length < c.nameDe.length)) c.nameDe = de
    const en = val(row, 'nameEn')
    if (en && (!c.nameEn || en.length < c.nameEn.length)) c.nameEn = en

    if (!c.image) {
      // Aus ".../Special:FilePath/Lion%20waiting.jpg" wird der Commons-Dateiname.
      const img = val(row, 'img')
      if (img) c.image = decodeURIComponent(img.split('/').pop() ?? '')
    }
  }
  return byQid
}

function filterToAnimals(candidates: Map<string, Candidate>, tree: TaxTree) {
  const kept: Candidate[] = []
  const stats = { unbekannteTaxid: 0, keinTier: 0, blockiert: 0, zuUnbekannt: 0, behalten: 0 }
  const blocklist = new Set(readOverride<{ taxids: number[] }>('blocklist.json', { taxids: [] }).taxids)

  for (const c of candidates.values()) {
    if (c.taxid >= tree.parent.length || tree.parent[c.taxid] === 0) {
      // NCBI kennt die Taxon-ID nicht mehr, weil sie zurueckgezogen oder zusammengelegt wurde.
      stats.unbekannteTaxid++
      continue
    }
    if (!isDescendantOf(c.taxid, CONFIG.METAZOA_TAXID, tree)) {
      stats.keinTier++
      continue
    }
    if (blocklist.has(c.taxid)) {
      stats.blockiert++
      continue
    }
    if (c.sitelinks < CONFIG.MIN_SITELINKS) {
      stats.zuUnbekannt++
      continue
    }
    c.rank = rankOf(c.taxid, tree)
    kept.push(c)
    stats.behalten++
  }

  kept.sort((a, b) => b.sitelinks - a.sitelinks)
  return { kept, stats }
}

async function main(): Promise<void> {
  ensureDirs()
  console.log('Schritt 2: Kandidaten beschaffen')

  console.log('  2a) Taxobox-Artikel der deutschen Wikipedia ernten ...')
  const pages = await harvestTaxoboxPages()
  console.log('      ' + pages.length + ' Artikel mit Wikidata-ID')

  const titles = new Map<string, string>()
  for (const p of pages) if (!titles.has(p.qid)) titles.set(p.qid, p.title)
  const allQids = [...titles.keys()]

  console.log('  2b) Wikidata gezielt nach diesen ' + allQids.length + ' Items fragen ...')
  const rows: SparqlBinding[] = []
  for (let i = 0; i < allQids.length; i += BATCH) {
    const batch = allQids.slice(i, i + BATCH)
    rows.push(...(await sparql(buildQuery(batch))))
    const done = Math.min(i + BATCH, allQids.length)
    process.stderr.write('\r      ' + done + '/' + allQids.length + ' Items, ' + rows.length + ' Zeilen   ')
  }
  process.stderr.write('\n')

  const merged = mergeRows(rows, titles)
  console.log('      ' + merged.size + ' Items mit NCBI-Taxon-ID')

  console.log('  2c) Auf Tiere filtern ...')
  const tree = await loadTree()
  const { kept, stats } = filterToAnimals(merged, tree)
  console.log('      NCBI kennt Taxon-ID nicht:            ' + stats.unbekannteTaxid)
  console.log('      kein Tier (Pflanze, Pilz, Bakterium): ' + stats.keinTier)
  console.log('      unter der Sitelink-Grenze:            ' + stats.zuUnbekannt)
  console.log('      per Blockliste ausgeschlossen:        ' + stats.blockiert)
  console.log('      behalten:                             ' + stats.behalten)

  // Der Messpunkt aus dem Plan: wie viele Kandidaten sind wirklich brauchbar?
  const hatDe = (c: Candidate) => Boolean(c.nameDe ?? c.labelDe)
  const hatEn = (c: Candidate) => Boolean(c.nameEn ?? c.labelEn)
  const arten = kept.filter((c) => c.rank === 'species' || c.rank === 'subspecies')
  const spielbar = arten.filter((c) => hatDe(c) && hatEn(c) && c.image)

  console.log('')
  console.log('  MESSPUNKT (entscheidet ueber die Poolgroesse):')
  console.log('    Tiere gesamt:                      ' + kept.length)
  console.log('    davon Rang Art/Unterart:           ' + arten.length)
  console.log('    mit deutschem Namen:               ' + kept.filter(hatDe).length)
  console.log('    mit englischem Namen:              ' + kept.filter(hatEn).length)
  console.log('    mit Bild:                          ' + kept.filter((c) => c.image).length)
  console.log('    Arten mit deutsch + englisch + Bild: ' + spielbar.length + '   <-- realistischer Pool')

  console.log('')
  console.log('  Die 30 bekanntesten spielbaren Tiere:')
  for (const c of spielbar.slice(0, 30)) {
    const name = (c.nameDe ?? c.labelDe ?? '-').padEnd(26)
    const sci = (c.sci ?? '-').padEnd(28)
    console.log('    ' + String(c.sitelinks).padStart(4) + '  ' + name + sci + c.rank)
  }

  writeJson(path.join(PATHS.work, 'candidates.json'), kept)
  console.log('')
  console.log('  Geschrieben: data/work/candidates.json (' + kept.length + ' Kandidaten)')
  console.log('Schritt 2 fertig.')
}

main().catch((err) => {
  console.error('\nSchritt 2 fehlgeschlagen:', err)
  process.exit(1)
})
