import { fetchCached, isCached, mapLimit, sleep } from './http.ts'
import { CONFIG } from './config.ts'

/**
 * Wikipedia-Abrufzahlen als Bekanntheitsmass.
 *
 * Bisher wurde die Zahl der Wikipedia-Sprachversionen benutzt. Die misst aber,
 * wie gruendlich eine Gruppe erfasst ist, nicht wie bekannt ein Tier ist. Bei
 * Voegeln ist sie systematisch aufgeblaeht, weil Vogelkunde ein weltweit
 * gepflegtes Hobby ist: Jede europaeische Vogelart hat Artikel in dreissig
 * Sprachen. So landeten Lachseeschwalbe und Rotschenkel in der Stufe "Leicht".
 *
 * Abrufzahlen messen dagegen, wonach Menschen tatsaechlich suchen. Genommen wird
 * die deutsche Wikipedia: Der Kandidatenpool stammt ohnehin von dort, und für
 * ein Spiel mit deutschen Tiernamen ist das genau das richtige Publikum.
 *
 * Die Schnittstelle kann nur einen Artikel je Anfrage, deshalb dauert der erste
 * Lauf. Danach liegt alles im Plattencache.
 */

const BASIS = 'https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article'

export interface Aufrufe {
  /** Summe der Abrufe im betrachteten Zeitraum. */
  gesamt: number
  /** Monate mit Daten. Weniger als erwartet heisst: Artikel ist jung. */
  monate: number
}

/**
 * Zeitraum der Auswertung. Ein volles Jahr glaettet Ausschlaege durch
 * Nachrichtenlagen: Ein Tier, das wegen einer Meldung einen Monat lang
 * angeklickt wird, soll deswegen nicht als allgemein bekannt gelten.
 */
export const ZEITRAUM = { von: '20250801', bis: '20260731' }

function url(titel: string): string {
  // Der Titel steht im Pfad und muss deshalb doppelt kodiert werden, sonst
  // zerlegen Schraegstriche in Artikelnamen den Pfad.
  const kodiert = encodeURIComponent(titel.replace(/ /g, '_'))
  return (
    BASIS + '/de.wikipedia/all-access/user/' + kodiert + '/monthly/' + ZEITRAUM.von + '/' + ZEITRAUM.bis
  )
}

/**
 * Holt die Abrufzahlen zu vielen Artikeln. Titel ohne Daten fehlen im Ergebnis,
 * der Aufrufer muss das abfangen.
 */
export async function fetchPageviews(
  titel: readonly string[],
  onProgress?: (done: number, total: number) => void,
): Promise<Map<string, Aufrufe>> {
  const eindeutig = [...new Set(titel.filter(Boolean))]
  const out = new Map<string, Aufrufe>()

  await mapLimit(
    eindeutig,
    CONFIG.HTTP.concurrency,
    async (t) => {
      const adresse = url(t)
      if (!isCached(adresse)) await sleep(60)
      const body = await fetchCached(adresse)
      if (!body) return
      try {
        const json = JSON.parse(body) as { items?: Array<{ views: number }> }
        const items = json.items ?? []
        if (items.length === 0) return
        out.set(t, {
          gesamt: items.reduce((s, i) => s + (i.views ?? 0), 0),
          monate: items.length,
        })
      } catch {
        // Kaputte Antwort behandeln wir wie fehlende Daten.
      }
    },
    onProgress,
  )

  return out
}

/**
 * Ersatzwert fuer Artikel ohne Abrufdaten, geschaetzt aus den Sprachversionen.
 *
 * Manche Artikel liefern nichts, etwa weil sie erst kuerzlich umbenannt wurden.
 * Sie einfach auf null zu setzen wuerde bekannte Tiere in die schwerste Stufe
 * verbannen. Stattdessen wird aus allen Tieren, für die beides vorliegt, das
 * mittlere Verhaeltnis Abrufe je Sprachversion bestimmt und darauf hochgerechnet.
 */
export function schaetzerAusSitelinks(
  bekannt: ReadonlyArray<{ sitelinks: number; aufrufe: number }>,
): (sitelinks: number) => number {
  const verhaeltnisse = bekannt
    .filter((b) => b.sitelinks > 0 && b.aufrufe > 0)
    .map((b) => b.aufrufe / b.sitelinks)
    .sort((a, b) => a - b)

  const median = verhaeltnisse.length > 0 ? verhaeltnisse[Math.floor(verhaeltnisse.length / 2)] : 1
  return (sitelinks: number) => Math.round(sitelinks * median)
}
