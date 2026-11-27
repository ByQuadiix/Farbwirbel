# Farbwirbel – Projektübergabe für Claude Code

> Diese Datei wird von Claude Code automatisch geladen. Sie beschreibt **alles, was im Projekt steckt, wo es liegt und
> wie es zusammenspielt** – damit eine neue Sitzung (auch auf einem anderen Rechner) nahtlos weiterarbeiten kann.
> Endnutzer-Doku (Installation auf Unraid usw.) steht in `README.md`.

---

## 1. Was ist das?

**Farbwirbel** ist ein 3D-Kartenspiel im Browser (Three.js) im Stil klassischer „Farbe-oder-Zahl-ablegen“-Kartenspiele,
mit Online-Multiplayer (Räume per 4-Buchstaben-Code/Link), Bots, drei Tisch-Themes und vielen eigenen Sonderkarten
(Säure, Chaos-Karten, DOOM-Karten). Alles läuft in **einem Docker-Container**: Node.js liefert die gebaute Webseite aus
und betreibt den Spielserver per WebSocket auf demselben Port.

**Wichtige Vorgaben des Nutzers / rechtlich:**
- Es ist **kein UNO-Klon**: eigener Name („Farbwirbel“), eigenes Kartendesign (per Canvas gezeichnet, Raute statt Oval,
  eigene Rückseite), eigene Avatare (Emojis). Keine fremden Marken, Logos oder Grafiken verwenden.
- UI-Sprache ist **Deutsch**, der Nutzer schreibt Deutsch. Antworten auf Deutsch.
- Ziel-Deployment: **Unraid** (Docker/Compose, linux/amd64). Entwicklung auf **Windows** (PowerShell, Node 24).
- Der Nutzer probiert gern selbst im Browser – neue Features möglichst sichtbar/animiert und im Browser testen.

---

## 2. Schnellstart

**Repository:** https://github.com/ByQuadiix/Farbwirbel (Branch `main`)

```powershell
git clone https://github.com/ByQuadiix/Farbwirbel.git
cd Farbwirbel
```

Git-Autor für dieses Projekt (nur lokal im Repo gesetzt, nicht global):
`git config user.name "ByQuadiix"` und `git config user.email "ByQuadiix@users.noreply.github.com"`
(noreply-Adresse, damit die private E-Mail nicht in der öffentlichen Historie landet). Commits enden mit
`Co-Authored-By`-Zeile, wenn Claude sie erstellt. Der erste Push brauchte eine einmalige Browser-Anmeldung über den
Git Credential Manager – die macht der Nutzer selbst.

```powershell
npm install                 # einmalig (ws, three, vite, @fontsource/fredoka)
npm run build               # Client nach dist/public bauen (Vite, ~2 s)
npm start                   # Server auf http://localhost:3000
$env:FW_DEBUG='1'; npm start   # dito mit Debug-Menü (🛠-Button im Spiel)
npm test                    # Regel-Simulation: ~1760 Bot-Runden mit allen Varianten
```

- **Live-Entwicklung:** `npm run dev` (Server mit --watch) + parallel `npm run dev:client` (Vite auf :5173, proxyt `/ws` → :3000).
- **Wichtig:** Der Server liefert nur `dist/public` aus → nach Client-Änderungen immer `npm run build`, dann Seite neu laden.
  Nach Server-Änderungen den Node-Prozess neu starten.
- **Claude-Preview:** `.claude/launch.json` enthält `farbwirbel` (normal) und `farbwirbel-debug` (mit FW_DEBUG=1), Port 3000.
- **Docker:** `docker compose up -d --build` → http://localhost:8080 (Container-Port 3000).

---

## 3. Projektstruktur

