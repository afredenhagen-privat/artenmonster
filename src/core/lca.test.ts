import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { Tree } from './tree.ts'
import { SearchIndex } from './search.ts'
import type { TreeData } from './types.ts'

/**
 * Prueft die erzeugten Spieldaten, nicht die Logik.
 *
 * Wenn die Pipeline den Baum falsch zusammenfaltet, falsch verknuepft oder
 * Namen verwechselt, faellt es hier auf: die erwarteten gemeinsamen Gruppen
 * sind biologisches Grundwissen und aendern sich nicht.
 */

const DATA = path.resolve(__dirname, '../../public/data')
const vorhanden = fs.existsSync(path.join(DATA, 'tree.json'))

const beschreibe = vorhanden ? describe : describe.skip

beschreibe('Erzeugte Spieldaten', () => {
  const treeRaw = JSON.parse(fs.readFileSync(path.join(DATA, 'tree.json'), 'utf8')) as TreeData & {
    hidden: Record<string, string[]>
  }
  const animalsRaw = JSON.parse(fs.readFileSync(path.join(DATA, 'animals.json'), 'utf8')) as {
    animals: Array<{ node: number; tier: number; image?: { author: string; license: string } }>
    tierRanges: Record<string, { from: number; to: number }>
  }
  const searchRaw = JSON.parse(fs.readFileSync(path.join(DATA, 'search.json'), 'utf8')) as {
    entries: [string, number][]
  }
  const lies = (datei: string): Record<string, { text: string; url: string }> =>
    JSON.parse(fs.readFileSync(path.join(DATA, datei), 'utf8')) as Record<string, { text: string; url: string }>
  const blurbs = { de: lies('blurbs.de.json'), en: lies('blurbs.en.json') }
  const gruppenTexte = { de: lies('gruppen.de.json'), en: lies('gruppen.en.json') }

  const tree = new Tree(treeRaw)
  const index = new SearchIndex(searchRaw)
  const animals = animalsRaw.animals

  /** Baumknoten zu einem deutschen Tiernamen, ueber den echten Suchindex. */
  function knoten(name: string): number {
    const treffer = index.exact(name)
    expect(treffer, 'Tier nicht im Spiel: ' + name).not.toBeNull()
    return animals[treffer!].node
  }

  describe('Gemeinsame Gruppen', () => {
    const faelle: Array<[string, string, string]> = [
      ['Löwe', 'Tiger', 'Panthera'],
      ['Löwe', 'Gepard', 'Felidae'],
      ['Löwe', 'Wolf', 'Carnivora'],
      ['Wolf', 'Rotfuchs', 'Canidae'],
      ['Eisbär', 'Braunbär', 'Ursus'],
      ['Löwe', 'Blauwal', 'Laurasiatheria'],
      ['Löwe', 'Kolkrabe', 'Amniota'],
      ['Löwe', 'Karpfen', 'Euteleostomi'],
      ['Löwe', 'Weißer Hai', 'Gnathostomata'],
      ['Löwe', 'Westliche Honigbiene', 'Bilateria'],
    ]

    for (const [a, b, erwartet] of faelle) {
      it(a + ' und ' + b + ' treffen sich in ' + erwartet, () => {
        expect(tree.scientificName(tree.lca(knoten(a), knoten(b)))).toBe(erwartet)
      })
    }

    it('ist symmetrisch', () => {
      const l = knoten('Löwe')
      const w = knoten('Wolf')
      expect(tree.lca(l, w)).toBe(tree.lca(w, l))
    })

    it('zaehlt naehere Verwandte als weniger Schritte', () => {
      const ziel = knoten('Löwe')
      const nah = tree.stepsToTarget(knoten('Tiger'), ziel)
      const mittel = tree.stepsToTarget(knoten('Wolf'), ziel)
      const fern = tree.stepsToTarget(knoten('Westliche Honigbiene'), ziel)
      expect(nah).toBeLessThan(mittel)
      expect(mittel).toBeLessThan(fern)
    })
  })

  describe('Aufbau des Baums', () => {
    it('haengt jeden Knoten an einen frueheren Elternknoten', () => {
      treeRaw.nodes.forEach((n, i) => {
        if (i === 0) expect(n[1]).toBe(-1)
        else expect(n[1]).toBeGreaterThanOrEqual(0)
        expect(n[1]).toBeLessThan(i)
      })
    })

    it('fuehrt jedes Tier bis zur Wurzel', () => {
      const wurzel = 0
      for (const a of animals) {
        expect(tree.pathToRoot(a.node).at(-1)).toBe(wurzel)
      }
    })

    it('hat Metazoa als Wurzel', () => {
      expect(tree.scientificName(0)).toBe('Metazoa')
    })

    it('gibt jedem Knoten einen wissenschaftlichen Namen', () => {
      expect(treeRaw.nodes.filter((n) => !n[3])).toHaveLength(0)
    })

    it('laesst nur ausdruecklich erlaubte Tiere ineinander liegen', () => {
      /*
       * Ein Tier oberhalb eines anderen macht die Rueckmeldung mehrdeutig, weil
       * ein Tipp dann gleichzeitig Loesung und Gruppe waere. Erlaubt ist das nur
       * fuer die Haustiere aus overrides/animals.json, wo genau diese
       * Verschachtelung der Punkt ist (der Hund ist eine Unterart des Wolfs).
       * Dafuer gibt es die eigene Meldung insideTarget.
       */
      const overrides = JSON.parse(
        fs.readFileSync(path.resolve(__dirname, '../../tools/overrides/animals.json'), 'utf8'),
      ) as { animals: Array<{ taxid: number; allowNested?: boolean }> }
      const erlaubt = new Set(overrides.animals.filter((o) => o.allowNested).map((o) => o.taxid))

      const tierKnoten = new Set(animals.map((a) => a.node))
      const verletzungen: string[] = []
      for (const a of animals) {
        const taxid = treeRaw.nodes[a.node][0]
        if (erlaubt.has(taxid)) continue
        for (const vorfahr of tree.pathToRoot(a.node).slice(1)) {
          if (tierKnoten.has(vorfahr) && !erlaubt.has(treeRaw.nodes[vorfahr][0])) {
            verletzungen.push(tree.scientificName(a.node) + ' unter ' + tree.scientificName(vorfahr))
          }
        }
      }
      expect(verletzungen).toEqual([])
    })
  })

  /*
   * Steckbriefe hingen frueher am Tierindex. Der verschiebt sich bei jedem
   * Neubau, und weil die Datei im Laufzeit-Cache des Service Workers einen
   * Deploy ueberlebt, stand zum Manul der Text des Erdmaennchens. Seitdem ist
   * die Taxon-ID der Schluessel, und diese Tests halten das fest.
   */
  describe('Steckbriefe und Gruppenerklaerungen', () => {
    /** Nennt der Text den wissenschaftlichen Namen, zumindest die Gattung? */
    function passtZu(text: string, sci: string): boolean {
      return text.includes(sci) || text.includes(sci.split(' ')[0])
    }

    for (const lang of ['de', 'en'] as const) {
      it('schluesselt die Steckbriefe (' + lang + ') nach Taxon-ID', () => {
        const taxids = new Set(treeRaw.nodes.map((n) => n[0]))
        const fremd = Object.keys(blurbs[lang]).filter((k) => !taxids.has(Number(k)))
        expect(fremd.slice(0, 5)).toEqual([])
      })

      it('schluesselt die Gruppenerklaerungen (' + lang + ') nach Taxon-ID', () => {
        const taxids = new Set(treeRaw.nodes.map((n) => n[0]))
        const fremd = Object.keys(gruppenTexte[lang]).filter((k) => !taxids.has(Number(k)))
        expect(fremd.slice(0, 5)).toEqual([])
      })
    }

    it('legt zu jedem Tier den Text des richtigen Tiers', () => {
      let geprueft = 0
      let passend = 0
      const beispiele: string[] = []
      for (const a of animals) {
        const sci = tree.scientificName(a.node)
        const b = blurbs.de[String(treeRaw.nodes[a.node][0])]
        if (!b) continue
        geprueft++
        if (passtZu(b.text, sci)) passend++
        else if (beispiele.length < 5) beispiele.push(sci + ': ' + b.text.slice(0, 60))
      }
      expect(geprueft).toBeGreaterThan(animals.length * 0.9)
      // Einzelne Artikel nennen den wissenschaftlichen Namen erst spaeter im
      // Text. Eine Verschiebung der Schluessel wuerde die Quote reissen lassen.
      expect(passend / geprueft, 'Beispiele: ' + beispiele.join(' | ')).toBeGreaterThan(0.97)
    })

    it('legt zu jeder Gruppe den Text der richtigen Gruppe', () => {
      const byTaxid = new Map(treeRaw.nodes.map((n, i) => [n[0], i]))
      let geprueft = 0
      let passend = 0
      for (const [k, v] of Object.entries(gruppenTexte.de)) {
        const i = byTaxid.get(Number(k))
        if (i === undefined) continue
        geprueft++
        if (passtZu(v.text, tree.scientificName(i))) passend++
      }
      expect(geprueft).toBeGreaterThan(0)
      expect(passend / geprueft).toBeGreaterThan(0.9)
    })

    it('nennt namentlich das richtige Tier', () => {
      const faelle: Array<[string, string]> = [
        ['Manul', 'Otocolobus manul'],
        ['Löwe', 'Panthera leo'],
        ['Erdmännchen', 'Suricata suricatta'],
      ]
      for (const [name, sci] of faelle) {
        const knotenIndex = knoten(name)
        const b = blurbs.de[String(treeRaw.nodes[knotenIndex][0])]
        expect(b, 'kein Steckbrief fuer ' + name).toBeDefined()
        expect(b.text).toContain(sci)
      }
    })
  })

  describe('Vollstaendigkeit', () => {
    it('gibt jedem Tier einen eigenen Knoten', () => {
      expect(new Set(animals.map((a) => a.node)).size).toBe(animals.length)
    })

    it('nennt zu jedem Bild Urheber und Lizenz', () => {
      const ohne = animals.filter((a) => a.image && (!a.image.author || !a.image.license))
      expect(ohne).toHaveLength(0)
    })

    it('findet jedes Tier ueber den Suchindex', () => {
      const gefunden = new Set(searchRaw.entries.map(([, i]) => i))
      expect(gefunden.size).toBe(animals.length)
    })

    it('deckt die Stufenbereiche die ganze Liste ab', () => {
      const r = animalsRaw.tierRanges
      expect(r['1'].from).toBe(0)
      expect(r['1'].to).toBe(r['2'].from)
      expect(r['2'].to).toBe(r['3'].from)
      expect(r['3'].to).toBe(animals.length)
    })

    it('findet ueber Umlaut und Umschrift gleichermassen', () => {
      expect(index.search('Löwe')).toContain(index.exact('Löwe'))
      expect(index.search('loewe')).toContain(index.exact('Löwe'))
      expect(index.search('lowe')).toContain(index.exact('Löwe'))
    })

    it('findet auch ueber den englischen und wissenschaftlichen Namen', () => {
      const loewe = index.exact('Löwe')
      expect(index.search('lion')).toContain(loewe)
      expect(index.search('panthera leo')).toContain(loewe)
    })
  })
})
