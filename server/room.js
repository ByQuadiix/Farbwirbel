import {
  buildDeck, shuffle, canPlay, isSameCard, cardPoints, isNumber, isWild,
  COLORS, DEFAULT_SETTINGS, MAX_PLAYERS, CHAOS, CHAOS_KEYS, CHAOS_LEVELS, isChaos,
  DOOM, DOOM_KEYS, DOOM_LEVELS, isDoom,
} from '../shared/rules.js';

const isSpecial = (c) => isChaos(c) || isDoom(c);
export const HELL_ID_START = 2_000_000;
import { botDecide, botCallChance, botCatchChance, botDelay } from './bot.js';

export const AVATARS = ['🦊', '🐻', '🐼', '🐧', '🐸', '🦉', '🐱', '🐶', '🦁', '🐨', '🐙', '🦄', '🐯', '🐰', '🤖', '👾'];
const BOT_NAMES = ['Kiki', 'Bruno', 'Lotte', 'Pixel', 'Fiete', 'Mira', 'Ozzy', 'Nala', 'Toni', 'Wanda', 'Rocco', 'Zora'];

let nextPlayerId = 1;

export class GameError extends Error {}
const fail = (msg) => { throw new GameError(msg); };

export class Room {
  constructor(code, { onDestroy } = {}) {
    this.code = code;
    this.players = [];
    this.hostId = null;
    this.phase = 'lobby'; // lobby | playing | roundOver
    this.settings = { ...DEFAULT_SETTINGS };
    this.game = null;
    this.result = null;
    this.round = 0;
    this.events = [];
    this.eventSeq = 0;
    this.actionNo = 0;
    this.timers = new Set();
    this.onDestroy = onDestroy;
    this.idleSince = null;
    this.destroyed = false;
    this.chaosId = 1_000_000;
    this.hellId = HELL_ID_START;
  }

  /** Eventuell eine Sonderkarte statt einer normalen: erst DOOM (selten), dann Chaos. */
  maybeChaos() {
    const doom = this.settings.doom;
    if (doom && Math.random() * 100 < doom) {
      const effect = DOOM_KEYS[Math.floor(Math.random() * DOOM_KEYS.length)];
      return { id: this.chaosId++, color: 'd', kind: 'doom', effect };
    }
    const pct = this.settings.chaos;
    if (!pct || Math.random() * 100 >= pct) return null;
    const effect = CHAOS_KEYS[Math.floor(Math.random() * CHAOS_KEYS.length)];
    return { id: this.chaosId++, color: 'x', kind: 'chaos', effect };
  }

  /** Neue, zufällige normale Karten "aus dem Höllenportal". */
  hellCards(n) {
    const tpl = buildDeck(0, { acid: this.settings.acid });
    return Array.from({ length: n }, () => ({ ...tpl[Math.floor(Math.random() * tpl.length)], id: this.hellId++ }));
  }

  // ---------- Spieler ----------

  byId(id) { return this.players.find((p) => p.id === id); }
  indexOf(p) { return this.players.indexOf(p); }
  humans() { return this.players.filter((p) => !p.isBot); }
  connectedHumans() { return this.players.filter((p) => !p.isBot && p.session?.ws); }

  addHuman(session) {
    if (this.phase !== 'lobby') fail('Das Spiel läuft bereits.');
    if (this.players.length >= MAX_PLAYERS) fail('Der Raum ist voll.');
    const p = this.newPlayer({ name: session.name, avatar: session.avatar, isBot: false });
    p.session = session;
    this.players.push(p);
    if (!this.hostId) this.hostId = p.id;
    this.ev({ type: 'join', player: p.id });
    return p;
  }

  addBot() {
    if (this.players.length >= MAX_PLAYERS) fail('Der Raum ist voll.');
    const used = new Set(this.players.map((p) => p.name));
    const name = BOT_NAMES.filter((n) => !used.has(n))[Math.floor(Math.random() * 6)] ?? `Bot ${this.players.length + 1}`;
    const usedAv = new Set(this.players.map((p) => p.avatar));
    const avs = AVATARS.filter((a) => !usedAv.has(a));
    const avatar = avs[Math.floor(Math.random() * avs.length)] ?? '🤖';
    const p = this.newPlayer({ name, avatar, isBot: true });
    this.players.push(p);
    return p;
  }

