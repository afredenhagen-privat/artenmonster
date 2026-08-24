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

    versucheFeld: 'Versuche',
    ohneLimit: '∞',
    versucheHinweis: 'Eine andere Zahl startet eine neue Runde. ∞ heißt ohne Limit.',

    kategorien: 'Gruppen',
    kategorienAlle: 'Alle',
    kategorienUmkehren: 'Umkehren',
    kategorienHinweis: 'Bestimmt, woraus das gesuchte Tier kommt. Raten darfst du weiter alles.',
    kategorienLeer: 'In dieser Stufe gibt es kein Tier aus den gewählten Gruppen.',
    kategorienTag: 'Das Tagesrätsel nimmt immer alle Gruppen, sonst wäre es nicht für alle dasselbe.',

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
    hinweisMerkmal: 'Merkmal',

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
    steckbriefQuelleFremd: 'Text aus der englischen Wikipedia, CC BY-SA 4.0',

    baum: 'Stammbaum',
    baumLeer: 'Rate ein Tier. Der Baum wächst mit jedem Versuch.',
    zuruecksetzen: 'Ansicht zurücksetzen',
    baumGruppe: 'Bis zur Gruppe',
    baumVoll: 'Vollständig',
    baumModusHilfe: 'Bis zur Gruppe zeigt nur die gemeinsamen Gruppen. Vollständig zeigt jede Abstammungsebene.',
    gruppe: 'Gruppe',
    steckbriefLaedt: 'Steckbrief wird geladen ...',
    keinSteckbrief: 'Zu diesem Tier liegt kein Text vor.',
    schliessen: 'Schließen',
    gesuchtesTier: 'Hier steckt die Lösung',
    vollbild: 'Vollbild',
    themaHell: 'Hell',
    themaDunkel: 'Dunkel',
    themaSystem: 'System',
    themaWechseln: 'Darstellung wechseln',
    vollbildVerlassen: 'Vollbild verlassen',

    laedt: 'Lade Stammbaum ...',
    ladefehler: 'Die Spieldaten ließen sich nicht laden.',
    erneutVersuchen: 'Erneut versuchen',
    offline: 'Offline. Das Spiel läuft weiter, nur Bilder fehlen.',

    sprache: 'English',
    ueber: 'Über',
    datenstand: 'Datenstand {datum}',
    quellen: 'Stammbaum: NCBI Taxonomy. Namen, Texte und Bilder: Wikidata, Wikipedia und Wikimedia Commons.',
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

    versucheFeld: 'Guesses',
    ohneLimit: '∞',
    versucheHinweis: 'Changing the number starts a new round. ∞ means no limit.',

    kategorien: 'Groups',
    kategorienAlle: 'All',
    kategorienUmkehren: 'Invert',
    kategorienHinweis: 'Sets where the mystery animal comes from. You can still guess anything.',
    kategorienLeer: 'No animal in this level belongs to the selected groups.',
    kategorienTag: 'The daily always uses every group — otherwise it would not be the same for everyone.',

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
    hinweisMerkmal: 'Trait',

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
    steckbriefQuelleFremd: 'Text from the German Wikipedia, CC BY-SA 4.0',

    baum: 'Tree of life',
    baumLeer: 'Make a guess. The tree grows with every try.',
    zuruecksetzen: 'Reset view',
    baumGruppe: 'To the group',
    baumVoll: 'Every level',
    baumModusHilfe: 'To the group shows only the shared groups. Every level shows the full lineage.',
    gruppe: 'Group',
    steckbriefLaedt: 'Loading profile ...',
    keinSteckbrief: 'No text available for this animal.',
    schliessen: 'Close',
    gesuchtesTier: 'The answer is in here',
    vollbild: 'Full screen',
    themaHell: 'Light',
    themaDunkel: 'Dark',
    themaSystem: 'System',
    themaWechseln: 'Switch appearance',
    vollbildVerlassen: 'Leave full screen',

    laedt: 'Loading the tree ...',
    ladefehler: 'Could not load the game data.',
    erneutVersuchen: 'Try again',
    offline: 'Offline. The game keeps working, only images are missing.',

    sprache: 'Deutsch',
    ueber: 'About',
    datenstand: 'Data from {datum}',
    quellen: 'Tree: NCBI Taxonomy. Names, texts and images: Wikidata, Wikipedia and Wikimedia Commons.',
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
