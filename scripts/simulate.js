// Simuliert viele Bot-Partien mit allen Regelvarianten und prüft Invarianten.
// Aufruf: npm test
import { Room } from '../server/room.js';
import { botDecide } from '../server/bot.js';
import { deckSize, CHAOS_KEYS, DOOM_KEYS } from '../shared/rules.js';
import { HELL_ID_START } from '../server/room.js';

const variants = [
  {},
  { acid: false, doom: 0 },
  { doom: 15, chaos: 20 },
  { doom: 10, chaos: 35, stacking: true, sevenZero: true },
  { stacking: true },
  { sevenZero: true },
  { jumpIn: true, drawToMatch: true },
  { stacking: true, sevenZero: true, drawToMatch: true },
  { chaos: 10 },
  { chaos: 35, stacking: true, sevenZero: true },
  { chaos: 20, jumpIn: true, drawToMatch: true },
];
const effectsSeen = new Set();
const doomSeen = new Set();
let dirRolls = 0;
let timeLimits = 0;
let acidPlays = 0;
let acidDumped = 0;

let rounds = 0;
let actions = 0;
for (const v of variants) {
  for (const n of [2, 3, 4, 6]) {
    for (let r = 0; r < 40; r++) {
      const room = new Room('TEST');
      room.schedule = () => {}; // keine Timer im Test
      for (let i = 0; i < n; i++) room.addBot();
      room.hostId = room.players[0].id;
      room.settings = { ...room.settings, ...v, botLevel: ['easy', 'normal', 'hard'][r % 3] };
      room.startRound();
      let guard = 0;
      while (room.phase === 'playing') {
        if (++guard > 5000) throw new Error('Endlosschleife: ' + JSON.stringify(v));
        const a = room.actor();
        const origEv = room.ev;
        room.ev = function (e) {
          if (e.type === 'chaos') effectsSeen.add(e.effect);
          if (e.type === 'doom') doomSeen.add(e.effect);
          if (e.type === 'dirRoll') dirRolls++;
          if (e.type === 'acid') { acidPlays++; acidDumped += e.cards.length; }
          return origEv.call(this, e);
        };
        room.perform(a, botDecide(room, a, room.settings.botLevel));
        room.ev = origEv;
        actions++;
        // Zufällig: jemand ruft/erwischt
        for (const p of room.players) if (p.vulnerable && Math.random() < 0.2) room.catchPlayer(room.players.find((q) => q !== p), p.id);
        // Invariante: 108 normale Karten im Umlauf (Chaos-Karten kommen extra dazu)
        if (room.phase === 'playing') {
          const all = [...room.game.draw, ...room.game.discard, ...room.players.flatMap((p) => p.hand)];
          const normal = all.filter((c) => c.kind !== 'chaos' && c.kind !== 'doom' && c.id < HELL_ID_START);
          const expect = deckSize(room.settings) * room.game.decks;
          if (normal.length !== expect) throw new Error(`Kartenanzahl ${normal.length} != ${expect} bei ${JSON.stringify(v)}`);
          if (new Set(all.map((c) => c.id)).size !== all.length) throw new Error('Doppelte Karten');
          if ([...room.game.draw, ...room.game.discard].some((c) => c.kind === 'chaos' || c.kind === 'doom')) throw new Error('Sonderkarte im Stapel');
          if (room.game.dirChaos < 0) throw new Error('Richtungschaos negativ');
        }
      }
      if (!room.result) throw new Error('Kein Ergebnis');
      if (room.result.timeLimit) timeLimits++;
      else if (room.byId(room.result.winnerId).hand.length !== 0) throw new Error('Kein gültiger Gewinner');
      rounds++;
    }
  }
}
console.log(`OK: ${rounds} Runden, ${actions} Züge ohne Fehler (${timeLimits} davon per Zuglimit beendet).`);
console.log(`Chaos-Effekte gesehen: ${[...effectsSeen].sort().join(', ')}`);
console.log(`Säure: ${acidPlays}× gespielt, dabei ${acidDumped} Karten mit abgeworfen.`);
console.log(`DOOM-Effekte gesehen: ${[...doomSeen].sort().join(', ')} · Richtungschaos-Würfe: ${dirRolls}`);
if (doomSeen.size < DOOM_KEYS.length) throw new Error('Nicht alle DOOM-Effekte wurden ausgelöst');
if (!dirRolls) throw new Error('Richtungschaos hat nie gewürfelt');
if (effectsSeen.size < CHAOS_KEYS.length) throw new Error('Nicht alle Chaos-Effekte wurden ausgelöst');
if (!acidPlays) throw new Error('Säure wurde nie gespielt');