  newPlayer({ name, avatar, isBot }) {
    return {
      id: nextPlayerId++, name, avatar, isBot, session: null,
      hand: [], score: 0, called: false, vulnerable: false,
    };
  }

  /** Spieler verlässt den Raum endgültig. */
  leave(p) {
    if (this.phase === 'lobby') {
      this.players.splice(this.indexOf(p), 1);
    } else {
      // Im laufenden Spiel übernimmt ein Bot den Platz.
      p.isBot = true;
      p.session = null;
      p.name = `${p.name} (Bot)`;
    }
    if (this.hostId === p.id) this.hostId = this.humans()[0]?.id ?? null;
    if (!this.humans().length) return this.destroy();
    this.ev({ type: 'leave', player: p.id });
    this.afterAction(false);
  }

  reconnected(p) {
    this.ev({ type: 'reconnect', player: p.id });
    this.afterAction(false);
  }

  disconnected(p) {
    this.ev({ type: 'disconnect', player: p.id });
    this.afterAction(false);
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.clearTimers();
    for (const p of this.players) if (p.session?.room === this) p.session.room = null;
    this.onDestroy?.(this);
  }

  // ---------- Nachrichten ----------

  handle(p, msg) {
    try {
      const isHost = p.id === this.hostId;
      switch (msg.t) {
        case 'settings':
          if (!isHost || this.phase !== 'lobby') fail('Nur der Host kann das ändern.');
          this.settings = sanitizeSettings(this.settings, msg.settings ?? {});
          return this.afterAction(false);
        case 'addBot':
          if (!isHost || this.phase !== 'lobby') fail('Nur der Host kann Bots hinzufügen.');
          this.addBot();
          return this.afterAction(false);
        case 'removeBot': {
          if (!isHost || this.phase !== 'lobby') fail('Nur der Host kann Bots entfernen.');
          const b = this.byId(msg.id);
          if (b?.isBot) this.players.splice(this.indexOf(b), 1);
          return this.afterAction(false);
        }
        case 'start':
          if (!isHost) fail('Nur der Host kann starten.');
          if (this.phase !== 'lobby') fail('Das Spiel läuft bereits.');
          if (this.players.length < 2) fail('Mindestens 2 Spieler nötig – füge einen Bot hinzu.');
          for (const q of this.players) q.score = 0;
          this.round = 0;
          return this.startRound();
        case 'nextRound':
          if (!isHost || this.phase !== 'roundOver') fail('Nur der Host kann die nächste Runde starten.');
          if (this.result?.gameOver) for (const q of this.players) q.score = 0;
          return this.startRound();
        case 'toLobby':
          if (!isHost) fail('Nur der Host kann zurück zur Lobby.');
          this.clearTimers();
          this.phase = 'lobby';
          this.game = null;
          this.result = null;
          // Spieler, die zu Bots wurden, aus der Lobby entfernen; Bots behalten.
          this.players = this.players.filter((q) => !q.name.endsWith(' (Bot)'));
          for (const q of this.players) { q.hand = []; q.score = 0; q.called = false; q.vulnerable = false; }
          return this.afterAction(false);
        case 'play': return this.play(p, msg.cardId, msg);
        case 'draw': return this.draw(p);
        case 'pass': return this.pass(p);
        case 'challenge': return this.resolveChallenge(p, !!msg.challenge);
        case 'callLast': return this.callLast(p);
        case 'catch': return this.catchPlayer(p, msg.target);
        case 'emote': {
          const e = String(msg.emote ?? '').slice(0, 4);
          if (!e || (p.lastEmote && Date.now() - p.lastEmote < 1200)) return;
          p.lastEmote = Date.now();
          this.ev({ type: 'emote', player: p.id, emote: e });
          return this.broadcast();
        }
        default:
          return;
      }
    } catch (e) {
      if (e instanceof GameError) {
        p.session?.send({ t: 'error', msg: e.message });
        return;
      }
      throw e;
    }
  }

  // ---------- Spielablauf ----------

  ev(e) { this.events.push({ ...e, seq: ++this.eventSeq }); }

  nextIndex(from, steps = 1) {
    const n = this.players.length;
    return (((from + this.game.dir * steps) % n) + n) % n;
  }

  actor() {
    const g = this.game;
    if (!g || this.phase !== 'playing') return null;
    return g.awaiting ? this.byId(g.awaiting.player) : this.players[g.turn];
  }

