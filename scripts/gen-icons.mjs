/**
 * Erzeugt die PWA-Icons aus public/favicon.svg.
 * Aufruf: npm run icons
 */
import sharp from 'sharp'
import fs from 'node:fs'
import path from 'node:path'

const quelle = 'public/favicon.svg'
const ziel = 'public/icons'
fs.mkdirSync(ziel, { recursive: true })

const svg = fs.readFileSync(quelle)

// Maskable braucht Luft am Rand, weil Android das Icon rund beschneidet.
const maskable = svg
  .toString()
  .replace('<rect width="64" height="64" rx="14"', '<rect width="64" height="64" rx="0"')
  .replace('viewBox="0 0 64 64"', 'viewBox="-10 -10 84 84"')

const aufgaben = [
  { datei: 'icon-192.png', groesse: 192, inhalt: svg },
  { datei: 'icon-512.png', groesse: 512, inhalt: svg },
  { datei: 'icon-512-maskable.png', groesse: 512, inhalt: Buffer.from(maskable) },
  { datei: 'apple-touch-icon.png', groesse: 180, inhalt: svg },
]

for (const { datei, groesse, inhalt } of aufgaben) {
  await sharp(inhalt, { density: 400 }).resize(groesse, groesse).png().toFile(path.join(ziel, datei))
  console.log('  ' + datei + '  ' + groesse + 'x' + groesse)
}
console.log('Icons erzeugt.')
