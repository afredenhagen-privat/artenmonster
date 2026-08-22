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
  MIN_SITELINKS: 4,

  /**
   * Zielgroessen der drei Schwierigkeitsstufen. Zusammen ergeben sie den Pool.
   *
   * Die Grenzen stammen aus der Bekanntheitsverteilung: Rang 400 liegt bei etwa
   * Nutria und Kanadischem Luchs, Rang 1500 bei Klippentaube und Bennettkasuar,
   * Rang 3000 bei Kragenfaultier. Danach wird es zur Lotterie, deshalb ist dort
   * Schluss, obwohl rund 12.800 Tiere alle Anforderungen erfuellen wuerden.
   */
  TIERS: {
    1: { name: { de: 'Leicht', en: 'Easy' }, size: 500 },
    2: { name: { de: 'Mittel', en: 'Medium' }, size: 1400 },
    3: { name: { de: 'Schwer', en: 'Hard' }, size: 2100 },
  },

  /*
   * Mindestplaetze je Grossgruppe.
   *
   * Ohne Quote entscheidet allein die Bekanntheit, und dann besteht das Spiel
   * zur Haelfte aus Voegeln: Ueber Vogelarten schreibt die halbe Welt, ueber
   * einen beliebigen Kaefer niemand. Gemessen an der Artenzahl ist das die
   * Wirklichkeit auf den Kopf gestellt, denn allein von den Kaefern gibt es
   * mehr Arten als von allen Wirbeltieren zusammen.
   *
   * Jede Gruppe bekommt ihre Plaetze nach eigener Bekanntheitsreihenfolge. Was
   * uebrig bleibt, wird global nach Bekanntheit aufgefuellt. Die Reihenfolge
   * hier ist die Reihenfolge der Zuteilung.
   */
  GRUPPEN: [
    { taxid: 8782, name: 'Vögel', ziel: 1000 },
    { taxid: 40674, name: 'Säugetiere', ziel: 800 },
    { taxid: 50557, name: 'Insekten', ziel: 700 },
    { taxid: 7898, name: 'Strahlenflosser', ziel: 350 },
    { taxid: 8504, name: 'Schuppenkriechtiere', ziel: 200 },
    { taxid: 6854, name: 'Spinnentiere', ziel: 130 },
    { taxid: 8292, name: 'Amphibien', ziel: 120 },
    { taxid: 7777, name: 'Knorpelfische', ziel: 120 },
    { taxid: 6447, name: 'Weichtiere', ziel: 70 },
    { taxid: 8459, name: 'Schildkröten', ziel: 60 },
    // 6657 (Crustacea) fuehrt NCBI nicht mehr als Gruppe, es gilt als
    // paraphyletisch. Die Hoeheren Krebse mit Krabben, Hummern und Asseln
    // sitzen unter Malacostraca.
    { taxid: 6681, name: 'Höhere Krebse', ziel: 50 },
    { taxid: 6073, name: 'Nesseltiere', ziel: 30 },
    { taxid: 7586, name: 'Stachelhäuter', ziel: 25 },
    { taxid: 6340, name: 'Ringelwürmer', ziel: 15 },
    { taxid: 1294634, name: 'Krokodile', ziel: 25 },
  ] as ReadonlyArray<{ taxid: number; name: string; ziel: number }>,

  /** Maximale Laenge eines Steckbriefs in Zeichen. */
  BLURB_MAX_CHARS: 350,

  /** Breite der Bild-Thumbnails von Wikimedia Commons. */
  IMAGE_WIDTH: 400,

  /*
   * Hoeflichkeit gegenueber den Wikimedia-Servern.
   *
   * Der User-Agent muss eine erreichbare Adresse nennen, das verlangen die
   * Wikimedia-Richtlinien ausdruecklich. Ohne sie drosselt die Abrufzahlen-
   * Schnittstelle brutal: 13 Anfragen je Minute mit 59-Sekunden-Zwangspausen,
   * gegenueber ueber 1500 je Minute mit Adresse. Es war nicht die Nebenlaeufigkeit.
   */
  HTTP: {
    userAgent: 'artenmonster/0.1 (https://github.com/afredenhagen-privat/artenmonster)',
    concurrency: 6,
    retries: 6,
  },
} as const

export type TierId = 1 | 2 | 3