  top() { return this.game.discard[this.game.discard.length - 1]; }

  startRound() {
    this.clearTimers();
    const n = this.players.length;
    const draw = shuffle(buildDeck(1, { acid: this.settings.acid }));
    for (const p of this.players) {
      p.hand = [];
      for (let i = 0; i < this.settings.handSize; i++) p.hand.push(this.maybeChaos() ?? draw.pop());
      p.called = false;
      p.vulnerable = false;
      p.skipTurns = 0;
      p.hallu = 0;
    }
    const idx = draw.findIndex(isNumber);
    const first = draw.splice(idx, 1)[0];
    this.round += 1;
    const turn = this.round === 1 ? Math.floor(Math.random() * n) : (this.startSeat + 1) % n;
    this.startSeat = turn;
    this.game = { draw, discard: [first], color: first.color, turn, dir: 1, pending: 0, awaiting: null, deadline: 0, decks: 1, actions: 0, dirChaos: 0 };
    this.prevTurnId = null;
    this.phase = 'playing';
    this.result = null;
    this.ev({ type: 'deal', round: this.round });
    this.afterAction(true);
  }

  requirePlaying() { if (this.phase !== 'playing') fail('Gerade läuft keine Runde.'); }

  play(p, cardId, opts = {}) {
    this.requirePlaying();
    const g = this.game;
    const card = p.hand.find((c) => c.id === cardId);
    if (!card) fail('Diese Karte hast du nicht.');
    const top = this.top();
    const actor = this.actor();
    let jumpIn = false;

    if (isSpecial(card)) return this.playChaos(p, card, opts);

    if (g.awaiting) {
      if (g.awaiting.player !== p.id) fail('Du bist nicht dran.');
      if (g.awaiting.type === 'drawn' && card.id !== g.awaiting.cardId) fail('Du kannst nur die gezogene Karte spielen.');
      if (g.awaiting.type === 'challenge' && !(this.settings.stacking && card.kind === 'wild4')) {
        fail('Erst entscheiden: anzweifeln oder annehmen.');
      }
    } else if (actor !== p) {
      if (!(this.settings.jumpIn && g.pending === 0 && isSameCard(card, top))) fail('Du bist nicht dran.');
      jumpIn = true;
    }
    if (!jumpIn && !canPlay(card, top, g.color, g.pending, this.settings)) fail('Diese Karte passt nicht.');
    if (isWild(card) && !COLORS.includes(opts.color)) fail('Bitte eine Farbe wählen.');

    // --- Ausführen ---
    const prevColor = g.color;
    p.hand.splice(p.hand.indexOf(card), 1);
    g.discard.push(card);
    g.color = isWild(card) ? opts.color : card.color;
    g.awaiting = null;
    const idx = this.indexOf(p);
    g.turn = idx;
    this.clearVulnerable(p);
    this.ev({ type: 'play', player: p.id, card, jumpIn, color: g.color });

    // Säure: alle Karten dieser Farbe aus der eigenen Hand mit ablegen (unter die Säure-Karte)
    if (card.kind === 'acid') {
      const dumped = p.hand.filter((c) => c.color === card.color);
      if (dumped.length) {
        p.hand = p.hand.filter((c) => c.color !== card.color);
        g.discard.splice(g.discard.length - 1, 0, ...dumped);
      }
      this.ev({ type: 'acid', player: p.id, color: card.color, cards: dumped });
    }

    if (p.hand.length === 0) {
      // Strafkarten der letzten Karte zählen noch für die Punkte.
      const next = this.players[this.nextIndex(idx)];
      if (card.kind === 'draw2') this.drawCards(next, g.pending + 2, true);
      if (card.kind === 'wild4') this.drawCards(next, g.pending + 4, true);
      return this.endRound(p);
    }

    // Hausregel „0 – Hände weiterreichen“: alle Hände wandern einen Platz in Spielrichtung weiter
    if (this.settings.zeroPass && card.kind === '0') {
      const hands = this.players.map((q) => q.hand);
      this.players.forEach((q, i) => { this.players[this.nextIndex(i)].hand = hands[i]; });
      for (const q of this.players) { q.called = false; q.vulnerable = false; }
      this.ev({ type: 'rotate', dir: g.dir });
    }

    if (p.hand.length === 1 && !p.called) p.vulnerable = true;

    const n = this.players.length;
    const next = this.nextIndex(idx);
    switch (card.kind) {
      case 'skip':
        this.ev({ type: 'skip', player: this.players[next].id });
        g.turn = this.nextIndex(idx, 2);
        break;
      case 'rev':
        g.dir *= -1;
        this.ev({ type: 'reverse', dir: g.dir });
        g.turn = n === 2 ? idx : this.nextIndex(idx);
        if (n === 2) this.ev({ type: 'skip', player: this.players[next].id });
        break;
      case 'draw2':
        g.pending += 2;
        if (this.settings.stacking) {
          g.turn = next;
        } else {
          this.drawCards(this.players[next], g.pending, true);
          g.pending = 0;
          g.turn = this.nextIndex(idx, 2);
        }
        break;
      case 'wild4': {
        const stacked = g.pending > 0;
        g.pending += 4;
        g.turn = next;
        if (!stacked) {
          const guilty = p.hand.some((c) => c.color === prevColor);
          g.awaiting = { type: 'challenge', player: this.players[next].id, offender: p.id, guilty };
        }
        break;
      }
      default:
        g.turn = next;
    }
    this.afterAction(true);
  }

