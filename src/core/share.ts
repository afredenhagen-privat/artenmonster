import type { GameState } from './game.ts'
import type { Lang, TierId } from './types.ts'

/**
 * Ergebnis als Emoji-Block, wie man ihn von Wordle kennt.
 * Ein Feld je Tipp, die Farbe zeigt, wie nah er dran war.
 */

/** Von kalt nach warm. Gruen heisst getroffen. */
const FELDER = ['🟩', '🟧', '🟨', '🟦', '⬜'] as const

export function feldFuer(steps: number): string {
  return FELDER[Math.min(steps, FELDER.length - 1)]
}

export interface ShareOptions {
  lang: Lang
  tier: TierId
  /** Nummer des Tagesraetsels. Fehlt sie, wird die Zeile weggelassen. */
  puzzle?: number
  url?: string
}

export function buildShareText(state: GameState, options: ShareOptions): string {
  const { lang, tier, puzzle, url } = options

  const stufe = lang === 'de' ? 'Stufe ' + tier : 'Level ' + tier
  const kopf = puzzle !== undefined ? 'Artenmonster #' + puzzle + ' · ' + stufe : 'Artenmonster · ' + stufe

  // Ohne Limit steht das Unendlichzeichen im Nenner. "3/Infinity" haette sonst
  // im geteilten Text gestanden.
  const nenner = Number.isFinite(state.maxGuesses) ? String(state.maxGuesses) : '∞'
  const ergebnis = (state.status === 'gewonnen' ? String(state.guesses.length) : 'X') + '/' + nenner

  // Bei vielen Tipps in Zeilen zu fuenft umbrechen, sonst wird es unlesbar.
  const felder = state.guesses.map((g) => feldFuer(g.steps))
  const zeilen: string[] = []
  for (let i = 0; i < felder.length; i += 5) zeilen.push(felder.slice(i, i + 5).join(''))

  const teile = [kopf + '  ' + ergebnis, ...zeilen]
  if (url) teile.push(url)
  return teile.join('\n')
}

/** Kopiert in die Zwischenablage, mit Rueckfallebene fuer aeltere Browser. */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Faellt unten auf die alte Methode zurueck.
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}
