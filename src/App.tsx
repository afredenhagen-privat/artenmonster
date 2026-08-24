import { useCallback, useEffect, useMemo, useState } from 'react'
import { imageUrl, loadGameData, loadGruppen, textVersion, type GameData } from './data/load.ts'
import type { Thema } from './data/storage.ts'
import {
  ladeEinstellungen,
  speichereEinstellungen,
  speichereTagesErgebnis,
  ladeTagesErgebnis,
  buchePartie,
} from './data/storage.ts'
import {
  applyGuess,
  canTakeHint,
  createGame,
  takeHint,
  GUESS_OPTIONS,
  type BaumModus,
  type GameState,
} from './core/game.ts'
import { dayKey, dailyIndex, puzzleNumber } from './core/daily.ts'
import type { BlurbData, Lang, TierId } from './core/types.ts'
import { t, tierName } from './i18n/strings.ts'
import { GuessInput } from './ui/GuessInput.tsx'
import { GuessList } from './ui/GuessList.tsx'
import { TreeView, type TierBild } from './ui/TreeView.tsx'
import { ResultCard } from './ui/ResultCard.tsx'
import { Vollbild } from './ui/Vollbild.tsx'
import { Konfetti } from './ui/Konfetti.tsx'

type Modus = 'tag' | 'endlos' | 'zen'

/** Feste leere Auswahl. Als Konstante, damit sie keinen Effekt neu auslöst. */
const LEER: number[] = []

/**
 * Die Tiere einer Stufe, eingeschränkt auf die gewählten Grossgruppen.
 *
 * Eine leere Auswahl heißt "alle" — inklusive der Tiere ohne Grossgruppe, etwa
 * der Schwämme. Bliebe nach dem Filtern nichts übrig, gilt wieder die ganze
 * Stufe: Lieber ein Tier aus einer anderen Gruppe als eine Runde, die gar nicht
 * erst anfängt. Die Oberfläche verhindert diesen Fall ohnehin, indem sie leere
 * Gruppen nicht anbietet.
 */
function waehlbareTiere(d: GameData, stufe: TierId, gruppen: number[]): number[] {
  const bereich = d.tierRanges[String(stufe)]
  const alle: number[] = []
  for (let i = bereich.from; i < bereich.to; i++) alle.push(i)
  if (gruppen.length === 0) return alle
  const erlaubt = alle.filter((i) => gruppen.includes(d.animals[i].kat))
  return erlaubt.length > 0 ? erlaubt : alle
}

/** Wie viele Tiere je Grossgruppe stehen in dieser Stufe? */
function zaehleKategorien(d: GameData, stufe: TierId): number[] {
  const zahlen = new Array<number>(d.kategorien.length).fill(0)
  const bereich = d.tierRanges[String(stufe)]
  for (let i = bereich.from; i < bereich.to; i++) {
    const k = d.animals[i].kat
    if (k >= 0 && k < zahlen.length) zahlen[k]++
  }
  return zahlen
}

