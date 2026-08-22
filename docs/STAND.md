# Stand am 22.08.2026

Das Spiel läuft unter **https://afredenhagen-privat.github.io/artenmonster/** und wird bei jedem
Push auf `main` neu gebaut und veröffentlicht.

Diese Datei ist der Einstieg für jeden, der ohne Vorgeschichte weiterarbeiten will: was da ist, was
offen ist, und welche Entscheidungen man kennen muss, um nichts kaputtzumachen.

## Was da ist

| | |
|---|---|
| Spielbare Tiere | 4.000 (Leicht 500, Mittel 1.400, Schwer 2.100) |
| Baumknoten | 5.773 |
| Steckbriefe | je 4.000 deutsch und englisch |
| Gruppenerklärungen | je 1.599, davon 394 im Deutschen aus der englischen Wikipedia |
| Bilder | 4.000, alle mit Urheber- und Lizenzangabe |
| Offline-Paket | 506 KB gepackt |
| Tests | 101 |

Modi: Tagesrätsel (ohne Server, das Datum ist der Seed), Endlos, Zen. Drei Schwierigkeitsstufen.
Deutsch und Englisch umschaltbar. Hell, Dunkel und Systemeinstellung. Vollbild. Baumansicht wahlweise
verdichtet oder vollständig. Im Baum lässt sich jeder Knoten antippen: Gruppen zeigen ihre
Erklärung, Tiere ihren Steckbrief. Installierbar als PWA, offline spielbar bis auf die Tierfotos.

## Die sieben Entscheidungen, die man kennen muss

**Bekanntheit wird an Wikipedia-Abrufen gemessen, nicht an Sprachversionen.** Die Zahl der
Sprachversionen misst, wie gründlich eine Gruppe erfasst ist, nicht wie bekannt ein Tier ist. Bei
Vögeln ist sie systematisch aufgebläht, weil Vogelkunde ein weltweit gepflegtes Hobby ist. Folge
war, dass Lachseeschwalbe (2.350 Abrufe im Jahr) und Rotschenkel (12.837) in der Stufe „Leicht"
standen, während die Gartenkreuzspinne mit 77.039 Abrufen in „Schwer" saß. Seit der Umstellung
stimmt die Reihenfolge. Siehe `tools/pageviews.ts`.

**Jede Großgruppe hat eine Quote.** Ohne sie besteht das Spiel zur Hälfte aus Vögeln. Die Ziele
stehen in `tools/config.ts` unter `GRUPPEN`; jede Gruppe wird nach eigener Reihenfolge gefüllt, der
Rest global.

**Im Englischen darf der lateinische Name einspringen, im Deutschen nicht.** Die deutsche Wikipedia
bildet für Insekten Trivialnamen, die englische führt sie unter Latein. *Lasius flavus* heißt auf
Deutsch Gelbe Wiesenameise und auf Englisch eben *Lasius flavus*. Das als fehlenden Namen zu werten
hat 2.327 Insekten aussortiert, darunter 699 Käfer und 39 Ameisen — bei Vögeln nur vier. Umgekehrt
bliebe die deutsche Regel nicht bestehen: Ein Spiel, in dem man *Carabus auronitens* eintippen muss,
macht keinen Spaß.

**Kein spielbares Tier darf über einem anderen liegen** — sonst wäre ein Tipp gleichzeitig Lösung
und Gruppe. Die Regel räumt sinnvoll vier Tiger-Unterarten und den Grizzly weg. Ausgenommen sind die
Haustiere in `tools/overrides/animals.json`, denn dort ist die Verschachtelung gerade der Reiz: Der
Hund ist eine Unterart des Wolfs. Für diesen Fall meldet das Spiel „Dein Tipp ist eine Unterart der
Lösung" statt eines unverständlichen „noch 0 Verzweigungen".

