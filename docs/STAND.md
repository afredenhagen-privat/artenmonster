# Stand am 22.08.2026

Kurzfassung: Das Spiel läuft, ist einmal komplett durchgespielt, und die Daten stehen im Repo.
Was noch aussteht, steht unten und ist alles überschaubar.

## Was fertig ist

Die Datenpipeline ist einmal vollständig durchgelaufen. Ergebnis in `public/data/`:

| | |
|---|---|
| Spielbare Tiere | 3.000 (Stufe 1: 400, Stufe 2: 1.100, Stufe 3: 1.500) |
| Baumknoten | 4.089 |
| Steckbriefe | 3.000 deutsch, 3.000 englisch |
| Bilder | 3.000, alle mit Lizenzangabe |
| Precache (offline spielbar) | 362 KB gepackt |
| Alle Daten zusammen | 956 KB gepackt |

Das Spiel selbst: Tagesrätsel, Endlos- und Zen-Modus, drei Stufen, Deutsch und Englisch
umschaltbar, Autovervollständigung über deutsche, englische und wissenschaftliche Namen,
Baumansicht mit Pan und Zoom, Hinweise nach 8 und 14 Fehlversuchen, Ergebnisschirm mit Bild,
Steckbrief und vollständiger Systematik, Teilen als Emoji-Block.

78 Tests laufen grün, darunter Stichproben gegen die echten Daten (Löwe/Tiger treffen sich in
Panthera, Löwe/Wolf in Carnivora, Löwe/Kolkrabe in Amniota, Löwe/Honigbiene in Bilateria).

Beim Durchspielen des Tagesrätsels: Löwe → Amnioten (11 Verzweigungen), Kolkrabe → Telluraves (4),
Waldkauz → Eigentliche Eulen (2), Waldohreule → Ohreulen (1), dann die Sumpfohreule. Die
Eingrenzung stimmte in jedem Schritt mit dem berechneten Pfad überein.

## Was noch geprüft werden muss

**Der Offline-Test steht aus.** Im eingebetteten Vorschaufenster lässt sich kein Service Worker
registrieren — `/sw.js` wird ausgeliefert, der Kontext ist sicher, die Registrierung scheitert
trotzdem mit einem generischen Fetch-Fehler. Das ist eine Einschränkung der Testumgebung, keine
der App. Statisch geprüft ist: Das Precache-Manifest enthält genau die richtigen 17 Einträge
(Baum, Tierliste, Suchindex, App-Hülle, Icons) und ausdrücklich **nicht** die Steckbriefe.

So testest du es im echten Browser:

```bash
npm run build && npm run preview
```

Dann `http://localhost:4173` öffnen, kurz warten, bis der Service Worker installiert ist
(DevTools → Application → Service Workers), den Preview-Server abschalten und die Seite neu laden.
Das Spiel muss vollständig funktionieren, inklusive Tagesrätsel. Nur die Tierbilder fehlen, das
ist so gewollt.

**Auf dem Handy zum Startbildschirm hinzufügen** und dort eine Runde spielen. Die Baumansicht mit
Wischen und Zoomen ist das Stück, das ich am wenigsten prüfen konnte.

## Offene Punkte

**Kladen ohne deutschen Namen.** 429 von 4.089 Knoten haben keinen deutschen Namen und zeigen
Latein. Das sind fast nur Gattungen wie *Larus*, *Vulpes* oder *Ardea*, wo das völlig in Ordnung
ist. Wenn du einzelne davon eindeutschen willst, listet Schritt 4 am Ende die häufigsten auf, und
`tools/overrides/clades.json` nimmt sie auf.

**Bildurheber.** Bei 113 von 3.000 Bildern (4 %) fehlt in den Commons-Metadaten der Urheber, dort
steht "unbekannt". Die Bildzeile verlinkt in jedem Fall auf die Commons-Seite mit den vollen
Angaben, das reicht als Nachweis. Sauberer wäre, für diese Fälle ein anderes Bild zu nehmen.

**Deployment.** Noch nichts eingerichtet. `DEPLOY_TARGET=gh-pages npm run build` setzt die
Basis-URL auf `/artenmonster/`, das ist alles, was für GitHub Pages vorbereitet ist. Es fehlen
Repository, Workflow und die erste Veröffentlichung.

**Statistik.** `src/data/storage.ts` schreibt Serie, Trefferquote und Versuchsverteilung mit, aber
es gibt noch keinen Schirm, der das anzeigt.

## Zwei Entscheidungen, die man kennen sollte

**Warum der Umweg über die Wikipedia-Taxobox.** Der naheliegende Weg wäre eine SPARQL-Abfrage über
alle Taxa mit NCBI-ID. Der funktioniert nicht: Das sind 1,5 Mio. Einträge, und der Wikidata Query
Service bricht nach 60 Sekunden ab, egal wie eng man filtert. Die Taxobox-Vorlage der deutschen
Wikipedia liefert stattdessen eine begrenzte Liste von 61.842 Artikeln samt Wikidata-ID. Wikidata
wird danach gezielt nach genau diesen Items gefragt.

**Warum Hund und Wolf beide spielbar sind.** Normalerweise darf kein spielbares Tier über einem
anderen liegen, sonst wäre ein Tipp gleichzeitig Lösung und Gruppe. Diese Regel räumt sinnvoll vier
Tiger-Unterarten und den Grizzly weg. Bei Haustieren ist die Verschachtelung aber gerade das
Interessante, denn der Hund ist in der NCBI-Systematik eine Unterart des Wolfs. Diese Paare sind
über `allowNested` ausgenommen, und das Spiel meldet den Fall gesondert ("Dein Tipp ist eine
Unterart der Lösung"), statt ein unverständliches "noch 0 Verzweigungen" anzuzeigen.

Nebenbei: Haushund, Hauskatze, Hausrind, Hauspferd, Hausschaf und Hausziege fehlten zunächst
komplett, weil ihre Wikidata-Einträge keine NCBI-Taxon-ID haben. Ausgerechnet die bekanntesten
Tiere überhaupt, der Haushund hat 332 Wikipedia-Sprachversionen gegenüber 273 beim Löwen. Sie sind
jetzt in `tools/overrides/animals.json` von Hand zugeordnet.

## Daten neu bauen

Nur nötig, wenn der Pool wachsen soll oder die Quellen aktualisiert werden.

```bash
npm run data:all
```

Der erste Durchlauf dauerte etwa eine Stunde, fast nur Wartezeit auf Wikimedia. Alle Antworten
liegen unter `data/cache/`, ein zweiter Durchlauf ist deshalb eine Sache von Minuten. Die
Poolgröße ist eine Zahl in `tools/config.ts`, keine Codeänderung; 12.840 Arten erfüllen alle
Anforderungen, gespielt werden davon 3.000.
