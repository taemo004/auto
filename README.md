# 🏁 Turbo Rivals – Online-Autorennen im Browser

Ein schnelles Top-Down-Autorennspiel mit **Online-Multiplayer**, komplett im Browser – ohne Installation, ohne Login
und **ohne eigenen Server**: Das Spiel läuft auf GitHub Pages, die Browser verbinden sich direkt miteinander (WebRTC).
Inspiriert vom „Sofort-loslegen“-Prinzip von Spielen wie *Top Tennis*: Name eintippen, Farbe wählen, fahren.

## Features

- **Online-Multiplayer** (bis zu 8 Fahrer pro Raum), direkt zwischen den Browsern
  - ⚡ *Schnelles Spiel*: automatisch in einen öffentlichen Raum, Autostart nach 15 s sobald 2+ Spieler da sind
  - *Raum erstellen*: privater Raum mit 4-stelligem Code + Einladungslink (`?room=CODE`)
  - Lobby mit Chat, Streckenwahl und Rundenanzahl
  - **Gastgeber-Wechsel:** Verlässt der Gastgeber den Raum (auch durch Tab schließen), übernimmt automatisch der
    nächste Spieler – der Raumcode bleibt gültig
- **Einzelspieler gegen KI** (1–7 Gegner, 3 Schwierigkeitsstufen)
- **6 Strecken** mit eigenem Thema und Fahrgefühl:
  Speedway (Wiese), Serpentine (Berge, Schotterpassage), Hafenkurs (Container), Wüstenrallye (Schotter, Sprünge),
  Gletscherring (Schnee und Eis), Neon City (Nachtrennen)
- **3 Autos:** Sportwagen (ausgewogen), Drifter (wendig, rutschig), Muscle Car (schnell, träge)
- **Spezialsachen:** Boost-Felder, Sprungschanzen, Ölflecken, Nitro-Kanister, Mini-Turbo nach Drifts, Turbostart,
  Untergründe mit unterschiedlicher Haftung (Asphalt, Schotter, Schnee, Eis)
- **🏆 Bestenliste** der schnellsten Runde je Strecke – Top 10 / 100 / 1000, filterbar nach Auto, mit eigener Platzierung
  (weltweit nach Einrichtung, siehe [BESTENLISTE.md](BESTENLISTE.md))
- Tribünen mit Publikum, Startampel, Reifenspuren, Partikel, Kamerawackeln, synthetischer Motorsound
- HUD: Platz, Runde, Zeit, aktuelle Runde, Bestzeit, Live-Rangliste, Minimap, Tacho, Nitro
- **Handy:** analoge Lenkfläche (Empfindlichkeit einstellbar), große Gas-/Bremsknöpfe, mitdrehende Kamera,
  optional Auto-Gas – im Hoch- und Querformat

## Steuerung

| Taste | Aktion |
| --- | --- |
| `W` / `↑` | Gas |
| `S` / `↓` | Bremse / Rückwärts |
| `A` `D` / `←` `→` | Lenken |
| `Leertaste` | Drift |
| `Shift` / `N` | Nitro |
| `R` | Zurück auf die Strecke |
| `M` | Ton an/aus |
| Handy | links über die Lenkfläche wischen, rechts Gas/Bremse, darüber Nitro und Drift |
| `Esc` | Rennen verlassen |

## Online spielen (GitHub Pages)

Das Spiel besteht nur aus statischen Dateien in `public/` und wird per GitHub Actions
(`.github/workflows/pages.yml`) bei jedem Push auf `main` automatisch veröffentlicht.

Einmalig einrichten: im Repository **Settings → Pages → Build and deployment → Source: „GitHub Actions“** wählen.
Danach ist das Spiel unter `https://<benutzername>.github.io/<repository>/` erreichbar.

> Hinweis: GitHub Pages ist für öffentliche Repositories kostenlos, für private Repositories braucht man GitHub Pro/Team.

**Vor jeder Veröffentlichung die Versionsnummer hochzählen:** in `public/js/version.js` und in `public/index.html`
(`data-v`, alle `?v=` und die Import-Map – `npm test` prüft, dass alles übereinstimmt). Browser dürfen die Seite
bis zu 10 Minuten zwischenspeichern; die Versionsnummer sorgt dafür, dass alte Seiten die neuen Skripte nicht
mit alten mischen, sondern sich einmal selbst neu laden.

## Lokal starten

Voraussetzung: Node.js ≥ 18 (keine Abhängigkeiten nötig)

