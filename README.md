# Artenmonster

**Spielen: https://afredenhagen-privat.github.io/artenmonster/**

Ein Ratespiel im Stil von [Metazooa](https://metazooa.com/): Du rätst Tiere, und das Spiel verrät
bei jedem Fehlversuch, in welcher gemeinsamen Gruppe des Stammbaums dein Tipp und die Lösung liegen.
Aus "Ameise und Tarantel sind beide Gliederfüßer" wird über mehrere Versuche eine Eingrenzung bis zur
Art.

Deutsch und Englisch, drei Schwierigkeitsstufen, Tagesrätsel ohne Server, installierbar als PWA.

## Der wichtigste Punkt zur Architektur

Es gibt zwei Datensätze, und sie werden getrennt beschafft:

1. **Der Stammbaum** muss vollständig und biologisch korrekt sein. Er kommt fertig von der
   [NCBI Taxonomy](https://www.ncbi.nlm.nih.gov/taxonomy) (rund 3 Mio. Taxa, gemeinfrei).
2. **Der Rateraum** muss klein und kuratiert sein. Metazooa spielt mit rund 300 Tieren. Das ist
   Design, kein Versäumnis: Mit zwei Millionen ratbaren Arten wäre das Spiel unspielbar.

Beides wird **zur Bauzeit** einmal zusammengeführt und als statisches JSON ausgeliefert. Zur Laufzeit
fragt die App keine externe Datenquelle mehr an. Deshalb funktioniert sie offline, Tagesrätsel
eingeschlossen: Das Datum ist der Zufallsseed, den rechnet das Gerät selbst aus.

Nur die Tierfotos kommen live von Wikimedia. Der Service Worker legt jedes einmal geladene Bild
dauerhaft ab, sodass Tiere aus vergangenen Runden ihr Foto auch ohne Netz behalten.

## Veröffentlichen

Jeder Push auf `main` baut und veröffentlicht automatisch
([.github/workflows/deploy.yml](.github/workflows/deploy.yml)). Der Workflow lässt vorher die
Tests laufen, und die pruefen auch die erzeugten Spieldaten. Ein kaputter Datenstand kommt damit
gar nicht erst online.

`DEPLOY_TARGET=gh-pages` setzt die Basis-URL auf `/artenmonster/`, weil GitHub Pages unter dem
Repository-Namen ausliefert. Manifest, Service-Worker-Scope und Precache-Pfade ziehen mit.

## Loslegen

```bash
npm install
```

Die Spieldaten liegen fertig unter `public/data/` im Repo. Zum Spielen reicht deshalb:

```bash
npm run dev
```

## Daten neu bauen

Nur nötig, wenn der Pool wachsen soll oder die Quellen aktualisiert werden. Der erste Durchlauf
dauert etwa eine Stunde, danach greift der Cache unter `data/cache/` und es sind Minuten.

```bash
npm run data:all
```

Die fünf Schritte einzeln:

| Schritt | Befehl | Was passiert |
|---|---|---|
| 1 | `npm run data:ncbi` | `taxdump.tar.gz` laden, `nodes.dmp` und `names.dmp` entpacken |
| 2 | `npm run data:wikidata` | Kandidaten über die Taxobox-Vorlage der deutschen Wikipedia ernten, bei Wikidata anreichern, auf Tiere filtern |
| 3 | `npm run data:enrich` | Pool schneiden, Steckbriefe und Bildrechte holen |
| 4 | `npm run data:tree` | Induzierten Teilbaum bauen, zusammenfalten, zweisprachig benennen |
| 5 | `npm run data:emit` | Spieldateien nach `public/data/` schreiben und prüfen |

### Warum der Umweg über die Wikipedia-Taxobox?

Der naheliegende Weg wäre eine SPARQL-Abfrage über alle Taxa mit NCBI-ID. Der scheitert: Das sind
1,5 Mio. Einträge, und der Wikidata Query Service bricht nach 60 Sekunden ab, egal wie eng man
filtert. Die Taxobox-Vorlage der deutschen Wikipedia liefert stattdessen eine begrenzte Liste von
rund 62.000 Artikeln über Lebewesen samt Wikidata-ID. Wikidata wird danach gezielt nach genau diesen
Items gefragt (`VALUES` statt Vollscan), was pro 400 Items wenige Sekunden dauert.

Dass die deutsche Wikipedia das Nadelöhr ist, passt zum Spiel: Ein Tier ohne deutschen Artikel wollen
wir ohnehin nicht als Rateziel.

### Stellschrauben

Alles Wesentliche steht in [`tools/config.ts`](tools/config.ts). Die Poolgröße ist dort ein
Drehregler (`TIERS[n].size`), keine Codeänderung.

Handkorrekturen liegen in `tools/overrides/`:

- `blocklist.json` — Taxa, die als Rateziel nicht taugen (Modellorganismen wie *Drosophila*)
- `animals.json` — Namenskorrekturen und Sonderfälle einzelner Tiere
- `clades.json` — deutsche Namen für Kladen, für die Wikidata keinen Trivialnamen kennt

## Aufbau

```
tools/       Datenpipeline. Läuft beim Entwickeln, nie beim Spieler.
src/core/    Baumlogik, Spielzustand, Suche, Tagesseed. Ohne DOM, voll testbar.
src/data/    Laden der JSON-Dateien und Ablage im Browser.
src/ui/      React-Komponenten.
public/data/ Generierte Spieldateien, eingecheckt.
```

Die Trennung zwischen `core/` und `ui/` ist die wichtigste im Projekt: Die Spiellogik ist reine
Baummathematik und wird gegen die echten Daten getestet, ohne dass eine Komponente gerendert werden
muss.

```bash
npm test          # Kerntests
npm run typecheck
npm run build
```

## Lizenzen der Datenquellen

| Quelle | Lizenz | Wofür |
|---|---|---|
| NCBI Taxonomy | gemeinfrei (US-Bundesbehörde) | Stammbaum und wissenschaftliche Namen |
| Wikidata | CC0 | deutsche Trivialnamen, Bekanntheitswert, Bildverweise |
| Wikipedia | CC BY-SA 4.0 | Steckbrieftexte, Quelle wird im Spiel genannt |
| Wikimedia Commons | je Bild einzeln | Tierfotos, Urheber und Lizenz werden am Bild angezeigt |

Die Bildrechte sind der einzige Punkt mit echtem Kleingedruckten. Die Pipeline sammelt Urheber und
Lizenz zu jedem Bild ein und bricht ab, wenn ein Bild ohne diese Angaben durchrutschen würde.
