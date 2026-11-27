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
npm test                    # Regel-Simulation: ~2500 Bot-Runden mit allen Varianten
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
| `join` | `code` | Raum beitreten (nur in der Lobby, max. `settings.maxPlayers`) |
| `leave` | – | Raum verlassen |
| `settings` | `settings:{…}` | nur Host, nur Lobby (siehe `sanitizeSettings` in room.js) |
| `addBot` / `removeBot` / `fillBots` / `clearBots` | `id` (removeBot) | nur Host, Lobby; fillBots füllt bis `maxPlayers` |
| `start` / `nextRound` / `toLobby` | – | nur Host |
| `play` | `cardId, color?, target?, dirChoice?` | Karte spielen (Farbe bei Joker, Ziel bei 7/Chaos/DOOM, `cancel`/`extend` bei Richtungschaos) |
| `draw` / `pass` | – | ziehen / gezogene Karte behalten |
| `challenge` | `challenge: bool` | +4 anzweifeln oder annehmen |
| `mirror` | `use: bool` | Bei `awaiting {type:'mirror'}`: Angriff mit Spiegel zurückwerfen oder schlucken |
| `callLast` / `catch` | `target` | „Letzte Karte!“ / jemanden erwischen |
| `emote` | `emote` | Emoji-Blase |
| `debugGive` | `cards:[…], target?` | **nur mit FW_DEBUG=1**: Karten auf eine Hand legen |
| `debugEvent` | `kind: wheel\|ice\|blackout\|rain` | **nur mit FW_DEBUG=1**: Tisch-Ereignis sofort auslösen |
| `ping` | `at` | → `pong` |

**Server → Client:** `welcome {token,name,avatar,room,debug}`, `noroom`, `room {…view}`, `error {msg}`, `pong`,
`xray {target, name, cards, ms}` (nur an den Spieler, der Röntgenblick gespielt hat).

**View (`room`)**: `code, hostId, phase ('lobby'|'playing'|'roundOver'), settings, me, players[] {id,name,avatar,isBot,
connected,count,score,called,vulnerable,skipTurns,chaos,doom,hallu,pact,curse{color,turns}}, hand[], playable[],
game {discard (letzte 14), color, turnId, actorId, dir, pending, dirChaos, drawCount, deadline, serverNow, round,
awaiting {type: drawn|challenge|mirror, player, …; bei mirror: attacker, amount, source}, frozen {color,turns}, wet,
ice, blackoutUntil, bomb {holder, danger, power}}, result (inkl. `wet`), events[]`.

**Events** (`room.ev`, alle mit `seq`): `deal, play {card, jumpIn, chaos, doom}, acid {color, cards}, skip {chaos,left},
reverse, draw {n, penalty, chaos, doom, hell}, pass, call, caught, challenge {guilty}, rotate, shuffle, newDeck,
chaos {effect, target, choice}, doom {effect, target, n, hits}, dirRoll {flipped, left}, halluEnd, mirror, bombArm,
bombMove, bombBoom, steal, thaw, curseEnd, pactDoom, lottery {rolls, losers, winners}, lotteryDrop,
underdog, iceSlide {from,to}, tableEvent {kind, index}, win, timeLimit, timeout, emote, join, leave, disconnect,
reconnect, debug`.

---

## 6. Karten & Regeln (`shared/rules.js`)

**Kartenmodell:** `{ id, color, kind, effect? }`
- `color`: `r y g b` (Farben), `w` (Joker), `x` (Chaos), `d` (DOOM)
- `kind`: `'0'..'9'`, `skip`, `rev`, `draw2`, `acid`, `lottery`, `wild`, `wild4`, `chaos`, `doom`
- `slidFrom` (nur auf dem Ablagestapel): Originalfarbe einer auf Glatteis gerutschten Karte; `reshuffle()` stellt sie wieder her.

**ID-Bereiche** (wichtig für Tests/Invarianten): Grunddeck ab 1 · Zusatzdecks `decks*1000+1` · Chaos/DOOM ab
`1_000_000` · Höllenkarten (aus DOOM-Effekten) ab `2_000_000` (`HELL_ID_START`) · Debug-Karten ab `5_000_000`.

