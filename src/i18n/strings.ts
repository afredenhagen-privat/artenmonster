import type { Lang } from '../core/types.ts'

/**
 * Oberflaechentexte. Klein genug, dass sich eine Bibliothek nicht lohnt.
 * Platzhalter werden als {name} geschrieben.
 */
const STRINGS = {
  de: {
    titel: 'Artenmonster',
    untertitel: 'Errate das Tier an seinem Platz im Stammbaum',

    modusTag: 'Tagesrätsel',
    modusEndlos: 'Endlos',
    modusZen: 'Zen',
    modusTagBeschreibung: 'Jeden Tag ein Tier, für alle dasselbe.',
    modusEndlosBeschreibung: 'So viele Runden, wie du magst.',
    modusZenBeschreibung: 'Ohne Versuchslimit, Baum jederzeit sichtbar.',

    stufe: 'Stufe',
    stufe1: 'Leicht',
    stufe2: 'Mittel',
    stufe3: 'Schwer',
    stufeHinweis: 'Die Stufe bestimmt nur das gesuchte Tier. Raten darfst du immer alles.',

    eingabe: 'Tier eingeben ...',
    raten: 'Raten',
    versuche: 'Versuch {n} von {max}',
    verbleibend: '{n} übrig',
    versucheZen: 'Versuch {n}',
    schonGeraten: 'Das hattest du schon.',
    nichtGefunden: 'Kein Tier mit diesem Namen im Spiel.',

    gemeinsam: 'Gemeinsame Gruppe',
    nochSchritte: 'noch {n} Verzweigungen',
    nochEinSchritt: 'nur noch eine Verzweigung',
    gefunden: 'Gefunden',
    innerhalb: 'Dein Tipp ist eine Unterart der Lösung.',
    besterTipp: 'bester Tipp',

    hinweis: 'Hinweis',
    hinweisNehmen: 'Hinweis nehmen',
    hinweisNach: 'Hinweis ab {n} Fehlversuchen',
    hinweisAufgedeckt: 'Das gesuchte Tier gehört zu {gruppe}.',

    gewonnen: 'Erraten!',
    verloren: 'Aufgebraucht',
    loesungWar: 'Gesucht war',
    inVersuchen: 'in {n} Versuchen',
    neueRunde: 'Neue Runde',
    teilen: 'Ergebnis teilen',
    kopiert: 'In die Zwischenablage kopiert.',

    vollerPfad: 'Vollständige Systematik',
    mehrErfahren: 'Artikel bei Wikipedia',
    bildVon: 'Bild: {autor} ({lizenz})',
    steckbriefQuelle: 'Text aus Wikipedia, CC BY-SA 4.0',

    baum: 'Stammbaum',
    baumLeer: 'Rate ein Tier. Der Baum wächst mit jedem Versuch.',
    zuruecksetzen: 'Ansicht zurücksetzen',
    baumGruppe: 'Bis zur Gruppe',
    baumVoll: 'Vollständig',
    baumModusHilfe: 'Bis zur Gruppe zeigt von jedem Tipp nur den Weg bis zur gemeinsamen Gruppe. Vollständig zeigt jede Ebene.',

    laedt: 'Lade Stammbaum ...',
    ladefehler: 'Die Spieldaten ließen sich nicht laden.',
    erneutVersuchen: 'Erneut versuchen',
    offline: 'Offline. Das Spiel läuft weiter, nur Bilder fehlen.',

    sprache: 'English',
    ueber: 'Über',
    datenstand: 'Datenstand {datum}',
    quellen: 'Stammbaum: NCBI Taxonomy. Namen und Bilder: Wikidata, Wikipedia und Wikimedia Commons.',
  },

  en: {
    titel: 'Artenmonster',
    untertitel: 'Guess the animal from its place in the tree of life',

    modusTag: 'Daily',
    modusEndlos: 'Endless',
    modusZen: 'Zen',
    modusTagBeschreibung: 'One animal a day, the same for everyone.',
    modusEndlosBeschreibung: 'As many rounds as you like.',
    modusZenBeschreibung: 'No guess limit, tree always visible.',

    stufe: 'Level',
    stufe1: 'Easy',
    stufe2: 'Medium',
    stufe3: 'Hard',
    stufeHinweis: 'The level only sets the target. You can always guess any animal.',

    eingabe: 'Enter an animal ...',
    raten: 'Guess',
    versuche: 'Guess {n} of {max}',
    verbleibend: '{n} left',
    versucheZen: 'Guess {n}',
    schonGeraten: 'You already tried that one.',
    nichtGefunden: 'No animal by that name in the game.',

    gemeinsam: 'Shared group',
    nochSchritte: '{n} branches to go',
    nochEinSchritt: 'one branch to go',
    gefunden: 'Found it',
    innerhalb: 'Your guess is a subspecies of the answer.',
    besterTipp: 'best guess',

    hinweis: 'Hint',
    hinweisNehmen: 'Take a hint',
    hinweisNach: 'Hint after {n} wrong guesses',
    hinweisAufgedeckt: 'The mystery animal belongs to {gruppe}.',

    gewonnen: 'Solved!',
    verloren: 'Out of guesses',
    loesungWar: 'The answer was',
    inVersuchen: 'in {n} guesses',
    neueRunde: 'New round',
    teilen: 'Share result',
    kopiert: 'Copied to clipboard.',

    vollerPfad: 'Full classification',
    mehrErfahren: 'Read on Wikipedia',
    bildVon: 'Image: {autor} ({lizenz})',
    steckbriefQuelle: 'Text from Wikipedia, CC BY-SA 4.0',

    baum: 'Tree of life',
    baumLeer: 'Make a guess. The tree grows with every try.',
    zuruecksetzen: 'Reset view',
    baumGruppe: 'To the group',
    baumVoll: 'Every level',
    baumModusHilfe: 'To the group shows each guess only as far as the shared group. Every level shows the full lineage.',

    laedt: 'Loading the tree ...',
    ladefehler: 'Could not load the game data.',
    erneutVersuchen: 'Try again',
    offline: 'Offline. The game keeps working, only images are missing.',

    sprache: 'Deutsch',
    ueber: 'About',
    datenstand: 'Data from {datum}',
    quellen: 'Tree: NCBI Taxonomy. Names and images: Wikidata, Wikipedia and Wikimedia Commons.',
  },
} as const

export type StringKey = keyof (typeof STRINGS)['de']

export function t(lang: Lang, key: StringKey, params?: Record<string, string | number>): string {
  let text: string = STRINGS[lang][key]
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replaceAll('{' + k + '}', String(v))
    }
  }
  return text
}

export function tierName(lang: Lang, tier: 1 | 2 | 3): string {
  return t(lang, ('stufe' + tier) as StringKey)
}
