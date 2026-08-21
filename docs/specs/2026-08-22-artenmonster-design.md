# artenmonster — Tier-Ratespiel nach Metazooa-Vorbild

**Projektordner:** `C:\Projekte\Boi\Apps\artenmonster` (neu anzulegen, neben `buechermonster`,
`rezeptbuch`, `vorratsmonster` und `packlist-app`)

## Kontext

Ziel ist ein Ratespiel im Stil von [metazooa.com](https://metazooa.com/): Der Spieler rät Tiere, und
das Spiel verrät bei jedem Fehlversuch, in welcher gemeinsamen taxonomischen Gruppe Tipp und Lösung
liegen. Aus "Ameise und Tarantel sind beide Gliederfüßer" wird über mehrere Versuche eine Eingrenzung
bis zur Art.

Die Ausgangsfrage war die Datenbeschaffung: eine große Datenbank an Tierarten samt Gruppen und
Familien. Die Recherche hat ergeben, dass hinter dieser einen Frage zwei getrennte Datensätze
stecken, die auch getrennt beschafft werden müssen:

1. **Der Baum** muss vollständig und biologisch korrekt sein. Er kommt fertig von der
   NCBI Taxonomy (~2,5 Mio. Taxa, gemeinfrei). Das Original nutzt dieselbe Quelle.
2. **Der Rateraum** muss klein und kuratiert sein. Metazooa spielt mit rund 255 bis 329 Tieren.
   Das ist Design, kein Versäumnis: Mit zwei Millionen ratbaren Arten ist das Spiel unspielbar.

Die große Datenbank ist also der Baum, nicht die Auswahlliste. Beides wird zur **Bauzeit** einmal
zusammengeführt und als statisches JSON ausgeliefert. Zur Laufzeit fragt die App keine externe
Datenquelle mehr an, weshalb sie offline funktioniert.

### Getroffene Entscheidungen

| Thema | Entscheidung |
|---|---|
| Sprache | Deutsch und Englisch, im Spiel umschaltbar |
| Rateraum | ~2.500 Tiere, in drei Schwierigkeitsstufen gestaffelt |
| Schwierigkeit | nach Bekanntheit des Tiers, automatisch berechnet |
| Metadaten | Name, Taxonomie, Bild, Steckbrief-Text |
| Modi | Tagesrätsel, Endlos-Übungsmodus, Zen-/Lernmodus |
| Auslieferung | statische PWA, öffentlich, ohne Backend |
| Bilder | nur online geladen, kein Bundle-Ballast |
| Stack | React + Vite + TypeScript + Tailwind + vite-plugin-pwa |

## Zielarchitektur

Zwei klar getrennte Hälften, die sich nur über generierte JSON-Dateien berühren.

```
tools/            Datenpipeline, läuft bei mir/in CI, nie beim Spieler
  ├── 1-fetch-ncbi.ts        taxdump laden und entpacken
  ├── 2-fetch-wikidata.ts    Kandidaten via SPARQL
  ├── 3-enrich.ts            Steckbriefe, Bilder, Bildrechte
  ├── 4-build-tree.ts        induzierter Teilbaum + Benennung
  ├── 5-emit.ts              JSON nach public/data schreiben
  └── overrides/             handgepflegte Korrekturen
        ├── animals.json     Mapping-Sonderfälle (Hund, Zebra, ...)
        ├── clades.json      deutsche Namen für Kladen ohne Trivialnamen
        └── blocklist.json   Ausschlüsse (Modellorganismen etc.)

src/              Spiel, läuft im Browser
  ├── core/       Baumlogik, LCA, Spielzustand — framework-frei, voll testbar
  ├── data/       Laden und Cachen der JSON-Dateien
  ├── ui/         React-Komponenten
  └── i18n/       DE/EN-Strings der Oberfläche

public/data/      generierte Artefakte, im Repo eingecheckt
```

Die Trennung `core/` gegen `ui/` ist wichtig: Die Spiellogik ist reine Baummathematik ohne DOM und
lässt sich mit Vitest vollständig gegen die echten Daten testen. Die UI hängt daran, nicht umgekehrt.

## Die Datenpipeline im Detail

### Schritt 1 — Baum von NCBI

Download von `https://ftp.ncbi.nlm.nih.gov/pub/taxonomy/taxdump.tar.gz`. Relevant sind `nodes.dmp`
(Eltern-Kind-Beziehungen und Rang) und `names.dmp` (wissenschaftliche und englische Trivialnamen).
Entpackt sind das einige hundert MB, die nach `data/raw/` gehen und per `.gitignore` draußen bleiben.

NCBI ist hier GBIF vorzuziehen, weil es neben den Linné-Rängen auch unbenannte Zwischenkladen
enthält (Laurasiatheria, Sauropsida, Neognathae). Genau diese Zwischenstufen machen das Spiel
spannend. Ohne sie springt die Eingrenzung von "Säugetiere" direkt auf "Raubtiere" und überspringt
die halbe Spannungskurve.

### Schritt 2 — Kandidaten von Wikidata

Der kritische Trick: Wikidata materialisiert für jedes Item die Anzahl seiner Wikipedia-Sprachversionen
als `wikibase:sitelinks`. Diese Zahl ist ein sehr guter Bekanntheits-Proxy (Löwe liegt bei über 150,
ein beliebiger Rüsselkäfer bei 3) und filtert die 1,5 Mio. Taxa in einer einzigen Abfrage auf eine
handhabbare Menge herunter.

```sparql
SELECT ?item ?ncbi ?sitelinks ?sci ?nameDe ?nameEn ?img WHERE {
  ?item wdt:P685 ?ncbi ;
        wikibase:sitelinks ?sitelinks .
  FILTER(?sitelinks >= 12)
  OPTIONAL { ?item wdt:P225 ?sci }
  OPTIONAL { ?item wdt:P1843 ?nameDe . FILTER(LANG(?nameDe) = "de") }
  OPTIONAL { ?item wdt:P1843 ?nameEn . FILTER(LANG(?nameEn) = "en") }
  OPTIONAL { ?item wdt:P18  ?img }
}
```

Läuft die Abfrage in den 60-Sekunden-Timeout des Query Service, wird sie in Bänder zerlegt
(`>= 60`, `40–59`, `25–39`, `12–24`) und die Teilergebnisse werden zusammengeführt. Ergebnis sind
grob 10.000 bis 15.000 Kandidaten.

Anschließend gegen den NCBI-Baum filtern: Nur was Nachfahre von Metazoa (Taxon-ID 33208) ist, bleibt
drin. Das wirft Pflanzen, Pilze und Bakterien raus und validiert nebenbei jede NCBI-ID.

**Der Wikidata-Umweg ist nötig, weil NCBI keine deutschen Namen und keine Bekanntheitsdaten hat.**
Der Join läuft über die NCBI-Taxon-ID (P685). Für Kandidaten ohne P685 gibt es als Rückfallebene den
Abgleich des wissenschaftlichen Namens (P225) gegen `names.dmp`.

### Schritt 3 — Anreicherung

- **Steckbrief**: Wikipedia-REST-Endpunkt `/api/rest_v1/page/summary/{titel}` für die deutsche und
  englische Sitelink-Seite. Gespeichert werden die ersten ~350 Zeichen, die Artikel-URL und der
  CC-BY-SA-Hinweis.
- **Bild**: aus P18 den Commons-Dateinamen, daraus die stabile Thumbnail-URL
  `https://commons.wikimedia.org/wiki/Special:FilePath/{datei}?width=400`.
- **Bildrechte**: über die Commons-API (`prop=imageinfo&iiprop=extmetadata`) Urheber und Lizenz
  abholen und pro Bild mitspeichern. Das ist der einzige Punkt mit echtem rechtlichen Kleingedruckten.
  Fast alle Commons-Bilder verlangen Nennung von Urheber und Lizenz. In der Pipeline kostet das zehn
  Zeilen, nachträglich für 2.500 Bilder nachzupflegen wäre es die Hölle.

Alle HTTP-Antworten landen in einem lokalen Cache unter `data/cache/`, damit ein erneuter Durchlauf
Sekunden statt Stunden dauert und Wikimedia nicht unnötig belastet wird.

### Schritt 4 — Bereinigen und Staffeln

- **Duplikate**: Wikidata führt Art und Unterart teils getrennt (Canis lupus gegen Canis lupus
  familiaris). Regel: Bei gleicher Kernidentität gewinnt der Eintrag mit den meisten Sitelinks. Die
  klassischen Problemfälle (Hund, Hauskatze, Wolf, Zebra, Pferd) stehen fest in
  `overrides/animals.json` und überstimmen die Automatik.
- **Ausschlüsse**: Modellorganismen wie *Drosophila melanogaster* oder *C. elegans* haben absurd
  viele Sitelinks, sind als Rateziel aber unbrauchbar. Die kommen auf die Blockliste.
- **Pflichtfelder**: Ein Tier ohne deutschen *und* englischen Trivialnamen fliegt raus.
- **Stufen** nach Perzentil des Bekanntheits-Scores:

  | Stufe | Umfang | Beispiel |
  |---|---|---|
  | 1 Leicht | ~300 | Löwe, Adler, Hai |
  | 2 Mittel | ~700 | Erdmännchen, Gottesanbeterin |
  | 3 Schwer | ~1.500 | Zwergseidenäffchen, Blattschneiderameise |

  Die Grenzen sind eine Zahl in `config.ts`, keine Codeänderung. Die Poolgröße ist damit ein
  Drehregler.

**Wichtige Spielregel dazu:** Die Stufe bestimmt nur, aus welchem Topf das *Ziel* gezogen wird.
Geraten werden darf immer aus dem vollen Pool. Sonst kann man auf Stufe 3 nicht mehr mit einem Löwen
antesten, und genau so spielt man das Spiel.

### Schritt 5 — Baum bauen und ausgeben

Von jedem Spieltier den Pfad bis Metazoa hochlaufen und alle Pfade vereinigen. Das ergibt den
induzierten Teilbaum, grob 2.500 Blätter und 3.000 bis 4.000 innere Knoten.

Ketten von Knoten mit nur einem Kind werden zusammengefaltet, weil sie im Spiel keinen
Informationsgewinn bringen. Die eingefalteten Namen bleiben als Zusatzinfo am überlebenden Knoten
hängen, damit die Detailansicht sie zeigen kann.

Benennung der inneren Knoten in DE und EN, in dieser Reihenfolge:
Wikidata P1843 → Wikidata-Label → NCBI `genbank common name` → wissenschaftlicher Name.
Für die rund 150 wichtigsten Kladen ohne Trivialnamen liegen Handübersetzungen in
`overrides/clades.json`.

Ausgabe nach `public/data/`:

| Datei | Inhalt | ~roh | ~gepackt | Laden |
|---|---|---|---|---|
| `tree.json` | Knoten mit Eltern, Rang, Namen DE/EN | 800 KB | 150 KB | vorab gecacht |
| `animals.json` | Tiere mit Knoten, Namen, Score, Stufe, Bild-URL, Bildrechte | 600 KB | 120 KB | vorab gecacht |
| `search.json` | normalisierter Suchindex (umlautfrei, Synonyme) | 350 KB | 70 KB | vorab gecacht |
| `blurbs.{de,en}.json` | Steckbriefe | 1,8 MB | 450 KB | bei Bedarf |
| `meta.json` | Build-Datum, Quellstände, Zählwerte | klein | | vorab gecacht |

Unter 1 MB gepackt für den kompletten spielbaren Inhalt. Das Bundle ist damit kein Problem.

## Spiellogik

Kern ist der **Lowest Common Ancestor** von Tipp und Ziel im Baum. Bei 2.500 Blättern ist das eine
Handvoll Array-Zugriffe, dafür braucht es keine Datenbank und keinen Server.

- Rückmeldung pro Fehlversuch: Name der gemeinsamen Gruppe, ihr Rang, und die verbleibende Distanz
  als Verzweigungszahl ("noch 3 Abzweigungen entfernt"). Zusätzlich eine Warm/Kalt-Anzeige, die sich
  aus der Distanz ableitet.
- 20 Versuche wie im Original. Nach dem 8. und 14. Fehlversuch ein Hinweis, der eine Gruppe
  aufdeckt.
- **Tagesrätsel ohne Server**: Das Datum als String wird gehasht und indiziert die Liste der Stufen 1
  und 2. Jeder bekommt dasselbe Tier, die Berechnung passiert offline auf dem Gerät. Ergebnis als
  Emoji-Block teilbar.
- **Endlos-Modus**: freie Stufenwahl, beliebig viele Runden.
- **Zen-Modus**: kein Versuchslimit, Baum jederzeit frei erkundbar.
- Verlauf und Statistik in IndexedDB, damit nichts an einen Server geht.

## Oberfläche

- **Eingabe**: Autovervollständigung über den normalisierten Suchindex, sucht gleichzeitig in
  deutschen, englischen und wissenschaftlichen Namen. Muss "loewe" und "Löwe" gleich behandeln.
- **Baumansicht**: SVG-Layout mit `d3-hierarchy`, Pan und Zoom über `react-zoom-pan-pinch`. Gezeigt
  wird nur der bereits aufgedeckte Teilbaum, nicht die ganzen 4.000 Knoten. Auf dem Handy ist das
  das anspruchsvollste Stück und bekommt entsprechend Zeit.
- **Ergebnisschirm**: Bild, Steckbrief, vollständiger taxonomischer Pfad, Bildrechte-Zeile.
- Sprachumschalter DE/EN wirkt auf Tiernamen, Gruppennamen, Steckbriefe und Oberfläche gleichzeitig.

## Offline-Verhalten

`vite-plugin-pwa` mit Workbox:

- **Precache**: App-Shell, `tree.json`, `animals.json`, `search.json`, `meta.json`. Damit ist das
  Spiel im Flugmodus vollständig spielbar, inklusive Tagesrätsel.
- **Bei Bedarf**: Steckbriefe erst nach gelöstem Rätsel, dann dauerhaft gecacht.
- **Bilder**: bewusst nur online (deine Entscheidung, hält die App klein). Der Service Worker legt
  aber jedes einmal geladene Bild per CacheFirst ab, sodass Tiere aus vergangenen Runden auch ohne
  Netz ihr Foto behalten. Ohne Netz und ohne Cache greift ein Platzhalter statt eines kaputten Bilds.

## Umsetzung in Etappen

Die Pipeline kommt zuerst, weil dort das ganze Risiko sitzt. Wenn Wikidata nicht das liefert, was
ich erwarte, will ich das an Tag eins wissen und nicht, nachdem die UI steht.

1. **Projektgerüst** — `C:\Projekte\Boi\Apps\artenmonster` anlegen, `git init`, Vite + React + TS +
   Tailwind, Vitest. Spec aus dieser Planung als `docs/specs/` im Projekt ablegen.
2. **Pipeline Schritt 1 und 2** — NCBI-Baum einlesen, Wikidata-Kandidaten holen, joinen. Ergebnis
   ist erstmal nur eine CSV zum Draufschauen. **Prüfpunkt: Wie viele Tiere haben tatsächlich
   deutschen Namen, Bild und Artikel?** Diese Zahl entscheidet, ob die Zielgröße 2.500 realistisch
   ist oder nach unten korrigiert werden muss.
3. **Pipeline Schritt 3 bis 5** — Anreicherung, Bereinigung, Baumbau, JSON-Ausgabe, plus die
   Validierungen unten.
4. **Spielkern** — LCA, Zustandsautomat, Tagesseed, Hinweislogik. Testgetrieben gegen die echten
   Daten, ohne jede UI.
5. **Oberfläche** — Eingabe und Autovervollständigung, dann Rückmeldung, dann Baumansicht, dann
   Ergebnisschirm. Baumansicht bewusst zuletzt, weil sie am längsten dauert.
6. **PWA und Deployment** — Service Worker, Manifest, Icons, GitHub Pages, Offline-Test.

## Prüfung

**Automatisch in der Pipeline** (Lauf bricht ab, wenn eine Zusicherung fehlschlägt):

- Jede Tier-Taxon-ID löst im Baum auf, kein Blatt ohne Elternpfad bis Metazoa.
- Kein Tier ohne deutschen und englischen Namen.
- Kein Tier mit Bild, aber ohne Urheber- und Lizenzangabe.
- Stufengrößen innerhalb der erwarteten Bandbreite.
- Stichprobe von 50 Bild-URLs per HEAD-Request auf HTTP 200.

**Fachliche Stichproben als feste Testdatei** (`core/lca.test.ts`) — hier fällt sofort auf, wenn der
Baum kaputt ist:

| Tier A | Tier B | erwartete gemeinsame Gruppe |
|---|---|---|
| Löwe | Tiger | Panthera / Eigentliche Großkatzen |
| Löwe | Hauskatze | Felidae / Katzen |
| Löwe | Wolf | Carnivora / Raubtiere |
| Löwe | Karpfen | Euteleostomi / Knochenwirbeltiere |
| Löwe | Ameise | Bilateria |

**Manuell vor dem Deployment:**

- `npm run dev`, je eine Runde in Stufe 1, 2 und 3 durchspielen, Sprache umschalten.
- Produktionsbuild in den Flugmodus: App startet, Tagesrätsel funktioniert, Baumansicht rendert,
  Bilder zeigen sauber den Platzhalter statt eines kaputten Icons.
- Auf einem echten Handy zum Startbildschirm hinzufügen und dort spielen.

## Offene Punkte, die die Umsetzung nicht blockieren

- **Endgültige Poolgröße** hängt an der Messung in Etappe 2.
- **Pageviews als Feinschliff**: Sitelinks allein sind ein guter Bekanntheits-Proxy. Falls die
  Stufeneinteilung sich schief anfühlt, lässt sich die Wikimedia-Pageviews-API als zweites Signal
  nachrüsten, ohne dass sich sonst etwas ändert.