**Deck:** 108 Standardkarten + 4 Säure (wenn `settings.acid`) + 4 Lotterie (wenn `settings.lottery`) → `deckSize()`. Beim Rundenstart werden so viele Decks gemischt, dass alle Startkarten + 40 Reserve reichen (`decks = ceil((Spieler·Startkarten+40)/deckSize)`, Deck k hat IDs ab `k*1000+1`); später dürfen bis zu 5 weitere Decks dazukommen (`game.maxDecks`). Erste Ablagekarte ist immer eine Zahl.

**Grundregeln:** gleiche Farbe oder gleiche Art. Aussetzen, Richtungswechsel (bei 2 Spielern = Aussetzen), +2,
Joker, +4 mit **Bluff-Regel** (beim Legen wird `guilty = hat Karte der vorherigen Farbe` gespeichert; Anzweifeln:
schuldig → Leger zieht 4, Zweifler spielt normal; unschuldig → Zweifler zieht 4+2). „Letzte Karte!“ bei ≤ 2 Karten,
Erwischt = +2. Gezogene passende Karte darf sofort gespielt werden (`awaiting {type:'drawn'}`).

**Säure** (1 pro Farbe): legt alle eigenen Karten dieser Farbe mit ab (unter die Säure, Säure bleibt oben).

**Lotterie** (1 pro Farbe, normale Aktionskarte): `room.lottery(p)` – alle würfeln 1–6; niedrigster Wurf zieht 3,
höchster wirft 1 zufällige Karte ab (nur mit ≥ 2 Karten). Bei Gleichstand aller passiert nichts.

**Angriffs-Warteschlange** (`g.attackQueue`, `startAttacks(list, resume)`, `continueAttacks()`, `applyAttack()`):
Alle „X zieht N“-Angriffe (+2 ohne Stapeln, +50, Alle +4, +100, Meteor, gestapelte Strafen) laufen hier durch. Hält das
Opfer einen **Spiegel**, pausiert das Spiel mit `awaiting {type:'mirror'}` → `mirrorDecision(p, use)`. Zurückwerfen
tauscht Opfer und Angreifer – Ping-Pong ist möglich. Bei +4 gibt es den Spiegel als dritten Knopf im Anzweifeln-Dialog,
bei offenen Stapel-Strafen kann man den Spiegel direkt spielen (`playMirror`, Quelle `stack`).

**Einschränkungen:** `canPlay(card, top, color, pending, settings, restrict)` mit `restrictFor(p)` →
`{frozen: Farbe (Eiszeit), curse: Farbe (Fluch)}`. Joker dürfen die eingefrorene Farbe nicht wählen.

**Rundentakt** in `afterAction(turnChanged)`: `rollDirChaos`, `applySkips`, `tickPlayerCounters` (Halluzination, Fluch,
Pakt – zählen beim **Verlassen** des eigenen Zugs runter, daher Pakt startet bei 6), `tickFreeze`, `tickBomb`,
`maybeTableEvent`. Während `awaiting` (Spiegel) wird nichts getickt.

**Hausregeln** (Lobby-Schalter): `stacking`, `zeroPass` (0 = Hände weiterreichen; den früheren 7er-Handtausch gibt es nicht mehr), `jumpIn`, `drawToMatch`, `acid`, `lottery`.

**Punkte:** Zahl = Wert · Aktion/Säure/Lotterie = 20 · Joker/Chaos = 50 · DOOM = 100 · Karten der „nassen“ Farbe (Regen) doppelt. Punkteziel 0/200/300/500.

