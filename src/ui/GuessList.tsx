import type { GameData } from '../data/load.ts'
import type { GameState } from '../core/game.ts'
import type { Lang } from '../core/types.ts'
import { t } from '../i18n/strings.ts'
import { feldFuer } from '../core/share.ts'

/**
 * Liste der bisherigen Tipps, neuester zuerst.
 * Jede Zeile nennt die gemeinsame Gruppe und wie weit es von dort noch ist.
 */

interface Props {
  data: GameData
  state: GameState
  lang: Lang
}

export function GuessList({ data, state, lang }: Props) {
  if (state.guesses.length === 0 && state.hints.length === 0) return null

  const bester = state.guesses.reduce<number>(
    (best, g, i) => (g.steps < state.guesses[best].steps ? i : best),
    0,
  )

  return (
    <div className="space-y-2">
      {state.hints.map((node, i) => (
        <div
          key={'hinweis' + i}
          className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200"
        >
          <span className="mr-2 font-medium uppercase tracking-wide text-amber-400/80 text-[10px]">
            {t(lang, 'hinweis')}
          </span>
          {t(lang, 'hinweisAufgedeckt', { gruppe: data.tree.nameOf(node, lang) })}
        </div>
      ))}

      {[...state.guesses].reverse().map((g, i) => {
        const echterIndex = state.guesses.length - 1 - i
        const istBester = echterIndex === bester && !g.correct
        const gruppe = data.tree.nameOf(g.lca, lang)
        const gruppeLatein = data.tree.hasCommonName(g.lca, lang) ? data.tree.scientificName(g.lca) : null

        return (
          <div
            key={g.animal}
            className={
              'rounded-xl border px-4 py-3 transition ' +
              (g.correct
                ? 'border-emerald-500/60 bg-emerald-500/10'
                : istBester
                  ? 'border-teal-500/50 bg-slate-800/80'
                  : 'border-slate-700 bg-slate-800/40')
            }
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium text-slate-100">
                  {data.tree.nameOf(data.animals[g.animal].node, lang)}
                </p>
                <p className="truncate text-xs italic text-slate-500">
                  {data.tree.scientificName(data.animals[g.animal].node)}
                </p>
              </div>
              <span className="shrink-0 text-lg" aria-hidden>
                {feldFuer(g.steps)}
              </span>
            </div>

            <div className="mt-2 border-t border-slate-700/60 pt-2 text-sm">
              {g.correct ? (
                <span className="font-medium text-emerald-300">{t(lang, 'gefunden')}</span>
              ) : (
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="text-[10px] uppercase tracking-wide text-slate-500">
                    {t(lang, 'gemeinsam')}
                  </span>
                  <span className="font-medium text-teal-300">{gruppe}</span>
                  {gruppeLatein && <span className="text-xs italic text-slate-500">{gruppeLatein}</span>}
                  <span className="text-slate-400">
                    ·{' '}
                    {g.steps === 1
                      ? t(lang, 'nochEinSchritt')
                      : t(lang, 'nochSchritte', { n: g.steps })}
                  </span>
                  {istBester && (
                    <span className="rounded bg-teal-500/20 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-teal-300">
                      {t(lang, 'besterTipp')}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
