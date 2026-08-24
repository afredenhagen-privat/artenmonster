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
import { progress } from './http.ts'
import { fetchExtracts, shorten } from './wikipedia.ts'
import { merkmalsSaetze } from '../src/core/tipps.ts'
import { fetchImageInfo, type CommonsInfo } from './commons.ts'
import { fetchPageviews, schaetzerAusSitelinks } from './pageviews.ts'
import { loadTree, isDescendantOf, rankOf, type TaxTree } from './ncbi.ts'
import { sparql, val, qid } from './sparql.ts'
import type { Candidate } from './2-fetch-wikidata.ts'

export interface PoolAnimal {
  taxid: number
  qid: string
  sci: string
  nameDe: string
  nameEn: string
  /** Bekanntheit, gemessen an den Wikipedia-Abrufen des letzten Jahres. */
  score: number
  /** Zahl der Wikipedia-Sprachversionen. Nur noch zur Einordnung, nicht zur Wertung. */
  sitelinks: number
  /** true, wenn der Wert aus den Sprachversionen geschaetzt wurde. */
  geschaetzt?: boolean
  /** Rang laut NCBI, "species" oder "subspecies". */
  rang: string
  tier: TierId
  titleDe: string
  titleEn?: string
  image?: CommonsInfo
  blurbDe?: { text: string; url: string }
  blurbEn?: { text: string; url: string }
  /** Merkmalshinweise: Saetze aus dem Anriss, in denen der Name nicht vorkommt. */
  tippsDe?: string[]
  tippsEn?: string[]
}

interface AnimalOverride {
  taxid: number
  /** Nur noetig, wenn das Tier gar nicht unter den Kandidaten ist und nachgetragen wird. */
  qid?: string
  nameDe?: string
  nameEn?: string
  /** true blendet das Tier aus, auch wenn es sonst durchkaeme. */
  drop?: boolean
  tier?: TierId
  /** Erlaubt, dass dieses Tier ueber oder unter einem anderen spielbaren liegt. */
  allowNested?: boolean
}

/**
 * Holt Tiere nach, die Wikidata nicht mit einer NCBI-Taxon-ID verknuepft hat.
 *
 * Das betrifft ausgerechnet die bekanntesten: Haushund, Hauskatze, Hausrind,
 * Hauspferd, Hausschaf und Hausziege haben kein P685. Der Haushund hat 332
 * Wikipedia-Sprachversionen, mehr als der Loewe. Ohne diesen Nachtrag fehlten
 * sie im Spiel komplett.
 */
async function fetchNachtraege(overrides: readonly AnimalOverride[]): Promise<Candidate[]> {
  const mitQid = overrides.filter((o) => o.qid && !o.drop)
  if (mitQid.length === 0) return []

  const query = [
    'SELECT ?item ?sitelinks ?sci ?nameDe ?nameEn ?labelDe ?labelEn ?img ?deTitle ?enTitle WHERE {',
    '  VALUES ?item { ' + mitQid.map((o) => 'wd:' + o.qid).join(' ') + ' }',
    '  ?item wikibase:sitelinks ?sitelinks .',
    '  OPTIONAL { ?item wdt:P225 ?sci }',
    '  OPTIONAL { ?item wdt:P1843 ?nameDe . FILTER(LANG(?nameDe) = "de") }',
    '  OPTIONAL { ?item wdt:P1843 ?nameEn . FILTER(LANG(?nameEn) = "en") }',
    '  OPTIONAL { ?item rdfs:label ?labelDe . FILTER(LANG(?labelDe) = "de") }',
    '  OPTIONAL { ?item rdfs:label ?labelEn . FILTER(LANG(?labelEn) = "en") }',
    '  OPTIONAL { ?item wdt:P18 ?img }',
    '  OPTIONAL { ?a schema:about ?item ; schema:isPartOf <https://de.wikipedia.org/> ; schema:name ?deTitle }',
    '  OPTIONAL { ?b schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> ; schema:name ?enTitle }',
    '}',
  ].join('\n')

  const nachTaxid = new Map<string, number>(mitQid.map((o) => [o.qid!, o.taxid]))
  const gebaut = new Map<string, Candidate>()

  for (const row of await sparql(query)) {
    const q = qid(val(row, 'item'))
    if (!q) continue
    const taxid = nachTaxid.get(q)
    if (taxid === undefined) continue

    let c = gebaut.get(q)
    if (!c) {
      c = { qid: q, taxid, sitelinks: Number(val(row, 'sitelinks') ?? 0), titleDe: '' }
      gebaut.set(q, c)
    }
    c.titleDe ||= val(row, 'deTitle') ?? ''
    c.titleEn ??= val(row, 'enTitle')
    c.sci ??= val(row, 'sci')
    c.nameDe ??= val(row, 'nameDe')
    c.nameEn ??= val(row, 'nameEn')
    c.labelDe ??= val(row, 'labelDe')
    c.labelEn ??= val(row, 'labelEn')
    if (!c.image) {
      const img = val(row, 'img')
      if (img) c.image = decodeURIComponent(img.split('/').pop() ?? '')
    }
  }

  return [...gebaut.values()]
}

