import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { CONFIG } from './config.ts'
import { PATHS } from './paths.ts'

const ENDPOINT = 'https://query.wikidata.org/sparql'

export class SparqlTimeout extends Error {}

export interface SparqlBinding {
  [key: string]: { type: string; value: string; 'xml:lang'?: string } | undefined
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Fuehrt eine SPARQL-Abfrage gegen den Wikidata Query Service aus und cacht das
 * Ergebnis auf Platte. Laeuft die Abfrage in den 60-Sekunden-Timeout des Dienstes,
 * wird SparqlTimeout geworfen, damit der Aufrufer die Abfrage feiner zerlegen kann.
 */
/**
 * Der Query Service laesst nur eine Abfrage gleichzeitig zu und drosselt bei
 * Dauerfeuer. Deshalb liegt zwischen zwei echten Abrufen eine Pause. Aus dem
 * Cache beantwortete Abfragen sind davon nicht betroffen.
 */
const PAUSE_MS = 1500
let letzterAbruf = 0

export async function sparql(query: string): Promise<SparqlBinding[]> {
  const hash = crypto.createHash('sha1').update(query).digest('hex')
  const file = path.join(PATHS.cache, 'sparql', hash + '.json')
  if (fs.existsSync(file)) {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as SparqlBinding[]
  }

  const MAX_VERSUCHE = 6
  let lastError: unknown

  for (let attempt = 1; attempt <= MAX_VERSUCHE; attempt++) {
    const wartezeit = letzterAbruf + PAUSE_MS - Date.now()
    if (wartezeit > 0) await sleep(wartezeit)
    letzterAbruf = Date.now()

    let res: Response
    try {
      res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'User-Agent': CONFIG.HTTP.userAgent,
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/sparql-results+json',
        },
        body: new URLSearchParams({ query }).toString(),
      })
    } catch (err) {
      // Netzabbruch. Nochmal versuchen, aber langsamer.
      lastError = err
      if (attempt < MAX_VERSUCHE) await sleep(Math.min(60_000, 4000 * 2 ** attempt))
      continue
    }

    if (res.ok) {
      const json = (await res.json()) as { results: { bindings: SparqlBinding[] } }
      const rows = json.results.bindings
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(file, JSON.stringify(rows), 'utf8')
      return rows
    }

    const text = await res.text()

    // Timeout heisst: die Abfrage selbst ist zu teuer. Wiederholen bringt nichts,
    // der Aufrufer muss sie kleiner schneiden.
    if (/TimeoutException|QueryTimeout/i.test(text)) {
      throw new SparqlTimeout('Abfrage zu teuer (HTTP ' + res.status + ')')
    }

    // 429 heisst Drosselung, 5xx heisst der Dienst hat gerade schlechte Laune.
    // Beides geht vorbei, also warten und erneut versuchen.
    if (res.status === 429 || res.status >= 500) {
      const retryAfter = Number(res.headers.get('retry-after') ?? 0)
      const waitMs = retryAfter > 0 ? retryAfter * 1000 : Math.min(120_000, 5000 * 2 ** attempt)
      lastError = new Error('SPARQL HTTP ' + res.status)
      if (attempt < MAX_VERSUCHE) {
        process.stderr.write(
          '\n  Query Service bremst (HTTP ' + res.status + '), warte ' + Math.round(waitMs / 1000) + 's ...\n',
        )
        await sleep(waitMs)
        continue
      }
    }

    lastError = new Error('SPARQL HTTP ' + res.status + ': ' + text.slice(0, 300))
    if (attempt < MAX_VERSUCHE) await sleep(5000 * attempt)
  }
  throw lastError
}

export function val(b: SparqlBinding, key: string): string | undefined {
  return b[key]?.value
}

/** Aus "http://www.wikidata.org/entity/Q140" wird "Q140". */
export function qid(uri: string | undefined): string | undefined {
  if (!uri) return undefined
  const m = /\/(Q\d+)$/.exec(uri)
  return m ? m[1] : undefined
}
