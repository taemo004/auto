# 🏁 Turbo Rivals – Online-Autorennen im Browser

Ein schnelles Top-Down-Autorennspiel mit **Online-Multiplayer**, komplett im Browser – ohne Installation, ohne Login.
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
- Server misst die Zielzeiten selbst und prüft den gemeldeten Fortschritt (einfacher Schutz gegen Schummeln)

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

## Starten

Voraussetzung: Node.js ≥ 18

```bash
npm install
npm start
```

Dann im Browser **http://localhost:3000** öffnen. Für Multiplayer im Heimnetz einfach die IP des Rechners
(z. B. `http://192.168.0.10:3000`) auf den anderen Geräten öffnen. Port ändern: `PORT=8080 npm start`.

## Online stellen

Der Server ist ein einzelner Node-Prozess (HTTP + WebSocket auf demselben Port) und läuft auf jedem
Node-Hoster mit WebSocket-Unterstützung, z. B. Render, Railway, Fly.io oder einem eigenen VPS:

- Build-Befehl: `npm install`
- Start-Befehl: `npm start`
- Der Port wird über die Umgebungsvariable `PORT` übernommen.

Hinter HTTPS verbindet sich der Client automatisch per `wss://`.

## Aufbau

```
server.js            Node-Server: statische Dateien + WebSocket (Räume, Lobby, Rennablauf, Zustands-Relay 20 Hz)
public/index.html    Menüs, Lobby, HUD
public/style.css     Styling (inkl. Mobil-Layout)
public/js/main.js    Spielablauf, Eingabe, Lobby-UI, Netzwerk-Synchronisation & Interpolation
public/js/car.js     Fahrphysik, Rundenzählung (Checkpoints), Kollisionen, KI-Fahrer
public/js/tracks.js  Streckendefinitionen (Catmull-Rom-Splines) und Geometrie
public/js/render.js  Canvas-Renderer, Minimap, Effekte
public/js/audio.js   Motorsound und Effekte
public/js/net.js     WebSocket-Client
```

**Netzwerkmodell:** Jeder Client simuliert sein eigenes Auto lokal (sofortige Reaktion ohne Lag) und schickt
20× pro Sekunde seinen Zustand an den Server. Der Server verteilt die Zustände an alle im Raum; die Clients
zeigen die Gegner mit ~110 ms Interpolation flüssig an. Start, Countdown, Zieleinlauf und Ergebnis steuert der Server.

### Neue Strecke hinzufügen

In `public/js/tracks.js` einen Eintrag zu `TRACK_DEFS` hinzufügen (Kontrollpunkte im Uhrzeigersinn, Punkt 0 = Start/Ziel)
und die ID in `TRACK_IDS` in `server.js` ergänzen.