export function App() {
  const [data, setData] = useState<GameData | null>(null)
  const [fehler, setFehler] = useState(false)

  const anfang = useMemo(ladeEinstellungen, [])
  const [lang, setLang] = useState<Lang>(anfang.lang)
  const [tier, setTier] = useState<TierId>(anfang.tier)
  const [baumModus, setBaumModus] = useState<BaumModus>(anfang.baumModus)
  const [thema, setThema] = useState<Thema>(anfang.thema)
  const [maxGuesses, setMaxGuesses] = useState<number>(anfang.maxGuesses)
  const [kategorien, setKategorien] = useState<number[]>(anfang.kategorien)
  /*
   * Zählt die Runden. Er dient als key des Konfettis: So läuft der Wurf je Runde
   * genau einmal, auch wenn zweimal dasselbe Tier gesucht war.
   */
  const [runde, setRunde] = useState(0)
  const [modus, setModus] = useState<Modus>('tag')
  const [state, setState] = useState<GameState | null>(null)
  const [baumOffen, setBaumOffen] = useState(false)
  const [vollbild, setVollbild] = useState(false)
  const [gruppen, setGruppen] = useState<BlurbData>({})

  useEffect(() => {
    loadGameData().then(setData, () => setFehler(true))
  }, [])

  useEffect(() => {
    speichereEinstellungen({ lang, tier, baumModus, thema, maxGuesses, kategorien })
  }, [lang, tier, baumModus, thema, maxGuesses, kategorien])

  /*
   * Die Farbwahl haengt am Wurzelelement, damit sie ohne Ausnahme fuer alles
   * gilt, auch fuer das Vollbild. Ohne gesetztes data-theme entscheidet die
   * Systemeinstellung, das regelt index.css.
   */
  useEffect(() => {
    const wurzel = document.documentElement
    if (thema === 'system') wurzel.removeAttribute('data-theme')
    else wurzel.setAttribute('data-theme', thema)

    // Die Adressleiste auf dem Handy soll mitziehen.
    const marke = document.querySelector('meta[name="theme-color"]')
    if (marke) {
      const grund = getComputedStyle(document.body).backgroundColor
      marke.setAttribute('content', grund)
    }
  }, [thema])

  // Erklaerungen zu den Gruppen kommen nach, sobald die Spieldaten stehen: Erst
  // mit ihnen ist der Inhaltsstempel bekannt, der die richtige Fassung holt.
  useEffect(() => {
    if (!data) return
    let abgebrochen = false
    loadGruppen(lang, textVersion(data, 'gruppen.' + lang + '.json')).then((g) => {
      if (!abgebrochen) setGruppen(g)
    })
    return () => {
      abgebrochen = true
    }
  }, [data, lang])

  /**
   * Wählt ein Zieltier und startet eine Runde.
   *
   * `gruppen` schränkt ein, woraus das Ziel kommen darf. Eine leere Liste heißt
   * "alle" — dann bleibt auch das Tier ohne Grossgruppe im Topf, etwa der
   * Badeschwamm. Das Tagesrätsel bekommt immer eine leere Liste: Es soll für
   * alle dasselbe sein, und das wäre es mit einem persönlichen Filter nicht.
   */
  const starte = useCallback(
    (d: GameData, m: Modus, stufe: TierId, versuche: number, gruppen: number[]) => {
      const auswahl = waehlbareTiere(d, stufe, gruppen)
      if (auswahl.length === 0) {
        setState(null)
        return
      }

      const index =
        m === 'tag'
          ? auswahl[dailyIndex(dayKey(), auswahl.length, 'stufe' + stufe)]
          : auswahl[Math.floor(Math.random() * auswahl.length)]

      setState(createGame(index, d.animals[index].node, { zen: m === 'zen', maxGuesses: versuche }))
      setRunde((n) => n + 1)
    },
    [],
  )

  // Eine andere Versuchszahl mitten in der Runde waere mehrdeutig: Wer schon
  // fuenfundzwanzig Mal geraten hat und auf zehn stellt, haette rueckwirkend
  // verloren. Es beginnt deshalb eine neue Runde, wie bei der Stufe auch.
  // Im Tagesrätsel gilt der Gruppenfilter nicht, deshalb die leere Liste.
  const zielGruppen = modus === 'tag' ? LEER : kategorien
  useEffect(() => {
    if (data) starte(data, modus, tier, maxGuesses, zielGruppen)
  }, [data, modus, tier, maxGuesses, zielGruppen, starte])

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
  // Ohne Limit gibt es nichts abzuzaehlen, egal ob das am Zen-Modus liegt oder
  // an der eingestellten Versuchszahl.
  const ohneLimit = !Number.isFinite(state.maxGuesses)
  const uebrig = ohneLimit ? null : state.maxGuesses - state.guesses.length
  const letzterTipp = state.guesses.at(-1)
  const kategorieZahlen = zaehleKategorien(data, tier)

  const eingabe = (
    <GuessInput
      data={data}
      state={state}
      lang={lang}
      onGuess={(animal) => setState(applyGuess(state, data.tree, animal, data.animals[animal].node))}
    />
  )

  /*
   * Das Foto eines Tiers für die Leiste unter dem Baum. Nur Tiere haben eines:
   * Zu einer Klade gibt es kein Bild, und ein beliebiges Foto aus der Gruppe
   * wäre geraten statt belegt.
   */
  const bildVon = (animal: number): TierBild | null => {
    const eintrag = data.animals[animal]
    if (!eintrag?.image) return null
    return {
      url: imageUrl(data, eintrag.image),
      autor: eintrag.image.author,
      lizenz: eintrag.image.license,
      seite: eintrag.image.page,
    }
  }

  const baum = (
    <TreeView
      tree={data.tree}
      state={state}
      lang={lang}
      modus={baumModus}
      animalOfNode={data.animalOfNode}
      gruppen={gruppen}
      steckbriefVersion={textVersion(data, 'blurbs.' + lang + '.json')}
      bildVon={bildVon}
    />
  )

  return (
    <div className="mx-auto flex min-h-dvh max-w-[1500px] flex-col gap-5 p-4 lg:flex-row lg:items-start lg:gap-8 lg:p-8">
      {/*
        Der Wurf hängt an der App, nicht an der Ergebniskarte: Die steht im
        Vollbild ein zweites Mal, und zwei Würfe übereinander wären einer zu viel.
      */}
      {state.status === 'gewonnen' && <Konfetti key={runde} />}
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
            <div className="flex shrink-0 gap-1.5">
              <button
                type="button"
                onClick={() => setThema(naechstesThema(thema))}
                title={t(lang, 'themaWechseln')}
                className="etikett border border-linie px-2 py-1 transition hover:border-flechte hover:text-knochen"
              >
                {t(lang, thema === 'hell' ? 'themaHell' : thema === 'dunkel' ? 'themaDunkel' : 'themaSystem')}
              </button>
              <button
                type="button"
                onClick={() => setLang(lang === 'de' ? 'en' : 'de')}
                className="etikett border border-linie px-2 py-1 transition hover:border-flechte hover:text-knochen"
              >
                {t(lang, 'sprache')}
              </button>
            </div>
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

        {/*
          Im Zen-Modus gibt es grundsätzlich kein Limit. Die Auswahl dort
          anzubieten hieße, eine Einstellung zu zeigen, die nichts bewirkt.
        */}
        {/*
          Die Gruppenauswahl fehlt im Tagesrätsel mit Absicht: Dort soll für alle
          dasselbe Tier gesucht sein, und ein persönlicher Filter wäre genau das
          nicht. Die Zeile darunter sagt das, statt die Auswahl kommentarlos
          verschwinden zu lassen.
        */}
        <div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="etikett">{t(lang, 'kategorien')}</span>
            {modus !== 'tag' && (
              <>
                <button
                  type="button"
                  onClick={() => setKategorien(LEER)}
                  aria-pressed={kategorien.length === 0}
                  className={
                    'border px-2 py-1 font-etikett text-[10px] uppercase tracking-etikett transition ' +
                    (kategorien.length === 0
                      ? 'border-nah bg-nah/15 text-nah'
                      : 'border-linie text-flechte hover:border-flechte hover:text-knochen')
                  }
                >
                  {t(lang, 'kategorienAlle')}
                </button>
                {/*
                  Ein Klick wählt eine Gruppe allein aus. Zum Ausschließen einer
                  einzigen wären das sonst vierzehn Klicks: erst die Gruppe, dann
                  umkehren.
                */}
                <button
                  type="button"
                  disabled={kategorien.length === 0}
                  onClick={() => setKategorien((jetzt) => umkehren(jetzt, data, tier))}
                  className="border border-linie px-2 py-1 font-etikett text-[10px] uppercase tracking-etikett text-flechte transition enabled:hover:border-flechte enabled:hover:text-knochen disabled:opacity-25"
                >
                  {t(lang, 'kategorienUmkehren')}
                </button>
              </>
            )}
          </div>

          {modus === 'tag' ? (
            <p className="mt-2 text-[12px] leading-snug text-flechte">{t(lang, 'kategorienTag')}</p>
          ) : (
            <>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {data.kategorien.map((k, i) => {
                  const anzahl = kategorieZahlen[i]
                  const gewaehlt = kategorien.length === 0 || kategorien.includes(i)
                  return (
                    <button
                      key={i}
                      type="button"
                      disabled={anzahl === 0}
                      aria-pressed={gewaehlt}
                      onClick={() => setKategorien((jetzt) => umschalten(jetzt, i, data, tier))}
                      className={
                        'border px-2 py-1 text-left font-etikett text-[10px] uppercase tracking-etikett transition disabled:opacity-25 ' +
                        (gewaehlt && kategorien.length > 0
                          ? 'border-nah bg-nah/15 text-nah'
                          : 'border-linie text-flechte enabled:hover:border-flechte enabled:hover:text-knochen')
                      }
                    >
                      {lang === 'de' ? k.de : k.en}
                      <span className="ml-1.5 tabular-nums opacity-60">{anzahl}</span>
                    </button>
                  )
                })}
              </div>
              <p className="mt-2 text-[12px] leading-snug text-flechte">{t(lang, 'kategorienHinweis')}</p>
            </>
          )}
        </div>

        {modus !== 'zen' && (
          <div>
            <div className="flex items-center gap-3">
              <span className="etikett">{t(lang, 'versucheFeld')}</span>
              <Segmente
                werte={GUESS_OPTIONS}
                aktiv={maxGuesses}
                beschriften={(n) => (Number.isFinite(n) ? String(n) : t(lang, 'ohneLimit'))}
                waehlen={setMaxGuesses}
                schmal
              />
            </div>
            <p className="mt-2 text-[12px] leading-snug text-flechte">{t(lang, 'versucheHinweis')}</p>
          </div>
        )}

        {schonGespielt && !fertig && (
          <p className="border-l-2 border-l-linie bg-kabinett/60 px-4 py-2.5 text-[13px] text-flechte">
            {lang === 'de' ? 'Dieses Tagesrätsel hast du schon gespielt.' : 'You already played today’s puzzle.'}
          </p>
        )}

        {!fertig && (
          <div className="space-y-3">
            {eingabe}

            <div className="flex items-center justify-between">
              <span className="etikett">
                {ohneLimit
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
            onNewRound={() => starte(data, modus === 'tag' ? 'endlos' : modus, tier, maxGuesses, kategorien)}
          />
        )}

        <div className="flex gap-2 lg:hidden">
          <button
            type="button"
            onClick={() => setBaumOffen((v) => !v)}
            className="etikett flex-1 border border-linie px-4 py-2.5 text-left transition hover:border-flechte hover:text-knochen"
          >
            {t(lang, 'baum')} {baumOffen ? '−' : '+'}
          </button>
          <button
            type="button"
            onClick={() => setVollbild(true)}
            className="etikett border border-linie px-4 py-2.5 transition hover:border-flechte hover:text-knochen"
          >
            {t(lang, 'vollbild')}
          </button>
        </div>

        {baumOffen && !vollbild && (
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
      {!vollbild && (
        <div className="hidden flex-1 lg:sticky lg:top-8 lg:block lg:h-[calc(100dvh-4rem)]">
          <Plattenrahmen
            lang={lang}
            modus={baumModus}
            setzeModus={setBaumModus}
            beiVollbild={() => setVollbild(true)}
          >
            {baum}
          </Plattenrahmen>
        </div>
      )}

      {vollbild && (
        <Vollbild
          lang={lang}
          beiSchliessen={() => setVollbild(false)}
          steuerung={
            <Segmente
              werte={['gruppe', 'voll'] as const}
              aktiv={baumModus}
              beschriften={(m) => t(lang, m === 'gruppe' ? 'baumGruppe' : 'baumVoll')}
              waehlen={setBaumModus}
              schmal
              titel={t(lang, 'baumModusHilfe')}
            />
          }
          tafelGerahmt={!fertig}
          tafel={
            fertig ? (
              /*
               * Nach dem Spielende dieselbe Ergebniskarte wie in der Seitenspalte,
               * mit Bild, Steckbrief und vollem systematischen Pfad. Vorher stand
               * hier nur eine Zeile, und wer im Vollbild spielte, bekam das Tier,
               * das er gerade gesucht hatte, nie zu sehen.
               */
              <ResultCard
                data={data}
                state={state}
                lang={lang}
                tier={tier}
                puzzle={modus === 'tag' ? puzzleNumber(dayKey()) : undefined}
                onNewRound={() => starte(data, modus === 'tag' ? 'endlos' : modus, tier, maxGuesses, kategorien)}
              />
            ) : (
              <div className="space-y-2">
                {eingabe}
                <div className="flex items-center justify-between gap-3">
                  <span className="etikett">
                    {ohneLimit
                      ? t(lang, 'versucheZen', { n: state.guesses.length + 1 })
                      : t(lang, 'versuche', { n: state.guesses.length + 1, max: state.maxGuesses })}
                  </span>
                  {letzterTipp && (
                    <span className="truncate text-[12px] text-flechte">
                      {letzterTipp.correct
                        ? t(lang, 'gefunden')
                        : data.tree.nameOf(letzterTipp.lca, lang) +
                          ' · ' +
                          (letzterTipp.steps === 1
                            ? t(lang, 'nochEinSchritt')
                            : t(lang, 'nochSchritte', { n: letzterTipp.steps }))}
                    </span>
                  )}
                </div>
              </div>
            )
          }
        >
          {baum}
        </Vollbild>
      )}
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
  beiVollbild,
  children,
}: {
  lang: Lang
  modus: BaumModus
  setzeModus: (m: BaumModus) => void
  beiVollbild?: () => void
  children: React.ReactNode
}) {
  return (
    <div className="flex h-full flex-col border border-linie bg-kabinett/40">
      <div className="flex items-center justify-between gap-3 border-b border-linie px-3 py-2">
        <span className="etikett">{t(lang, 'baum')}</span>
        <div className="flex items-center gap-2">
          <Segmente
            werte={['gruppe', 'voll'] as const}
            aktiv={modus}
            beschriften={(m) => t(lang, m === 'gruppe' ? 'baumGruppe' : 'baumVoll')}
            waehlen={setzeModus}
            schmal
            titel={t(lang, 'baumModusHilfe')}
          />
          {beiVollbild && (
            <button
              type="button"
              onClick={beiVollbild}
              className="etikett border border-linie px-2.5 py-1 transition hover:border-flechte hover:text-knochen"
            >
              {t(lang, 'vollbild')}
            </button>
          )}
        </div>
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

/**
 * Verbleibende Versuche als Strichliste statt als Zahl.
 *
 * Mehr als zwanzig Striche werden zur Zaunlatte, deshalb steht bei groesseren
 * Vorraeten ein Strich fuer mehrere Versuche. Aufgerundet wird bewusst: Solange
 * noch ein Versuch uebrig ist, soll auch noch ein Strich stehen.
 */
function Vorrat({ uebrig, gesamt }: { uebrig: number; gesamt: number }) {
  const striche = Math.min(gesamt, 20)
  const voll = Math.ceil((Math.max(0, uebrig) / gesamt) * striche)
  return (
    <span className="flex items-end gap-[2px]" aria-label={String(uebrig)}>
      {Array.from({ length: striche }, (_, i) => (
        <span
          key={i}
          className={'block w-[2px] ' + (i < voll ? 'h-3 bg-flechte' : 'h-1.5 bg-linie')}
        />
      ))}
    </span>
  )
}

/**
 * Schaltet eine Grossgruppe an oder aus.
 *
 * Eine leere Auswahl bedeutet "alle", deshalb wird beim ersten Klick nicht eine
 * Gruppe an-, sondern alle anderen abgewählt: Wer auf "Vögel" tippt, will Vögel
 * spielen und nicht Vögel zu einer Auswahl hinzufügen, die ohnehin schon alles
 * enthält. Die letzte verbleibende Gruppe lässt sich nicht abwählen — sonst
 * stünde da eine Auswahl, die wieder alles bedeutet, obwohl gerade das Gegenteil
 * gemeint war.
 */
function umschalten(jetzt: number[], index: number, d: GameData, stufe: TierId): number[] {
  if (jetzt.length === 0) return [index]
  if (!jetzt.includes(index)) return [...jetzt, index].sort((a, b) => a - b)
  const rest = jetzt.filter((i) => i !== index)
  const zahlen = zaehleKategorien(d, stufe)
  return rest.some((i) => zahlen[i] > 0) ? rest : jetzt
}

/**
 * Kehrt die Auswahl um: aus "nur Vögel" wird "alles außer Vögeln".
 *
 * Gruppen ohne Tiere in dieser Stufe bleiben draußen, sie wären nur eine
 * Auswahl ohne Wirkung. Waren alle gewählt, bliebe nichts übrig — dann bleibt
 * es, wie es ist.
 */
function umkehren(jetzt: number[], d: GameData, stufe: TierId): number[] {
  if (jetzt.length === 0) return jetzt
  const zahlen = zaehleKategorien(d, stufe)
  const rest = d.kategorien
    .map((_, i) => i)
    .filter((i) => !jetzt.includes(i) && zahlen[i] > 0)
  return rest.length > 0 ? rest : jetzt
}

/** System, hell, dunkel und wieder von vorn. */
function naechstesThema(jetzt: Thema): Thema {
  return jetzt === 'system' ? 'hell' : jetzt === 'hell' ? 'dunkel' : 'system'
}

function Zentriert({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-dvh flex-col items-center justify-center p-6 text-center">{children}</div>
}
