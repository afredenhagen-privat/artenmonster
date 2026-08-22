import type { Lang } from '../core/types.ts'

/**
 * Die Rangbezeichnungen kommen von NCBI und sind dort englisch. Für die Anzeige
 * werden sie hier übersetzt.
 *
 * Nicht übersetzt wird, was auch im Deutschen keinen gebräuchlichen Begriff hat
 * oder wo der lateinische Ausdruck der übliche ist (Tribus, Klade). Ränge ohne
 * Eintrag erscheinen unverändert, damit ein neuer NCBI-Rang nicht stillschweigend
 * verschwindet.
 */
const DEUTSCH: Record<string, string> = {
  domain: 'Domäne',
  realm: 'Reich',
  acellular_root: 'ohne Zellen',
  cellular_root: 'zellulär',
  superkingdom: 'Überreich',
  kingdom: 'Reich',
  subkingdom: 'Unterreich',
  superphylum: 'Überstamm',
  phylum: 'Stamm',
  subphylum: 'Unterstamm',
  infraphylum: 'Infrastamm',
  superclass: 'Überklasse',
  class: 'Klasse',
  subclass: 'Unterklasse',
  infraclass: 'Infraklasse',
  subcohort: 'Unterkohorte',
  cohort: 'Kohorte',
  superorder: 'Überordnung',
  order: 'Ordnung',
  suborder: 'Unterordnung',
  infraorder: 'Infraordnung',
  parvorder: 'Parvordnung',
  superfamily: 'Überfamilie',
  family: 'Familie',
  subfamily: 'Unterfamilie',
  tribe: 'Tribus',
  subtribe: 'Untertribus',
  genus: 'Gattung',
  subgenus: 'Untergattung',
  section: 'Sektion',
  subsection: 'Untersektion',
  series: 'Serie',
  subseries: 'Unterserie',
  'species group': 'Artengruppe',
  'species subgroup': 'Artenuntergruppe',
  species: 'Art',
  subspecies: 'Unterart',
  varietas: 'Varietät',
  subvariety: 'Untervarietät',
  forma: 'Form',
  'forma specialis': 'Sonderform',
  strain: 'Stamm (Zuchtlinie)',
  isolate: 'Isolat',
  morph: 'Morphe',
  biotype: 'Biotyp',
  genotype: 'Genotyp',
  serotype: 'Serotyp',
  serogroup: 'Serogruppe',
  pathogroup: 'Pathogruppe',
  clade: 'Klade',
  'no rank': '',
}

/** Englische Ränge bleiben, wie NCBI sie führt, nur ohne die Füllwerte. */
const ENGLISCH: Record<string, string> = {
  'no rank': '',
  clade: 'clade',
}

export function rangName(rang: string, lang: Lang): string {
  const tabelle = lang === 'de' ? DEUTSCH : ENGLISCH
  const uebersetzt = tabelle[rang]
  if (uebersetzt !== undefined) return uebersetzt
  return rang
}
