/**
 * Schritt 4: Spielbaum bauen.
 *
 * Aus dem NCBI-Baum wird der von den Spieltieren aufgespannte Teilbaum
 * herausgeschnitten, zusammengefaltet und zweisprachig benannt.
 *
 * Zum Zusammenfalten: Ein Knoten mit nur einem Kind kann nie der tiefste
 * gemeinsame Vorfahre zweier verschiedener Tiere sein, denn dafuer braeuchte er
 * zwei Aeste. Sein Wegfall aendert also keine einzige Spielantwort, macht die
 * Schrittzahlen aber aussagekraeftig: jeder Schritt ist dann eine echte
 * Verzweigung. Die weggefalteten Namen bleiben als Zusatzinfo erhalten, damit
 * der Ergebnisschirm den vollstaendigen Pfad zeigen kann.
 *
 * Ergebnis: data/work/tree.json
 */
import path from 'node:path'
import { CONFIG } from './config.ts'
import { PATHS, ensureDirs, readJson, writeJson, readOverride } from './paths.ts'
import { loadTree, loadNames, lineage, rankOf, type TaxNames } from './ncbi.ts'
import { sparql, val } from './sparql.ts'
import type { PoolAnimal } from './3-enrich.ts'

export interface BuiltNode {
  taxid: number
  parent: number
  rank: string
  sci: string
  de: string
  en: string
  /** Wissenschaftliche Namen der weggefalteten Zwischenstufen ueber diesem Knoten. */
  collapsed: string[]
}

export interface BuiltTree {
  nodes: BuiltNode[]
  /** Taxon-ID eines Spieltiers auf seinen Knotenindex. */
  leafIndex: Record<string, number>
}

interface CladeOverride {
  taxid: number
  de?: string
  en?: string
}

/** Deutsche Namen fuer Taxa, gezielt ueber die NCBI-ID abgefragt. */
async function fetchCladeNames(taxids: readonly number[]): Promise<Map<number, { de?: string; en?: string }>> {
  const out = new Map<number, { de?: string; en?: string }>()
  const BATCH = 300

  for (let i = 0; i < taxids.length; i += BATCH) {
    const batch = taxids.slice(i, i + BATCH)
    const query = [
      'SELECT ?ncbi ?nameDe ?nameEn ?labelDe ?labelEn WHERE {',
      '  VALUES ?ncbi { ' + batch.map((t) => '"' + t + '"').join(' ') + ' }',
      '  ?item wdt:P685 ?ncbi .',
      '  OPTIONAL { ?item wdt:P1843 ?nameDe . FILTER(LANG(?nameDe) = "de") }',
      '  OPTIONAL { ?item wdt:P1843 ?nameEn . FILTER(LANG(?nameEn) = "en") }',
      '  OPTIONAL { ?item rdfs:label ?labelDe . FILTER(LANG(?labelDe) = "de") }',
      '  OPTIONAL { ?item rdfs:label ?labelEn . FILTER(LANG(?labelEn) = "en") }',
      '}',
    ].join('\n')

    for (const row of await sparql(query)) {
      const taxid = Number(val(row, 'ncbi'))
      if (!Number.isFinite(taxid)) continue
      const entry = out.get(taxid) ?? {}
      const de = val(row, 'nameDe') ?? val(row, 'labelDe')
      const en = val(row, 'nameEn') ?? val(row, 'labelEn')
      // Der kuerzeste Trivialname passt am besten in eine Rueckmeldung.
      if (de && (!entry.de || de.length < entry.de.length)) entry.de = de
      if (en && (!entry.en || en.length < entry.en.length)) entry.en = en
      out.set(taxid, entry)
    }
    process.stderr.write('\r  Kladennamen: ' + Math.min(i + BATCH, taxids.length) + '/' + taxids.length + '   ')
  }
  process.stderr.write('\n')
  return out
}

