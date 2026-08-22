/**
 * Schritt 1: NCBI-Taxonomie holen.
 *
 * Laedt taxdump.tar.gz (~65 MB), entpackt nodes.dmp, names.dmp und merged.dmp nach data/raw/
 * und prueft danach kurz, ob der Baum plausibel aussieht.
 *
 * Quelle: https://ftp.ncbi.nlm.nih.gov/pub/taxonomy/
 * Lizenz: gemeinfrei (Werk der US-Bundesregierung).
 */
import fs from 'node:fs'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import * as tar from 'tar'
import { PATHS, ensureDirs } from './paths.ts'
import { CONFIG } from './config.ts'
import { loadTree, loadNames, lineage, rankOf, NODES_FILE, NAMES_FILE } from './ncbi.ts'

const URL = 'https://ftp.ncbi.nlm.nih.gov/pub/taxonomy/taxdump.tar.gz'
const ARCHIVE = path.join(PATHS.raw, 'taxdump.tar.gz')

async function download(): Promise<void> {
  if (fs.existsSync(ARCHIVE) && fs.statSync(ARCHIVE).size > 10_000_000) {
    console.log(`  Archiv liegt schon da (${(fs.statSync(ARCHIVE).size / 1e6).toFixed(0)} MB), ueberspringe Download.`)
    return
  }
  console.log(`  Lade ${URL} ...`)
  const res = await fetch(URL, { headers: { 'User-Agent': CONFIG.HTTP.userAgent } })
  if (!res.ok || !res.body) throw new Error(`Download fehlgeschlagen: HTTP ${res.status}`)

  const total = Number(res.headers.get('content-length') ?? 0)
  let seen = 0
  const source = Readable.fromWeb(res.body as any)
  source.on('data', (chunk: Buffer) => {
    seen += chunk.length
    const pct = total ? ` (${Math.round((seen / total) * 100)}%)` : ''
    process.stderr.write(`\r  ${(seen / 1e6).toFixed(1)} MB${pct}   `)
  })
  await pipeline(source, fs.createWriteStream(ARCHIVE))
  process.stderr.write('\n')
}

async function extract(): Promise<void> {
  const needed = ['nodes.dmp', 'names.dmp', 'merged.dmp']
  if (needed.every((f) => fs.existsSync(path.join(PATHS.raw, f)))) {
    console.log('  nodes.dmp, names.dmp und merged.dmp sind schon entpackt.')
    return
  }
  console.log('  Entpacke nodes.dmp, names.dmp und merged.dmp ...')
  await tar.x({
    file: ARCHIVE,
    cwd: PATHS.raw,
    filter: (p) => needed.includes(path.basename(p)),
  })
}

async function sanityCheck(): Promise<void> {
  console.log('  Lese Baum ein ...')
  const tree = await loadTree()
  console.log(`  ${tree.count.toLocaleString('de-DE')} Taxa, hoechste Taxon-ID ${tree.maxTaxid.toLocaleString('de-DE')}`)
  console.log(`  ${tree.rankNames.length} verschiedene Raenge`)

  // Loewe (9689) muss ueber Panthera, Felidae, Carnivora bis Metazoa reichen.
  const LOEWE = 9689
  const path9689 = lineage(LOEWE, tree)
  if (!path9689.includes(CONFIG.METAZOA_TAXID)) {
    throw new Error('Der Loewe liegt nicht unterhalb von Metazoa. Der Baum ist kaputt.')
  }
  const names = await loadNames(new Set(path9689))
  console.log('  Stichprobe Loewe (Taxon 9689), Pfad zur Wurzel:')
  for (const t of path9689) {
    const n = names.get(t)
    console.log(`    ${String(t).padStart(8)}  ${rankOf(t, tree).padEnd(14)} ${n?.scientific ?? '?'}${n?.common ? `  (${n.common})` : ''}`)
  }
}

async function main(): Promise<void> {
  ensureDirs()
  console.log('Schritt 1: NCBI-Taxonomie')
  await download()
  await extract()
  for (const f of [NODES_FILE, NAMES_FILE]) {
    console.log(`  ${path.basename(f)}: ${(fs.statSync(f).size / 1e6).toFixed(0)} MB`)
  }
  await sanityCheck()
  console.log('Schritt 1 fertig.')
}

main().catch((err) => {
  console.error('\nSchritt 1 fehlgeschlagen:', err)
  process.exit(1)
})