```
farbwirbel/
├─ CLAUDE.md               ← diese Datei
├─ README.md               ← Nutzer-Doku: Features, Unraid-Installation, Debug, Entwicklung
├─ package.json            ← Skripte; runtime-Dep nur "ws"; Dev: three, vite, @fontsource/fredoka
├─ vite.config.js          ← root=client, outDir=../dist/public, Proxy /ws, fs.allow ['..'] (für shared/)
├─ Dockerfile              ← Multi-Stage: node:22-alpine build (npm ci, build, test) → schlankes Runtime-Image, USER node, HEALTHCHECK /health
├─ docker-compose.yml      ← Service "farbwirbel", Port 8080:3000, restart unless-stopped, FW_DEBUG auskommentiert
├─ .dockerignore / .gitignore
├─ .claude/launch.json     ← Preview-Server-Konfiguration für Claude Code
├─ shared/
│  └─ rules.js             ← Karten, Deck, canPlay, Punkte, Einstellungen, CHAOS/DOOM-Definitionen (Server UND Client)
├─ server/
│  ├─ index.js             ← HTTP (statische Dateien, /health), WebSocket /ws, Sessions, Räume, Debug-Befehl
│  ├─ room.js              ← Raum + komplette Spiellogik (Lobby, Züge, Effekte, Timer, Bots-Scheduling, View pro Spieler)
│  └─ bot.js               ← Bot-Entscheidungen (leicht/normal/schwer)
├─ client/
│  ├─ index.html           ← Gerüst: #stage (Canvas) + #ui (Overlay)
│  ├─ public/favicon.svg
│  └─ src/
│     ├─ main.js           ← UI/Steuerung: Screens, Lobby, HUD, Dialoge, Events→Effekte, Debug-Menü, Halluzinations-UI
│     ├─ stage.js          ← Three.js Renderer/Kamera/Licht, Resize, Render-Loop, Theme-Wechsel
│     ├─ themes.js         ← prozedurale Tische: neon / winter / garden
│     ├─ board.js          ← 3D-Spielfeld: Karten-Meshes, Diff-Sync, Animation, Portal, Tornado, Halluzinationen, Picking
│     ├─ cards.js          ← Kartentexturen per Canvas (normal, Säure, Chaos, DOOM, Rückseite), Mesh-Fabrik, Sortierung
│     ├─ particles.js      ← GPU-Partikel (Rauch/Glow/Funken), ChaosFX: Trails, Bursts, Säure, Tornado-Staub, Portalfeuer
│     ├─ rules.js          ← Regel-Seite (Overlay „Regeln & Karten“ mit Kartenbildern)
│     ├─ net.js            ← WebSocket mit Auto-Reconnect, Token in localStorage; `store` (localStorage-Wrapper)
│     ├─ audio.js          ← alle Sounds synthetisch per WebAudio (keine Dateien)
│     └─ style.css         ← komplettes Styling (Fredoka, Buttons, Lobby, HUD, Effekte, DOOM-Alert, Debug, Regeln)
└─ scripts/
   └─ simulate.js          ← Regeltest: viele Bot-Partien, prüft Invarianten (Kartenanzahl, keine Duplikate, Gewinner …)
```

Nicht im Repo (wird erzeugt, siehe `.gitignore`): `node_modules/`, `dist/`, `*.zip`, `*.tar.gz`.
Zeilenenden sind per `.gitattributes` überall LF (Linux-Container). Das fertige Docker-Image
(`farbwirbel-image.tar.gz`) und Übertragungs-ZIPs sind bewusst nicht im Repo – bei Bedarf neu erzeugen (siehe Abschnitt 11).

---

## 4. Architektur

### Server-autoritativ
- Der Client schickt nur **Absichten** (`play`, `draw`, …). `server/room.js` prüft alles (`fail()` wirft `GameError`
  → `{t:'error', msg}` an den Client) und führt den Zug aus.
- Nach jeder Aktion: `afterAction(turnChanged)` → (Notbremse, Richtungschaos würfeln, Aussetzen anwenden, Halluzination
  herunterzählen) → `schedule()` (Timer/Bots) → `broadcast()`.
- `broadcast()` schickt jedem Menschen **seine eigene Sicht** (`viewFor(player)`): öffentliche Infos + eigene Hand +
  spielbare Karten-IDs + die seit dem letzten Broadcast gesammelten **Events** (`this.events`, danach geleert).

