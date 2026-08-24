import { describe, it, expect } from 'vitest'
import { merkmalsSaetze, namensMarker } from './tipps.ts'

/**
 * Der Merkmalshinweis darf alles verraten ausser dem Tier selbst. Diese Tests
 * halten beide Seiten fest: dass Namen nicht durchrutschen, und dass brauchbare
 * Saetze nicht vorsichtshalber weggeworfen werden.
 */

describe('Namensmarker', () => {
  it('nimmt den ganzen Namen und das Grundwort', () => {
    const marker = namensMarker('Heidelerche')
    expect(marker).toContain('heidelerche')
    // "Lerchenart" soll auffliegen, deshalb auch die Endung des Grundworts.
    expect(marker).toContain('lerche')
  })

  it('laesst die vorderen Bestandteile in Ruhe', () => {
    /*
     * Sonst sperrt "Europaeische Hornotter" jeden Satz ueber Europa — und damit
     * ausgerechnet die Angabe zum Lebensraum, die den Hinweis ausmacht.
     */
    const marker = namensMarker('Europäische Hornotter')
    expect(marker.some((m) => 'europa'.includes(m))).toBe(false)
    expect(marker).toContain('hornotter')
  })

  it('behandelt Umlaute wie ihre Umschrift', () => {
    expect(namensMarker('Mönchsgrasmücke')).toContain('monchsgrasmucke')
  })
})

describe('Merkmalssaetze', () => {
  const namen = {
    trivial: ['Heidelerche', 'Woodlark'],
    wissenschaftlich: ['Lullula arborea', 'Lullula'],
  }

  it('wirft Saetze mit dem Namen weg', () => {
    const text =
      'Die Heidelerche ist eine Vogelart aus der Familie der Lerchen. ' +
      'Sie bewohnt trockene Heiden und lichte Kiefernwaelder mit sandigem Boden.'
    const tipps = merkmalsSaetze(text, namen, 'de')
    expect(tipps).toHaveLength(1)
    expect(tipps[0]).toContain('trockene Heiden')
  })

  it('schwaerzt das Grundwort, statt den Satz zu verwerfen', () => {
    const text = 'Diese kleine Lerchenart besiedelt die suedwestliche Palaearktis von England bis zum Iran.'
    const tipps = merkmalsSaetze(text, namen, 'de')
    expect(tipps).toHaveLength(1)
    expect(tipps[0]).toContain('…')
    expect(tipps[0]).not.toMatch(/lerche/i)
    expect(tipps[0]).toContain('Palaearktis')
  })

  it('wirft Saetze ueber den Namen selbst weg', () => {
    const text =
      'Ihr deutscher Name leitet sich von ihrem Lebensraum ab, den Heiden und Sandflaechen Mitteleuropas.'
    expect(merkmalsSaetze(text, namen, 'de')).toEqual([])
  })

  it('gibt nichts zurueck, wenn jeder Satz den Namen nennt', () => {
    const text = 'Die Heidelerche ist ein Zugvogel. Die Heidelerche singt auch nachts.'
    expect(merkmalsSaetze(text, namen, 'de')).toEqual([])
  })

  it('haelt sich an die Hoechstzahl', () => {
    const satz = 'Das Gefieder ist oberseits braun gestrichelt und unterseits deutlich heller gefaerbt. '
    expect(merkmalsSaetze(satz.repeat(6), namen, 'de', {
      fenster: 4000,
      minLaenge: 40,
      maxLaenge: 300,
      maxSaetze: 2,
      maxSchwaerzungen: 2,
    })).toHaveLength(2)
  })

  it('laesst zu kurze und zu lange Saetze aus', () => {
    const kurz = 'Sie ist klein.'
    const lang = 'Sie ' + 'lebt in Waeldern und Heiden '.repeat(20) + 'und frisst Insekten.'
    expect(merkmalsSaetze(kurz + ' ' + lang, namen, 'de')).toEqual([])
  })

  it('faengt lateinische Verwandte ueber den Wortanfang ab', () => {
    /*
     * Familiennamen werden aus dem Gattungsstamm gebildet: Balaeniceps rex
     * gehoert zu den Balaenicipitidae. Ein Satz, der die Familie nennt, ist eine
     * Suchmaschinenabfrage von der Loesung entfernt.
     */
    const schuhschnabel = {
      trivial: ['Schuhschnabel', 'Shoebill'],
      wissenschaftlich: ['Balaeniceps rex', 'Balaeniceps'],
    }
    const text = 'Da seine Morphologie einzigartig ist, wird er einer eigenen Familie, den Balaenicipitidae, zugeordnet.'
    const tipps = merkmalsSaetze(text, schuhschnabel, 'de')
    expect(tipps.join(' ')).not.toMatch(/balaenicipitidae/i)
  })

  it('greift auch im Englischen', () => {
    const text =
      'The Woodlark is a small passerine bird. It breeds in dry open country with scattered trees.'
    const tipps = merkmalsSaetze(text, namen, 'en')
    expect(tipps).toHaveLength(1)
    expect(tipps[0]).toContain('dry open country')
  })
})
