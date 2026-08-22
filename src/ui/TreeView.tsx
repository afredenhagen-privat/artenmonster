import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { hierarchy, tree as d3tree, type HierarchyPointNode } from 'd3-hierarchy'
import { TransformWrapper, TransformComponent, type ReactZoomPanPinchRef } from 'react-zoom-pan-pinch'
import type { Tree } from '../core/tree.ts'
import { knownNode, revealedNodes, type BaumModus, type GameState } from '../core/game.ts'
import { loadBlurbs } from '../data/load.ts'
import type { BlurbData, Lang } from '../core/types.ts'
import { t } from '../i18n/strings.ts'
import { rangName } from '../i18n/raenge.ts'

/**
 * Der aufgedeckte Teil des Stammbaums, gezeichnet als Kladogramm.
 *
 * Rechtwinklige Haarlinien statt geschwungener Kanten: So werden Stammbäume in
 * der Systematik tatsächlich gezeichnet, und es unterscheidet die Darstellung von
 * einem beliebigen Organigramm. Die Länge eines Astes bedeutet nichts, die
 * Verzweigung ist die Information.
 *
 * Der Ausschnitt wird nach jeder Änderung auf den Inhalt eingepasst, damit die
 * geratenen Tiere immer im Bild sind. Wer selbst zoomt oder schiebt, behält seine
 * Ansicht bis zum nächsten Tipp.
 */

/** Platzhalter für die noch unbekannte Lösung. */
const GESUCHT = -1

interface Knoten {
  index: number
  /** Übersprungene Ebenen zwischen diesem Knoten und dem sichtbaren Elternknoten. */
  ausgelassen: number
  children: Knoten[]
}

interface Props {
  tree: Tree
  state: GameState
  lang: Lang
  modus: BaumModus
  /** Baumknoten der Spieltiere, damit Blätter anders gezeichnet werden. */
  animalOfNode: Map<number, number>
  /** Einleitungsabsätze zu den Gruppen, nach NCBI-Taxon-ID. */
  gruppen: BlurbData
  /** Inhaltsstempel der Steckbriefdatei, damit kein alter Cache-Stand kommt. */
  steckbriefVersion?: string
}

/*
 * Zeilenhoehe je nach Modus.
 *
 * Der volle Baum ist zwanzig Ebenen tief und besteht groesstenteils aus
 * Kladen-Ketten. Mit der luftigen Zeilenhoehe des Gruppenmodus wird er so hoch,
 * dass die Schrift beim Einpassen auf fuenf Pixel schrumpft. Enger gesetzt
 * bleibt er lesbar, ohne dass etwas aus dem Bild faellt.
 */
const MASSE = {
  gruppe: { spalte: 172, reihe: 88 },
  voll: { spalte: 152, reihe: 54 },
} as const

function baueTeilbaum(tree: Tree, sichtbar: Set<number>, gesuchtUnter: number | null): Knoten | null {
  if (sichtbar.size === 0) return null

  const kinder = new Map<number, Array<{ index: number; ausgelassen: number }>>()
  let wurzel = -1

  for (const i of sichtbar) {
    let eltern = tree.parentOf(i)
    let ausgelassen = 0
    while (eltern !== -1 && !sichtbar.has(eltern)) {
      eltern = tree.parentOf(eltern)
      ausgelassen++
    }
    if (eltern === -1) {
      wurzel = i
      continue
    }
    const liste = kinder.get(eltern)
    if (liste) liste.push({ index: i, ausgelassen })
    else kinder.set(eltern, [{ index: i, ausgelassen }])
  }
  if (wurzel === -1) return null

  const bauen = (index: number, ausgelassen: number): Knoten => {
    const eigene = (kinder.get(index) ?? [])
      .sort((a, b) => a.index - b.index)
      .map((k) => bauen(k.index, k.ausgelassen))
    // Das gesuchte Tier hängt sichtbar unter der bisher engsten bekannten Gruppe.
    if (index === gesuchtUnter) eigene.push({ index: GESUCHT, ausgelassen: 0, children: [] })
    return { index, ausgelassen, children: eigene }
  }
  return bauen(wurzel, 0)
}

