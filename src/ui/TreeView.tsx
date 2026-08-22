import { useMemo, useRef } from 'react'
import { hierarchy, tree as d3tree, type HierarchyPointNode } from 'd3-hierarchy'
import { TransformWrapper, TransformComponent, type ReactZoomPanPinchRef } from 'react-zoom-pan-pinch'
import type { Tree } from '../core/tree.ts'
import { revealedNodes, type BaumModus, type GameState } from '../core/game.ts'
import type { Lang } from '../core/types.ts'
import { t } from '../i18n/strings.ts'

/**
 * Der aufgedeckte Teil des Stammbaums, gezeichnet als Kladogramm.
 *
 * Rechtwinklige Haarlinien statt geschwungener Kanten: So werden Stammbäume in
 * der Systematik tatsächlich gezeichnet, und es unterscheidet die Darstellung
 * von einem beliebigen Organigramm. Die Länge eines Astes bedeutet nichts, die
 * Verzweigung ist die Information.
 *
 * Gezeigt wird nie der ganze Baum, sondern nur, was der Spieler aufgedeckt hat.
 * Sind Ebenen ausgelassen, erscheint die Strecke gestrichelt mit der Zahl der
 * übersprungenen Stufen.
 */

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
}

const SPALTE = 176
const REIHE = 96

/**
 * Baut aus den sichtbaren Knoten einen Baum. Ist der echte Elternknoten nicht
 * sichtbar, hängt der Knoten am nächsten sichtbaren Vorfahren, und die Zahl der
 * dazwischen ausgelassenen Ebenen wird mitgeführt.
 */
function baueTeilbaum(tree: Tree, sichtbar: Set<number>): Knoten | null {
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

  const bauen = (index: number, ausgelassen: number): Knoten => ({
    index,
    ausgelassen,
    children: (kinder.get(index) ?? [])
      .sort((a, b) => a.index - b.index)
      .map((k) => bauen(k.index, k.ausgelassen)),
  })
  return bauen(wurzel, 0)
}

/** Wärmestufe nach verbleibenden Verzweigungen. Kalt heißt weit weg. */
function waerme(steps: number): { strich: string; text: string } {
  if (steps <= 1) return { strich: 'stroke-nah', text: 'text-nah' }
  if (steps === 2) return { strich: 'stroke-mittel', text: 'text-mittel' }
  if (steps === 3) return { strich: 'stroke-weit', text: 'text-weit' }
  return { strich: 'stroke-fern', text: 'text-fern' }
}

