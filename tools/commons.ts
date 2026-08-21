import { fetchCached } from './http.ts'
import { CONFIG } from './config.ts'

/**
 * Bildinformationen von Wikimedia Commons.
 *
 * Fast alle Commons-Bilder verlangen die Nennung von Urheber und Lizenz. Diese
 * Angaben werden hier zusammen mit der Bild-URL eingesammelt und pro Bild
 * gespeichert. Nachtraeglich waere das fuer ein paar tausend Bilder kaum noch
 * aufzuholen, deshalb passiert es gleich in der Pipeline.
 */

export interface CommonsInfo {
  file: string
  /** Thumbnail-URL ohne den gemeinsamen Praefix, siehe THUMB_PREFIX. */
  thumb: string
  author: string
  license: string
  licenseUrl?: string
  descriptionUrl: string
}

/** Wird beim Ausliefern wieder vorangestellt, spart rund 50 Zeichen je Bild. */
export const THUMB_PREFIX = 'https://upload.wikimedia.org/wikipedia/commons/thumb/'

const API = 'https://commons.wikimedia.org/w/api.php'
const BATCH = 40

/** Commons liefert den Urheber als HTML-Schnipsel. Wir wollen den blanken Text. */
function stripHtml(html: string | undefined): string {
  if (!html) return ''
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

interface ImageInfoPage {
  title: string
  missing?: boolean
  imageinfo?: Array<{
    thumburl?: string
    descriptionurl?: string
    extmetadata?: Record<string, { value?: string }>
  }>
}

/** Holt Bildinfos fuer bis zu 40 Dateinamen auf einmal. */
async function fetchBatch(files: readonly string[]): Promise<Map<string, CommonsInfo>> {
  const params = new URLSearchParams({
    action: 'query',
    prop: 'imageinfo',
    iiprop: 'url|extmetadata',
    iiurlwidth: String(CONFIG.IMAGE_WIDTH),
    iiextmetadatafilter: 'Artist|LicenseShortName|LicenseUrl|Credit',
    titles: files.map((f) => 'File:' + f).join('|'),
    format: 'json',
    formatversion: '2',
  })

  const body = await fetchCached(API + '?' + params.toString())
  const out = new Map<string, CommonsInfo>()
  if (!body) return out

  const json = JSON.parse(body) as { query?: { pages?: ImageInfoPage[] } }
  for (const page of json.query?.pages ?? []) {
    if (page.missing) continue
    const info = page.imageinfo?.[0]
    if (!info?.thumburl) continue

    const meta = info.extmetadata ?? {}
    const file = page.title.replace(/^File:/, '')
    const author = stripHtml(meta.Artist?.value) || stripHtml(meta.Credit?.value) || 'unbekannt'

    // Commons haengt Tracking-Parameter an die Thumbnail-URL. Mit ihnen laedt das
    // Bild im Browser nicht, ohne sie sofort. Also weg damit.
    const thumb = info.thumburl.split('?')[0]

    out.set(file, {
      file,
      thumb: thumb.startsWith(THUMB_PREFIX) ? thumb.slice(THUMB_PREFIX.length) : thumb,
      // Manche Urheberangaben sind ganze Absaetze. Fuer eine Bildzeile reicht deutlich weniger.
      author: author.length > 90 ? author.slice(0, 87) + '...' : author,
      license: stripHtml(meta.LicenseShortName?.value) || 'siehe Commons',
      licenseUrl: meta.LicenseUrl?.value,
      descriptionUrl: info.descriptionurl ?? 'https://commons.wikimedia.org/wiki/' + encodeURIComponent(page.title),
    })
  }
  return out
}

/** Bildinfos fuer beliebig viele Dateien, in Haeppchen von 40. */
export async function fetchImageInfo(
  files: readonly string[],
  onProgress?: (done: number, total: number) => void,
): Promise<Map<string, CommonsInfo>> {
  const unique = [...new Set(files)]
  const out = new Map<string, CommonsInfo>()

  for (let i = 0; i < unique.length; i += BATCH) {
    const batch = unique.slice(i, i + BATCH)
    for (const [k, v] of await fetchBatch(batch)) out.set(k, v)
    onProgress?.(Math.min(i + BATCH, unique.length), unique.length)
  }
  return out
}
