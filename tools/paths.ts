import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'

const here = path.dirname(fileURLToPath(import.meta.url))
export const ROOT = path.resolve(here, '..')

export const PATHS = {
  root: ROOT,
  /** Rohdownloads (taxdump). Gross, gitignored, reproduzierbar. */
  raw: path.join(ROOT, 'data', 'raw'),
  /** HTTP-Antwortcache, damit ein zweiter Lauf Sekunden statt Stunden dauert. */
  cache: path.join(ROOT, 'data', 'cache'),
  /** Zwischenergebnisse zwischen den Pipeline-Schritten. */
  work: path.join(ROOT, 'data', 'work'),
  /** Endergebnis, wird eingecheckt und ausgeliefert. */
  out: path.join(ROOT, 'public', 'data'),
  overrides: path.join(ROOT, 'tools', 'overrides'),
}

export function ensureDirs(): void {
  for (const dir of [PATHS.raw, PATHS.cache, PATHS.work, PATHS.out]) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

export function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T
}

export function writeJson(file: string, data: unknown, pretty = false): void {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data), 'utf8')
}

/** Liest eine Override-Datei, oder gibt den Standardwert zurueck, falls sie fehlt. */
export function readOverride<T>(name: string, fallback: T): T {
  const file = path.join(PATHS.overrides, name)
  if (!fs.existsSync(file)) return fallback
  return readJson<T>(file)
}
