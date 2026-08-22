import path from 'node:path'
import { PATHS, readJson } from './paths.ts'
import { loadTree, isDescendantOf } from './ncbi.ts'
import type { PoolAnimal } from './3-enrich.ts'

async function main(): Promise<void> {
  const pool = readJson<PoolAnimal[]>(path.join(PATHS.work, 'pool.json'))
  const tree = await loadTree()
  const stufen = [1, 2, 3] as const
  const namen = { 1: 'Leicht', 2: 'Mittel', 3: 'Schwer' }

  console.log('Stufe      Tiere   Sitelinks von–bis   Median   Beispiele')
  console.log('-'.repeat(96))
  for (const s of stufen) {
    const t = pool.filter((a) => a.tier === s).sort((a, b) => b.score - a.score)
    const werte = t.map((a) => a.score)
    const median = werte[Math.floor(werte.length / 2)]
    const bsp = [t[0], t[Math.floor(t.length / 2)], t[t.length - 1]].map((a) => a.nameDe).join(', ')
    console.log(
      (namen[s] + ' (' + s + ')').padEnd(12) +
        String(t.length).padStart(5) +
        ('   ' + werte[werte.length - 1] + '–' + werte[0]).padEnd(20) +
        String(median).padStart(7) + '   ' + bsp,
    )
  }

  const gruppen: Array<[number, string]> = [
    [8782, 'Vögel'], [40674, 'Säugetiere'], [50557, 'Insekten'], [7898, 'Fische'],
    [8504, 'Schuppenkriechtiere'], [8292, 'Amphibien'], [7777, 'Knorpelfische'],
    [6854, 'Spinnentiere'], [6681, 'Höhere Krebse'], [6447, 'Weichtiere'],
  ]
  console.log('')
  console.log('Gruppe'.padEnd(22) + 'Leicht'.padStart(8) + 'Mittel'.padStart(8) + 'Schwer'.padStart(8) + '   gesamt')
  console.log('-'.repeat(60))
  for (const [taxid, name] of gruppen) {
    const drin = pool.filter((a) => isDescendantOf(a.taxid, taxid, tree))
    const z = stufen.map((s) => drin.filter((a) => a.tier === s).length)
    console.log(name.padEnd(22) + z.map((n) => String(n).padStart(8)).join('') + String(drin.length).padStart(9))
  }

  console.log('')
  for (const s of stufen) {
    const t = pool.filter((a) => a.tier === s).sort((a, b) => b.score - a.score)
    console.log('Stufe ' + s + ' (' + namen[s] + '), Stichprobe alle 100 Plätze:')
    const zeile: string[] = []
    for (let i = 0; i < t.length; i += Math.max(1, Math.floor(t.length / 8))) {
      zeile.push(t[i].nameDe + ' (' + t[i].score + ')')
    }
    console.log('  ' + zeile.join(' · '))
    console.log('')
  }
}
main().catch((e) => { console.error(e); process.exit(1) })
