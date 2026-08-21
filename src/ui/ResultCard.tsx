import { useEffect, useState } from 'react'
import type { GameData } from '../data/load.ts'
import { imageUrl, loadBlurbs } from '../data/load.ts'
import type { GameState } from '../core/game.ts'
import type { Blurb, Lang, TierId } from '../core/types.ts'
import { t } from '../i18n/strings.ts'
import { buildShareText, copyToClipboard } from '../core/share.ts'

/**
 * Ergebnisschirm. Zeigt Loesung, Bild, Steckbrief und den vollstaendigen
 * systematischen Pfad, inklusive der Zwischenstufen, die im Spielbaum
 * weggefaltet wurden.
 */

interface Props {
  data: GameData
  state: GameState
  lang: Lang
  tier: TierId
  puzzle?: number
  onNewRound: () => void
}

export function ResultCard({ data, state, lang, tier, puzzle, onNewRound }: Props) {
  const [blurb, setBlurb] = useState<Blurb | null>(null)
  const [kopiert, setKopiert] = useState(false)
  const [bildKaputt, setBildKaputt] = useState(false)

  const animal = data.animalOfNode.get(state.targetNode)
  const eintrag = animal !== undefined ? data.animals[animal] : undefined

  useEffect(() => {
    let abgebrochen = false
    if (animal === undefined) return
    loadBlurbs(lang).then((alle) => {
      if (!abgebrochen) setBlurb(alle[String(animal)] ?? null)
    })
    return () => {
      abgebrochen = true
    }
  }, [animal, lang])

  useEffect(() => setBildKaputt(false), [state.targetNode])

  const gewonnen = state.status === 'gewonnen'
  const pfad = pfadMitZwischenstufen(data, state.targetNode, lang)

  async function teilen(): Promise<void> {
    const text = buildShareText(state, { lang, tier, puzzle })
    if (await copyToClipboard(text)) {
      setKopiert(true)
      setTimeout(() => setKopiert(false), 2200)
    }
  }

  return (
    <div
      className={
        'overflow-hidden rounded-2xl border ' +
        (gewonnen ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-slate-700 bg-slate-800/50')
      }
    >
      <div className="px-5 pt-5">
        <p className={'text-sm font-medium ' + (gewonnen ? 'text-emerald-400' : 'text-slate-400')}>
          {gewonnen ? t(lang, 'gewonnen') : t(lang, 'verloren')}
          {gewonnen && ' ' + t(lang, 'inVersuchen', { n: state.guesses.length })}
        </p>
        <h2 className="mt-1 text-2xl font-semibold text-slate-50">
          {data.tree.nameOf(state.targetNode, lang)}
        </h2>
        <p className="italic text-slate-400">{data.tree.scientificName(state.targetNode)}</p>
      </div>

      {eintrag?.image && !bildKaputt && (
        <figure className="mt-4">
          <img
            src={imageUrl(data, eintrag.image)}
            alt={data.tree.nameOf(state.targetNode, lang)}
            loading="lazy"
            onError={() => setBildKaputt(true)}
            className="h-56 w-full bg-slate-900 object-cover"
          />
          <figcaption className="px-5 py-2 text-[11px] text-slate-500">
            <a href={eintrag.image.page} target="_blank" rel="noreferrer" className="hover:text-slate-300">
              {t(lang, 'bildVon', { autor: eintrag.image.author, lizenz: eintrag.image.license })}
            </a>
          </figcaption>
        </figure>
      )}

      {bildKaputt && (
        <div className="mt-4 flex h-24 items-center justify-center bg-slate-900/60 text-sm text-slate-500">
          {t(lang, 'offline')}
        </div>
      )}

      {blurb && (
        <div className="px-5 pt-3">
          <p className="text-sm leading-relaxed text-slate-300">{blurb.text}</p>
          <p className="mt-1.5 text-[11px] text-slate-500">
            <a href={blurb.url} target="_blank" rel="noreferrer" className="hover:text-slate-300">
              {t(lang, 'mehrErfahren')}
            </a>
            {' · '}
            {t(lang, 'steckbriefQuelle')}
          </p>
        </div>
      )}

      <details className="group px-5 pt-4">
        <summary className="cursor-pointer text-sm text-slate-400 hover:text-slate-200">
          {t(lang, 'vollerPfad')}
        </summary>
        <ol className="mt-2 space-y-0.5 text-xs">
          {pfad.map((eintrag, i) => (
            <li
              key={i}
              style={{ paddingLeft: Math.min(i, 12) * 8 }}
              className={eintrag.gefaltet ? 'text-slate-600' : 'text-slate-300'}
            >
              <span className="italic">{eintrag.sci}</span>
              {eintrag.trivial && <span className="ml-2 not-italic text-slate-500">{eintrag.trivial}</span>}
            </li>
          ))}
        </ol>
      </details>

      <div className="flex flex-wrap gap-2 p-5">
        <button
          type="button"
          onClick={onNewRound}
          className="rounded-xl bg-teal-600 px-4 py-2.5 font-medium text-white transition hover:bg-teal-500"
        >
          {t(lang, 'neueRunde')}
        </button>
        <button
          type="button"
          onClick={teilen}
          className="rounded-xl border border-slate-600 px-4 py-2.5 text-slate-200 transition hover:bg-slate-700"
        >
          {kopiert ? t(lang, 'kopiert') : t(lang, 'teilen')}
        </button>
      </div>
    </div>
  )
}

interface PfadEintrag {
  sci: string
  trivial?: string
  /** Zwischenstufe, die im Spielbaum weggefaltet wurde. */
  gefaltet: boolean
}

/**
 * Systematischer Pfad von oben nach unten, angereichert um die Zwischenstufen,
 * die beim Zusammenfalten aus dem Spielbaum geflogen sind. Fuer das Spiel waren
 * sie belanglos, zum Nachlesen sind sie das Interessanteste.
 */
function pfadMitZwischenstufen(data: GameData, blatt: number, lang: Lang): PfadEintrag[] {
  const knoten = data.tree.pathToRoot(blatt).reverse()
  const out: PfadEintrag[] = []

  for (const i of knoten) {
    for (const sci of [...(data.hidden[String(i)] ?? [])].reverse()) {
      out.push({ sci, gefaltet: true })
    }
    out.push({
      sci: data.tree.scientificName(i),
      trivial: data.tree.hasCommonName(i, lang) ? data.tree.nameOf(i, lang) : undefined,
      gefaltet: false,
    })
  }
  return out
}