### Client diff-basiert
- `main.js` → `onRoom(view)` → `board.sync(view, events)` gleicht Meshes mit dem Stand ab (Karten-IDs als Schlüssel),
  Events steuern nur Effekte/Animationsquellen (z. B. „Karte kam aus Gegnerhand X“, „aus dem Portal“).
- Karten bewegen sich per **exponentieller Glättung** zu Zielposen (`userData.tp/tq/ts`, `speed`, `delay`, `dieAt`).
- Eigene Hand hängt an `handGroup` (Kind der Kamera), Gegnerfächer an `seat.group` (schaut zur Tischmitte).

### Sessions, Räume, Reconnect (`server/index.js`)
- Session = Token (UUID, im Browser `localStorage['fw.token']`). `hello` mit Token → gleiche Session, Spieler bekommt
  seinen Platz zurück. Verbindungsabbruch im Spiel → nach 2,5 s spielt ein Bot für ihn (`autoAct(p, true)`).
- `leave` im laufenden Spiel → Spieler wird dauerhaft Bot („Name (Bot)“). Räume ohne verbundene Menschen pausieren
  und werden nach 30 min gelöscht; Sessions ohne Verbindung nach 2 h.
- Alles **im Speicher** – Server-Neustart = alle Räume weg (bewusst, kein DB).

### Timer & Bots (`room.schedule()`)
- Bei jedem Broadcast werden alle Timer neu gesetzt: Bot-Zug (`botDelay`), Auto-Zug für Offline-Spieler,
  optionaler Zug-Timer (`settings.turnTime`, Deadline im View), Bots „erwischen“ vergessliche Spieler.
- Ohne verbundene Menschen werden keine Timer gesetzt (Spiel pausiert).

---

## 5. Netzwerkprotokoll (`/ws`, JSON)

**Client → Server**

| `t` | Felder | Wirkung |
|---|---|---|
| `hello` | `token?, name?, avatar?` | Session anlegen/wiederaufnehmen → `welcome`, ggf. `noroom` |
| `profile` | `name, avatar` | Name/Avatar ändern (in der Lobby auch im Raum) |
| `create` / `quick` | `quick: bots, theme, chaos` | Raum erstellen / sofort Spiel gegen Bots |
| `join` | `code` | Raum beitreten (nur in der Lobby, max. 6) |
| `leave` | – | Raum verlassen |
| `settings` | `settings:{…}` | nur Host, nur Lobby (siehe `sanitizeSettings` in room.js) |
| `addBot` / `removeBot` | `id` | nur Host, Lobby |
| `start` / `nextRound` / `toLobby` | – | nur Host |
| `play` | `cardId, color?, target?, dirChoice?` | Karte spielen (Farbe bei Joker, Ziel bei 7/Chaos/DOOM, `cancel`/`extend` bei Richtungschaos) |
| `draw` / `pass` | – | ziehen / gezogene Karte behalten |
| `challenge` | `challenge: bool` | +4 anzweifeln oder annehmen |
| `callLast` / `catch` | `target` | „Letzte Karte!“ / jemanden erwischen |
| `emote` | `emote` | Emoji-Blase |
| `debugGive` | `cards:[…], target?` | **nur mit FW_DEBUG=1**: Karten auf eine Hand legen |
| `ping` | `at` | → `pong` |

**Server → Client:** `welcome {token,name,avatar,room,debug}`, `noroom`, `room {…view}`, `error {msg}`, `pong`.

**View (`room`)**: `code, hostId, phase ('lobby'|'playing'|'roundOver'), settings, me, players[] {id,name,avatar,isBot,
connected,count,score,called,vulnerable,skipTurns,chaos,doom,hallu}, hand[], playable[], game {discard (letzte 14),
color, turnId, actorId, dir, pending, dirChaos, drawCount, deadline, serverNow, round, awaiting}, result, events[]`.

