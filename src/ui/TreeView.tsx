import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { hierarchy, tree as d3tree, type HierarchyPointNode } from 'd3-hierarchy'
import { TransformWrapper, TransformComponent, type ReactZoomPanPinchRef } from 'react-zoom-pan-pinch'
import type { Tree } from '../core/tree.ts'
import { knownNode, revealedNodes, type BaumModus, type GameState } from '../core/game.ts'
import type { Lang } from '../core/types.ts'
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
  /** Einleitungsabsätze zu den Gruppen, nach Knotenindex. */
  gruppen: Record<string, { text: string; url: string }>
}

const SPALTE = 168
const REIHE = 84

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

export function TreeView({ tree, state, lang, modus, animalOfNode, gruppen }: Props) {
  const zoom = useRef<ReactZoomPanPinchRef | null>(null)
  const rahmen = useRef<HTMLDivElement | null>(null)
  const [gewaehlt, setGewaehlt] = useState<number | null>(null)

  const layout = useMemo(() => {
    const sichtbar = revealedNodes(state, tree, modus)
    // Solange gespielt wird, steht statt der Lösung ein Platzhalter im Baum.
    const gesuchtUnter = state.status === 'laeuft' && !state.zen ? knownNode(state, tree) : null
    const wurzel = baueTeilbaum(tree, sichtbar, gesuchtUnter)
    if (!wurzel) return null

    const gelegt = d3tree<Knoten>().nodeSize([SPALTE, REIHE])(hierarchy<Knoten>(wurzel))

    let minX = Infinity
    let maxX = -Infinity
    let maxY = 0
    gelegt.each((n) => {
      minX = Math.min(minX, n.x)
      maxX = Math.max(maxX, n.x)
      maxY = Math.max(maxY, n.y)
    })

    const rand = SPALTE / 2 + 20
    return {
      knoten: gelegt.descendants(),
      kanten: gelegt.links(),
      versatzX: -minX + rand,
      breite: maxX - minX + rand * 2,
      hoehe: maxY + REIHE,
    }
  }, [tree, state, modus])

  /** Setzt den Ausschnitt so, dass der ganze Baum ins Bild passt. */
  const einpassen = useCallback(() => {
    const box = rahmen.current?.getBoundingClientRect()
    if (!box || !layout || !zoom.current) return
    const luft = 24
    const skala = Math.min(1.1, (box.width - luft) / layout.breite, (box.height - luft) / layout.hoehe)
    const x = (box.width - layout.breite * skala) / 2
    const y = (box.height - layout.hoehe * skala) / 2
    zoom.current.setTransform(x, y, skala, 260)
  }, [layout])

  // Nach jeder Änderung am Baum neu einpassen, damit neue Tiere im Bild landen.
  useLayoutEffect(() => {
    const timer = setTimeout(einpassen, 30)
    return () => clearTimeout(timer)
  }, [einpassen])

  useEffect(() => {
    if (!rahmen.current) return
    const beobachter = new ResizeObserver(() => einpassen())
    beobachter.observe(rahmen.current)
    return () => beobachter.disconnect()
  }, [einpassen])

  useEffect(() => setGewaehlt(null), [state.targetNode])

  if (!layout) {
    return (
      <div className="flex h-full items-center justify-center px-8 text-center">
        <p className="max-w-xs font-tafel text-sm italic leading-relaxed text-flechte">{t(lang, 'baumLeer')}</p>
      </div>
    )
  }

  const proTipp = new Map(state.guesses.map((g) => [g.node, g]))
  const hinweise = new Set(state.hints)
  const erklaerung = gewaehlt !== null ? gruppen[String(gewaehlt)] : undefined

  return (
    <div ref={rahmen} className="relative h-full w-full overflow-hidden">
      <TransformWrapper
        ref={zoom}
        minScale={0.15}
        maxScale={2.5}
        limitToBounds={false}
        doubleClick={{ mode: 'zoomIn' }}
        wheel={{ step: 0.08 }}
      >
        {/*
          Der Inhalt darf ausdruecklich nicht auf Rahmengroesse gezwungen werden.
          Sonst rechnet die Zentrierung mit der Groesse des Rahmens statt mit der
          des Baums, und die Knoten landen an falschen Stellen.
        */}
        <TransformComponent wrapperClass="!h-full !w-full">
          <svg width={layout.breite} height={layout.hoehe}>
            <g transform={`translate(${layout.versatzX}, ${REIHE / 2})`}>
              {layout.kanten.map((kante) => (
                <Ast
                  key={kante.target.data.index}
                  quelle={kante.source}
                  ziel={kante.target}
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
                    latein={tree.hasCommonName(index, lang) ? tree.scientificName(index) : null}
                    rang={rangName(tree.rankOf(index), lang)}
                    istTier={istTier}
                    schritte={tipp?.steps}
                    istZiel={index === state.targetNode && state.status !== 'laeuft'}
                    istHinweis={hinweise.has(index)}
                    erklaerbar={!istTier && Boolean(gruppen[String(index)])}
                    gewaehlt={gewaehlt === index}
                    beiKlick={() => setGewaehlt((v) => (v === index ? null : index))}
                  />
                )
              })}
            </g>
          </svg>
        </TransformComponent>
      </TransformWrapper>

      <button
        type="button"
        onClick={einpassen}
        className="absolute bottom-3 right-3 border border-linie bg-kabinett/95 px-3 py-1.5 font-etikett text-[10px] uppercase tracking-etikett text-flechte transition hover:border-flechte hover:text-knochen"
      >
        {t(lang, 'zuruecksetzen')}
      </button>

      {erklaerung && gewaehlt !== null && (
        <aside className="animate-aufblenden absolute inset-x-0 bottom-0 border-t border-linie bg-kabinett/97 p-4 backdrop-blur">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="etikett">{rangName(tree.rankOf(gewaehlt), lang) || t(lang, 'gruppe')}</p>
              <p className="mt-0.5 font-tafel text-[15px] text-knochen">
                {tree.nameOf(gewaehlt, lang)}
                {tree.hasCommonName(gewaehlt, lang) && (
                  <span className="binomen ml-2 text-[12px] text-flechte">{tree.scientificName(gewaehlt)}</span>
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
          <p className="mt-2 max-h-28 overflow-y-auto font-tafel text-[13px] leading-relaxed text-knochen/85">
            {erklaerung.text}
          </p>
          <p className="mt-2 font-etikett text-[10px] text-flechte/70">
            <a href={erklaerung.url} target="_blank" rel="noreferrer" className="hover:text-knochen">
              {t(lang, 'mehrErfahren')}
            </a>
            {' · '}
            {t(lang, 'steckbriefQuelle')}
          </p>
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
}: {
  quelle: HierarchyPointNode<Knoten>
  ziel: HierarchyPointNode<Knoten>
  ton: Ton | null
}) {
  const oben = quelle.y + 16
  const unten = ziel.y - 24
  const knick = quelle.y + REIHE * 0.5
  const ausgelassen = ziel.data.ausgelassen
  const farbe = ton ? ton.linie : 'text-linie'

  return (
    <g className={farbe}>
      <path
        d={`M${quelle.x},${oben} L${quelle.x},${knick} L${ziel.x},${knick}`}
        fill="none"
        stroke="currentColor"
        strokeWidth={1}
      />
      <path
        d={`M${ziel.x},${knick} L${ziel.x},${unten}`}
        fill="none"
        stroke="currentColor"
        strokeWidth={1}
        strokeDasharray={ausgelassen > 0 ? '2 4' : undefined}
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
          className={istHinweis ? 'text-mittel' : gewaehlt ? 'text-nah' : betont ? 'text-flechte' : 'text-linie'}
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
    : schritte !== undefined
      ? 'fill-kabinett ' + waerme(schritte).strich
      : 'fill-kabinett stroke-linie'

  return (
    <g transform={`translate(${x - breite / 2}, ${y - hoehe / 2 + 4})`} className="animate-aufblenden">
      <rect width={breite} height={hoehe} className={rahmen} strokeWidth={1} />
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