/** Aus "Wolf (Begriffsklaerung)" wird "Wolf". */
function ohneKlammerzusatz(name: string | undefined): string {
  return name ? name.replace(/\s*\([^)]*\)\s*$/, '').trim() : ''
}

/**
 * Der Titel des Wikipedia-Artikels ist die mit Abstand beste Namensquelle.
 *
 * Wikidatas Trivialnamen (P1843) sind eine ungeordnete Sammlung: fuer Sus scrofa
 * steht dort unter anderem "Keiler", was aber nur das maennliche Wildschwein
 * meint, und fuer Canis lupus "Wolfe". Der Artikeltitel dagegen ist genau der
 * Name, unter dem die Art im Deutschen gefuehrt wird, und er existiert auch
 * dort, wo Wikidata gar keinen Trivialnamen kennt.
 *
 * Reihenfolge: Artikeltitel, dann Trivialname, dann Label. Ein Name, der nur
 * der wissenschaftliche Name ist, zaehlt nicht als Trivialname.
 */
function pickName(c: Candidate, lang: 'de' | 'en'): string {
  const kandidaten =
    lang === 'de'
      ? [c.titleDe, c.nameDe, c.labelDe]
      : [c.titleEn, c.nameEn, c.labelEn]

  const sci = (c.sci ?? '').toLowerCase()
  for (const roh of kandidaten) {
    const name = ohneKlammerzusatz(roh)
    if (name && name.toLowerCase() !== sci) return name
  }

  /*
   * Im Englischen darf der wissenschaftliche Name einspringen.
   *
   * Die englische Wikipedia fuehrt Insekten fast immer unter dem lateinischen
   * Namen, waehrend die deutsche einen Trivialnamen bildet: Lasius flavus heisst
   * auf Deutsch Gelbe Wiesenameise und auf Englisch eben Lasius flavus. Das als
   * fehlenden Namen zu werten hat 2327 Insekten aussortiert, darunter 699 Kaefer
   * und 39 Ameisen. Bei Voegeln traf es nur vier.
   *
   * Im Deutschen bleibt es bei der strengen Regel: Ein Spiel, in dem man
   * Carabus auronitens eintippen muss, macht keinen Spass.
   */
  if (lang === 'en') {
    const latein = ohneKlammerzusatz(c.titleEn) || (c.sci ?? '')
    if (latein) return latein
  }
  return ''
}

/**
 * Verteilt die Plaetze auf die Grossgruppen und fuellt den Rest global auf.
 *
 * Jede Gruppe bekommt ihre Plaetze nach eigener Bekanntheitsreihenfolge. Eine
 * Gruppe, die ihr Ziel nicht fuellen kann, gibt die uebrigen Plaetze an die
 * globale Auffuellung ab.
 */
function waehleMitQuote(
  verfuegbar: readonly PoolAnimal[],
  tree: TaxTree,
  gesamt: number,
  stats: Record<string, number>,
): PoolAnimal[] {
  const gewaehlt = new Set<number>()
  const ergebnis: PoolAnimal[] = []

  for (const gruppe of CONFIG.GRUPPEN) {
    let n = 0
    for (const tier of verfuegbar) {
      if (n >= gruppe.ziel || ergebnis.length >= gesamt) break
      if (gewaehlt.has(tier.taxid)) continue
      if (!isDescendantOf(tier.taxid, gruppe.taxid, tree)) continue
      gewaehlt.add(tier.taxid)
      ergebnis.push(tier)
      n++
    }
    stats['gruppe_' + gruppe.name] = n
  }

  for (const tier of verfuegbar) {
    if (ergebnis.length >= gesamt) break
    if (gewaehlt.has(tier.taxid)) continue
    gewaehlt.add(tier.taxid)
    ergebnis.push(tier)
  }

  // Nach Bekanntheit sortiert, denn danach werden gleich die Stufen geschnitten.
  return ergebnis.sort((a, b) => b.score - a.score || a.sci.localeCompare(b.sci))
}

