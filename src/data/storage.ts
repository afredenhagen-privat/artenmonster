import { MAX_GUESSES, type BaumModus } from '../core/game.ts'
import type { Lang, TierId } from '../core/types.ts'

/**
 * Ablage im Browser. Alles bleibt auf dem Geraet, es geht nichts an einen Server.
 *
 * Es sind ein paar Kilobyte, deshalb reicht localStorage. Eine IndexedDB waere
 * hier mehr Maschinerie als Nutzen.
 */

const PREFIX = 'artenmonster:'

/** 'system' folgt der Einstellung des Geraets, alles andere uebersteuert sie. */
export type Thema = 'system' | 'hell' | 'dunkel'

export interface Einstellungen {
  lang: Lang
  tier: TierId
  /** Wie viel vom Stammbaum gezeigt wird. */
  baumModus: BaumModus
  thema: Thema
  /** Versuche je Runde. Infinity heisst ohne Limit. */
  maxGuesses: number
}

/**
 * JSON kennt kein Infinity — JSON.stringify macht daraus null, und beim Lesen
 * faellt der Wert stillschweigend auf den Standard zurueck. Deshalb steht "ohne
 * Limit" in der Ablage als 0.
 */
const OHNE_LIMIT = 0

export interface TagesErgebnis {
  tag: string
  tier: TierId
  gewonnen: boolean
  versuche: number
  /** Verbleibende Verzweigungen je Tipp, fuer den Teilen-Block. */
  verlauf: number[]
}

export interface Statistik {
  gespielt: number
  gewonnen: number
  serie: number
  besteSerie: number
  /** Wie oft wurde in n Versuchen gewonnen? */
  verteilung: Record<string, number>
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    // Privater Modus oder voller Speicher: das Spiel laeuft auch ohne Ablage.
  }
}

export function ladeEinstellungen(): Einstellungen {
  const gespeichert = read<Partial<Einstellungen>>('settings', {})
  const browserSprache = typeof navigator !== 'undefined' && navigator.language?.startsWith('en') ? 'en' : 'de'
  return {
    lang: gespeichert.lang ?? browserSprache,
    tier: gespeichert.tier ?? 1,
    baumModus: gespeichert.baumModus ?? 'gruppe',
    thema: gespeichert.thema ?? 'system',
    maxGuesses:
      gespeichert.maxGuesses === OHNE_LIMIT ? Infinity : (gespeichert.maxGuesses ?? MAX_GUESSES),
  }
}

export function speichereEinstellungen(e: Einstellungen): void {
  write('settings', {
    ...e,
    maxGuesses: Number.isFinite(e.maxGuesses) ? e.maxGuesses : OHNE_LIMIT,
  })
}

export function ladeTagesErgebnis(tag: string, tier: TierId): TagesErgebnis | null {
  const alle = read<Record<string, TagesErgebnis>>('daily', {})
  return alle[tag + ':' + tier] ?? null
}

export function speichereTagesErgebnis(e: TagesErgebnis): void {
  const alle = read<Record<string, TagesErgebnis>>('daily', {})
  alle[e.tag + ':' + e.tier] = e
  // Nur das letzte Jahr behalten, damit die Ablage nicht endlos waechst.
  const schluessel = Object.keys(alle).sort()
  for (const k of schluessel.slice(0, Math.max(0, schluessel.length - 400))) delete alle[k]
  write('daily', alle)
}

export function ladeStatistik(): Statistik {
  return read<Statistik>('stats', { gespielt: 0, gewonnen: 0, serie: 0, besteSerie: 0, verteilung: {} })
}

export function buchePartie(gewonnen: boolean, versuche: number): Statistik {
  const s = ladeStatistik()
  s.gespielt++
  if (gewonnen) {
    s.gewonnen++
    s.serie++
    s.besteSerie = Math.max(s.besteSerie, s.serie)
    s.verteilung[String(versuche)] = (s.verteilung[String(versuche)] ?? 0) + 1
  } else {
    s.serie = 0
  }
  write('stats', s)
  return s
}
