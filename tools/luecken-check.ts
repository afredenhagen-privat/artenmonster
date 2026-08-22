/**
 * Sucht bekannte Tiere, die der Pipeline durchs Raster fallen.
 *
 * Der Join zwischen Wikidata und der NCBI-Systematik haengt an der Eigenschaft
 * P685, der NCBI-Taxon-ID. Fehlt sie am Wikidata-Item, sieht die Pipeline das
 * Tier nicht — und das trifft ausgerechnet bekannte Arten. Haushund, Hauskatze
 * und Hauspferd waren so betroffen und mussten von Hand nachgetragen werden;
 * das Steppenzebra, das gewoehnliche Zebra schlechthin, fiel erst beim Spielen
 * auf, weil bei der Eingabe "Zebra" keines kam.
 *
 * Dieses Werkzeug findet solche Luecken, statt darauf zu warten, dass jemand
 * darueber stolpert.
 *
 * Gefragt wird nicht Wikidata nach allen Arten ohne P685 — dieser Scan laeuft
 * zuverlaessig in den 60-Sekunden-Timeout des Query Service. Ausgangspunkt ist
 * stattdessen dieselbe Liste, aus der auch die Kandidaten stammen: die Artikel
 * der deutschen Wikipedia mit Taxobox. Wer dort steht, aber nicht unter den
 * Kandidaten, hat die Verknuepfung nicht ueberstanden. Diese Items werden
 * gezielt abgefragt, im lokalen NCBI-Namensindex nachgeschlagen und nach echten
 * Abrufzahlen sortiert.
 *
 * Aufruf: npx tsx tools/luecken-check.ts
 * Ergebnis: eine Liste, dazu fertige Zeilen fuer tools/overrides/animals.json
 */
import fs from 'node:fs'
import path from 'node:path'
import { CONFIG } from './config.ts'
import { PATHS, readJson, readOverride } from './paths.ts'
import { progress } from './http.ts'
import { sparql, val, qid } from './sparql.ts'
import { harvestTaxoboxPages } from './wikipedia.ts'
import { loadTree, loadScientificIndex, isDescendantOf, rankOf } from './ncbi.ts'
import { fetchPageviews } from './pageviews.ts'
import type { Candidate } from './2-fetch-wikidata.ts'

/** Items je Abfrage. Klein genug, dass keine in den Timeout laeuft. */
const BATCH = 400

/**
 * Ab wie vielen Sprachversionen ueberhaupt hingeschaut wird.
 *
 * Sitelinks messen Bekanntheit schlecht, dafuer stehen sie ohne weiteren Abruf
 * zur Verfuegung. Sie taugen deshalb als grobes Vorsieb; die Reihenfolge macht
 * danach die Abrufzahl.
 */
const MIN_SITELINKS = 35

/** Hoechstens so viele Tiere kommen in die Abrufzahlen-Runde. */
const MAX_ABRUFE = 900

interface Luecke {
  qid: string
  taxid: number
  sci: string
  titel: string
  sitelinks: number
  aufrufe: number
}

function abfrage(qids: readonly string[]): string {
  return [
    'SELECT ?item ?sitelinks ?sci WHERE {',
    '  VALUES ?item { ' + qids.map((q) => 'wd:' + q).join(' ') + ' }',
    '  ?item wikibase:sitelinks ?sitelinks .',
    '  OPTIONAL { ?item wdt:P225 ?sci }',
    '}',
  ].join('\n')
}

