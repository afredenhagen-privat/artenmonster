import type { GameData } from '../data/load.ts'
import type { GameState } from '../core/game.ts'
import type { Lang } from '../core/types.ts'
import { t } from '../i18n/strings.ts'

/**
 * Die bisherigen Tipps als Bestimmungsprotokoll, neuester zuerst.
 *
 * Jede Zeile trägt links eine Kante in der Wärmefarbe: Sie zeigt auf einen Blick,
 * wie nah der Tipp war, ohne dass man die Zahl lesen muss. Die Zahl steht
 * trotzdem daneben, im Etikettensatz.
 */

interface Props {
  data: GameData
  state: GameState
  lang: Lang
}

/** Kalt heißt viele Verzweigungen bis zur Lösung, warm heißt fast dran. */
function waerme(steps: number): { kante: string; text: string } {
  if (steps <= 1) return { kante: 'border-l-nah', text: 'text-nah' }
  if (steps === 2) return { kante: 'border-l-mittel', text: 'text-mittel' }
  if (steps === 3) return { kante: 'border-l-weit', text: 'text-weit' }
  return { kante: 'border-l-fern', text: 'text-fern' }
}

export function GuessList({ data, state, lang }: Props) {
  if (state.guesses.length === 0 && state.hints.length === 0) return null

  const besterIndex = state.guesses.reduce(
    (best, g, i) => (g.steps < state.guesses[best].steps ? i : best),
    0,
  )

  return (
    <ol className="space-y-px">
      {state.hints.map((node, i) => (
        <li
          key={'hinweis' + i}
          className="animate-aufblenden border-l-2 border-l-mittel bg-mittel/10 px-4 py-2.5"
        >
          <p className="etikett text-mittel">{t(lang, 'hinweis')}</p>
          <p className="mt-0.5 text-sm text-knochen">
            {t(lang, 'hinweisAufgedeckt', { gruppe: data.tree.nameOf(node, lang) })}
          </p>
        </li>
      ))}

      {[...state.guesses].reverse().map((g, i) => {
        const echterIndex = state.guesses.length - 1 - i
        const istBester = echterIndex === besterIndex && !g.correct
        const skala = waerme(g.steps)
        const tierKnoten = data.animals[g.animal].node
        const gruppe = data.tree.nameOf(g.lca, lang)
        const gruppeLatein = data.tree.latinIfDistinct(g.lca, lang)

        return (
          <li
            key={g.animal}
            className={
              'animate-aufblenden border-l-2 px-4 py-2.5 transition ' +
              (g.correct
                ? 'border-l-zinnober bg-zinnober/10'
                : (istBester ? 'bg-fach/60 ' : 'bg-kabinett/50 ') + skala.kante)
            }
          >
            <div className="flex items-baseline justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-tafel text-[15px] text-knochen">
                  {data.tree.nameOf(tierKnoten, lang)}
                </p>
                {data.tree.latinIfDistinct(tierKnoten, lang) && (
                  <p className="binomen truncate text-[11px] text-flechte">
                    {data.tree.latinIfDistinct(tierKnoten, lang)}
                  </p>
                )}
              </div>

              {!g.correct && (
                <span className={'shrink-0 font-etikett text-lg tabular-nums ' + skala.text}>{g.steps}</span>
              )}
            </div>

            <div className="mt-2 border-t border-linie/70 pt-2">
              {g.correct ? (
                <p className="font-etikett text-[11px] uppercase tracking-etikett text-zinnober">
                  {t(lang, 'gefunden')}
                </p>
              ) : g.insideTarget ? (
                <p className="text-[13px] text-nah">{t(lang, 'innerhalb')}</p>
              ) : (
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="etikett">{t(lang, 'gemeinsam')}</span>
                  <span className="font-tafel text-[14px] text-knochen">{gruppe}</span>
                  {gruppeLatein && <span className="binomen text-[11px] text-flechte">{gruppeLatein}</span>}
                  <span className="text-[12px] text-flechte">
                    ·{' '}
                    {g.steps === 1 ? t(lang, 'nochEinSchritt') : t(lang, 'nochSchritte', { n: g.steps })}
                  </span>
                  {istBester && (
                    <span className="etikett text-nah">· {t(lang, 'besterTipp')}</span>
                  )}
                </div>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
