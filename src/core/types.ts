/**
 * Datenmodell, das Pipeline und Spiel teilen.
 *
 * Die Dateien werden zur Bauzeit erzeugt und statisch ausgeliefert. Zur Laufzeit
 * fragt das Spiel keine externe Datenquelle an, deshalb funktioniert es offline.
 * Kompaktheit geht hier vor Lesbarkeit: die Dateien landen im Precache des
 * Service Workers und sollen zusammen unter einem Megabyte bleiben.
 */

export type Lang = 'de' | 'en'
export type TierId = 1 | 2 | 3

/**
 * Ein Baumknoten als Tupel:
 * [ NCBI-Taxon-ID, Index des Elternknotens (-1 bei der Wurzel), Index im
 *   ranks-Array, wissenschaftlicher Name, deutscher Name, englischer Name ]
 *
 * Die Namen sind leer, wenn es keinen Trivialnamen gibt. Dann zeigt die
 * Oberflaeche den wissenschaftlichen Namen.
 */
export type NodeTuple = [taxid: number, parent: number, rank: number, sci: string, de: string, en: string]

export interface TreeData {
  /** Rangbezeichnungen, ueber den Index referenziert ("family", "clade", ...). */
  ranks: string[]
  nodes: NodeTuple[]
}

export interface ImageCredit {
  /** Dateiname auf Wikimedia Commons. */
  file: string
  /** Urheber. Muss angezeigt werden, das verlangen fast alle Commons-Lizenzen. */
  author: string
  /** Lizenzkuerzel, etwa "CC BY-SA 4.0". */
  license: string
  licenseUrl?: string
  /** Beschreibungsseite auf Commons. */
  descriptionUrl: string
}

/**
 * Ein spielbares Tier. Namen stehen im zugehoerigen Baumknoten und werden hier
 * nicht wiederholt.
 */
export interface Animal {
  /** Index des Blattknotens in TreeData.nodes. */
  node: number
  /** Bekanntheitswert (Zahl der Wikipedia-Sprachversionen). */
  score: number
  tier: TierId
  image?: ImageCredit
}

export interface AnimalsData {
  animals: Animal[]
  /** Startindex je Stufe in der nach Bekanntheit sortierten Liste. */
  tierRanges: Record<TierId, { from: number; to: number }>
}

/** Ein Suchbegriff und das Tier, auf das er zeigt. Normalisiert, also umlautfrei. */
export type SearchEntry = [term: string, animal: number]

export interface SearchData {
  entries: SearchEntry[]
}

export interface Blurb {
  text: string
  url: string
}

/** Steckbriefe, nach Tierindex. Wird erst nach geloestem Raetsel geladen. */
export type BlurbData = Record<string, Blurb>

export interface MetaData {
  builtAt: string
  counts: { nodes: number; animals: number; tiers: Record<string, number> }
  sources: {
    ncbi: string
    wikidata: string
    wikipedia: string
  }
}
