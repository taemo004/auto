# 🏁 Turbo Rivals – Online-Autorennen im Browser

Ein schnelles Top-Down-Autorennspiel mit **Online-Multiplayer**, komplett im Browser – ohne Installation, ohne Login
und **ohne eigenen Server**: Das Spiel läuft auf GitHub Pages, die Browser verbinden sich direkt miteinander (WebRTC).
Inspiriert vom „Sofort-loslegen“-Prinzip von Spielen wie *Top Tennis*: Name eintippen, Farbe wählen, fahren.

## Features

- **Online-Multiplayer** (bis zu 8 Fahrer pro Raum)
  - ⚡ *Schnelles Spiel*: automatisch in einen öffentlichen Raum, Autostart nach 15 s sobald 2+ Spieler da sind
  - *Raum erstellen*: privater Raum mit 4-stelligem Code + Einladungslink (`?room=CODE`)
  - Lobby mit Chat, Streckenwahl und Rundenanzahl (Host)
- **Einzelspieler gegen KI** (1–7 Gegner, 3 Schwierigkeitsstufen) – funktioniert auch ohne Server
- 3 Strecken: *Speedway*, *Serpentine*, *Hafenkurs*
- Arcade-Physik mit **Drift** (lädt Nitro auf) und **Nitro-Boost**, Kollisionen, Kiesbett, Reifenstapel
- Reifenspuren, Partikel, Kamerawackeln, synthetischer Motorsound (WebAudio)
- HUD: Platz, Runde, Zeit, Rundenbestzeit, Live-Rangliste, Minimap, Tacho
- Touch-Steuerung für Handy/Tablet
- Der Gastgeber misst die Zielzeiten selbst und prüft den gemeldeten Fortschritt (einfacher Schutz gegen Schummeln)

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
| `Esc` | Rennen verlassen |

## Online spielen (GitHub Pages)

Das Spiel besteht nur aus statischen Dateien in `public/` und wird per GitHub Actions
(`.github/workflows/pages.yml`) bei jedem Push auf `main` automatisch veröffentlicht.

Einmalig einrichten: im Repository **Settings → Pages → Build and deployment → Source: „GitHub Actions“** wählen.
Danach ist das Spiel unter `https://<benutzername>.github.io/<repository>/` erreichbar.

> Hinweis: GitHub Pages ist für öffentliche Repositories kostenlos, für private Repositories braucht man GitHub Pro/Team.

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

**Einschränkungen:** Verlässt der Gastgeber den Raum oder schließt das Fenster, endet der Raum für alle.
Das Gastgeber-Fenster sollte im Vordergrund bleiben (Browser drosseln Hintergrund-Tabs). In sehr restriktiven
Netzwerken (manche Firmen-/Schulnetze) kann eine direkte Verbindung scheitern.

Optional kann ein eigener PeerJS-Server genutzt werden: `?peerhost=mein-server.de&peerport=443&peerpath=/`

## Aufbau

```
server.js            Kleiner lokaler Entwicklungsserver (nur statische Dateien)
.github/workflows/   Automatische Veröffentlichung auf GitHub Pages
public/index.html    Menüs, Lobby, HUD
public/style.css     Styling (inkl. Mobil-Layout)
public/js/main.js    Spielablauf, Eingabe, Lobby-UI, Netzwerk-Synchronisation & Interpolation
public/js/car.js     Fahrphysik, Rundenzählung (Checkpoints), Kollisionen, KI-Fahrer
public/js/tracks.js  Streckendefinitionen (Catmull-Rom-Splines) und Geometrie
public/js/render.js  Canvas-Renderer, Minimap, Effekte
public/js/audio.js   Motorsound und Effekte
public/js/net.js     Peer-to-Peer-Verbindungen (PeerJS/WebRTC), Raum erstellen/beitreten/Schnelles Spiel
public/js/room.js    Raumlogik, läuft im Browser des Gastgebers
public/vendor/       PeerJS 1.5.5 (MIT-Lizenz)
```

### Neue Strecke hinzufügen

In `public/js/tracks.js` einen Eintrag zu `TRACK_DEFS` hinzufügen (Kontrollpunkte im Uhrzeigersinn, Punkt 0 = Start/Ziel)
– sie erscheint automatisch in der Streckenauswahl.