**Einstellungen** (`DEFAULT_SETTINGS`): `theme (neon|winter|garden), maxPlayers (2–20, Standard 6; PLAYER_MIN/PLAYER_LIMIT), handSize, stacking, zeroPass, jumpIn, drawToMatch,
scoreLimit, turnTime (0/15/30/60), botLevel (easy|normal|hard), chaos (0/5/10/20/35 %), acid (bool), lottery (bool), doom (0/1/3 %),
events (0 Aus / 1 Selten / 2 Oft – `EVENT_LEVELS`)`.
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
| `bomb` | Zeitbombe `g.bomb {holder, fuse 3–8, power 10}` wandert mit jedem Zug zum Nächsten; beim Knall zieht der Halter `power`. Zweite Bombe → `power += 10`. Zünder ist geheim, `danger` im View nur grob. |
| `mirror` | Konter, nur spielbar bei offener Strafe (`pending > 0`) bzw. über den Spiegel-Dialog (siehe Angriffs-Warteschlange) |
| `thief` | 1 zufällige Karte vom Ziel klauen (Ziel braucht ≥ 2 Karten) |
| `xray` | 5 s die Hand des Ziels sehen (private Nachricht `xray`, Overlay `showXray()`) |
| `freeze` | gewählte Farbe `2 × Spieler` Züge gesperrt (`g.frozen`, `tickFreeze()`, Event `thaw`) |

### DOOM-Karten (`DOOM`, Farbe `d`)
Seltener als Chaos (`settings.doom` %, wird in `maybeChaos()` zuerst gewürfelt). Karten aus DOOM-Effekten sind **neu
erzeugt** (`room.hellCards(n)`, IDs ab 2 000 000) und kommen visuell aus dem **Höllenportal** in der Tischmitte.

| Key | Wirkung |
|---|---|
| `plus100` | Ziel bekommt 100 Höllenkarten |
| `tornado` | wie Chaos-Tornado + 10 Höllenkarten pro Gegner, nur unter den anderen verteilt |
| `hallu` | alle anderen: `player.hallu = 3` (zählt eigene Züge runter in `tickPlayerCounters()`); rein clientseitige Darstellung |
| `pact` | Dämonenpakt: halbe Hand sofort ab; `player.pact` = 5 eigene Züge – wer bis dahin nicht gewinnt, bekommt 20 Höllenkarten (`pactDoom`) |
| `meteor` | bis zu 3 zufällige Gegner bekommen je 5–15 Höllenkarten (über die Angriffs-Warteschlange → spiegelbar); Feuerbälle `spawnMeteor()` |
| `curse` | Fluch: Ziel darf 5 eigene Züge nur seine schwächste Farbe spielen (`player.curse {color, turns}`), Joker gehen weiterhin |

### Tisch-Ereignisse (`settings.events`, `maybeTableEvent()`, `triggerEvent(kind)`)
Alle `EVENT_EVERY` (15) Züge würfelt der Server mit `EVENT_CHANCE[level]`, ob ein Ereignis kommt: halb Glücksrad,
halb Theme-Ereignis (`THEME_EVENTS[theme]`).
- **Glücksrad** (`WHEEL`): `allPlus1`, `reverse`, `passLeft` (jeder gibt eine Karte weiter), `swapNeighbors`, `underdog`
  (meiste Karten wirft 3 ab). Client: `showWheel(index)` dreht das Rad auf das Ergebnis.
- **Glatteis** (Winter, `g.ice`): die nächste gespielte Farbkarte rutscht in eine Nachbarfarbe (`iceSlide`).
- **Stromausfall** (Neon, `g.blackoutUntil`, 10 s): Licht gedimmt (`board.setBlackout`), eigene Karten zeigen Rückseiten.
- **Regen** (Garten, `g.wet`): eine Farbe zählt am Rundenende doppelt; Regen-Partikel + bläulicher Tint.

### Sicherheitsnetze
- Ziehstapel leer und nichts zum Mischen → **frisches Deck** (`newDeck`, bis zu 5 zusätzliche Decks).
- Nach **max(2000, Spieler·150) Zügen** endet eine Runde, wenigste Karten gewinnt (`result.timeLimit`).

---

## 7. Client im Detail