  /** Chaos- und DOOM-Karten. */
  playChaos(p, card, opts) {
    const g = this.game;
    const doom = isDoom(card);
    const fx = doom ? DOOM[card.effect] : CHAOS[card.effect];
    const label = doom ? 'DOOM-Karten' : 'Chaos-Karten';
    if (this.actor() !== p) fail(`${label} kannst du nur spielen, wenn du dran bist.`);
    if (g.awaiting?.type === 'challenge') fail('Erst entscheiden: anzweifeln oder annehmen.');
    if (g.awaiting?.type === 'drawn' && card.id !== g.awaiting.cardId) fail('Du kannst nur die gezogene Karte spielen.');
    if (g.pending > 0) fail(`Erst ${g.pending} Karten ziehen oder stapeln.`);
    let target = null;
    if (fx.target) {
      target = this.byId(opts.target);
      if (!target || target === p) fail('Wähle einen Spieler als Ziel.');
    }
    const dirActive = !doom && card.effect === 'dirChaos' && g.dirChaos > 0;
    if (dirActive && !['cancel', 'extend'].includes(opts.dirChoice)) fail('Richtungschaos läuft schon: aufheben oder +10 Züge?');

    p.hand.splice(p.hand.indexOf(card), 1);
    g.awaiting = null;
    const idx = this.indexOf(p);
    g.turn = idx;
    this.clearVulnerable(p);
    this.ev({ type: 'play', player: p.id, card, chaos: true, doom });
    if (p.hand.length === 0) return this.endRound(p);
    if (doom) return this.applyDoom(p, card, target, idx);

    const reset = (q) => { q.called = false; q.vulnerable = false; };
    const randomCards = (q, n) => {
      const out = [];
      for (let i = 0; i < n && q.hand.length; i++) out.push(q.hand.splice(Math.floor(Math.random() * q.hand.length), 1)[0]);
      return out;
    };

    const chaosEv = { type: 'chaos', effect: card.effect, player: p.id, target: target?.id ?? null };
    if (card.effect === 'dirChaos') chaosEv.choice = dirActive ? opts.dirChoice : 'start';
    this.ev(chaosEv);
    switch (card.effect) {
      case 'dirChaos':
        if (!dirActive) g.dirChaos = 10;
        else if (opts.dirChoice === 'cancel') g.dirChaos = 0;
        else g.dirChaos += 10;
        g.dirChaosFresh = true; // in diesem Zug noch nicht würfeln
        break;
      case 'plus50':
        this.drawCards(target, 50, true);
        break;
      case 'skip3':
        target.skipTurns = (target.skipTurns ?? 0) + 3;
        break;
      case 'swapHand':
        [p.hand, target.hand] = [target.hand, p.hand];
        reset(p); reset(target);
        break;
      case 'gift':
        target.hand.push(...randomCards(p, 3));
        reset(target);
        break;
      case 'shuffleHands': {
        const counts = this.players.map((q) => q.hand.length);
        const pool = shuffle(this.players.flatMap((q) => q.hand));
        this.players.forEach((q, i) => { q.hand = pool.splice(0, counts[i]); reset(q); });
        break;
      }
      case 'tornado': {
        // Alle Karten in einen Topf, dann möglichst gleichmäßig verteilen
        const pool = shuffle(this.players.flatMap((q) => q.hand));
        const base = Math.floor(pool.length / this.players.length);
        let extra = pool.length % this.players.length;
        for (const q of shuffle([...this.players])) {
          q.hand = pool.splice(0, base + (extra-- > 0 ? 1 : 0));
          reset(q);
        }
        break;
      }
      case 'colorShift': {
        const next = { r: 'y', y: 'g', g: 'b', b: 'r' };
        for (const q of this.players) {
          q.hand = q.hand.map((c) => (next[c.color] ? { ...c, color: next[c.color] } : c));
        }
        break;
      }
      case 'plus4All':
        for (const q of this.players) if (q !== p) this.drawCards(q, 4, true);
        break;
      case 'dump2':
        // Karten kommen unter den Ziehstapel; Chaos-Karten verschwinden ganz
        for (const c of randomCards(p, 2)) if (!isSpecial(c)) g.draw.unshift(c);
        break;
    }
    this.finishSpecial(p, idx);
  }

