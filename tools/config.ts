/**
 * Zentrale Stellschrauben der Datenpipeline.
 * Poolgroesse und Stufengrenzen sind hier Zahlen, keine Codeaenderung.
 */
export const CONFIG = {
  /** Wurzel des Spielbaums: Metazoa, also die vielzelligen Tiere. */
  METAZOA_TAXID: 33208,

  /**
   * Untergrenze der Wikipedia-Sprachversionen bei der Wikidata-Abfrage.
   * Niedriger heisst mehr Kandidaten und laengere Laufzeit.
   */
  MIN_SITELINKS: 12,

  /** Zielgroessen der drei Schwierigkeitsstufen (kumulativ ergibt das den Pool). */
  TIERS: {
    1: { name: { de: 'Leicht', en: 'Easy' }, size: 300 },
    2: { name: { de: 'Mittel', en: 'Medium' }, size: 700 },
    3: { name: { de: 'Schwer', en: 'Hard' }, size: 1500 },
  },

  /** Maximale Laenge eines Steckbriefs in Zeichen. */
  BLURB_MAX_CHARS: 350,

  /** Breite der Bild-Thumbnails von Wikimedia Commons. */
  IMAGE_WIDTH: 400,

  /** Hoeflichkeit gegenueber den Wikimedia-Servern. */
  HTTP: {
    userAgent: 'artenmonster-datapipeline/0.1 (privates Lernspiel; Kontakt via GitHub)',
    concurrency: 6,
    retries: 6,
  },
} as const

export type TierId = 1 | 2 | 3