**In der Suche zählt das Wortende so viel wie der Wortanfang.** Im Deutschen steht das Grundwort
einer Zusammensetzung hinten: Ein Bergzebra ist ein Zebra, ein Zebrafink ist ein Fink. Solange nur
der Wortanfang zählte, brachte die Eingabe „Zebra" Zebrabärbling, Zebramanguste und
Zebra-Harnischwels, aber kein Zebra — die Liste war voll, bevor Grevyzebra und Bergzebra drankamen.
Beide Stellen zählen deshalb gleich, danach entscheidet die Bekanntheit. Dazu wiegt ein Treffer im
angezeigten Namen schwerer als einer im englischen oder wissenschaftlichen, sonst steht bei „Zebra"
auf Deutsch die Wandermuschel oben (englisch *Zebra mussel*). Siehe `matchRang` in
`src/core/search.ts`.

**Fehlt ein Text in der gespielten Sprache, springt die andere ein.** Zu vielen Kladen gibt es nur
einen englischen Wikipedia-Artikel — Whippomorpha, Neoaves, Asterozoa und rund vierhundert weitere.
Das Feld leer zu lassen, obwohl der Text vorliegt, wäre Verschwendung; ein englischer Absatz mit
ehrlicher Herkunftsangabe ist besser als gar keine Erklärung. Die Oberfläche schreibt „Text aus der
englischen Wikipedia" darunter, der Link führt zum englischen Artikel. Umgekehrt genauso: 15 Gruppen
und 56 Tiere haben nur einen deutschen Artikel und zeigen ihn im englischen Modus. Zusammengesetzt
wird das zur Bauzeit in `mitRueckfall` (`tools/5-emit.ts`), damit zur Laufzeit weiterhin eine einzige
Datei je Sprache reicht.

**Kandidaten kommen über die Taxobox der deutschen Wikipedia, nicht über Wikidata.** Eine
SPARQL-Abfrage über alle Taxa mit NCBI-ID läuft zuverlässig in den 60-Sekunden-Timeout, egal wie eng
man filtert. Die Taxobox-Vorlage liefert stattdessen eine begrenzte Liste von rund 62.000 Artikeln
samt Wikidata-ID; Wikidata wird danach gezielt nach genau diesen Items gefragt.

## Vier Fallen, in die ich getappt bin

**Der User-Agent braucht eine erreichbare Adresse.** Ohne sie drosselt die Abrufzahlen-Schnittstelle
auf 13 Anfragen pro Minute mit 59-Sekunden-Zwangspausen — mit Adresse sind es über 1.500. Aus 19
Stunden wurden 50 Minuten. Es lag nicht an der Nebenläufigkeit, die war unschuldig.

**Steckbriefe dürfen nicht am Index hängen.** Sie taten es, und nach der Umstellung auf Abrufzahlen
verschob sich die Sortierung des Pools: Position 141 war vorher das Erdmännchen und danach der
Manul. Weil `blurbs.*.json` und `gruppen.*.json` nicht im Precache liegen, sondern im Laufzeit-Cache
des Service Workers, überlebten sie den Deploy — und zum Manul stand der Text des Erdmännchens.
Schlüssel ist jetzt die NCBI-Taxon-ID. Ein veralteter Cache liefert damit höchstens keinen Text
statt einem falschen, und beim nächsten Aufruf ist er ohnehin nachgezogen. Alles, was neben dem
Precache liegt und einen Neubau überdauern kann, braucht einen Schlüssel, der den Neubau ebenfalls
überdauert.

**Der Join über die NCBI-Taxon-ID verliert bekannte Tiere, und zwar auf zwei Wegen.** Aufgefallen
ist es, weil die Eingabe „Zebra" kein Zebra brachte: Das Steppenzebra war gar nicht im Spiel. Beim
Wikidata-Item fehlt die Eigenschaft P685 — derselbe Fall wie beim Haushund. Beim Buntspecht dagegen
ist sie vorhanden, zeigt aber auf Taxon 137523, das NCBI inzwischen mit 183177 verschmolzen hat.
Beide Male läuft der Join ins Leere und das Tier existiert für das Spiel nicht.