**Events** (`room.ev`, alle mit `seq`): `deal, play {card, jumpIn, chaos, doom}, acid {color, cards}, skip {chaos,left},
reverse, draw {n, penalty, chaos, doom}, pass, call, caught, challenge {guilty}, swap, rotate, shuffle, newDeck,
chaos {effect, target, choice}, doom {effect, target, n}, dirRoll {flipped, left}, halluEnd, win, timeLimit, timeout,
emote, join, leave, disconnect, reconnect, debug`.

---

## 6. Karten & Regeln (`shared/rules.js`)

**Kartenmodell:** `{ id, color, kind, effect? }`
- `color`: `r y g b` (Farben), `w` (Joker), `x` (Chaos), `d` (DOOM)
- `kind`: `'0'..'9'`, `skip`, `rev`, `draw2`, `acid`, `wild`, `wild4`, `chaos`, `doom`

**ID-Bereiche** (wichtig für Tests/Invarianten): Grunddeck ab 1 · Zusatzdecks `decks*1000+1` · Chaos/DOOM ab
`1_000_000` · Höllenkarten (aus DOOM-Effekten) ab `2_000_000` (`HELL_ID_START`) · Debug-Karten ab `5_000_000`.

**Deck:** 108 Standardkarten + 4 Säure (wenn `settings.acid`) → `deckSize()`. Erste Ablagekarte ist immer eine Zahl.

**Grundregeln:** gleiche Farbe oder gleiche Art. Aussetzen, Richtungswechsel (bei 2 Spielern = Aussetzen), +2,
Joker, +4 mit **Bluff-Regel** (beim Legen wird `guilty = hat Karte der vorherigen Farbe` gespeichert; Anzweifeln:
schuldig → Leger zieht 4, Zweifler spielt normal; unschuldig → Zweifler zieht 4+2). „Letzte Karte!“ bei ≤ 2 Karten,
Erwischt = +2. Gezogene passende Karte darf sofort gespielt werden (`awaiting {type:'drawn'}`).

**Säure** (1 pro Farbe): legt alle eigenen Karten dieser Farbe mit ab (unter die Säure, Säure bleibt oben).

**Hausregeln** (Lobby-Schalter): `stacking`, `sevenZero`, `jumpIn`, `drawToMatch`, `acid`.

**Punkte:** Zahl = Wert · Aktion/Säure = 20 · Joker/Chaos = 50 · DOOM = 100. Punkteziel 0/200/300/500.

**Einstellungen** (`DEFAULT_SETTINGS`): `theme (neon|winter|garden), handSize, stacking, sevenZero, jumpIn, drawToMatch,
scoreLimit, turnTime (0/15/30/60), botLevel (easy|normal|hard), chaos (0/5/10/20/35 %), acid (bool), doom (0/1/3 %)`.
Validierung in `sanitizeSettings()` (room.js) – neue Einstellungen dort UND in `DEFAULT_SETTINGS` UND in der Lobby (main.js `renderLobby`) eintragen.

### Chaos-Karten (`CHAOS`, Farbe `x`)
Entstehen beim **normalen** Ziehen/Austeilen mit `settings.chaos` % (`room.maybeChaos()`; Strafkarten nie).
Spielbar immer im eigenen Zug, außer bei offenen Strafkarten. Verschwinden nach dem Spielen (nicht auf den Ablagestapel).

| Key | Wirkung |
|---|---|
| `plus50` | Ziel zieht 50 |
| `skip3` | Ziel setzt 3 Züge aus (`player.skipTurns`, `applySkips()`) |
| `swapHand` | Hand mit Ziel tauschen |
| `gift` | 3 zufällige eigene Karten an Ziel |
| `shuffleHands` | alle Hände mischen, Anzahl bleibt |
| `tornado` | alle Hände mischen und **gleichmäßig** verteilen |
| `colorShift` | Farben auf allen Händen rotieren r→y→g→b→r |
| `plus4All` | alle anderen +4 |
| `dump2` | 2 zufällige eigene Karten weg (normale unter den Ziehstapel) |
| `dirChaos` | 10 Züge lang nach jedem Zug 50 % Richtungswechsel (`game.dirChaos`, `rollDirChaos()`); läuft es schon → `dirChoice` `cancel`/`extend` (+10) |