/**
 * Ein Label taugt nur als Trivialname, wenn es sich vom wissenschaftlichen Namen
 * unterscheidet. Wikidata setzt als deutsches Label oft einfach das Latein ein.
 */
function usableCommonName(name: string | undefined, sci: string): string {
  if (!name) return ''
  const n = name.trim()
  if (!n || n === sci) return ''
  if (n.toLowerCase() === sci.toLowerCase()) return ''
  return n
}

async function main(): Promise<void> {
  ensureDirs()
  console.log('Schritt 4: Spielbaum bauen')

  const pool = readJson<PoolAnimal[]>(path.join(PATHS.work, 'pool.json'))
  console.log('  ' + pool.length + ' Spieltiere')

  const tree = await loadTree()

  // 1) Alle Pfade von den Spieltieren bis Metazoa vereinigen.
  const keep = new Set<number>()
  const leafTaxids = new Set(pool.map((p) => p.taxid))
  for (const p of pool) {
    for (const t of lineage(p.taxid, tree)) {
      keep.add(t)
      if (t === CONFIG.METAZOA_TAXID) break
    }
  }
  console.log('  Induzierter Teilbaum: ' + keep.size + ' Knoten vor dem Zusammenfalten')

  // 2) Kinder zaehlen, aber nur innerhalb des Teilbaums.
  const children = new Map<number, number[]>()
  for (const t of keep) {
    if (t === CONFIG.METAZOA_TAXID) continue
    const p = tree.parent[t]
    if (!keep.has(p)) continue
    const list = children.get(p)
    if (list) list.push(t)
    else children.set(p, [t])
  }

  // 3) Zusammenfalten: Knoten mit genau einem Kind fallen weg, ihr Name wandert
  //    als Zwischenstufe an das ueberlebende Kind.
  const collapsedNames = new Map<number, number[]>()
  const effectiveParent = new Map<number, number>()

  for (const t of keep) {
    if (t === CONFIG.METAZOA_TAXID) continue
    let p = tree.parent[t]
    const gefaltet: number[] = []
    while (p !== CONFIG.METAZOA_TAXID && keep.has(p) && (children.get(p)?.length ?? 0) === 1 && !leafTaxids.has(p)) {
      gefaltet.push(p)
      p = tree.parent[p]
    }
    effectiveParent.set(t, p)
    if (gefaltet.length > 0) collapsedNames.set(t, gefaltet)
  }

  const survivors = new Set<number>([CONFIG.METAZOA_TAXID])
  for (const t of keep) {
    if (t === CONFIG.METAZOA_TAXID) continue
    const istBlatt = leafTaxids.has(t)
    const kinderzahl = children.get(t)?.length ?? 0
    if (istBlatt || kinderzahl >= 2) survivors.add(t)
  }
  console.log('  Nach dem Zusammenfalten: ' + survivors.size + ' Knoten')

  // 4) Reihenfolge festlegen: Eltern immer vor ihren Kindern (Breitensuche).
  const survivorChildren = new Map<number, number[]>()
  for (const t of survivors) {
    if (t === CONFIG.METAZOA_TAXID) continue
    let p = effectiveParent.get(t) ?? tree.parent[t]
    while (p !== CONFIG.METAZOA_TAXID && !survivors.has(p)) p = effectiveParent.get(p) ?? tree.parent[p]
    const list = survivorChildren.get(p)
    if (list) list.push(t)
    else survivorChildren.set(p, [t])
  }

  const order: number[] = []
  const parentOf = new Map<number, number>()
  const queue: number[] = [CONFIG.METAZOA_TAXID]
  parentOf.set(CONFIG.METAZOA_TAXID, -1)
  while (queue.length > 0) {
    const t = queue.shift()!
    order.push(t)
    for (const c of survivorChildren.get(t) ?? []) {
      parentOf.set(c, t)
      queue.push(c)
    }
  }
  if (order.length !== survivors.size) {
    throw new Error('Der Baum ist nicht zusammenhaengend: ' + order.length + ' von ' + survivors.size + ' erreichbar.')
  }

  // 5) Benennen. Englisch kommt von NCBI, Deutsch von Wikidata, Handuebersetzungen
  //    aus overrides/clades.json haben immer Vorrang.
  const alleTaxids = new Set<number>(order)
  for (const list of collapsedNames.values()) for (const t of list) alleTaxids.add(t)

  console.log('  Namen aus names.dmp lesen ...')
  const ncbiNames: Map<number, TaxNames> = await loadNames(alleTaxids)

  const internal = order.filter((t) => !leafTaxids.has(t))
  console.log('  Deutsche Kladennamen von Wikidata holen (' + internal.length + ' Knoten) ...')
  const wikidataNames = await fetchCladeNames(internal)

  const overrides = new Map<number, CladeOverride>(
    readOverride<{ clades: CladeOverride[] }>('clades.json', { clades: [] }).clades.map((c) => [c.taxid, c]),
  )
  const poolByTaxid = new Map(pool.map((p) => [p.taxid, p]))

  const index = new Map<number, number>()
  order.forEach((t, i) => index.set(t, i))

  const nodes: BuiltNode[] = order.map((taxid, i) => {
    const sci = ncbiNames.get(taxid)?.scientific ?? String(taxid)
    const tier = poolByTaxid.get(taxid)
    const ov = overrides.get(taxid)

    // Spieltiere tragen die im Pool festgelegten Namen, damit die Anzeige zur
    // Rateliste passt. Alles andere wird aus den Quellen zusammengesucht.
    const de = tier
      ? tier.nameDe
      : usableCommonName(ov?.de ?? wikidataNames.get(taxid)?.de, sci)
    const en = tier
      ? tier.nameEn
      : usableCommonName(ov?.en ?? ncbiNames.get(taxid)?.common ?? wikidataNames.get(taxid)?.en, sci)

    return {
      taxid,
      parent: i === 0 ? -1 : (index.get(parentOf.get(taxid)!) ?? -1),
      rank: rankOf(taxid, tree),
      sci,
      de,
      en,
      collapsed: (collapsedNames.get(taxid) ?? []).map((t) => ncbiNames.get(t)?.scientific ?? String(t)),
    }
  })

  const leafIndex: Record<string, number> = {}
  for (const p of pool) {
    const i = index.get(p.taxid)
    if (i === undefined) throw new Error('Spieltier ' + p.sci + ' (' + p.taxid + ') fehlt im Baum.')
    leafIndex[String(p.taxid)] = i
  }

  const benannteDe = nodes.filter((n) => n.de).length
  const benannteEn = nodes.filter((n) => n.en).length
  console.log('  Knoten mit deutschem Namen:  ' + benannteDe + ' von ' + nodes.length)
  console.log('  Knoten mit englischem Namen: ' + benannteEn + ' von ' + nodes.length)

  const ohneDe = nodes.filter((n) => !n.de && !leafTaxids.has(n.taxid))
  if (ohneDe.length > 0) {
    console.log('  Die 20 haeufigsten Kladen ohne deutschen Namen (Kandidaten fuer overrides/clades.json):')
    const kinderzahl = (t: number) => survivorChildren.get(t)?.length ?? 0
    for (const n of [...ohneDe].sort((a, b) => kinderzahl(b.taxid) - kinderzahl(a.taxid)).slice(0, 20)) {
      console.log('    ' + String(n.taxid).padStart(8) + '  ' + n.sci.padEnd(28) + n.rank)
    }
  }

  writeJson(path.join(PATHS.work, 'tree.json'), { nodes, leafIndex } satisfies BuiltTree)
  console.log('  Geschrieben: data/work/tree.json')
  console.log('Schritt 4 fertig.')
}

main().catch((err) => {
  console.error('\nSchritt 4 fehlgeschlagen:', err)
  process.exit(1)
})