/**
 * Waehlt den Rateraum aus. Regeln der Reihe nach:
 * Rang Art oder Unterart, deutscher und englischer Trivialname, Bild vorhanden.
 * Bei doppelter Taxon-ID gewinnt der bekanntere Eintrag.
 */
async function buildPool(
  candidates: Candidate[],
  tree: TaxTree,
  bewerten: (kandidaten: PoolAnimal[]) => Promise<void>,
): Promise<{ pool: PoolAnimal[]; stats: Record<string, number> }> {
  const overrides = new Map<number, AnimalOverride>(
    readOverride<{ animals: AnimalOverride[] }>('animals.json', { animals: [] }).animals.map((o) => [o.taxid, o]),
  )

  const stats = { falscherRang: 0, keinNameDe: 0, keinNameEn: 0, keinBild: 0, doppelt: 0, verworfen: 0, ineinander: 0 }
  const byTaxid = new Map<number, PoolAnimal>()

  for (const c of candidates) {
    const ov = overrides.get(c.taxid)
    if (ov?.drop) {
      stats.verworfen++
      continue
    }

    const rang = c.rank ?? (c.taxid < tree.parent.length ? rankOf(c.taxid, tree) : '')
    const rangPasst = rang === 'species' || rang === 'subspecies'
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
      rang,
      sci: c.sci ?? '',
      nameDe,
      nameEn,
      score: 0,
      sitelinks: c.sitelinks,
      tier: 3,
      titleDe: c.titleDe,
      titleEn: c.titleEn,
      image: { file: c.image } as CommonsInfo,
    })
  }

  // Erst jetzt steht fest, welche Tiere ueberhaupt in Frage kommen. Die
  // Abrufzahlen werden deshalb an dieser Stelle nachgereicht, nicht frueher.
  await bewerten([...byTaxid.values()])

  const nachBekanntheit = [...byTaxid.values()].sort((a, b) => b.score - a.score || a.sci.localeCompare(b.sci))

  /*
   * Fuer die Verschachtelungspruefung kommen Arten vor Unterarten, innerhalb
   * beider Gruppen weiterhin nach Bekanntheit.
   *
   * Sonst entscheidet bei einem Konflikt allein die Bekanntheit, und die zeigt
   * gelegentlich in die falsche Richtung: Das Quagga hat als ausgestorbene
   * Unterart mehr Abrufe als das Steppenzebra, dessen Unterart es ist — und
   * verdraengte damit ausgerechnet das gewoehnliche Zebra aus dem Spiel. Wer
   * "Zebra" eingibt, meint die Art, nicht den Sonderfall. Dieselbe Regel raeumt
   * die Tiger-Unterarten weg, dort stimmte die Bekanntheit nur zufaellig schon.
   *
   * Array.prototype.sort ist stabil, die Reihenfolge nach Bekanntheit bleibt
   * innerhalb der beiden Gruppen also erhalten.
   */
  const zurPruefung = [...nachBekanntheit].sort(
    (a, b) => (a.rang === 'subspecies' ? 1 : 0) - (b.rang === 'subspecies' ? 1 : 0),
  )


  /*
   * Kein spielbares Tier darf oberhalb eines anderen liegen. Sonst waere ein
   * Tipp gleichzeitig Loesung und Gruppe: raet man den Hund, waehrend der Wolf
   * gesucht ist, waere die gemeinsame Gruppe der Wolf selbst, und die Anzeige
   * "noch 0 Verzweigungen" bei falschem Tipp ergaebe keinen Sinn.
   *
   * Der Fall ist nicht exotisch, sondern der Normalfall bei Haustieren: In der
   * NCBI-Systematik ist Canis lupus familiaris ein Nachfahre von Canis lupus.
   * Deshalb wird er automatisch aufgeloest statt den Lauf abzubrechen. Es
   * gewinnt das bekanntere Tier, das andere faellt aus dem Rateraum, bleibt im
   * Baum aber als Gruppe erhalten.
   */
  const pool: PoolAnimal[] = []
  const behalten = new Set<number>()
  const vorfahrenBehaltener = new Set<number>()

  for (const kandidat of zurPruefung) {
    if (overrides.get(kandidat.taxid)?.allowNested) {
      // Ausdruecklich erlaubte Verschachtelung, etwa Hund unter Wolf. Dieses Tier
      // wird weder geprueft noch sperrt es andere. Das Spiel meldet den Fall
      // gesondert, statt ihn als "noch 0 Verzweigungen" auszugeben.
      behalten.add(kandidat.taxid)
      pool.push(kandidat)
      continue
    }

    const vorfahren: number[] = []
    let cur = tree.parent[kandidat.taxid]
    let guard = 0
    let liegtUnterBehaltenem = false
    while (cur > 1 && guard++ < 200) {
      if (behalten.has(cur) && !overrides.get(cur)?.allowNested) {
        liegtUnterBehaltenem = true
        break
      }
      vorfahren.push(cur)
      const next = tree.parent[cur]
      if (!next || next === cur) break
      cur = next
    }

    if (liegtUnterBehaltenem || vorfahrenBehaltener.has(kandidat.taxid)) {
      stats.ineinander++
      continue
    }

    behalten.add(kandidat.taxid)
    for (const v of vorfahren) vorfahrenBehaltener.add(v)
    pool.push(kandidat)
  }

  // Die Pruefung lief nach Rang, die Auswahl laeuft wieder nach Bekanntheit.
  pool.sort((a, b) => b.score - a.score || a.sci.localeCompare(b.sci))

  // Auswahl nach Quote statt reiner Bekanntheit, damit nicht alles Vogel wird.
  const grenzen = [CONFIG.TIERS[1].size, CONFIG.TIERS[1].size + CONFIG.TIERS[2].size]
  const gesamt = grenzen[1] + CONFIG.TIERS[3].size
  const geschnitten = waehleMitQuote(pool, tree, gesamt, stats)
  geschnitten.forEach((p, i) => {
    const ov = overrides.get(p.taxid)
    p.tier = ov?.tier ?? (i < grenzen[0] ? 1 : i < grenzen[1] ? 2 : 3)
  })

  // Sicherheitsnetz gegen einen kaputten Filter weiter oben.
  for (const p of geschnitten) {
    if (!isDescendantOf(p.taxid, CONFIG.METAZOA_TAXID, tree)) {
      throw new Error(p.sci + ' (' + p.taxid + ') liegt nicht unterhalb von Metazoa.')
    }
  }

  return { pool: geschnitten, stats }
}