async function main(): Promise<void> {
  console.log('Luecken-Check: bekannte Tiere ohne NCBI-Verknuepfung in Wikidata')

  const seiten = await harvestTaxoboxPages()
  const kandidatenQids = new Set<string>(
    readJson<Candidate[]>(path.join(PATHS.work, 'candidates.json')).map((c) => c.qid),
  )
  const imBaum = new Set<number>(
    readJson<{ nodes: Array<[number, ...unknown[]]> }>(path.join(PATHS.out, 'tree.json')).nodes.map((n) => n[0]),
  )
  const schonNachgetragen = new Set<number>(
    readOverride<{ animals: Array<{ taxid: number }> }>('animals.json', { animals: [] }).animals.map((o) => o.taxid),
  )

  const offen = seiten.filter((s) => !kandidatenQids.has(s.qid))
  console.log(
    '  ' +
      seiten.length +
      ' Artikel mit Taxobox, ' +
      kandidatenQids.size +
      ' davon verknuepft, ' +
      offen.length +
      ' nicht (darunter Pflanzen, Pilze und hoehere Raenge)',
  )

  console.log('  Sprachversionen und wissenschaftliche Namen dazu holen ...')
  const titelZu = new Map(offen.map((s) => [s.qid, s.title]))
  const roh: Array<{ qid: string; sci: string; titel: string; sitelinks: number }> = []
  for (let i = 0; i < offen.length; i += BATCH) {
    const teil = offen.slice(i, i + BATCH).map((s) => s.qid)
    for (const zeile of await sparql(abfrage(teil))) {
      const q = qid(val(zeile, 'item'))
      const sci = val(zeile, 'sci')
      const titel = q ? titelZu.get(q) : undefined
      const sitelinks = Number(val(zeile, 'sitelinks') ?? 0)
      if (!q || !sci || !titel || sitelinks < MIN_SITELINKS) continue
      roh.push({ qid: q, sci, titel, sitelinks })
    }
    process.stderr.write('\r  Abfrage ' + Math.ceil((i + BATCH) / BATCH) + ' von ' + Math.ceil(offen.length / BATCH) + ', ' + roh.length + ' im Vorsieb   ')
  }
  process.stderr.write('\n')

  console.log('  Taxon-IDs im lokalen NCBI-Namensindex nachschlagen ...')
  const namensIndex = await loadScientificIndex()
  const tree = await loadTree()

  const luecken: Luecke[] = []
  let ohneTaxid = 0
  let keinTier = 0
  let falscherRang = 0
  for (const e of roh) {
    const taxid = namensIndex.get(e.sci.toLowerCase())
    if (taxid === undefined) {
      ohneTaxid++
      continue
    }
    if (imBaum.has(taxid) || schonNachgetragen.has(taxid)) continue
    if (!isDescendantOf(taxid, CONFIG.METAZOA_TAXID, tree)) {
      keinTier++
      continue
    }
    const rang = rankOf(taxid, tree)
    if (rang !== 'species' && rang !== 'subspecies') {
      falscherRang++
      continue
    }
    luecken.push({ ...e, taxid, aufrufe: 0 })
  }
  console.log(
    '  ' +
      luecken.length +
      ' Tiere uebrig (' +
      ohneTaxid +
      ' ohne NCBI-Eintrag, ' +
      keinTier +
      ' keine Tiere, ' +
      falscherRang +
      ' ueber Artebene)',
  )
  if (luecken.length === 0) return

  luecken.sort((a, b) => b.sitelinks - a.sitelinks)
  const zuPruefen = luecken.slice(0, MAX_ABRUFE)
  if (luecken.length > MAX_ABRUFE) {
    console.log('  Abrufzahlen nur fuer die ' + MAX_ABRUFE + ' mit den meisten Sprachversionen')
  }

  const aufrufe = await fetchPageviews(
    zuPruefen.map((k) => k.titel),
    progress('Abrufzahlen'),
  )
  for (const k of zuPruefen) k.aufrufe = aufrufe.get(k.titel)?.gesamt ?? 0
  zuPruefen.sort((a, b) => b.aufrufe - a.aufrufe)

  console.log('')
  console.log('  Abrufe/Jahr  Sprachen  Taxon-ID  Artikel')
  console.log('  ' + '-'.repeat(78))
  for (const k of zuPruefen.slice(0, 40)) {
    console.log(
      '  ' +
        String(k.aufrufe).padStart(11) +
        String(k.sitelinks).padStart(10) +
        String(k.taxid).padStart(10) +
        '  ' +
        k.titel +
        ' (' +
        k.sci +
        ')',
    )
  }

  /*
   * Die Schwelle ist das schwaechste Tier, das es in den Rateraum geschafft hat.
   * Wer bekannter ist als das und trotzdem fehlt, gehoert hinein — die Auswahl
   * nach Quote entscheidet danach ohnehin selbst.
   *
   * Die Zeilen sind gueltiges JSON, die Datei vertraegt keine Kommentare.
   * "_name" wird von der Pipeline ignoriert und steht nur zum Lesen da.
   */
  // pool.json ist eine flache Liste, kein Objekt mit Feld.
  const scores = readJson<Array<{ score: number }>>(path.join(PATHS.work, 'pool.json')).map((a) => a.score)
  const schwelle = scores.length > 0 ? Math.min(...scores) : 0
  const vorschlag = zuPruefen.filter((k) => k.aufrufe >= schwelle)
  if (vorschlag.length > 0) {
    console.log('')
    console.log('  Zeilen fuer tools/overrides/animals.json (ab ' + schwelle + ' Abrufen im Jahr):')
    for (const k of vorschlag) {
      console.log(
        '    { "taxid": ' + k.taxid + ', "qid": "' + k.qid + '", "_name": "' + k.titel + '" },',
      )
    }
  }

  const bericht = path.join(PATHS.work, 'luecken.json')
  fs.writeFileSync(bericht, JSON.stringify(zuPruefen, null, 2), 'utf8')
  console.log('')
  console.log('  Vollstaendige Liste: ' + bericht)
}

main().catch((err) => {
  console.error('\nLuecken-Check fehlgeschlagen:', err)
  process.exit(1)
})