/**
 * Kalt heißt viele Verzweigungen bis zur Lösung, warm heißt fast dran.
 *
 * Die Klassennamen stehen hier vollständig, weil Tailwind den Quelltext nur
 * statisch durchsucht: ein zusammengebautes 'stroke-' + ton landet nicht im
 * erzeugten CSS.
 */
interface Ton {
  linie: string
  strich: string
}

const KALT: Ton = { linie: 'text-fern', strich: 'stroke-fern' }
const SKALA: Record<number, Ton> = {
  1: { linie: 'text-nah', strich: 'stroke-nah' },
  2: { linie: 'text-mittel', strich: 'stroke-mittel' },
  3: { linie: 'text-weit', strich: 'stroke-weit' },
}
const GESUCHT_TON: Ton = { linie: 'text-zinnober', strich: 'stroke-zinnober' }

function waerme(steps: number): Ton {
  return SKALA[Math.max(1, Math.min(steps, 3))] ?? KALT
}

export function TreeView({ tree, state, lang, modus, animalOfNode, gruppen, steckbriefVersion }: Props) {
  const zoom = useRef<ReactZoomPanPinchRef | null>(null)
  const rahmen = useRef<HTMLDivElement | null>(null)
  const [gewaehlt, setGewaehlt] = useState<number | null>(null)

  /*
   * Die Steckbriefe der Tiere kommen erst, wenn zum ersten Mal ein Tier
   * angetippt wird. Sie sind die groesste der Datendateien und werden fuer das
   * Spielen selbst nicht gebraucht; sie beim Start mitzuladen wuerde jede Runde
   * teurer machen, damit ein Tippen guenstiger wird.
   */
  const [steckbriefe, setSteckbriefe] = useState<BlurbData | null>(null)
  const [willSteckbriefe, setWillSteckbriefe] = useState(false)

  useEffect(() => {
    if (!willSteckbriefe) return
    let abgebrochen = false
    loadBlurbs(lang, steckbriefVersion).then((b) => {
      if (!abgebrochen) setSteckbriefe(b)
    })
    return () => {
      abgebrochen = true
    }
  }, [willSteckbriefe, lang, steckbriefVersion])

  const layout = useMemo(() => {
    const sichtbar = revealedNodes(state, tree, modus)
    // Solange gespielt wird, steht statt der Lösung ein Platzhalter im Baum.
    const gesuchtUnter = state.status === 'laeuft' && !state.zen ? knownNode(state, tree) : null
    const wurzel = baueTeilbaum(tree, sichtbar, gesuchtUnter)
    if (!wurzel) return null

    const { spalte, reihe } = MASSE[modus]
    const gelegt = d3tree<Knoten>().nodeSize([spalte, reihe])(hierarchy<Knoten>(wurzel))

    let minX = Infinity
    let maxX = -Infinity
    let maxY = 0
    gelegt.each((n) => {
      minX = Math.min(minX, n.x)
      maxX = Math.max(maxX, n.x)
      maxY = Math.max(maxY, n.y)
    })

    const rand = spalte / 2 + 20
    return {
      reihe,
      knoten: gelegt.descendants(),
      kanten: gelegt.links(),
      versatzX: -minX + rand,
      breite: maxX - minX + rand * 2,
      hoehe: maxY + reihe,
    }
  }, [tree, state, modus])

  /*
   * Das Einpassen macht die viewBox des SVG, nicht die Zoom-Bibliothek.
   *
   * Der Versuch, es imperativ ueber setTransform zu setzen, blieb wirkungslos:
   * Die Transformation der Bibliothek blieb auf Identitaet stehen, und der Baum
   * ragte unten aus dem Rahmen. Mit viewBox uebernimmt der Browser die
   * Skalierung, sie stimmt bei jeder Rahmengroesse von selbst, und die
   * Bibliothek macht nur noch das, was sie gut kann: schieben und zoomen.
   */
  const zuruecksetzen = useCallback(() => zoom.current?.resetTransform(260), [])

  useEffect(() => setGewaehlt(null), [state.targetNode])

  // Nach einem neuen Tipp zurueck auf die eingepasste Ansicht, damit das eben
  // hinzugekommene Tier sicher im Bild ist.
  useEffect(() => {
    zoom.current?.resetTransform(260)
  }, [state.guesses.length, modus])

  if (!layout) {
    return (
      <div className="flex h-full items-center justify-center px-8 text-center">
        <p className="max-w-xs font-tafel text-sm italic leading-relaxed text-flechte">{t(lang, 'baumLeer')}</p>
      </div>
    )
  }

  const proTipp = new Map(state.guesses.map((g) => [g.node, g]))
  const hinweise = new Set(state.hints)

  // Tiere und Gruppen fuehren zu verschiedenen Dateien, beide nach Taxon-ID.
  const gewaehltIstTier = gewaehlt !== null && animalOfNode.has(gewaehlt)
  const erklaerung =
    gewaehlt === null
      ? undefined
      : gewaehltIstTier
        ? steckbriefe?.[String(tree.taxidOf(gewaehlt))]
        : gruppen[String(tree.taxidOf(gewaehlt))]

  return (
    <div ref={rahmen} className="relative h-full w-full overflow-hidden">
      <TransformWrapper
        ref={zoom}
        minScale={0.6}
        maxScale={8}
        limitToBounds={false}
        doubleClick={{ mode: 'zoomIn' }}
        wheel={{ step: 0.08 }}
      >
        {/*
          Der Inhalt darf ausdruecklich nicht auf Rahmengroesse gezwungen werden.
          Sonst rechnet die Zentrierung mit der Groesse des Rahmens statt mit der
          des Baums, und die Knoten landen an falschen Stellen.
        */}
        <TransformComponent wrapperClass="!h-full !w-full" contentClass="!h-full !w-full">
          <svg
            className="h-full w-full"
            viewBox={`0 0 ${layout.breite} ${layout.hoehe}`}
            preserveAspectRatio="xMidYMid meet"
          >
            <g transform={`translate(${layout.versatzX}, ${layout.reihe / 2})`}>
              {layout.kanten.map((kante) => (
                <Ast
                  key={kante.target.data.index}
                  quelle={kante.source}
                  ziel={kante.target}
                  reihe={layout.reihe}
                  ton={
                    kante.target.data.index === GESUCHT
                      ? GESUCHT_TON
                      : proTipp.has(kante.target.data.index)
                        ? waerme(proTipp.get(kante.target.data.index)!.steps)
                        : null
                  }
                />
              ))}

              {layout.knoten.map((n) => {
                const index = n.data.index
                if (index === GESUCHT) return <Gesucht key="gesucht" x={n.x} y={n.y} lang={lang} />

                const tipp = proTipp.get(index)
                const istTier = animalOfNode.has(index)
                return (
                  <Marke
                    key={index}
                    x={n.x}
                    y={n.y}
                    name={tree.nameOf(index, lang)}
                    latein={tree.latinIfDistinct(index, lang)}
                    rang={rangName(tree.rankOf(index), lang)}
                    istTier={istTier}
                    schritte={tipp?.steps}
                    istZiel={index === state.targetNode && state.status !== 'laeuft'}
                    istHinweis={hinweise.has(index)}
                    erklaerbar={istTier || Boolean(gruppen[String(tree.taxidOf(index))])}
                    gewaehlt={gewaehlt === index}
                    beiKlick={() => {
                      if (istTier) setWillSteckbriefe(true)
                      setGewaehlt((v) => (v === index ? null : index))
                    }}
                  />
                )
              })}
            </g>
          </svg>
        </TransformComponent>
      </TransformWrapper>

      <button
        type="button"
        onClick={zuruecksetzen}
        className="absolute bottom-3 right-3 border border-linie bg-kabinett/95 px-3 py-1.5 font-etikett text-[10px] uppercase tracking-etikett text-flechte transition hover:border-flechte hover:text-knochen"
      >
        {t(lang, 'zuruecksetzen')}
      </button>

      {gewaehlt !== null && (erklaerung || gewaehltIstTier) && (
        <aside className="animate-aufblenden absolute inset-x-0 bottom-0 border-t border-linie bg-kabinett/97 p-4 backdrop-blur">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="etikett">{rangName(tree.rankOf(gewaehlt), lang) || t(lang, 'gruppe')}</p>
              <p className="mt-0.5 font-tafel text-[15px] text-knochen">
                {tree.nameOf(gewaehlt, lang)}
                {tree.latinIfDistinct(gewaehlt, lang) && (
                  <span className="binomen ml-2 text-[12px] text-flechte">
                    {tree.latinIfDistinct(gewaehlt, lang)}
                  </span>
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setGewaehlt(null)}
              aria-label={t(lang, 'schliessen')}
              className="shrink-0 border border-linie px-2 py-0.5 font-etikett text-[11px] text-flechte transition hover:border-flechte hover:text-knochen"
            >
              ×
            </button>
          </div>
          {erklaerung ? (
            <>
              <p className="mt-2 max-h-28 overflow-y-auto font-tafel text-[13px] leading-relaxed text-knochen/85">
                {erklaerung.text}
              </p>
              <p className="mt-2 font-etikett text-[10px] text-flechte/70">
                <a href={erklaerung.url} target="_blank" rel="noreferrer" className="hover:text-knochen">
                  {t(lang, 'mehrErfahren')}
                </a>
                {' · '}
                {t(lang, erklaerung.lang && erklaerung.lang !== lang ? 'steckbriefQuelleFremd' : 'steckbriefQuelle')}
              </p>
            </>
          ) : (
            <p className="mt-2 font-tafel text-[13px] italic leading-relaxed text-flechte">
              {steckbriefe === null ? t(lang, 'steckbriefLaedt') : t(lang, 'keinSteckbrief')}
            </p>
          )}
        </aside>
      )}
    </div>
  )
}

/** Ein rechtwinkliger Ast. Ausgelassene Ebenen erscheinen gestrichelt mit Zähler. */
function Ast({
  quelle,
  ziel,
  ton,
  reihe,
}: {
  quelle: HierarchyPointNode<Knoten>
  ziel: HierarchyPointNode<Knoten>
  ton: Ton | null
  reihe: number
}) {
  const oben = quelle.y + 15
  const unten = ziel.y - 22
  const knick = quelle.y + reihe * 0.5
  const ausgelassen = ziel.data.ausgelassen
  const farbe = ton ? ton.linie : 'text-ast'

  return (
    <g>
      {/*
        Die waagerechte Schiene ist Struktur und bleibt neutral. Faerbte sie
        jeder Ast mit, uebermalt der zuletzt gezeichnete alle anderen, und die
        ganze Verzweigung sieht nach dem heissesten Tipp aus.
      */}
      <path
        d={`M${quelle.x},${oben} L${quelle.x},${knick} L${ziel.x},${knick}`}
        fill="none"
        stroke="currentColor"
        strokeWidth={1}
        className="text-ast"
      />
      <path
        d={`M${ziel.x},${knick} L${ziel.x},${unten}`}
        fill="none"
        stroke="currentColor"
        strokeWidth={ton ? 1.5 : 1}
        strokeDasharray={ausgelassen > 0 ? '2 4' : undefined}
        className={farbe}
      />
      {ausgelassen > 0 && (
        <text x={ziel.x + 6} y={(knick + unten) / 2 + 3} className="fill-flechte font-etikett text-[9px]">
          {'+' + ausgelassen}
        </text>
      )}
    </g>
  )
}

/** Der Platzhalter für die gesuchte Art. */
function Gesucht({ x, y, lang }: { x: number; y: number; lang: Lang }) {
  const breite = 116
  const hoehe = 36
  return (
    <g transform={`translate(${x - breite / 2}, ${y - hoehe / 2 + 4})`}>
      <title>{t(lang, 'gesuchtesTier')}</title>
      <rect
        width={breite}
        height={hoehe}
        className="fill-zinnober/10 stroke-zinnober"
        strokeWidth={1}
        strokeDasharray="4 3"
      />
      <text x={breite / 2} y={23} textAnchor="middle" className="fill-zinnober font-etikett text-[15px]">
        ???
      </text>
    </g>
  )
}

interface MarkeProps {
  x: number
  y: number
  name: string
  latein: string | null
  rang: string
  istTier: boolean
  schritte: number | undefined
  istZiel: boolean
  istHinweis: boolean
  erklaerbar: boolean
  gewaehlt: boolean
  beiKlick: () => void
}

/**
 * Gruppen stehen als Beschriftung auf der Linie, Tiere als gerahmtes Etikett.
 * Der Unterschied ist inhaltlich: Eine Gruppe ist eine Verzweigung, ein Tier ein
 * Endpunkt, an dem der Baum aufhört.
 */
function Marke({
  x,
  y,
  name,
  latein,
  rang,
  istTier,
  schritte,
  istZiel,
  istHinweis,
  erklaerbar,
  gewaehlt,
  beiKlick,
}: MarkeProps) {
  if (!istTier) {
    const betont = istZiel || istHinweis || gewaehlt
    return (
      <g
        transform={`translate(${x}, ${y})`}
        onClick={erklaerbar ? beiKlick : undefined}
        className={erklaerbar ? 'cursor-pointer' : undefined}
      >
        {erklaerbar && <rect x={-64} y={-20} width={128} height={52} className="fill-transparent" />}
        {rang && (
          <text textAnchor="middle" y={-6} className="fill-flechte font-etikett text-[9px] uppercase tracking-etikett">
            {rang}
          </text>
        )}
        <text
          textAnchor="middle"
          y={8}
          className={
            'font-tafel text-[13px] ' +
            (istHinweis ? 'fill-mittel' : betont ? 'fill-knochen' : 'fill-knochen/75') +
            (latein ? '' : ' italic')
          }
        >
          {kuerzen(name, 22)}
        </text>
        <line
          x1={-52}
          x2={52}
          y1={14}
          y2={14}
          stroke="currentColor"
          strokeWidth={betont ? 1 : 0.5}
          className={istHinweis ? 'text-mittel' : gewaehlt ? 'text-nah' : betont ? 'text-flechte' : 'text-ast'}
        />
        {latein && (
          <text textAnchor="middle" y={26} className="fill-flechte/70 font-tafel text-[10px] italic">
            {kuerzen(latein, 26)}
          </text>
        )}
      </g>
    )
  }

  const breite = 140
  const hoehe = 36
  const rahmen = istZiel
    ? 'fill-zinnober stroke-zinnober'
    : gewaehlt
      ? 'fill-kabinett stroke-nah'
      : schritte !== undefined
        ? 'fill-kabinett ' + waerme(schritte).strich
        : 'fill-kabinett stroke-ast'

  // Tiere sind genauso antippbar wie Gruppen, nur steht dahinter der Steckbrief
  // der Art statt der Erklaerung zur Gruppe.
  return (
    <g
      transform={`translate(${x - breite / 2}, ${y - hoehe / 2 + 4})`}
      onClick={erklaerbar ? beiKlick : undefined}
      className={'animate-einblenden' + (erklaerbar ? ' cursor-pointer' : '')}
    >
      <rect width={breite} height={hoehe} className={rahmen} strokeWidth={gewaehlt ? 2 : 1} />
      <text
        x={breite / 2}
        y={15}
        textAnchor="middle"
        className={'font-tafel text-[12px] ' + (istZiel ? 'fill-tinte font-bold' : 'fill-knochen')}
      >
        {kuerzen(name, 20)}
      </text>
      <text
        x={breite / 2}
        y={28}
        textAnchor="middle"
        className={'font-tafel text-[9px] italic ' + (istZiel ? 'fill-tinte/70' : 'fill-flechte/80')}
      >
        {kuerzen(latein ?? '', 24)}
      </text>
    </g>
  )
}

function kuerzen(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max - 1) + '…'
}
