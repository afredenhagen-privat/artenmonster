import fs from 'node:fs'
import path from 'node:path'
import { CONFIG } from './config.ts'
import { PATHS } from './paths.ts'
import { fetchCached, isCached, sleep } from './http.ts'

/**
 * Zugriff auf die MediaWiki-API.
 *
 * Die Kandidatensuche laeuft ueber die Taxobox-Vorlage der deutschen Wikipedia.
 * Jeder Artikel ueber ein Lebewesen bindet sie ein, das sind rund 60.000 Seiten.
 * Das ist eine begrenzte, verlaessliche Liste, im Gegensatz zu einem Vollscan
 * ueber alle 1,5 Mio. Taxa in Wikidata, der zwangslaeufig in den Timeout des
 * Query Service laeuft.
 */

export interface TaxoboxPage {
  title: string
  qid: string
}

/**
 * Alle Artikel der deutschen Wikipedia, die eine Taxobox einbinden, samt
 * ihrer Wikidata-ID. Ergebnis wird auf Platte gecacht.
 */
export async function harvestTaxoboxPages(template = 'Vorlage:Taxobox'): Promise<TaxoboxPage[]> {
  const cacheFile = path.join(PATHS.cache, 'taxobox-' + template.replace(/\W+/g, '_') + '.json')
  if (fs.existsSync(cacheFile)) {
    return JSON.parse(fs.readFileSync(cacheFile, 'utf8')) as TaxoboxPage[]
  }

  const out: TaxoboxPage[] = []
  let cont: string | undefined
  let page = 0

  while (true) {
    const params = new URLSearchParams({
      action: 'query',
      generator: 'embeddedin',
      geititle: template,
      geilimit: '500',
      geinamespace: '0',
      prop: 'pageprops',
      ppprop: 'wikibase_item',
      format: 'json',
      formatversion: '2',
    })
    if (cont) params.set('geicontinue', cont)

    const url = 'https://de.wikipedia.org/w/api.php?' + params.toString()
    // Nur bremsen, wenn wirklich ein Netzabruf ansteht. Aus dem Cache darf es rasen.
    if (!isCached(url)) await sleep(400)
    const body = await fetchCached(url)
    const json = JSON.parse(body) as {
      query?: { pages?: Array<{ title: string; pageprops?: { wikibase_item?: string } }> }
      continue?: { geicontinue?: string }
    }

    for (const p of json.query?.pages ?? []) {
      const qid = p.pageprops?.wikibase_item
      if (qid) out.push({ title: p.title, qid })
    }

    page++
    process.stderr.write('\r  Taxobox-Seiten: ' + out.length + ' (Abruf ' + page + ')   ')

    cont = json.continue?.geicontinue
    if (!cont) break
  }
  process.stderr.write('\n')

  fs.mkdirSync(path.dirname(cacheFile), { recursive: true })
  fs.writeFileSync(cacheFile, JSON.stringify(out), 'utf8')
  return out
}

export interface Summary {
  text: string
  url: string
}

/** Einleitungsabsatz eines Wikipedia-Artikels ueber den REST-Endpunkt. */
export async function fetchSummary(lang: 'de' | 'en', title: string): Promise<Summary | null> {
  const url =
    'https://' + lang + '.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(title.replace(/ /g, '_'))
  const body = await fetchCached(url)
  if (!body) return null
  try {
    const json = JSON.parse(body) as {
      extract?: string
      content_urls?: { desktop?: { page?: string } }
      type?: string
    }
    if (!json.extract || json.type === 'disambiguation') return null
    return {
      text: shorten(json.extract, CONFIG.BLURB_MAX_CHARS),
      url: json.content_urls?.desktop?.page ?? 'https://' + lang + '.wikipedia.org/wiki/' + encodeURIComponent(title),
    }
  } catch {
    return null
  }
}

/** Kuerzt auf volle Saetze, damit der Steckbrief nicht mitten im Wort abbricht. */
export function shorten(text: string, maxChars: number): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= maxChars) return clean
  const cut = clean.slice(0, maxChars)
  const lastStop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '))
  if (lastStop > maxChars * 0.5) return cut.slice(0, lastStop + 1)
  const lastSpace = cut.lastIndexOf(' ')
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut) + ' ...'
}
