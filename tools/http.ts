import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { CONFIG } from './config.ts'
import { PATHS } from './paths.ts'

/**
 * HTTP mit Plattencache. Jede URL wird hoechstens einmal wirklich abgerufen,
 * danach kommt die Antwort vom Dateisystem. Das haelt wiederholte Laeufe schnell
 * und belastet Wikimedia nicht unnoetig. Weil pro URL gecacht wird, setzt ein
 * abgebrochener Lauf dort wieder an, wo er stehengeblieben ist.
 */

function cacheFile(key: string): string {
  const hash = crypto.createHash('sha1').update(key).digest('hex')
  return path.join(PATHS.cache, hash.slice(0, 2), `${hash}.json`)
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Liegt die Antwort schon auf Platte? Dann muss auch nicht gebremst werden. */
export function isCached(key: string): boolean {
  return fs.existsSync(cacheFile(key))
}

export async function fetchCached(
  url: string,
  init: RequestInit = {},
  cacheKey = url,
): Promise<string> {
  const file = cacheFile(cacheKey)
  if (fs.existsSync(file)) {
    return JSON.parse(fs.readFileSync(file, 'utf8')).body as string
  }

  let lastError: unknown
  for (let attempt = 1; attempt <= CONFIG.HTTP.retries; attempt++) {
    try {
      const res = await fetch(url, {
        ...init,
        headers: {
          'User-Agent': CONFIG.HTTP.userAgent,
          ...(init.headers ?? {}),
        },
      })

      if (res.status === 429 || res.status >= 500) {
        // Wikimedia nennt im Retry-After, wie lange es still sein moechte.
        const retryAfter = Number(res.headers.get('retry-after') ?? 0)
        const waitMs = retryAfter > 0 ? retryAfter * 1000 : Math.min(60_000, 2000 * 2 ** attempt)
        if (attempt < CONFIG.HTTP.retries) {
          process.stderr.write(
            `\n  gedrosselt (HTTP ${res.status}), warte ${Math.round(waitMs / 1000)}s ...\n`,
          )
          await sleep(waitMs)
          continue
        }
        throw new Error(`HTTP ${res.status} bei ${url}`)
      }

      // Auch ein 404 wird gecacht: "Artikel existiert nicht" ist ein gueltiges
      // Ergebnis, nach dem wir nicht bei jedem Lauf erneut fragen muessen.
      const body = res.ok ? await res.text() : ''
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(file, JSON.stringify({ status: res.status, body }), 'utf8')
      return body
    } catch (err) {
      lastError = err
      if (attempt < CONFIG.HTTP.retries) await sleep(Math.min(30_000, 2000 * 2 ** attempt))
    }
  }
  throw lastError
}

/** Fuehrt `worker` ueber alle Elemente aus, hoechstens `limit` gleichzeitig. */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
  onProgress?: (done: number, total: number) => void,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  let done = 0

  async function run(): Promise<void> {
    while (true) {
      const i = next++
      if (i >= items.length) return
      results[i] = await worker(items[i], i)
      done++
      if (onProgress && done % 100 === 0) onProgress(done, items.length)
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run))
  onProgress?.(done, items.length)
  return results
}

/** Einzeiliger Fortschritt auf stderr, damit die Logs nicht zulaufen. */
export function progress(label: string): (done: number, total: number) => void {
  return (done, total) => {
    const pct = total ? Math.round((done / total) * 100) : 100
    process.stderr.write(`\r  ${label}: ${done}/${total} (${pct}%)   `)
    if (done >= total) process.stderr.write('\n')
  }
}