Betroffen waren unter anderem Pottwal (209.000 Abrufe im Jahr), Buntspecht (161.000) und Habicht
(102.000) — keine Randfiguren. `npx tsx tools/luecken-check.ts` findet solche Lücken systematisch:
Ausgangspunkt sind die Taxobox-Artikel der deutschen Wikipedia, wer dort steht und nicht unter den
Kandidaten, wird über den wissenschaftlichen Namen im lokalen NCBI-Index nachgeschlagen und nach
Abrufzahlen sortiert. Das Werkzeug gehört nach jedem Datenlauf einmal aufgerufen.

**In SVG überschreibt eine CSS-`transform`-Eigenschaft das `transform`-Attribut.** Die
Einblend-Animation der Tierknoten hat sie gesetzt, worauf jeder Knoten auf den Nullpunkt zurückfiel
und alle Tiere übereinander lagen. Für SVG gibt es deshalb eine eigene Animation, die nur die
Deckkraft anfasst (`animate-einblenden`).

## Was offen ist

**Abrufzahlen nur auf Deutsch.** Die Schwierigkeitsstufen sind an deutschen Lesegewohnheiten
geeicht. Für die englische Fassung wären englische Abrufzahlen richtiger; das wäre ein zweiter Lauf
derselben Größenordnung über `en.wikipedia`.

**Kladen ohne deutschen Namen.** Rund 900 von 5.771 Knoten zeigen Latein. Das sind fast nur
Gattungen wie *Larus* oder *Vulpes*, wo das in Ordnung ist. Schritt 4 listet am Ende die häufigsten
auf, `tools/overrides/clades.json` nimmt Übersetzungen auf.

**Bildurheber.** Bei etwa 4 % der Bilder fehlt in den Commons-Metadaten der Urheber, dort steht
„unbekannt". Die Bildzeile verlinkt in jedem Fall auf die Commons-Seite mit den vollen Angaben.

**Statistik.** `src/data/storage.ts` schreibt Serie, Trefferquote und Versuchsverteilung mit, aber
es gibt keinen Schirm dafür.

**Keine Tests für die Oberfläche.** Die 87 Tests decken Spiellogik und Daten ab, nicht das Verhalten
der Komponenten. Ein Fehler wie die verschwindende Vorschlagsliste (ein Timer, der nach dem
Zurückkehren des Fokus zuschlug) wäre nur mit einer Testbibliothek für React-Komponenten zu fangen.

## Daten neu bauen

```bash
npm run data:all
```

Der erste vollständige Durchlauf dauert ein bis zwei Stunden, fast nur Wartezeit auf Wikimedia. Alle
Antworten liegen unter `data/cache/`, ein zweiter Durchlauf ist deshalb eine Sache von Minuten. Zum
Nachmessen:

```bash
npm run data:gruppen
```

```bash
npm run data:stufen
```

Die Poolgröße ist eine Zahl in `tools/config.ts`, keine Codeänderung: `TIERS[n].size` bestimmt die
Stufen, `GRUPPEN[n].ziel` die Verteilung. Verfügbar wären rund 14.700 Arten, gespielt werden 4.000.

## Was noch geprüft werden sollte

**Auf dem Handy zum Startbildschirm hinzufügen** und eine Runde spielen. Die Baumansicht mit Wischen
und Zoomen ist das am wenigsten geprüfte Stück.

**Flugmodus.** Auf der veröffentlichten Seite registriert sich der Service Worker und legt die
Kerndateien in den Precache; die Steckbriefe und Gruppenerklärungen kommen erst bei Bedarf. Der
Cache-Inhalt ist geprüft, ein tatsächlich abgeschaltetes Netz nicht. Einmal laden, dann Flugmodus,
dann neu laden.