  finishSpecial(p, idx) {
    const empty = this.players.find((q) => q.hand.length === 0);
    if (empty) return this.endRound(empty);
    if (p.hand.length === 1 && !p.called) p.vulnerable = true;
    this.game.turn = this.nextIndex(idx);
    this.afterAction(true);
  }

  /** DOOM-Effekte. Neue Karten kommen aus dem Höllenportal (frisch erzeugt, nicht vom Stapel). */
  applyDoom(p, card, target, idx) {
    const reset = (q) => { q.called = false; q.vulnerable = false; };
    const ev = { type: 'doom', effect: card.effect, player: p.id, target: target?.id ?? null };
    switch (card.effect) {
      case 'plus100':
        target.hand.push(...this.hellCards(100));
        reset(target);
        ev.n = 100;
        break;
      case 'tornado': {
        const pool = shuffle(this.players.flatMap((q) => q.hand));
        const base = Math.floor(pool.length / this.players.length);
        let extra = pool.length % this.players.length;
        for (const q of shuffle([...this.players])) {
          q.hand = pool.splice(0, base + (extra-- > 0 ? 1 : 0));
          reset(q);
        }
        // 10 Höllenkarten pro Gegner – nur unter den anderen aufgeteilt
        const others = this.players.filter((q) => q !== p);
        const hell = this.hellCards(10 * others.length);
        hell.forEach((c, i) => others[i % others.length].hand.push(c));
        ev.n = hell.length;
        break;
      }
      case 'hallu':
        for (const q of this.players) if (q !== p) q.hallu = 3;
        break;
    }
    this.ev(ev);
    this.finishSpecial(p, idx);
  }

  /** Richtungschaos: nach jedem Zug 50 % Richtungswechsel. */
  rollDirChaos() {
    const g = this.game;
    if (!g.dirChaos) return;
    if (g.dirChaosFresh) { g.dirChaosFresh = false; return; }
    g.dirChaos--;
    const flipped = Math.random() < 0.5;
    if (flipped) {
      // Wer gerade gezogen hat, war prevTurnId. Wurde normal weitergegeben, geht es jetzt in die andere Richtung.
      const prevIdx = this.players.findIndex((q) => q.id === this.prevTurnId);
      const wasNormal = prevIdx >= 0 && !g.awaiting && g.turn === this.nextIndex(prevIdx);
      g.dir *= -1;
      if (wasNormal) g.turn = this.nextIndex(prevIdx);
    }
    this.ev({ type: 'dirRoll', flipped, left: g.dirChaos, dir: g.dir });
  }

  /** Halluzinationen zählen die eigenen Züge der Betroffenen herunter. */
  tickHallu() {
    const g = this.game;
    const cur = this.players[g.turn];
    if (this.prevTurnId != null && this.prevTurnId !== cur?.id) {
      const prev = this.byId(this.prevTurnId);
      if (prev?.hallu > 0) {
        prev.hallu--;
        if (!prev.hallu) this.ev({ type: 'halluEnd', player: prev.id });
      }
    }
    this.prevTurnId = cur?.id ?? null;
  }

