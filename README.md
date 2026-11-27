# Farbwirbel 🌀

Buntes 3D-Kartenspiel im Browser – mit Freunden (Raumcode/Link) oder gegen Bots.
Ein einziger Docker-Container: Node.js liefert die Webseite aus und betreibt den Spielserver (WebSocket) auf demselben Port.

## Features

- 3D-Tisch mit Three.js, drei Themes: **Neon-Arena**, **Winter**, **Garten**
- 2–20 Spieler (Plätze in der Lobby einstellbar, Standard 6), leere Plätze mit Bots (leicht / normal / schwer) auffüllen
- „Schnelles Spiel“ startet sofort gegen 3 Bots
- Offizielle Grundregeln inkl. +4-Bluff anzweifeln, „Letzte Karte!“ rufen / „Erwischt!“
- **Säure-Karten** (je 1 in Rot, Gelb, Grün, Blau; in der Lobby abschaltbar): Wer z. B. rote Säure legt,
  wirft alle seine roten Karten mit ab. Die Säure bleibt oben liegen.
- **☠ DOOM-Karten** (Aus / 1 % / 3 %, Standard 1 %): extrem selten und fies. Beim Ziehen erscheint für alle eine riesige
  Warnung, die Karte qualmt rot mit Glutfunken. Effekte: **+100** (Ziel wählen), **Höllen-Tornado** (gleichmäßig verteilen +
  10 Höllenkarten pro Gegner), **Halluzinationen** (alle anderen sehen 3 Züge lang Enten & Essen statt Karten, Quatsch-Zahlen
  und -Namen). Karten aus DOOM-Effekten steigen aus einem Höllenportal in der Tischmitte.
- Regel-Seite im Spiel (?-Button) mit allen Karten
- Hausregeln: Stapeln, 7–0, Reinwerfen, Ziehen bis passt
- **Chaos-Modus** (Aus / 5 / 10 / 20 / 35 %): Chance, dass eine gezogene Karte eine Chaos-Karte ist.
  Effekte: +50, 3× Aussetzen, Handtausch, Geschenk (3 Karten verschenken), Kartenwirbel (alle Hände neu verteilt),
  Tornado (alle Karten wirbeln um die Tischmitte und werden gleichmäßig neu verteilt),
  Farbrotation, Alle +4, Ausmisten. Chaos-Karten passen immer (außer bei offenen Strafkarten).
  Neu: Richtungschaos (10 Züge lang 50 % Richtungswechsel nach jedem Zug; liegt es schon, wählt man: aufheben oder +10).
  Wer eine Chaos-Karte zieht, löst eine lila Explosion aus; solange er sie hält, steigt für alle sichtbar
  lila Rauch von der Karte auf und am Namensschild steht „✦ Chaos ×N“ (welche Karte es ist, bleibt geheim).
  Gehen alle Karten aus, kommt ein frisches Deck ins Spiel; nach 2000 Zügen endet eine Runde automatisch.
- Punktezählung mit Punkteziel, optionaler Zug-Timer
- Reconnect: Seite neu laden → man landet wieder auf seinem Platz; bei Verbindungsabbruch spielt kurz ein Bot weiter
- Emotes, synthetische Soundeffekte (keine Audiodateien), Tastatur: `Leertaste`/`D` = ziehen, `L` = Letzte Karte,
  `←`/`→` bzw. Mausrad = Karte wählen, `↑`/`↓` = Reihe wechseln, `Enter` = spielen
- Große Hände (50, 100+ Karten): Lupen-Effekt um den Mauszeiger, spielbare Karten in eigener Reihe vorne,
  auf dem Handy erst antippen, dann nochmal tippen zum Spielen

## Auf Unraid installieren

### 1. Dateien auf den Server holen
Am einfachsten per Git direkt im Unraid-Terminal:

```bash
cd /mnt/user/appdata && git clone https://github.com/ByQuadiix/Farbwirbel.git farbwirbel
```

Oder manuell kopieren:
Kopiere den Ordner `farbwirbel` (ohne `node_modules` und `dist`) auf eine Freigabe, z. B. nach
`\\TOWER\appdata\farbwirbel` → auf dem Server ist das `/mnt/user/appdata/farbwirbel`.

### 2a. Mit Docker Compose (empfohlen)
Plugin **Docker Compose Manager** aus den Community Apps installieren. Dann im Unraid-Terminal:

```bash
cd /mnt/user/appdata/farbwirbel
docker compose up -d --build
```

Der Container erscheint danach im Docker-Tab und startet mit dem Server automatisch neu (`restart: unless-stopped`).

### 2b. Ohne Compose-Plugin
```bash
cd /mnt/user/appdata/farbwirbel
docker build -t farbwirbel .
docker run -d --name farbwirbel --restart unless-stopped -p 8080:3000 farbwirbel
```

### 2c. Fertiges Image laden (ohne Bauen)
Die Datei `farbwirbel-image.tar.gz` enthält das fertig gebaute Image (linux/amd64). Auf die Freigabe kopieren, dann:

```bash
docker load -i /mnt/user/appdata/farbwirbel-image.tar.gz
docker run -d --name farbwirbel --restart unless-stopped -p 8080:3000 farbwirbel:latest
```

### 3. Spielen
Im Browser `http://<IP-deines-Unraid>:8080` öffnen. Raum erstellen → Code oder Link an Freunde im selben Netzwerk schicken.

Port ändern: in `docker-compose.yml` die linke Zahl bei `8080:3000` anpassen.

### Update
Neue Dateien in den Ordner kopieren und erneut `docker compose up -d --build` ausführen.

### Von außen erreichbar (optional)
Hinter einem Reverse Proxy (Nginx Proxy Manager, SWAG, Traefik) einfach auf Port 8080 weiterleiten und
**WebSocket-Support aktivieren** (Pfad `/ws`). Es gibt keine Benutzerkonten – wer den Link kennt, kann mitspielen.

## Debug-Modus

Mit der Umgebungsvariable `FW_DEBUG=1` erscheint im Spiel oben rechts ein 🛠-Button. Das Debug-Menü
verteilt beliebige Karten (Säure, alle Chaos-Karten, Joker, eigene Karten in Wunschfarbe) an dich oder einen
anderen Spieler – praktisch zum Ausprobieren. In `docker-compose.yml` ist die Zeile vorbereitet (auskommentiert).
Lokal: `$env:FW_DEBUG='1'; npm start` (PowerShell).

## Entwicklung

Ausführliche Entwickler-Doku (Architektur, Protokoll, alle Karten, Dateien, Fallstricke): **[CLAUDE.md](CLAUDE.md)**.

```bash
npm install
npm run build      # Client nach dist/public bauen
npm start          # Server auf http://localhost:3000
npm test           # 800 simulierte Bot-Runden prüfen die Spielregeln
```

Für Live-Reload: `npm run dev` (Server) und parallel `npm run dev:client` (Vite auf Port 5173, leitet `/ws` an den Server weiter).

## Aufbau

```
shared/rules.js    Kartendeck & Regeln (Server und Client)
server/index.js    HTTP (statische Dateien, /health) + WebSocket /ws, Sitzungen, Räume
server/room.js     Lobby, Spielablauf, Timer, Reconnect – der Server prüft jeden Zug
server/bot.js      Bot-Logik
client/src/        Three.js-Client: stage (Renderer/Kamera), themes, board (Karten & Animation),
                   cards (Kartengrafiken per Canvas), main (UI), net, audio
```
