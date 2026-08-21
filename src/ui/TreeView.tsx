import { useMemo, useRef } from 'react'
import { hierarchy, tree as d3tree, type HierarchyPointNode } from 'd3-hierarchy'
import { TransformWrapper, TransformComponent, type ReactZoomPanPinchRef } from 'react-zoom-pan-pinch'
import type { Tree } from '../core/tree.ts'
import type { GameState } from '../core/game.ts'
import { revealedNodes } from '../core/game.ts'
import type { Lang } from '../core/types.ts'
import { t } from '../i18n/strings.ts'

/**
 * Der aufgedeckte Teil des Stammbaums.
 *
 * Gezeigt wird nie der ganze Baum, sondern nur, was der Spieler aufgedeckt hat.
 * Sonst waeren es mehrere tausend Knoten, und die Loesung stuende darin.
 */

interface Knoten {
  index: number
  children: Knoten[]
}

interface Props {
  tree: Tree
  state: GameState
  lang: Lang
  /** Baumknoten der Spieltiere, damit Blaetter anders gezeichnet werden. */
  animalOfNode: Map<number, number>
}

const KNOTEN_BREITE = 168
const REIHEN_HOEHE = 78

function baueTeilbaum(tree: Tree, sichtbar: Set<number>): Knoten | null {
  if (sichtbar.size === 0) return null

  const kinder = new Map<number, number[]>()
  let wurzel = -1
  for (const i of sichtbar) {
    const p = tree.parentOf(i)
    if (p === -1 || !sichtbar.has(p)) {
      wurzel = i
      continue
    }
    const liste = kinder.get(p)
    if (liste) liste.push(i)
    else kinder.set(p, [i])
  }
  if (wurzel === -1) return null

  const bauen = (index: number): Knoten => ({
    index,
    children: (kinder.get(index) ?? []).sort((a, b) => a - b).map(bauen),
  })
  return bauen(wurzel)
}

export function TreeView({ tree, state, lang, animalOfNode }: Props) {
  const zoom = useRef<ReactZoomPanPinchRef | null>(null)

  const layout = useMemo(() => {
    const sichtbar = revealedNodes(state, tree)
    const wurzel = baueTeilbaum(tree, sichtbar)
    if (!wurzel) return null

    const h = hierarchy<Knoten>(wurzel)
    const gelegt = d3tree<Knoten>().nodeSize([KNOTEN_BREITE, REIHEN_HOEHE])(h)

    let minX = Infinity
    let maxX = -Infinity
    let maxY = 0
    gelegt.each((n) => {
      minX = Math.min(minX, n.x)
      maxX = Math.max(maxX, n.x)
      maxY = Math.max(maxY, n.y)
    })

    const rand = KNOTEN_BREITE / 2 + 16
    return {
      wurzelKnoten: gelegt,
      knoten: gelegt.descendants(),
      kanten: gelegt.links(),
      versatzX: -minX + rand,
      breite: maxX - minX + rand * 2,
      hoehe: maxY + REIHEN_HOEHE,
    }
  }, [tree, state])

  if (!layout) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-slate-400">
        {t(lang, 'baumLeer')}
      </div>
    )
  }

  const getraten = new Set(state.guesses.map((g) => g.node))
  const hinweise = new Set(state.hints)
  const besteGruppe = state.guesses.reduce<number | null>(
    (best, g) => (best === null || tree.depthOf(g.lca) > tree.depthOf(best) ? g.lca : best),
    null,
  )

  return (
    <div className="relative h-full w-full">
      <TransformWrapper
        ref={zoom}
        minScale={0.25}
        maxScale={2.5}
        initialScale={0.7}
        centerOnInit
        limitToBounds={false}
        doubleClick={{ mode: 'zoomIn' }}
        wheel={{ step: 0.08 }}
      >
        <TransformComponent
          wrapperClass="!h-full !w-full"
          contentClass="!h-full !w-full"
        >
          <svg width={layout.breite} height={layout.hoehe} className="overflow-visible">
            <g transform={`translate(${layout.versatzX}, ${REIHEN_HOEHE / 2})`}>
              {layout.kanten.map((kante, i) => (
                <path
                  key={i}
                  d={kantenPfad(kante.source, kante.target)}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  className="text-slate-600"
                />
              ))}

              {layout.knoten.map((n) => {
                const index = n.data.index
                const istBlatt = animalOfNode.has(index)
                const istTipp = getraten.has(index)
                const istZiel = index === state.targetNode && state.status !== 'laeuft'
                const istHinweis = hinweise.has(index)
                const istBesteGruppe = index === besteGruppe

                return (
                  <TreeNodeBox
                    key={index}
                    x={n.x}
                    y={n.y}
                    titel={tree.nameOf(index, lang)}
                    untertitel={tree.hasCommonName(index, lang) ? tree.scientificName(index) : tree.rankOf(index)}
                    blatt={istBlatt}
                    tipp={istTipp}
                    ziel={istZiel}
                    hinweis={istHinweis}
                    hervor={istBesteGruppe}
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
        className="absolute bottom-3 right-3 rounded-full bg-slate-800/90 px-3 py-1.5 text-xs text-slate-300 shadow ring-1 ring-slate-700 hover:bg-slate-700"
      >
        {t(lang, 'zuruecksetzen')}
      </button>
    </div>
  )
}

/** Geschwungene Kante von Elternknoten zu Kind. */
function kantenPfad(quelle: HierarchyPointNode<Knoten>, ziel: HierarchyPointNode<Knoten>): string {
  const mitte = (quelle.y + ziel.y) / 2
  return `M${quelle.x},${quelle.y + 14} C${quelle.x},${mitte} ${ziel.x},${mitte} ${ziel.x},${ziel.y - 20}`
}

interface BoxProps {
  x: number
  y: number
  titel: string
  untertitel: string
  blatt: boolean
  tipp: boolean
  ziel: boolean
  hinweis: boolean
  hervor: boolean
}

function TreeNodeBox({ x, y, titel, untertitel, blatt, tipp, ziel, hinweis, hervor }: BoxProps) {
  const breite = 148
  const hoehe = 40

  const fuellung = ziel
    ? 'fill-emerald-500/25 stroke-emerald-400'
    : tipp
      ? 'fill-slate-700/80 stroke-slate-500'
      : hinweis
        ? 'fill-amber-500/20 stroke-amber-400/70'
        : hervor
          ? 'fill-teal-500/20 stroke-teal-400/70'
          : 'fill-slate-800/70 stroke-slate-700'

  return (
    <g transform={`translate(${x - breite / 2}, ${y - hoehe / 2})`}>
      <rect width={breite} height={hoehe} rx={blatt ? 20 : 8} className={fuellung} strokeWidth={1.5} />
      <text
        x={breite / 2}
        y={untertitel ? 17 : 24}
        textAnchor="middle"
        className={'fill-slate-100 text-[11px] font-medium ' + (ziel ? 'fill-emerald-200' : '')}
      >
        {kuerzen(titel, 20)}
      </text>
      {untertitel && (
        <text x={breite / 2} y={30} textAnchor="middle" className="fill-slate-400 text-[9px] italic">
          {kuerzen(untertitel, 24)}
        </text>
      )}
    </g>
  )
}

function kuerzen(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max - 1) + '…'
}