### DOOM-Karten (`DOOM`, Farbe `d`)
Seltener als Chaos (`settings.doom` %, wird in `maybeChaos()` zuerst gewürfelt). Karten aus DOOM-Effekten sind **neu
erzeugt** (`room.hellCards(n)`, IDs ab 2 000 000) und kommen visuell aus dem **Höllenportal** in der Tischmitte.

| Key | Wirkung |
|---|---|
| `plus100` | Ziel bekommt 100 Höllenkarten |
| `tornado` | wie Chaos-Tornado + 10 Höllenkarten pro Gegner, nur unter den anderen verteilt |
| `hallu` | alle anderen: `player.hallu = 3` (zählt eigene Züge runter in `tickHallu()`); rein clientseitige Darstellung |

### Sicherheitsnetze
- Ziehstapel leer und nichts zum Mischen → **frisches Deck** (`newDeck`, max. 6 Decks).
- Nach **2000 Zügen** endet eine Runde, wenigste Karten gewinnt (`result.timeLimit`).

---

## 7. Client im Detail

### `main.js` (größte Datei)
- `state` (view, pick, debug, halluNames …), `render()` → `renderStart / renderLobby / renderHud / renderModal / renderDebug`.
- **Eingaben:** Ein Click-Handler mit `data-act`-Attributen (Event-Delegation auf `#ui`). Karten-Klicks kommen aus
  `board.handlers.onCardClick` → `onCardClick()` entscheidet: Farbwahl (`pick.type 'color'`), Zielwahl (`'swap'`, auch
  für Chaos/DOOM mit Ziel), Richtungschaos-Dialog (`'dir'`).
- **Effekte:** `handleEvents()` mappt Server-Events auf Sounds, Pop-Texte (`pop()`), Toasts, Konfetti, `doomAlert()`
  (bildschirmfüllende DOOM-Warnung + Screen-Shake).
- **Halluzination:** wenn `me.hallu > 0`: Quatsch-Namen (`SILLY_NAMES`, eindeutig pro Gegner), Quatsch-Zahlen/Avatare
  (wechseln im Frame-Updater), Flags ausgeblendet.
- **Debug-Menü** (`renderDebug`, nur wenn `welcome.debug`): Empfänger wählen, Säure/Chaos/DOOM/Joker/eigene Karten geben.
  Wird nur neu gezeichnet, wenn sich `state.debugKey` ändert (sonst schließt das Dropdown bei jedem Zug).
- **Regel-Seite:** `toggleRules()` → `rules.js` `rulesHtml(settings)`.
- `window.__fw = { stage, board, state, send, doomAlert }` – absichtlich für Tests im Browser (Konsole/Automatisierung).
- Seat-Labels werden pro Frame per `board.seatScreen(id)` (3D→2D-Projektion) positioniert.

### `board.js`
- `sync(view, events)`: Ablagestapel → Chaos/DOOM-Karten fliegen in die Mitte (`chaosFly`) → Portal öffnen bei DOOM →
  Tornado **oder** normaler Abgleich (eigene Hand, Gegnerfächer, max. 18 sichtbare Karten pro Gegner) → Markierungen
  (`setChaosMark(m, 'chaos'|'doom'|null)`: Emissive + Partikel-Trail + Burst beim Ankommen) → `applyHallu()`.
- Kartenquelle für neue Karten: Ziehstapel, Tischmitte (bei Tausch/Wirbel) oder Portal (`portalPose()`, unter der Tischplatte).
- **Tornado:** `startTornado()` → alle Hand-/Fächer-Meshes `toOrbit()` (Trichterbahn in `updateOrbit()`), danach
  `dest.attach()` und Glättung zur Zielpose. Fehlende Karten kommen vom Stapel bzw. beim DOOM-Tornado aus dem Portal.
  Bei Halluzination fliegen die Früchte mit (`sillyTornado()`, `updateFlyingSilly()`, danach `returning` zum Platz).
