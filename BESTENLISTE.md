# 🏆 Weltweite Bestenliste einrichten (ca. 5 Minuten, kostenlos)

Ohne Einrichtung speichert das Spiel die Rundenzeiten nur auf dem jeweiligen Gerät.
Damit alle Spieler eine gemeinsame Bestenliste sehen, braucht es einen kleinen Online-Speicher.
Dafür wird die kostenlose **Firebase Realtime Database** von Google genutzt (Tarif „Spark“, keine Kreditkarte nötig).

## Schritt 1: Firebase-Projekt anlegen

1. Öffne https://console.firebase.google.com und melde dich mit einem Google-Konto an.
2. Klicke auf **„Projekt erstellen“** (bzw. „Neues Firebase-Projekt erstellen“).
3. Name z. B. `turbo-rivals` → Weiter → **Google Analytics ausschalten** → **Projekt erstellen**.

## Schritt 2: Datenbank anlegen

1. Links im Menü: **Build → Realtime Database** (ggf. unter „Alle Produkte“).
2. **„Datenbank erstellen“** klicken.
3. Standort: **Belgien (europe-west1)** → Weiter.
4. **„Im gesperrten Modus starten“** auswählen → **Aktivieren**.

## Schritt 3: Regeln einfügen

Die Regeln sorgen dafür, dass nur gültige Rundenzeiten gespeichert werden und eine Zeit nur durch eine bessere ersetzt werden kann.

1. In der Realtime Database oben auf den Tab **„Regeln“** klicken.
2. Den gesamten Inhalt löschen und den Inhalt der Datei [`firebase-rules.json`](firebase-rules.json) einfügen.
3. **„Veröffentlichen“** klicken.

## Schritt 4: Adresse eintragen

1. Tab **„Daten“**: Oben steht die Adresse der Datenbank, z. B.
   `https://turbo-rivals-default-rtdb.europe-west1.firebasedatabase.app`
2. Diese Adresse in [`public/js/config.js`](public/js/config.js) eintragen:
   ```js
   export const FIREBASE_DB_URL = 'https://turbo-rivals-default-rtdb.europe-west1.firebasedatabase.app';
   ```
   (Oder die Adresse einfach Claude schicken – das Eintragen übernimmt Claude.)
3. Änderung auf `main` bringen – GitHub Pages veröffentlicht automatisch.

Fertig! In der Bestenliste steht dann oben **„Weltweit“** statt „Nur dieses Gerät“.

## Gut zu wissen

- Pro Strecke hat jeder Name genau einen Eintrag – seine schnellste Runde. Groß-/Kleinschreibung spielt keine Rolle.
- Es gibt keine Konten: Wer denselben Namen wählt, schreibt in denselben Eintrag (aber nur mit einer besseren Zeit).
- Die Zeiten werden im Browser gemessen. Die Regeln blockieren unmögliche Werte (unter 5 s), einen entschlossenen
  Schummler mit Entwicklerkenntnissen können sie aber nicht vollständig aufhalten.
- Einträge löschen: in der Firebase-Konsole unter „Daten“ → `laps` → Strecke → Eintrag → Papierkorb.
- Der kostenlose Tarif reicht für viele tausend Spieler pro Monat.
