import { useCallback, useEffect, useMemo, useState } from 'react'
import { loadGameData, type GameData } from './data/load.ts'
import {
  ladeEinstellungen,
  speichereEinstellungen,
  speichereTagesErgebnis,
  ladeTagesErgebnis,
  buchePartie,
} from './data/storage.ts'
import { applyGuess, canTakeHint, createGame, takeHint, type GameState } from './core/game.ts'
import { dayKey, dailyIndex, puzzleNumber } from './core/daily.ts'
import type { Lang, TierId } from './core/types.ts'
import { t, tierName } from './i18n/strings.ts'
import { GuessInput } from './ui/GuessInput.tsx'
import { GuessList } from './ui/GuessList.tsx'
import { TreeView } from './ui/TreeView.tsx'
import { ResultCard } from './ui/ResultCard.tsx'

type Modus = 'tag' | 'endlos' | 'zen'

export function App() {
  const [data, setData] = useState<GameData | null>(null)
  const [fehler, setFehler] = useState(false)

  const anfang = useMemo(ladeEinstellungen, [])
  const [lang, setLang] = useState<Lang>(anfang.lang)
  const [tier, setTier] = useState<TierId>(anfang.tier)
  const [modus, setModus] = useState<Modus>('tag')
  const [state, setState] = useState<GameState | null>(null)
  const [baumOffen, setBaumOffen] = useState(false)

  useEffect(() => {
    loadGameData().then(setData, () => setFehler(true))
  }, [])

  useEffect(() => {
    speichereEinstellungen({ lang, tier })
  }, [lang, tier])

  /** Waehlt ein Zieltier und startet eine Runde. */
  const starte = useCallback(
    (d: GameData, m: Modus, stufe: TierId) => {
      const bereich = d.tierRanges[String(stufe)]
      const groesse = bereich.to - bereich.from
      if (groesse <= 0) return

      const index =
        m === 'tag'
          ? bereich.from + dailyIndex(dayKey(), groesse, 'stufe' + stufe)
          : bereich.from + Math.floor(Math.random() * groesse)

      setState(createGame(index, d.animals[index].node, { zen: m === 'zen' }))
    },
    [],
  )

  useEffect(() => {
    if (data) starte(data, modus, tier)
  }, [data, modus, tier, starte])

  // Tagesergebnis festhalten, damit es nach dem Neuladen erhalten bleibt.
  useEffect(() => {
    if (!state || modus !== 'tag' || state.status === 'laeuft') return
    speichereTagesErgebnis({
      tag: dayKey(),
      tier,
      gewonnen: state.status === 'gewonnen',
      versuche: state.guesses.length,
      verlauf: state.guesses.map((g) => g.steps),
    })
    buchePartie(state.status === 'gewonnen', state.guesses.length)
  }, [state?.status, modus, tier])

  if (fehler) {
    return (
      <Zentriert>
        <p className="text-slate-300">{t(lang, 'ladefehler')}</p>
        <button
          type="button"
          onClick={() => location.reload()}
          className="mt-4 rounded-xl bg-teal-600 px-4 py-2 text-white"
        >
          {t(lang, 'erneutVersuchen')}
        </button>
      </Zentriert>
    )
  }

  if (!data || !state) {
    return (
      <Zentriert>
        <p className="animate-pulse text-slate-400">{t(lang, 'laedt')}</p>
      </Zentriert>
    )
  }

  const schonGespielt = modus === 'tag' ? ladeTagesErgebnis(dayKey(), tier) : null
  const fertig = state.status !== 'laeuft'
  const hinweisMoeglich = canTakeHint(state, data.tree)

  return (
    <div className="mx-auto flex min-h-dvh max-w-6xl flex-col gap-4 p-4 lg:flex-row lg:gap-6 lg:p-6">
      <div className="flex w-full flex-col gap-4 lg:max-w-md">
        <header>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-50">{t(lang, 'titel')}</h1>
              <p className="text-sm text-slate-400">{t(lang, 'untertitel')}</p>
            </div>
            <button
              type="button"
              onClick={() => setLang(lang === 'de' ? 'en' : 'de')}
              className="shrink-0 rounded-lg border border-slate-700 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-800"
            >
              {t(lang, 'sprache')}
            </button>
          </div>
        </header>

        <div className="flex gap-1.5 rounded-xl bg-slate-800/60 p-1">
          {(['tag', 'endlos', 'zen'] as Modus[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setModus(m)}
              className={
                'flex-1 rounded-lg px-3 py-2 text-sm transition ' +
                (modus === m ? 'bg-teal-600 font-medium text-white' : 'text-slate-300 hover:bg-slate-700/60')
              }
            >
              {t(lang, m === 'tag' ? 'modusTag' : m === 'endlos' ? 'modusEndlos' : 'modusZen')}
            </button>
          ))}
        </div>

        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-wide text-slate-500">{t(lang, 'stufe')}</span>
            <div className="flex gap-1.5">
              {([1, 2, 3] as TierId[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setTier(s)}
                  className={
                    'rounded-lg border px-2.5 py-1 text-xs transition ' +
                    (tier === s
                      ? 'border-teal-500 bg-teal-500/15 text-teal-300'
                      : 'border-slate-700 text-slate-400 hover:bg-slate-800')
                  }
                >
                  {tierName(lang, s)}
                </button>
              ))}
            </div>
          </div>
          <p className="mt-1.5 text-[11px] text-slate-500">{t(lang, 'stufeHinweis')}</p>
        </div>

        {schonGespielt && !fertig && (
          <p className="rounded-xl border border-slate-700 bg-slate-800/50 px-4 py-2.5 text-sm text-slate-400">
            {lang === 'de'
              ? 'Dieses Tagesrätsel hast du schon gespielt.'
              : 'You already played today’s puzzle.'}
          </p>
        )}

        {!fertig && (
          <>
            <GuessInput
              data={data}
              state={state}
              lang={lang}
              onGuess={(animal) => setState(applyGuess(state, data.tree, animal, data.animals[animal].node))}
            />

            <div className="flex items-center justify-between text-sm text-slate-400">
              <span>
                {state.zen
                  ? t(lang, 'versucheZen', { n: state.guesses.length + 1 })
                  : t(lang, 'versuche', { n: state.guesses.length + 1, max: state.maxGuesses })}
              </span>
              <button
                type="button"
                disabled={!hinweisMoeglich}
                onClick={() => setState(takeHint(state, data.tree))}
                className="rounded-lg border border-slate-700 px-2.5 py-1 text-xs text-slate-300 transition enabled:hover:bg-slate-800 disabled:opacity-40"
              >
                {t(lang, 'hinweisNehmen')}
              </button>
            </div>
          </>
        )}

        {fertig && (
          <ResultCard
            data={data}
            state={state}
            lang={lang}
            tier={tier}
            puzzle={modus === 'tag' ? puzzleNumber(dayKey()) : undefined}
            onNewRound={() => starte(data, modus === 'tag' ? 'endlos' : modus, tier)}
          />
        )}

        <button
          type="button"
          onClick={() => setBaumOffen((v) => !v)}
          className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-800 lg:hidden"
        >
          {t(lang, 'baum')} {baumOffen ? '▲' : '▼'}
        </button>

        <div className={baumOffen ? 'h-[60vh] lg:hidden' : 'hidden'}>
          <BaumRahmen>
            <TreeView tree={data.tree} state={state} lang={lang} animalOfNode={data.animalOfNode} />
          </BaumRahmen>
        </div>

        <GuessList data={data} state={state} lang={lang} />

        <footer className="mt-auto pt-4 text-[11px] leading-relaxed text-slate-600">
          <p>{t(lang, 'datenstand', { datum: data.meta.builtAt })}</p>
          <p>{t(lang, 'quellen')}</p>
        </footer>
      </div>

      <div className="hidden min-h-[70vh] flex-1 lg:block">
        <BaumRahmen>
          <TreeView tree={data.tree} state={state} lang={lang} animalOfNode={data.animalOfNode} />
        </BaumRahmen>
      </div>
    </div>
  )
}

function BaumRahmen({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60">{children}</div>
  )
}

function Zentriert({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-dvh flex-col items-center justify-center p-6 text-center">{children}</div>
}