- **Portal:** `buildPortal()` (lazy), `openPortal(sec)`, `updatePortal()` (Skalierung, Drehung, Licht, `fx.portalFire`).
- **Halluzination:** `makeSillyStuff()` (Ente, Pizza, Banane, Fisch, Donut) ersetzt Gegnerfächer (Fächer-Meshes `visible=false`).
- Selbstheilung: NaN-Positionen werden auf Zielpose gesetzt (passierte, wenn Seite in unsichtbarem Fenster lud).

### Weitere
- `stage.js`: Kamera je nach Seitenverhältnis (Hochformat höher/weiter). Updater bekommen `raw`-dt (max 0,5 s), Themes max 0,05 s.
  Resize ignoriert 0×0 (Hintergrund-Tab).
- `cards.js`: Texturen werden gecacht pro `color+kind+effect`. **Schrift muss vorher geladen sein** – deshalb verbindet
  `main.js` erst nach `document.fonts.load('… Fredoka')`.
- `particles.js`: `Particles` = Ringpuffer + ShaderMaterial (Größe/Alpha pro Partikel). `ChaosFX` hat 3 Systeme
  (smoke normal, glow additiv, sparks additiv) und Paletten `PAL.chaos` (lila) / `PAL.doom` (rot/Glut).
- `audio.js`: `sfx(name)` – card, draw, turn, error, skip, reverse, plus, wild, call, caught, shuffle, win, lose, click,
  pop, chaos, shimmer, acid, tornado, doomDraw, doomPlay, dice. Stumm-Schalter in localStorage.

---

## 8. Bots (`server/bot.js`)
`botDecide(room, bot, level)` liefert eine Client-Nachricht. Bewertet spielbare Karten per Score (Aktionskarten wenn der
Nächste wenige Karten hat, Säure je mehr gleiche Farbe, Chaos/DOOM über `chaosValue()` – negative Werte = lieber
ziehen, z. B. Handtausch nur, wenn man mehr Karten hat). Bluff-Anzweifeln abhängig von Stufe/Handgröße.
`room.perform()` ruft für Bots ggf. „Letzte Karte!“ und hat einen Fallback (ziehen/passen), falls ein Zug ungültig war.

---

## 9. Tests
`npm test` → `scripts/simulate.js`: viele Varianten (Hausregeln, Chaos 10–35 %, DOOM bis 15 %) × 2/3/4/6 Spieler × 40 Runden.
Prüft nach **jedem** Zug: normale Kartenanzahl = `deckSize * decks` (ohne Chaos/DOOM/Höllenkarten), keine doppelten
IDs, keine Sonderkarten im Stapel, `dirChaos ≥ 0`; am Ende gültiger Gewinner (leere Hand oder Zuglimit).
Prüft außerdem, dass **alle** Chaos- und DOOM-Effekte, Säure und Richtungschaos-Würfe vorkamen.
Der Docker-Build führt `npm test` aus – schlägt er fehl, wird kein Image gebaut.

**Neue Effekte immer:** in `shared/rules.js` definieren → `room.js` umsetzen → `bot.js` bewerten → `simulate.js`
(läuft automatisch über `CHAOS_KEYS`/`DOOM_KEYS`) → Client (`board.js`/`main.js`/`rules.js`/Debug-Menü) → Browser-Test.

---

## 10. Debug-Modus
`FW_DEBUG=1` (Umgebungsvariable) → `welcome.debug = true` → 🛠-Button im Spiel. Server-Befehl `debugGive` validiert
Karten in `validDebugCard()` (index.js). Lokal: `$env:FW_DEBUG='1'; npm start`. In `docker-compose.yml` vorbereitet
(auskommentiert). Ohne Variable wird `debugGive` ignoriert.

---