export function TreeView({ tree, state, lang, modus, animalOfNode }: Props) {
  const zoom = useRef<ReactZoomPanPinchRef | null>(null)

  const layout = useMemo(() => {
    const sichtbar = revealedNodes(state, tree, modus)
    const wurzel = baueTeilbaum(tree, sichtbar)
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

    const rand = SPALTE / 2 + 24
    return {
      knoten: gelegt.descendants(),
      kanten: gelegt.links(),
      versatzX: -minX + rand,
      breite: maxX - minX + rand * 2,
      hoehe: maxY + REIHE,
    }
  }, [tree, state, modus])

  if (!layout) {
    return (
      <div className="flex h-full items-center justify-center px-8 text-center">
        <p className="max-w-xs font-tafel text-sm italic leading-relaxed text-flechte">{t(lang, 'baumLeer')}</p>
      </div>
    )
  }

  const proTipp = new Map(state.guesses.map((g) => [g.node, g]))
  const hinweise = new Set(state.hints)
  const besteGruppe = state.guesses.reduce<number | null>(
    (best, g) => (best === null || tree.depthOf(g.lca) > tree.depthOf(best) ? g.lca : best),
    null,
  )

  return (
    <div className="relative h-full w-full">
      <TransformWrapper
        ref={zoom}
        minScale={0.3}
        maxScale={2.2}
        initialScale={0.85}
        centerOnInit
        limitToBounds={false}
        doubleClick={{ mode: 'zoomIn' }}
        wheel={{ step: 0.08 }}
      >
        <TransformComponent wrapperClass="!h-full !w-full" contentClass="!h-full !w-full">
          <svg width={layout.breite} height={layout.hoehe} className="overflow-visible">
            <g transform={`translate(${layout.versatzX}, ${REIHE / 2})`}>
              {layout.kanten.map((kante) => (
                <Ast
                  key={kante.target.data.index}
                  quelle={kante.source}
                  ziel={kante.target}
                  tipp={proTipp.get(kante.target.data.index)?.steps}
                />
              ))}

              {layout.knoten.map((n) => {
                const index = n.data.index
                const tipp = proTipp.get(index)
                return (
                  <Marke
                    key={index}
                    x={n.x}
                    y={n.y}
                    name={tree.nameOf(index, lang)}
                    latein={tree.hasCommonName(index, lang) ? tree.scientificName(index) : null}
                    rang={tree.rankOf(index)}
                    istTier={animalOfNode.has(index)}
                    schritte={tipp?.steps}
                    istZiel={index === state.targetNode && state.status !== 'laeuft'}
                    istHinweis={hinweise.has(index)}
                    istBesteGruppe={index === besteGruppe}
                  />
                )
              })}
            </g>
          </svg>
        </TransformComponent>
      </TransformWrapper>

      <button
        type="button"
        onClick={() => zoom.current?.resetTransform()}
        className="absolute bottom-3 right-3 border border-linie bg-kabinett/95 px-3 py-1.5 font-etikett text-[10px] uppercase tracking-etikett text-flechte transition hover:border-flechte hover:text-knochen"
      >
        {t(lang, 'zuruecksetzen')}
      </button>
    </div>
  )
}

/**
 * Ein rechtwinkliger Ast. Sind Ebenen ausgelassen, wird das untere Stück
 * gestrichelt und mit der Zahl der übersprungenen Stufen beschriftet.
 */
function Ast({
  quelle,
  ziel,
  tipp,
}: {
  quelle: HierarchyPointNode<Knoten>
  ziel: HierarchyPointNode<Knoten>
  tipp: number | undefined
}) {
  const oben = quelle.y + 16
  const unten = ziel.y - 26
  const knick = quelle.y + REIHE * 0.55
  const ausgelassen = ziel.data.ausgelassen
  const farbe = tipp === undefined ? 'stroke-linie' : waerme(tipp).strich

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
        <text
          x={ziel.x + 6}
          y={(knick + unten) / 2 + 3}
          className="fill-flechte font-etikett text-[9px]"
        >
          {'+' + ausgelassen}
        </text>
      )}
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
  istBesteGruppe: boolean
}

/**
 * Gruppen stehen als Beschriftung auf der Linie, Tiere als gerahmtes Etikett.
 * Der Unterschied ist inhaltlich: Eine Gruppe ist eine Verzweigung, ein Tier ein
 * Endpunkt, an dem der Baum aufhört.
 */
function Marke({ x, y, name, latein, rang, istTier, schritte, istZiel, istHinweis, istBesteGruppe }: MarkeProps) {
  if (!istTier) {
    const betont = istZiel || istHinweis || istBesteGruppe
    return (
      <g transform={`translate(${x}, ${y})`}>
        <text textAnchor="middle" y={-6} className="fill-flechte font-etikett text-[9px] uppercase tracking-etikett">
          {rang === 'no rank' || rang === 'clade' ? '' : rang}
        </text>
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
          className={istHinweis ? 'text-mittel' : betont ? 'text-flechte' : 'text-linie'}
        />
        {latein && (
          <text textAnchor="middle" y={26} className="fill-flechte/70 font-tafel text-[10px] italic">
            {kuerzen(latein, 26)}
          </text>
        )}
      </g>
    )
  }

  const breite = 142
  const hoehe = 38
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
        y={16}
        textAnchor="middle"
        className={'font-tafel text-[12px] ' + (istZiel ? 'fill-tinte font-bold' : 'fill-knochen')}
      >
        {kuerzen(name, 20)}
      </text>
      <text
        x={breite / 2}
        y={29}
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