  /** Spieler mit "Aussetzen"-Zählern überspringen. */
  applySkips() {
    const g = this.game;
    for (let guard = 0; guard < 24 && this.phase === 'playing' && !g.awaiting; guard++) {
      const q = this.players[g.turn];
      if (!q.skipTurns) break;
      q.skipTurns--;
      if (g.pending > 0) { this.drawCards(q, g.pending, true); g.pending = 0; }
      this.ev({ type: 'skip', player: q.id, chaos: true, left: q.skipTurns });
      g.turn = this.nextIndex(g.turn);
    }
  }

  draw(p) {
    this.requirePlaying();
    const g = this.game;
    if (this.actor() !== p) fail('Du bist nicht dran.');
    if (g.awaiting?.type === 'challenge') return this.resolveChallenge(p, false);
    if (g.awaiting?.type === 'drawn') fail('Spiele die gezogene Karte oder behalte sie.');
    this.clearVulnerable(p);
    if (g.pending > 0) {
      this.drawCards(p, g.pending, true);
      g.pending = 0;
      g.turn = this.nextIndex(g.turn);
      return this.afterAction(true);
    }
    let last = null;
    for (let i = 0; i < 30; i++) {
      const [c] = this.drawCards(p, 1);
      if (!c) break;
      last = c;
      if (canPlay(c, this.top(), g.color, 0, this.settings) || !this.settings.drawToMatch) break;
    }
    if (last && canPlay(last, this.top(), g.color, 0, this.settings)) {
      g.awaiting = { type: 'drawn', player: p.id, cardId: last.id };
    } else {
      g.turn = this.nextIndex(g.turn);
    }
    this.afterAction(true);
  }

  pass(p) {
    this.requirePlaying();
    const g = this.game;
    if (g.awaiting?.type !== 'drawn' || g.awaiting.player !== p.id) fail('Du kannst gerade nicht passen.');
    g.awaiting = null;
    g.turn = this.nextIndex(this.indexOf(p));
    this.ev({ type: 'pass', player: p.id });
    this.afterAction(true);
  }

  resolveChallenge(p, challenge) {
    this.requirePlaying();
    const g = this.game;
    const a = g.awaiting;
    if (a?.type !== 'challenge' || a.player !== p.id) fail('Hier gibt es nichts anzuzweifeln.');
    const offender = this.byId(a.offender);
    g.awaiting = null;
    this.clearVulnerable(p);
    if (!challenge) {
      this.drawCards(p, g.pending, true);
      g.pending = 0;
      g.turn = this.nextIndex(this.indexOf(p));
    } else if (a.guilty) {
      this.ev({ type: 'challenge', by: p.id, offender: offender.id, guilty: true });
      this.drawCards(offender, 4, true);
      g.pending = 0;
      g.turn = this.indexOf(p); // Herausforderer spielt normal weiter
    } else {
      this.ev({ type: 'challenge', by: p.id, offender: offender.id, guilty: false });
      this.drawCards(p, g.pending + 2, true);
      g.pending = 0;
      g.turn = this.nextIndex(this.indexOf(p));
    }
    this.afterAction(true);
  }

  callLast(p) {
    this.requirePlaying();
    if (p.hand.length > 2 && !p.vulnerable) fail('Erst bei zwei Karten rufen!');
    if (p.called && !p.vulnerable) return;
    p.called = true;
    p.vulnerable = false;
    this.ev({ type: 'call', player: p.id });
    this.afterAction(false);
  }

  catchPlayer(by, targetId) {
    if (this.phase !== 'playing') return;
    const t = this.byId(targetId);
    if (!t || t === by || !t.vulnerable || t.hand.length !== 1) return;
    this.ev({ type: 'caught', by: by.id, player: t.id });
    this.drawCards(t, 2, true);
    this.afterAction(false);
  }

  clearVulnerable(except) {
    for (const q of this.players) if (q !== except) q.vulnerable = false;
  }

  drawCards(p, n, penalty = false) {
    const g = this.game;
    const got = [];
    for (let i = 0; i < n; i++) {
      // Chaos-Karten gibt es nur beim normalen Ziehen, nicht bei Strafkarten
      const chaos = penalty ? null : this.maybeChaos();
      if (chaos) { got.push(chaos); continue; }
      if (!g.draw.length) this.reshuffle();
      if (!g.draw.length) break;
      got.push(g.draw.pop());
    }
    p.hand.push(...got);
    p.called = false;
    p.vulnerable = false;
    if (got.length) this.ev({ type: 'draw', player: p.id, n: got.length, penalty, chaos: got.filter(isChaos).length, doom: got.filter(isDoom).length });
    return got;
  }

