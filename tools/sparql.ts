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
export async function sparql(query: string): Promise<SparqlBinding[]> {
  const hash = crypto.createHash('sha1').update(query).digest('hex')
  const file = path.join(PATHS.cache, 'sparql', hash + '.json')
  if (fs.existsSync(file)) {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as SparqlBinding[]
  }

  let lastError: unknown
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'User-Agent': CONFIG.HTTP.userAgent,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/sparql-results+json',
      },
      body: new URLSearchParams({ query }).toString(),
    })

    if (res.ok) {
      const json = (await res.json()) as { results: { bindings: SparqlBinding[] } }
      const rows = json.results.bindings
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(file, JSON.stringify(rows), 'utf8')
      return rows
    }

    const text = await res.text()
    if (/TimeoutException|QueryTimeout/i.test(text)) {
      throw new SparqlTimeout('Abfrage zu teuer (HTTP ' + res.status + ')')
    }
    lastError = new Error('SPARQL HTTP ' + res.status + ': ' + text.slice(0, 300))
    if (attempt < 3) await sleep(3000 * attempt)
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
