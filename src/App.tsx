import { useCallback, useEffect, useMemo, useState } from 'react'
import { loadGameData, loadGruppen, type GameData } from './data/load.ts'
import {
  ladeEinstellungen,
  speichereEinstellungen,
  speichereTagesErgebnis,
  ladeTagesErgebnis,
  buchePartie,
} from './data/storage.ts'
import { applyGuess, canTakeHint, createGame, takeHint, type BaumModus, type GameState } from './core/game.ts'
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
  const [baumModus, setBaumModus] = useState<BaumModus>(anfang.baumModus)
  const [modus, setModus] = useState<Modus>('tag')
  const [state, setState] = useState<GameState | null>(null)
  const [baumOffen, setBaumOffen] = useState(false)
  const [gruppen, setGruppen] = useState<Record<string, { text: string; url: string }>>({})

  useEffect(() => {
    loadGameData().then(setData, () => setFehler(true))
  }, [])

  useEffect(() => {
    speichereEinstellungen({ lang, tier, baumModus })
  }, [lang, tier, baumModus])

  // Erklaerungen zu den Gruppen kommen nach, sobald die Sprache feststeht.
  useEffect(() => {
    let abgebrochen = false
    loadGruppen(lang).then((g) => {
      if (!abgebrochen) setGruppen(g)
    })
    return () => {
      abgebrochen = true
    }
  }, [lang])

  /** Wählt ein Zieltier und startet eine Runde. */
  const starte = useCallback((d: GameData, m: Modus, stufe: TierId) => {
    const bereich = d.tierRanges[String(stufe)]
    const groesse = bereich.to - bereich.from
    if (groesse <= 0) return

    const index =
      m === 'tag'
        ? bereich.from + dailyIndex(dayKey(), groesse, 'stufe' + stufe)
        : bereich.from + Math.floor(Math.random() * groesse)

    setState(createGame(index, d.animals[index].node, { zen: m === 'zen' }))
  }, [])

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
        <p className="font-tafel text-knochen">{t(lang, 'ladefehler')}</p>
        <button
          type="button"
          onClick={() => location.reload()}
          className="mt-5 border border-nah bg-nah/15 px-4 py-2 font-etikett text-[11px] uppercase tracking-etikett text-nah transition hover:bg-nah hover:text-tinte"
        >
          {t(lang, 'erneutVersuchen')}
        </button>
      </Zentriert>
    )
  }

  if (!data || !state) {
    return (
      <Zentriert>
        <p className="animate-pulse font-tafel italic text-flechte">{t(lang, 'laedt')}</p>
      </Zentriert>
    )
  }

  const schonGespielt = modus === 'tag' ? ladeTagesErgebnis(dayKey(), tier) : null
  const fertig = state.status !== 'laeuft'
  const hinweisMoeglich = canTakeHint(state, data.tree)
  const uebrig = state.zen ? null : state.maxGuesses - state.guesses.length

  const baum = (
    <TreeView
      tree={data.tree}
      state={state}
      lang={lang}
      modus={baumModus}
      animalOfNode={data.animalOfNode}
      gruppen={gruppen}
    />
  )

  return (
    <div className="mx-auto flex min-h-dvh max-w-[1500px] flex-col gap-5 p-4 lg:flex-row lg:items-start lg:gap-8 lg:p-8">
      <div className="flex w-full flex-col gap-5 lg:max-w-sm">
        <header className="border-b border-linie pb-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="font-tafel text-[28px] leading-none tracking-tight text-knochen">
                {t(lang, 'titel')}
              </h1>
              <p className="mt-1.5 max-w-[26ch] font-tafel text-[13px] italic leading-snug text-flechte">
                {t(lang, 'untertitel')}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setLang(lang === 'de' ? 'en' : 'de')}
              className="etikett shrink-0 border border-linie px-2 py-1 transition hover:border-flechte hover:text-knochen"
            >
              {t(lang, 'sprache')}
            </button>
          </div>
        </header>

        <div>
          <Segmente
            werte={['tag', 'endlos', 'zen'] as const}
            aktiv={modus}
            beschriften={(m) => t(lang, m === 'tag' ? 'modusTag' : m === 'endlos' ? 'modusEndlos' : 'modusZen')}
            waehlen={setModus}
          />
          <p className="mt-2 text-[12px] leading-snug text-flechte">
            {t(lang, modus === 'tag' ? 'modusTagBeschreibung' : modus === 'endlos' ? 'modusEndlosBeschreibung' : 'modusZenBeschreibung')}
          </p>
        </div>

        <div>
          <div className="flex items-center gap-3">
            <span className="etikett">{t(lang, 'stufe')}</span>
            <Segmente
              werte={[1, 2, 3] as const}
              aktiv={tier}
              beschriften={(s) => tierName(lang, s)}
              waehlen={setTier}
              schmal
            />
          </div>
          <p className="mt-2 text-[12px] leading-snug text-flechte">{t(lang, 'stufeHinweis')}</p>
        </div>

        {schonGespielt && !fertig && (
          <p className="border-l-2 border-l-linie bg-kabinett/60 px-4 py-2.5 text-[13px] text-flechte">
            {lang === 'de' ? 'Dieses Tagesrätsel hast du schon gespielt.' : 'You already played today’s puzzle.'}
          </p>
        )}

        {!fertig && (
          <div className="space-y-3">
            <GuessInput
              data={data}
              state={state}
              lang={lang}
              onGuess={(animal) => setState(applyGuess(state, data.tree, animal, data.animals[animal].node))}
            />

            <div className="flex items-center justify-between">
              <span className="etikett">
                {state.zen
                  ? t(lang, 'versucheZen', { n: state.guesses.length + 1 })
                  : t(lang, 'versuche', { n: state.guesses.length + 1, max: state.maxGuesses })}
              </span>
              <div className="flex items-center gap-3">
                {uebrig !== null && <Vorrat uebrig={uebrig} gesamt={state.maxGuesses} />}
                <button
                  type="button"
                  disabled={!hinweisMoeglich}
                  onClick={() => setState(takeHint(state, data.tree))}
                  className="etikett border border-linie px-2 py-1 transition enabled:hover:border-mittel enabled:hover:text-mittel disabled:opacity-30"
                >
                  {t(lang, 'hinweisNehmen')}
                </button>
              </div>
            </div>
          </div>
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
          className="etikett border border-linie px-4 py-2.5 text-left transition hover:border-flechte hover:text-knochen lg:hidden"
        >
          {t(lang, 'baum')} {baumOffen ? '−' : '+'}
        </button>

        {baumOffen && (
          <div className="h-[62vh] lg:hidden">
            <Plattenrahmen lang={lang} modus={baumModus} setzeModus={setBaumModus}>
              {baum}
            </Plattenrahmen>
          </div>
        )}

        <GuessList data={data} state={state} lang={lang} />

        <footer className="mt-auto border-t border-linie pt-4 font-etikett text-[10px] leading-relaxed text-flechte/60">
          <p>{t(lang, 'datenstand', { datum: data.meta.builtAt })}</p>
          <p className="mt-1">{t(lang, 'quellen')}</p>
        </footer>
      </div>

      {/*
        Feste Hoehe, nicht min-height: Der Baum soll ein Fenster sein, in das
        hineingezoomt wird. Waechst der Bereich stattdessen mit dem Inhalt, wird
        das Einpassen wirkungslos und die Seite scrollt an den Aesten entlang.
      */}
      <div className="hidden flex-1 lg:sticky lg:top-8 lg:block lg:h-[calc(100dvh-4rem)]">
        <Plattenrahmen lang={lang} modus={baumModus} setzeModus={setBaumModus}>
          {baum}
        </Plattenrahmen>
      </div>
    </div>
  )
}