  reshuffle() {
    const g = this.game;
    if (g.discard.length < 2) {
      // Alles ist auf den Händen: ein frisches Deck kommt ins Spiel
      if (g.decks >= 6) return;
      g.draw = shuffle(buildDeck(g.decks * 1000 + 1, { acid: this.settings.acid }));
      g.decks += 1;
      this.ev({ type: 'newDeck' });
      return;
    }
    const top = g.discard.pop();
    g.draw = shuffle(g.discard);
    g.discard = [top];
    this.ev({ type: 'shuffle' });
  }

  endRound(winner, { timeLimit = false } = {}) {
    this.clearTimers();
    const g = this.game;
    g.awaiting = null;
    g.pending = 0;
    const hands = this.players.map((q) => ({
      id: q.id, cards: q.hand, points: q.hand.reduce((s, c) => s + cardPoints(c), 0),
    }));
    const points = hands.reduce((s, h) => s + h.points, 0);
    winner.score += points;
    const limit = this.settings.scoreLimit;
    this.phase = 'roundOver';
    this.result = { winnerId: winner.id, points, hands, gameOver: limit > 0 && winner.score >= limit, round: this.round, timeLimit };
    this.ev({ type: 'win', player: winner.id, points });
    this.afterAction(true);
  }

  // ---------- Timer & Bots ----------

  timer(fn, ms) {
    const t = setTimeout(() => {
      this.timers.delete(t);
      if (this.destroyed) return;
      try { fn(); } catch (e) { console.error('[room]', this.code, e); }
    }, Math.max(0, ms));
    this.timers.add(t);
  }

  clearTimers() {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
  }

  afterAction(turnChanged) {
    if (this.destroyed) return;
    if (turnChanged) {
      this.actionNo++;
      if (this.phase === 'playing') {
        // Notbremse gegen endlose Runden: wer die wenigsten Karten hat, gewinnt
        if (++this.game.actions > 2000) {
          const best = this.players.reduce((m, q) => (q.hand.length < m.hand.length ? q : m));
          this.ev({ type: 'timeLimit' });
          return this.endRound(best, { timeLimit: true });
        }
        this.rollDirChaos();
        this.applySkips();
        this.tickHallu();
      }
    }
    this.schedule();
    this.broadcast();
  }

  schedule() {
    this.clearTimers();
    const g = this.game;
    if (this.phase !== 'playing' || !g) return;
    // Ohne verbundene Menschen pausiert das Spiel.
    if (!this.connectedHumans().length) return;
    const a = this.actor();
    if (!a) return;

    if (this.settings.turnTime > 0 && !a.isBot && a.session?.ws) {
      if (this.deadlineKey !== this.actionNo) {
        this.deadlineKey = this.actionNo;
        g.deadline = Date.now() + this.settings.turnTime * 1000;
      }
      this.timer(() => this.autoAct(a, false), g.deadline - Date.now());
    } else {
      g.deadline = 0;
    }

    const anyVulnerable = this.players.some((q) => q.vulnerable);
    if (a.isBot) {
      this.timer(() => this.botAct(a), botDelay(this.settings.botLevel) + (anyVulnerable ? 700 : 0));
    } else if (!a.session?.ws) {
      this.timer(() => this.autoAct(a, true), 2500);
    }

    for (const t of this.players) {
      if (!t.vulnerable) continue;
      for (const b of this.players) {
        if (!b.isBot || b === t) continue;
        if (Math.random() < botCatchChance(this.settings.botLevel)) {
          this.timer(() => this.catchPlayer(b, t.id), 900 + Math.random() * 2000);
        }
      }
    }
  }

  botAct(b) {
    if (this.actor() !== b) return;
    const action = botDecide(this, b, this.settings.botLevel);
    this.perform(b, action);
  }

  /** Zeit abgelaufen oder Spieler offline. */
  autoAct(p, smart) {
    if (this.actor() !== p) return;
    if (smart) return this.perform(p, botDecide(this, p, 'normal'));
    const g = this.game;
    if (g.awaiting?.type === 'challenge') return this.resolveChallenge(p, false);
    if (g.awaiting?.type === 'drawn') return this.pass(p);
    this.ev({ type: 'timeout', player: p.id });
    this.draw(p);
    if (this.game?.awaiting?.type === 'drawn' && this.game.awaiting.player === p.id) this.pass(p);
  }