async function main(): Promise<void> {
  ensureDirs()
  console.log('Schritt 3: Pool festlegen und anreichern')

  const candidates = readJson<Candidate[]>(path.join(PATHS.work, 'candidates.json'))
  console.log('  ' + candidates.length + ' Kandidaten gelesen')

  const overrides = readOverride<{ animals: AnimalOverride[] }>('animals.json', { animals: [] }).animals
  const bekannt = new Set(candidates.map((c) => c.taxid))
  const nachtraege = (await fetchNachtraege(overrides)).filter((c) => !bekannt.has(c.taxid))
  if (nachtraege.length > 0) {
    console.log('  ' + nachtraege.length + ' Tiere nachgetragen, denen Wikidata die NCBI-ID schuldig bleibt:')
    for (const n of nachtraege) {
      console.log('    ' + String(n.sitelinks).padStart(4) + ' Sitelinks  ' + n.titleDe + '  (taxid ' + n.taxid + ')')
    }
  }

  const tree = await loadTree()
  const { pool, stats } = await buildPool([...nachtraege, ...candidates], tree, async (kandidaten) => {
    /*
     * Bekanntheit wird an den Wikipedia-Abrufen des letzten Jahres gemessen,
     * nicht mehr an der Zahl der Sprachversionen. Die zaehlt, wie gruendlich
     * eine Gruppe erfasst ist, und ist bei Voegeln systematisch aufgeblaeht:
     * So landeten Lachseeschwalbe (2350 Abrufe) und Rotschenkel (12837) in der
     * Stufe "Leicht", waehrend der Loewe auf 212410 kommt.
     */
    console.log('  Abrufzahlen fuer ' + kandidaten.length + ' Tiere holen (das dauert beim ersten Mal) ...')
    const aufrufe = await fetchPageviews(
      kandidaten.map((k) => k.titleDe),
      progress('Abrufzahlen'),
    )

    const mitBeidem = kandidaten
      .map((k) => ({ sitelinks: k.sitelinks, aufrufe: aufrufe.get(k.titleDe)?.gesamt ?? 0 }))
      .filter((x) => x.aufrufe > 0)
    const schaetzen = schaetzerAusSitelinks(mitBeidem)

    let ohneDaten = 0
    for (const k of kandidaten) {
      const a = aufrufe.get(k.titleDe)
      if (a && a.gesamt > 0) {
        k.score = a.gesamt
      } else {
        k.score = schaetzen(k.sitelinks)
        k.geschaetzt = true
        ohneDaten++
      }
    }
    console.log(
      '  ' + (kandidaten.length - ohneDaten) + ' mit echten Abrufzahlen, ' + ohneDaten + ' aus Sprachversionen geschaetzt',
    )
  })

  console.log('  Aussortiert:')
  console.log('    Rang weder Art noch Unterart: ' + stats.falscherRang)
  console.log('    ohne deutschen Trivialnamen:  ' + stats.keinNameDe)
  console.log('    ohne englischen Trivialnamen: ' + stats.keinNameEn)
  console.log('    ohne Bild:                    ' + stats.keinBild)
  console.log('    per Override verworfen:       ' + stats.verworfen)
  console.log('    lag im Baum unter einem bekannteren Tier: ' + stats.ineinander)
  console.log('  Verteilung auf die Grossgruppen:')
  for (const g of CONFIG.GRUPPEN) {
    const n = stats['gruppe_' + g.name] ?? 0
    console.log('    ' + g.name.padEnd(22) + String(n).padStart(5) + ' von ' + String(g.ziel).padStart(5) + ' Plaetzen')
  }
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
  const de = await fetchExtracts(
    'de',
    pool.map((p) => p.titleDe),
    progress('Steckbriefe deutsch'),
  )
  const en = await fetchExtracts(
    'en',
    pool.map((p) => p.titleEn ?? '').filter(Boolean),
    progress('Steckbriefe englisch'),
  )
  /*
   * Aus demselben Abruf kommen zwei Dinge: der gekuerzte Steckbrief fuer den
   * Ergebnisschirm und die Merkmalshinweise fuers Raten. Die Hinweise brauchen
   * mehr Text als in den Steckbrief passt, deshalb liefert fetchExtracts
   * ungekuerzt und beide Seiten nehmen sich, was sie brauchen.
   */
  const namenVon = (p: PoolAnimal) => ({
    trivial: [p.nameDe, p.nameEn],
    wissenschaftlich: [p.sci, p.sci.split(' ')[0]],
  })

  for (const p of pool) {
    const d = de.get(p.titleDe)
    if (d) {
      p.blurbDe = { ...d, text: shorten(d.text, CONFIG.BLURB_MAX_CHARS) }
      p.tippsDe = merkmalsSaetze(d.text, namenVon(p), 'de')
    }
    const e = p.titleEn ? en.get(p.titleEn) : undefined
    if (e) {
      p.blurbEn = { ...e, text: shorten(e.text, CONFIG.BLURB_MAX_CHARS) }
      p.tippsEn = merkmalsSaetze(e.text, namenVon(p), 'en')
    }
  }

  const mitDe = pool.filter((p) => p.blurbDe).length
  const mitEn = pool.filter((p) => p.blurbEn).length
  console.log('  Steckbriefe deutsch: ' + mitDe + ', englisch: ' + mitEn)
  const tippDe = pool.filter((p) => p.tippsDe?.length).length
  const tippEn = pool.filter((p) => p.tippsEn?.length).length
  console.log(
    '  Merkmalshinweise deutsch: ' +
      tippDe +
      ' Tiere (' +
      Math.round((100 * tippDe) / pool.length) +
      '%), englisch: ' +
      tippEn +
      ' (' +
      Math.round((100 * tippEn) / pool.length) +
      '%)',
  )

  writeJson(path.join(PATHS.work, 'pool.json'), pool)
  console.log('  Geschrieben: data/work/pool.json')
  console.log('Schritt 3 fertig.')
}

main().catch((err) => {
  console.error('\nSchritt 3 fehlgeschlagen:', err)
  process.exit(1)
})