/**
 * Rahmen um den Stammbaum, mit der Umschaltung zwischen den beiden Ansichten.
 * Die Leiste oben ist bewusst schmal: Der Baum ist der Hauptdarsteller.
 */
function Plattenrahmen({
  lang,
  modus,
  setzeModus,
  children,
}: {
  lang: Lang
  modus: BaumModus
  setzeModus: (m: BaumModus) => void
  children: React.ReactNode
}) {
  return (
    <div className="flex h-full flex-col border border-linie bg-kabinett/40">
      <div className="flex items-center justify-between gap-3 border-b border-linie px-3 py-2">
        <span className="etikett">{t(lang, 'baum')}</span>
        <Segmente
          werte={['gruppe', 'voll'] as const}
          aktiv={modus}
          beschriften={(m) => t(lang, m === 'gruppe' ? 'baumGruppe' : 'baumVoll')}
          waehlen={setzeModus}
          schmal
          titel={t(lang, 'baumModusHilfe')}
        />
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  )
}

/** Schmale Segmentleiste im Etikettensatz. Hairlines statt Kacheln. */
function Segmente<T extends string | number>({
  werte,
  aktiv,
  beschriften,
  waehlen,
  schmal,
  titel,
}: {
  werte: readonly T[]
  aktiv: T
  beschriften: (wert: T) => string
  waehlen: (wert: T) => void
  schmal?: boolean
  titel?: string
}) {
  return (
    <div className="flex border border-linie" title={titel}>
      {werte.map((w, i) => (
        <button
          key={String(w)}
          type="button"
          onClick={() => waehlen(w)}
          aria-pressed={w === aktiv}
          className={
            'font-etikett uppercase tracking-etikett transition ' +
            (schmal ? 'px-2.5 py-1 text-[10px]' : 'flex-1 px-3 py-2 text-[11px]') +
            (i > 0 ? ' border-l border-l-linie' : '') +
            (w === aktiv ? ' bg-nah/15 text-nah' : ' text-flechte hover:bg-fach hover:text-knochen')
          }
        >
          {beschriften(w)}
        </button>
      ))}
    </div>
  )
}

/** Verbleibende Versuche als Strichliste statt als Zahl. */
function Vorrat({ uebrig, gesamt }: { uebrig: number; gesamt: number }) {
  const striche = Math.min(gesamt, 20)
  return (
    <span className="flex items-end gap-[2px]" aria-label={String(uebrig)}>
      {Array.from({ length: striche }, (_, i) => (
        <span
          key={i}
          className={'block w-[2px] ' + (i < uebrig ? 'h-3 bg-flechte' : 'h-1.5 bg-linie')}
        />
      ))}
    </span>
  )
}

function Zentriert({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-dvh flex-col items-center justify-center p-6 text-center">{children}</div>
}
