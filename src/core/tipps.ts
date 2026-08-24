import type { Lang } from './types.ts'

/**
 * Merkmalshinweise aus dem Wikipedia-Anriss.
 *
 * Ein Hinweis soll auf Aussehen, Färbung, Größe oder Lebensraum zeigen, ohne
 * das Tier zu verraten. Genau solche Sätze stehen im Anriss des Artikels — nur
 * eben zwischen anderen, die den Namen nennen.
 *
 * Die Auswahl arbeitet deshalb in drei Stufen:
 *
 *   1. Sätze, die einen der Namen enthalten, fliegen raus.
 *   2. Sätze über den Namen selbst ("Die Bezeichnung leitet sich ab von ...")
 *      fliegen ebenfalls raus. Sie sind Sprachgeschichte, kein Merkmal.
 *   3. Wörter, die nur das Grundwort streifen, werden geschwärzt statt den Satz
 *      zu verwerfen: Aus "Verglichen mit anderen Arten ist die Ringelmücke groß"
 *      wird "Verglichen mit anderen Arten ist die … groß". Das hebt die Ausbeute
 *      von rund der Hälfte der Tiere auf zwei Drittel.
 *
 * Die Logik liegt im Kern und nicht bei den Werkzeugen, damit sie sich mit den
 * übrigen Tests prüfen lässt. Gebraucht wird sie nur zur Bauzeit.
 */

export interface TippOptionen {
  /** So weit in den Anriss wird hineingesehen. */
  fenster: number
  minLaenge: number
  maxLaenge: number
  maxSaetze: number
  /** Mehr Schwärzungen als das, und der Satz sagt nichts mehr aus. */
  maxSchwaerzungen: number
}

export const TIPP_STANDARD: TippOptionen = {
  fenster: 1400,
  minLaenge: 40,
  maxLaenge: 300,
  maxSaetze: 3,
  maxSchwaerzungen: 2,
}

/**
 * Sätze über Namen und Wortherkunft. Sie stehen oft im Anriss, taugen aber
 * nicht als Hinweis: Wer wissen will, wie ein Tier aussieht, ist mit
 * "Die Bezeichnung ist im Lebensmittelrecht nicht gestattet" nicht bedient.
 */
const META: Record<Lang, RegExp> = {
  de: /bezeichnung|\bnamen?\b|benannt|genannt|synonym|erstbeschr|abgeleitet|wortherkunft|heißt/i,
  en: /\bnames?\b|named|called|synonym|etymolog|derived from|first described/i,
}

/** Kleinschreibung ohne Diakritika, damit "Mücke" und "muecke" gleich zählen. */
function normalisiere(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')
}

export interface TierNamen {
  /** Trivialnamen, deutsch und englisch. */
  trivial: string[]
  /** Wissenschaftlicher Name und seine Gattung. */
  wissenschaftlich: string[]
}

/**
 * Die verräterischen Bruchstücke eines Namens.
 *
 * Neben dem ganzen Namen sind es seine Wörter ab fünf Zeichen und deren
 * Endungen: Im Deutschen steht das Grundwort einer Zusammensetzung hinten, und
 * "Lerchenart" verrät die Heidelerche genauso wie "Heidelerche" selbst. Die
 * vorderen Bestandteile bleiben ausgespart — sonst sperrte "Europäische
 * Hornotter" jeden Satz, der Europa erwähnt, und damit ausgerechnet die
 * Angabe zum Lebensraum.
 */
export function namensMarker(name: string, mitWortanfang = false): string[] {
  const marker: string[] = []
  const n = normalisiere(name).trim()
  if (!n) return marker
  marker.push(n)
  for (const wort of n.split(/[^a-z]+/).filter((w) => w.length >= 5)) {
    marker.push(wort)
    for (const laenge of [6, 5]) if (wort.length > laenge) marker.push(wort.slice(-laenge))
    /*
     * Bei wissenschaftlichen Namen zaehlt auch der Wortanfang. Lateinische
     * Familien- und Unterfamiliennamen werden aus dem Gattungsstamm gebildet:
     * Aus Balaeniceps wird Balaenicipitidae, aus Panthera wird Pantherinae. Wer
     * nur auf Wortenden achtet, laesst genau diese Verwandten durch — und ein
     * Satz wie "wird einer eigenen Familie, den Balaenicipitidae, zugeordnet"
     * ist eine Suchmaschinenabfrage von der Loesung entfernt.
     *
     * Fuer Trivialnamen waere das falsch: Dort sperrte der Anfang von
     * "Europaeische Hornotter" jeden Satz ueber Europa.
     */
    if (mitWortanfang && wort.length > 6) marker.push(wort.slice(0, 6))
  }
  return marker
}

/** Ersetzt verräterische Wörter durch ein Auslassungszeichen. */
function schwaerze(satz: string, marker: readonly string[]): { satz: string; ersetzt: number } {
  let ersetzt = 0
  const teile = satz.split(/(\s+)/).map((stueck) => {
    if (/^\s*$/.test(stueck)) return stueck
    const n = normalisiere(stueck)
    if (marker.some((m) => m.length >= 5 && n.includes(m))) {
      ersetzt++
      return '…'
    }
    return stueck
  })
  // Mehrere geschwärzte Wörter nebeneinander werden zu einer Lücke.
  return { satz: teile.join('').replace(/…(?:\s+…)+/g, '…').trim(), ersetzt }
}

/**
 * Zerlegt in Sätze. Abkürzungen mit Punkt (z. B., ca., Abb.) beenden keinen
 * Satz, deshalb wird nur vor einem Großbuchstaben getrennt.
 */
function saetze(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-ZÄÖÜ])/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * Baut die Merkmalshinweise zu einem Tier.
 *
 * `namen` sind alle Namen, die es zu verbergen gilt: Trivialname, englischer
 * Name, wissenschaftlicher Name und dessen Gattung.
 */
export function merkmalsSaetze(
  anriss: string,
  namen: TierNamen,
  lang: Lang,
  optionen: TippOptionen = TIPP_STANDARD,
): string[] {
  if (!anriss) return []
  const alle = [...namen.trivial, ...namen.wissenschaftlich].filter(Boolean)
  const marker = [
    ...namen.trivial.flatMap((n) => namensMarker(n)),
    ...namen.wissenschaftlich.flatMap((n) => namensMarker(n, true)),
  ]
  const voll = marker.filter((m) => m.includes(' ') || m.length >= 5)
  const out: string[] = []

  for (const roh of saetze(anriss.slice(0, optionen.fenster))) {
    if (out.length >= optionen.maxSaetze) break
    if (roh.length < optionen.minLaenge || roh.length > optionen.maxLaenge) continue
    if (META[lang].test(roh)) continue

    // Der ganze Name im Satz ist nicht zu retten, der Satz fliegt raus.
    const n = normalisiere(roh)
    if (alle.some((name) => n.includes(normalisiere(name)))) continue

    const { satz, ersetzt } = schwaerze(roh, voll)
    if (ersetzt > optionen.maxSchwaerzungen) continue
    // Ein Satz, der nach dem Schwärzen nur noch aus Lücken besteht, sagt nichts.
    if (satz.replace(/…/g, '').trim().length < optionen.minLaenge) continue
    out.push(satz)
  }
  return out
}