```bash
npm start
```

Dann im Browser **http://localhost:3000** öffnen. Jeder andere statische Webserver funktioniert genauso
(z. B. `npx serve public`).

## So funktioniert der Multiplayer

- Wer einen Raum erstellt, ist **Gastgeber**. In seinem Browser läuft die Raumlogik (`public/js/room.js`):
  Lobby, Countdown, Verteilen der Positionen (20×/s), Zieleinlauf und Ergebnis.
- Alle anderen verbinden sich per **WebRTC direkt** mit dem Gastgeber. Zum Finden des Gastgebers wird nur der
  kostenlose öffentliche Vermittlungsserver von [PeerJS](https://peerjs.com) genutzt – die Spieldaten laufen nicht darüber.
- Der Raumcode ist gleichzeitig die Verbindungs-ID des Gastgebers. *Schnelles Spiel* nutzt die festen öffentlichen
  Räume `QK01`…`QK08`: Ist ein Raum frei, wird man selbst Gastgeber, sonst tritt man bei.
- Jeder Browser simuliert sein eigenes Auto lokal (keine Eingabeverzögerung); die Gegner werden mit ~110 ms
  Interpolation flüssig dargestellt.

- Verlässt der Gastgeber den Raum, benennt seine Raumlogik einen Nachfolger; bei einem Abbruch (Tab geschlossen,
  Netz weg) erkennen die anderen das über fehlende Lebenszeichen nach ca. 7 s. Der Nachfolger übernimmt die
  Raum-ID, alle anderen treten automatisch wieder bei. Ein laufendes Rennen wird dabei abgebrochen.

**Einschränkungen:** Das Gastgeber-Fenster sollte im Vordergrund bleiben (Browser drosseln Hintergrund-Tabs).
In sehr restriktiven Netzwerken (manche Firmen-/Schulnetze) kann eine direkte Verbindung scheitern.

Optional kann ein eigener PeerJS-Server genutzt werden: `?peerhost=mein-server.de&peerport=443&peerpath=/`

## Tests

```bash
npm test
```

Prüft die Streckengeometrie (keine Abkürzungen, fahrbare Kurven), lässt KI-Autos aller Typen jede Strecke
zu Ende fahren und testet die Raumlogik (Beitreten, Start, Zielprüfung, Ergebnisse, Host-Wechsel).
Läuft auch automatisch bei jedem Pull Request (`.github/workflows/test.yml`).

## Aufbau

```
server.js            Kleiner lokaler Entwicklungsserver (nur statische Dateien)
.github/workflows/   Automatische Veröffentlichung auf GitHub Pages, Tests bei Pull Requests
test/                Automatische Tests (npm test)
public/index.html    Menüs, Lobby, HUD
public/style.css     Styling (inkl. Mobil-Layout)
public/js/main.js    Spielablauf, Eingabe, Lobby-UI, Netzwerk-Synchronisation & Interpolation
public/js/board-ui.js  Bestenlisten-Bildschirm
public/js/util.js    Kleine Helfer (Zeitformat, HTML-Escaping)
public/js/car.js     Fahrphysik, Rundenzählung (Checkpoints), Kollisionen, KI-Fahrer
public/js/tracks.js  Streckendefinitionen (Catmull-Rom-Splines) und Geometrie
public/js/render.js  Canvas-Renderer, Minimap, Effekte
public/js/audio.js   Motorsound und Effekte
public/js/net.js     Peer-to-Peer-Verbindungen (PeerJS/WebRTC), Raum erstellen/beitreten/Schnelles Spiel, Gastgeber-Wechsel
public/js/room.js    Raumlogik, läuft im Browser des Gastgebers
public/js/leaderboard.js  Bestenliste (Firebase REST oder lokal)
public/js/config.js  Adresse der Bestenlisten-Datenbank
firebase-rules.json  Sicherheitsregeln für die Bestenlisten-Datenbank
public/vendor/       PeerJS 1.5.5 (MIT-Lizenz)
```

### Neue Strecke hinzufügen

In `public/js/tracks.js` einen Eintrag zu `TRACK_DEFS` hinzufügen: Kontrollpunkte (Punkt 0 = Start/Ziel), Thema,
Untergrund, optionale Zonen (`zones`) und Spezialelemente (`features`). Sie erscheint automatisch in der Streckenauswahl.
Für die weltweite Bestenliste die Strecken-ID zusätzlich in `firebase-rules.json` ergänzen.