## 11. Docker / Unraid
- `docker compose up -d --build` → Container `farbwirbel`, Port **8080**, healthy-Check auf `/health`.
- Fertiges Image exportieren (für Unraid ohne Bauen):
  ```powershell
  docker save farbwirbel:latest -o farbwirbel-image.tar   # optional danach gzip
  ```
  Auf Unraid: `docker load -i farbwirbel-image.tar.gz` und
  `docker run -d --name farbwirbel --restart unless-stopped -p 8080:3000 farbwirbel:latest`.
- Reverse Proxy: WebSocket-Support für `/ws` aktivieren. Keine Accounts – wer den Link kennt, spielt mit.
- Auf Windows war `docker` direkt nach der Installation nicht im PATH der bereits offenen Shell → ggf.
  `$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')`.

---

## 12. Fallstricke & Erkenntnisse
- **Browser-Pane von Claude Code im Hintergrund** drosselt `requestAnimationFrame` stark → Animationen wirken eingefroren.
  Für Tests länger warten oder Zustand per `window.__fw` prüfen. (Deshalb raw-dt bis 0,5 s in `stage.js`.)
- `#ui` hat `pointer-events: none`; interaktive Elemente schalten sie wieder ein (sonst blockiert das Overlay den Canvas).
- Discard zeigt nur die letzten 14 Karten; ältere Meshes werden entsorgt.
- Wenn ein menschlicher Spieler dran ist, wartet das Spiel – bei automatisierten Tests eigene Züge mitspielen.
- Server-Code ändert sich nicht durch `npm run build` → Server neu starten. Client-Code → `npm run build` + Reload.
- `npm ci` zeigt mit neuem npm eine Warnung „allow-scripts … approve-scripts“ – harmlos, Build und Tests laufen trotzdem.
- `package.json`-Beschreibung enthält einen Gedankenstrich; PowerShell `Get-Content` zeigt ihn evtl. falsch an (Datei ist UTF-8).

---

## 13. Feature-Verlauf (Wünsche des Nutzers, in Reihenfolge)
1. 3D-Kartenspiel im Browser, Docker/Unraid, Multiplayer + Bots, Name „Farbwirbel“, drei Themes.
2. Chaos-Modus mit einstellbarer Chance (+50, 3× Aussetzen, Handtausch, Geschenk, Kartenwirbel, Farbrotation, Alle +4, Ausmisten).
3. Lila Rauch/Partikel für alle sichtbar, wenn jemand eine Chaos-Karte zieht/hält.
4. Säure-Karten (pro Farbe) + Chaos-Tornado mit Wirbel-Animation um die Tischmitte.
5. Debug-Modus mit Menü zum Kartengeben.
6. Regel-Seite im Spiel („?“) + Erklärung der Bluff-Logik.
7. DOOM-Karten (1 %, rot, riesige Warnung, Höllenportal): +100, Höllen-Tornado, Halluzinationen
   (Nutzer wählte: Gummienten & Essen, Quatsch-Zahlen, Quatsch-Namen/Avatare; alle anderen; 3 eigene Züge;
   +100 mit Zielwahl; DOOM als eigener Regler, Standard 1 %). Dazu Chaos-Karte Richtungschaos.
8. Früchte fliegen bei Halluzination mit in den Tornado.
9. Docker-Container lokal gebaut und getestet, Image als `.tar.gz` exportiert.
10. Projektübergabe: CLAUDE.md, Git-Repo auf GitHub (zuerst „3D-Uno“, vom Nutzer umbenannt in „Farbwirbel“).

## 14. Mögliche nächste Schritte (nicht beauftragt)
- Hochformat/Handy weiter optimieren (Sitzplätze eng bei 5–6 Spielern).
- Ablagestapel liegt optisch über dem Höllenportal – könnte während des Portals ausgeblendet/angehoben werden.
- Persistenz (Räume überleben keinen Neustart), Zuschauer-Modus, Chat.
- Balance: Säure ist stark (Ø ~4 Karten pro Säure in der Simulation).