### `main.js` (größte Datei)
- `state` (view, pick, debug, halluNames …), `render()` → `renderStart / renderLobby / renderHud / renderModal / renderDebug`.
- **Eingaben:** Ein Click-Handler mit `data-act`-Attributen (Event-Delegation auf `#ui`). Karten-Klicks kommen aus
  `board.handlers.onCardClick` → `onCardClick()` entscheidet: Farbwahl (`pick.type 'color'`), Zielwahl (`'swap'`, für Chaos/DOOM mit Ziel), Richtungschaos-Dialog (`'dir'`).
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
- **Eigene Hand / Kartenauswahl** (`layoutHand()`, `layoutRow()`, `pickHand()`):
  - Bei eigenem Zug und > 12 Karten: vordere Reihe = spielbare Karten, hintere Reihe (kleiner, gedimmt) = Rest.
    `handRows[0]` vorne, `handRows[1]` hinten. `main.js` setzt dann `body.hand-tall` (Banner/Tipps/Dialoge höher).
  - **Fischaugen-Lupe** (Sarkar-Brown) pro Reihe: Fixpunkt = Mauszeiger (`handPointer {row, x}`) bzw. per Tastatur
    gewählte Karte; Stärke so, dass die Karte am Zeiger ~95 % sichtbar ist. Gehoverte Karte bekommt z = 1.4 (ganz vorn).
  - **Auswahl nach Position** statt Raycast: Zeiger → Punkt in der Ebene der `handGroup` (`handLocalPoint`), Index =
    `floor((x - A) / s)` im unverzerrten Layout. Weil der Zeiger Fixpunkt der Verzerrung ist, entspricht das exakt der
    sichtbaren Karte → kein Flackern. Ziehstapel weiter per Raycast (`pickPile`).
  - Eingaben: Maus, Mausrad (`onWheel` → `moveHover`), Tastatur in `main.js` (←/→ Karte, ↑/↓ Reihe, Enter spielen),
    Touch: erster Tipp wählt aus (`hoverBeforeDown`), zweiter Tipp auf dieselbe Karte spielt.

### Weitere
- `stage.js`: Kamera je nach Seitenverhältnis (Hochformat höher/weiter). Updater bekommen `raw`-dt (max 0,5 s), Themes max 0,05 s.
  Resize ignoriert 0×0 (Hintergrund-Tab).
- `cards.js`: Texturen werden gecacht pro `color+kind+effect`. **Schrift muss vorher geladen sein** – deshalb verbindet
  `main.js` erst nach `document.fonts.load('… Fredoka')`.
- `particles.js`: `Particles` = Ringpuffer + ShaderMaterial (Größe/Alpha pro Partikel). `ChaosFX` hat 3 Systeme
  (smoke normal, glow additiv, sparks additiv) und Paletten `PAL.chaos` (lila) / `PAL.doom` (rot/Glut).
- `audio.js`: `sfx(name)` – card, draw, turn, error, skip, reverse, plus, wild, call, caught, shuffle, win, lose, click,
  pop, chaos, shimmer, acid, tornado, doomDraw, doomPlay, dice, tick, tickFast, boom, mirror, steal, freeze, xray,
  meteor, wheel, blackout, rain. Stumm-Schalter in localStorage.
- `board.js` (neu für Paket 15): `handleFx()` (Effekte zu Events), `seatPos(id)`, Bombe (`buildBomb/updateBomb`),
  Meteore (`spawnMeteor/updateMeteors`), Farb-Tints `TINTS` (frost/curse/wet, `tintFor`), `setBlackout()`, Regen
  (`rainUntil` → `fx.rain`), Diebstahl-Flugbahn (`stealTo/stealFrom`). Partikel-Paletten zusätzlich `mirror`, `frost`.

---

## 8. Bots (`server/bot.js`)
`botDecide(room, bot, level)` liefert eine Client-Nachricht. Bewertet spielbare Karten per Score (Aktionskarten wenn der
Nächste wenige Karten hat, Säure je mehr gleiche Farbe, Chaos/DOOM über `chaosValue()` – negative Werte = lieber
ziehen, z. B. Handtausch nur, wenn man mehr Karten hat). Bluff-Anzweifeln abhängig von Stufe/Handgröße.
`room.perform()` ruft für Bots ggf. „Letzte Karte!“ und hat einen Fallback (ziehen/passen), falls ein Zug ungültig war.

