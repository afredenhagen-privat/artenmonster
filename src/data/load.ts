import { Tree } from '../core/tree.ts'
import { SearchIndex } from '../core/search.ts'
import type { BlurbData, Lang, TierId } from '../core/types.ts'

/**
 * Laedt die generierten Spieldaten.
 *
 * Alle Dateien liegen statisch neben der App. Der Service Worker haelt Baum,
 * Tierliste und Suchindex fest im Precache, deshalb funktioniert das auch ohne
 * Netz. Nur die Steckbriefe werden nachgeladen, weil sie erst nach geloestem
 * Raetsel gebraucht werden.
 */

export interface ImageInfo {
  url: string
  author: string
  license: string
  licenseUrl?: string
  page: string
}

export interface AnimalEntry {
  node: number
  score: number
  tier: TierId
  image?: ImageInfo
}

export interface GameData {
  tree: Tree
  /** Weggefaltete Zwischenstufen je Knotenindex, fuer den Ergebnisschirm. */
  hidden: Record<string, string[]>
  animals: AnimalEntry[]
  tierRanges: Record<string, { from: number; to: number }>
  thumbPrefix: string
  search: SearchIndex
  /** Baumknoten zurueck auf den Tierindex. */
  animalOfNode: Map<number, number>
  meta: { builtAt: string; counts: { nodes: number; animals: number } }
}

function dataUrl(file: string): string {
  return import.meta.env.BASE_URL + 'data/' + file
}

async function getJson<T>(file: string): Promise<T> {
  const res = await fetch(dataUrl(file))
  if (!res.ok) throw new Error('Konnte ' + file + ' nicht laden (HTTP ' + res.status + ')')
  return (await res.json()) as T
}

let cached: Promise<GameData> | null = null

export function loadGameData(): Promise<GameData> {
  cached ??= (async () => {
    const [treeRaw, animalsRaw, searchRaw, meta] = await Promise.all([
      getJson<{ ranks: string[]; nodes: never[]; hidden: Record<string, string[]> }>('tree.json'),
      getJson<{
        animals: AnimalEntry[]
        tierRanges: Record<string, { from: number; to: number }>
        thumbPrefix: string
      }>('animals.json'),
      getJson<{ entries: [string, number][] }>('search.json'),
      getJson<GameData['meta']>('meta.json'),
    ])

    const tree = new Tree({ ranks: treeRaw.ranks, nodes: treeRaw.nodes })
    const animalOfNode = new Map<number, number>()
    animalsRaw.animals.forEach((a, i) => animalOfNode.set(a.node, i))

    return {
      tree,
      hidden: treeRaw.hidden ?? {},
      animals: animalsRaw.animals,
      tierRanges: animalsRaw.tierRanges,
      thumbPrefix: animalsRaw.thumbPrefix,
      search: new SearchIndex({ entries: searchRaw.entries }),
      animalOfNode,
      meta,
    }
  })()
  return cached
}

const blurbCache = new Map<Lang, Promise<BlurbData>>()
const gruppenCache = new Map<Lang, Promise<BlurbData>>()

/** Steckbriefe. Werden erst geholt, wenn der Ergebnisschirm sie braucht. */
export function loadBlurbs(lang: Lang): Promise<BlurbData> {
  let p = blurbCache.get(lang)
  if (!p) {
    p = getJson<BlurbData>('blurbs.' + lang + '.json').catch(() => ({}) as BlurbData)
    blurbCache.set(lang, p)
  }
  return p
}

/**
 * Erklaerungen zu den Gruppen im Baum. Wie die Steckbriefe erst bei Bedarf, sie
 * gehoeren nicht zu dem, was das Spiel zum Laufen braucht.
 */
export function loadGruppen(lang: Lang): Promise<BlurbData> {
  let p = gruppenCache.get(lang)
  if (!p) {
    p = getJson<BlurbData>('gruppen.' + lang + '.json').catch(() => ({}) as BlurbData)
    gruppenCache.set(lang, p)
  }
  return p
}

export function imageUrl(data: GameData, image: ImageInfo): string {
  return image.url.startsWith('http') ? image.url : data.thumbPrefix + image.url
}
