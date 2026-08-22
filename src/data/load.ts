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
  /** Index der Grossgruppe in GameData.kategorien, -1 wenn in keiner. */
  kat: number
  image?: ImageInfo
}

/** Eine wählbare Grossgruppe, etwa Vögel oder Insekten. */
export interface Kategorie {
  de: string
  en: string
}

export interface GameData {
  tree: Tree
  /** Weggefaltete Zwischenstufen je Knotenindex, fuer den Ergebnisschirm. */
  hidden: Record<string, string[]>
  animals: AnimalEntry[]
  tierRanges: Record<string, { from: number; to: number }>
  kategorien: Kategorie[]
  thumbPrefix: string
  search: SearchIndex
  /** Baumknoten zurueck auf den Tierindex. */
  animalOfNode: Map<number, number>
  meta: {
    builtAt: string
    counts: { nodes: number; animals: number }
    /** Inhaltsstempel der nachgeladenen Dateien, je Dateiname. */
    textVersion?: Record<string, string>
  }
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
        kategorien?: Kategorie[]
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
      kategorien: animalsRaw.kategorien ?? [],
      thumbPrefix: animalsRaw.thumbPrefix,
      search: new SearchIndex({ entries: searchRaw.entries }),
      animalOfNode,
      meta,
    }
  })()
  return cached
}

const textCache = new Map<string, Promise<BlurbData>>()

/**
 * Laedt eine der beiden Textdateien, mit ihrem Inhaltsstempel in der Adresse.
 *
 * Der Stempel steht in meta.json und liegt damit im Precache: Er ist nach einem
 * Deploy sofort neu, waehrend die Textdatei selbst im Laufzeit-Cache des Service
 * Workers noch alt sein kann. Neue Daten heissen so eine neue Adresse, und die
 * kann der Cache nicht mit einem alten Stand beantworten. Ohne den Stempel blieb
 * nach jedem Neubau der Daten fuer eine Sitzung der alte Stand stehen.
 */
function ladeTexte(datei: string, version: string | undefined): Promise<BlurbData> {
  const schluessel = datei + '?' + (version ?? '')
  let p = textCache.get(schluessel)
  if (!p) {
    p = getJson<BlurbData>(version ? datei + '?v=' + version : datei).catch(() => ({}) as BlurbData)
    textCache.set(schluessel, p)
  }
  return p
}

/** Steckbriefe. Werden erst geholt, wenn jemand ein Tier antippt oder loest. */
export function loadBlurbs(lang: Lang, version?: string): Promise<BlurbData> {
  return ladeTexte('blurbs.' + lang + '.json', version)
}

/**
 * Erklaerungen zu den Gruppen im Baum. Wie die Steckbriefe erst bei Bedarf, sie
 * gehoeren nicht zu dem, was das Spiel zum Laufen braucht.
 */
export function loadGruppen(lang: Lang, version?: string): Promise<BlurbData> {
  return ladeTexte('gruppen.' + lang + '.json', version)
}

/** Der Inhaltsstempel einer nachladbaren Datei, falls die Daten ihn kennen. */
export function textVersion(data: GameData, datei: string): string | undefined {
  return data.meta.textVersion?.[datei]
}

export function imageUrl(data: GameData, image: ImageInfo): string {
  return image.url.startsWith('http') ? image.url : data.thumbPrefix + image.url
}
