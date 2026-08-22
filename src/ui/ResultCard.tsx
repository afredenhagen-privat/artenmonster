import { useEffect, useState } from 'react'
import type { GameData } from '../data/load.ts'
import { imageUrl, loadBlurbs, textVersion } from '../data/load.ts'
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
  const taxid = data.tree.taxidOf(state.targetNode)
  const version = textVersion(data, 'blurbs.' + lang + '.json')

  useEffect(() => {
    let abgebrochen = false
    setBlurb(null)
    loadBlurbs(lang, version).then((alle) => {
      if (!abgebrochen) setBlurb(alle[String(taxid)] ?? null)
    })
    return () => {
      abgebrochen = true
    }
  }, [taxid, lang, version])

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
        'animate-aufblenden overflow-hidden border ' +
        (gewonnen ? 'border-zinnober/60 bg-zinnober/5' : 'border-linie bg-kabinett')
      }
    >
      <div className="px-5 pt-5">
        <p className={'etikett ' + (gewonnen ? 'text-zinnober' : 'text-flechte')}>
          {gewonnen ? t(lang, 'gewonnen') : t(lang, 'verloren')}
          {gewonnen && ' · ' + t(lang, 'inVersuchen', { n: state.guesses.length })}
        </p>
        <h2 className="mt-1.5 font-tafel text-[26px] leading-tight text-knochen">
          {data.tree.nameOf(state.targetNode, lang)}
        </h2>
        {data.tree.latinIfDistinct(state.targetNode, lang) && (
          <p className="binomen text-flechte">{data.tree.latinIfDistinct(state.targetNode, lang)}</p>
        )}
      </div>

      {eintrag?.image && !bildKaputt && (
        <figure className="mt-4">
          <img
            src={imageUrl(data, eintrag.image)}
            alt={data.tree.nameOf(state.targetNode, lang)}
            // Bewusst eager: Es ist das einzige Bild des Schirms und immer sichtbar,
            // sobald der Schirm erscheint. Verzoegertes Laden brachte hier nichts
            // ausser einer sichtbaren Luecke.
            decoding="async"
            onError={() => setBildKaputt(true)}
            className="h-56 w-full bg-tinte object-cover"
          />
          <figcaption className="px-5 py-2 font-etikett text-[10px] text-flechte/80">
            <a href={eintrag.image.page} target="_blank" rel="noreferrer" className="hover:text-knochen">
              {t(lang, 'bildVon', { autor: eintrag.image.author, lizenz: eintrag.image.license })}
            </a>
          </figcaption>
        </figure>
      )}

      {bildKaputt && (
        <div className="mt-4 flex h-24 items-center justify-center bg-tinte/60 text-[13px] text-flechte">
          {t(lang, 'offline')}
        </div>
      )}

      {blurb && (
        <div className="px-5 pt-3">
          <p className="font-tafel text-[14px] leading-relaxed text-knochen/90">{blurb.text}</p>
          <p className="mt-2 font-etikett text-[10px] text-flechte/80">
            <a href={blurb.url} target="_blank" rel="noreferrer" className="hover:text-knochen">
              {t(lang, 'mehrErfahren')}
            </a>
            {' · '}
            {t(lang, blurb.lang && blurb.lang !== lang ? 'steckbriefQuelleFremd' : 'steckbriefQuelle')}
          </p>
        </div>
      )}

      <details className="group px-5 pt-4">
        <summary className="etikett cursor-pointer hover:text-knochen">
          {t(lang, 'vollerPfad')}
        </summary>
        <ol className="mt-2 space-y-0.5 text-xs">
          {pfad.map((eintrag, i) => (
            <li
              key={i}
              style={{ paddingLeft: Math.min(i, 14) * 7 }}
              className={eintrag.gefaltet ? 'text-flechte/50' : 'text-knochen/80'}
            >
              <span className="binomen">{eintrag.sci}</span>
              {eintrag.trivial && <span className="ml-2 font-sans text-flechte">{eintrag.trivial}</span>}
            </li>
          ))}
        </ol>
      </details>

      <div className="flex flex-wrap gap-2 p-5">
        <button
          type="button"
          onClick={onNewRound}
          className="border border-nah bg-nah/15 px-4 py-2.5 font-etikett text-[11px] uppercase tracking-etikett text-nah transition hover:bg-nah hover:text-tinte"
        >
          {t(lang, 'neueRunde')}
        </button>
        <button
          type="button"
          onClick={teilen}
          className="border border-linie px-4 py-2.5 font-etikett text-[11px] uppercase tracking-etikett text-flechte transition hover:border-flechte hover:text-knochen"
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
      trivial: data.tree.latinIfDistinct(i, lang) ? data.tree.nameOf(i, lang) : undefined,
      gefaltet: false,
    })
  }
  return out
}