  perform(p, action) {
    if (action.t === 'play' && p.hand.length === 2 && !p.called) {
      const chance = p.isBot ? botCallChance(this.settings.botLevel) : 1;
      if (Math.random() < chance) { p.called = true; this.ev({ type: 'call', player: p.id }); }
    }
    const before = this.actionNo;
    this.handle(p, action);
    // Fallback, falls der Bot etwas Ungültiges wollte
    if (this.phase === 'playing' && this.actor() === p && this.actionNo === before) {
      const g = this.game;
      if (g.awaiting?.type === 'drawn') this.pass(p);
      else if (g.awaiting?.type === 'challenge') this.resolveChallenge(p, false);
      else this.draw(p);
    }
  }

  // ---------- Ansicht ----------

  playableIds(p) {
    const g = this.game;
    if (this.phase !== 'playing' || !g) return [];
    const top = this.top();
    const a = this.actor();
    if (a === p) {
      if (g.awaiting?.type === 'drawn') return [g.awaiting.cardId];
      if (g.awaiting?.type === 'challenge') return this.settings.stacking ? p.hand.filter((c) => c.kind === 'wild4').map((c) => c.id) : [];
      return p.hand.filter((c) => canPlay(c, top, g.color, g.pending, this.settings)).map((c) => c.id);
    }
    if (this.settings.jumpIn && !g.awaiting && g.pending === 0) {
      return p.hand.filter((c) => isSameCard(c, top)).map((c) => c.id);
    }
    return [];
  }

  viewFor(viewer) {
    const g = this.game;
    const a = this.actor();
    return {
      t: 'room',
      code: this.code,
      hostId: this.hostId,
      phase: this.phase,
      settings: this.settings,
      me: viewer.id,
      players: this.players.map((p) => ({
        id: p.id, name: p.name, avatar: p.avatar, isBot: p.isBot,
        connected: p.isBot || !!p.session?.ws, count: p.hand.length,
        score: p.score, called: p.called, vulnerable: p.vulnerable, skipTurns: p.skipTurns ?? 0,
        chaos: p.hand.filter(isChaos).length, // öffentlich: jeder sieht, wer Chaos-Karten hält
        doom: p.hand.filter(isDoom).length,
        hallu: p.hallu ?? 0,
      })),
      hand: viewer.hand,
      playable: this.playableIds(viewer),
      game: g ? {
        discard: g.discard.slice(-14),
        color: g.color,
        turnId: this.players[g.turn]?.id,
        actorId: a?.id ?? null,
        dir: g.dir,
        pending: g.pending,
        dirChaos: g.dirChaos ?? 0,
        drawCount: g.draw.length,
        deadline: g.deadline,
        serverNow: Date.now(),
        round: this.round,
        awaiting: g.awaiting ? {
          type: g.awaiting.type,
          player: g.awaiting.player,
          offender: g.awaiting.offender,
          cardId: g.awaiting.player === viewer.id ? g.awaiting.cardId : undefined,
        } : null,
      } : null,
      result: this.result,
      events: this.events,
    };
  }

  broadcast() {
    for (const p of this.players) {
      if (!p.isBot && p.session?.ws) p.session.send(this.viewFor(p));
    }
    this.events = [];
  }
}

function sanitizeSettings(cur, s) {
  const out = { ...cur };
  if (['neon', 'winter', 'garden'].includes(s.theme)) out.theme = s.theme;
  if (Number.isInteger(s.handSize) && s.handSize >= 3 && s.handSize <= 10) out.handSize = s.handSize;
  for (const k of ['stacking', 'zeroPass', 'jumpIn', 'drawToMatch', 'acid']) if (typeof s[k] === 'boolean') out[k] = s[k];
  if ([0, 200, 300, 500].includes(s.scoreLimit)) out.scoreLimit = s.scoreLimit;
  if ([0, 15, 30, 60].includes(s.turnTime)) out.turnTime = s.turnTime;
  if (['easy', 'normal', 'hard'].includes(s.botLevel)) out.botLevel = s.botLevel;
  if (CHAOS_LEVELS.includes(s.chaos)) out.chaos = s.chaos;
  if (DOOM_LEVELS.includes(s.doom)) out.doom = s.doom;
  return out;
}