---

## 9. Tests
`npm test` → `scripts/simulate.js`: viele Varianten (Hausregeln, Chaos 10–35 %, DOOM bis 15 %, Ereignisse in allen
Themes, Lotterie an/aus) × 2/3/4/6 Spieler × 40 Runden + 10/20 Spieler × 8 Runden (~2500 Runden, ~430 000 Züge).
Prüft nach **jedem** Zug: normale Kartenanzahl = `deckSize * decks` (ohne Chaos/DOOM/Höllenkarten), keine doppelten
IDs, keine Sonderkarten im Stapel, `dirChaos ≥ 0`, gültiges Spiegel-`awaiting`; am Ende gültiger Gewinner (leere Hand oder Zuglimit).
Prüft außerdem, dass **alle** Chaos- und DOOM-Effekte, Säure, Richtungschaos-Würfe, Lotterie, alle Glücksrad-Ergebnisse
und Theme-Ereignisse (Bombe, Spiegel, Diebstahl, Auftauen, Fluch-/Pakt-Ende …) vorkamen.
Der Docker-Build führt `npm test` aus – schlägt er fehl, wird kein Image gebaut.

**Neue Effekte immer:** in `shared/rules.js` definieren → `room.js` umsetzen → `bot.js` bewerten → `simulate.js`
(läuft automatisch über `CHAOS_KEYS`/`DOOM_KEYS`) → Client (`board.js`/`main.js`/`rules.js`/Debug-Menü) → Browser-Test.

---

## 10. Debug-Modus
`FW_DEBUG=1` (Umgebungsvariable) → `welcome.debug = true` → 🛠-Button im Spiel. Server-Befehl `debugGive` validiert
Karten in `validDebugCard()` (index.js); `debugEvent` löst Glücksrad/Glatteis/Stromausfall/Regen sofort aus
(unabhängig vom Theme). Aus der Browser-Konsole geht beides auch per `__fw.send({...})`. Lokal: `$env:FW_DEBUG='1'; npm start`. In `docker-compose.yml` vorbereitet
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
11. Kartenauswahl bei großen Händen überarbeitet (Lupe, spielbare Karten vorne, Auswahl nach Position, Tastatur/Mausrad/Touch).
12. Kartenanimationen beschleunigt (feste Gesamtdauer, Neuladen ohne Austeil-Animation).
13. Hausregel 7 (Hand tauschen) **entfernt** auf Wunsch des Nutzers; 0 (Hände weiterreichen) bleibt als `zeroPass`.
14. Spielerlimit einstellbar (Lobby-Stepper 2–20, Standard 6): mehrere Decks, 24 Bot-Namen, 28 Avatare (`AVATARS` in shared/rules.js), Bots schneller bei vielen Spielern, kompakte Sitzplätze.
15. Großes Erweiterungspaket (Nutzer wählte aus Vorschlägen; **nicht** gewünscht: Seelentausch-DOOM, Lotterie als Chaos-Karte):
    Chaos Zeitbombe/Spiegel/Dieb/Röntgenblick/Eiszeit · Lotterie als farbige Aktionskarte · DOOM Dämonenpakt/
    Meteoritenhagel/Fluch · Tisch-Ereignisse Glücksrad + Glatteis/Stromausfall/Regen (Lobby: Aus/Selten/Oft).
    Dafür Angriffs-Warteschlange (Spiegel-Konter) und `restrict` in `canPlay` eingeführt.

## 14. Mögliche nächste Schritte (nicht beauftragt)
- Hochformat/Handy weiter optimieren (Sitzplätze eng bei vielen Spielern).
- Ablagestapel liegt optisch über dem Höllenportal – könnte während des Portals ausgeblendet/angehoben werden.
- Persistenz (Räume überleben keinen Neustart), Zuschauer-Modus, Chat.
- Balance: Säure ist stark (Ø ~4 Karten pro Säure in der Simulation).
