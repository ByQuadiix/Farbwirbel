import {
  buildDeck, shuffle, canPlay, isSameCard, cardPoints, isNumber, isWild,
  COLORS, DEFAULT_SETTINGS, PLAYER_LIMIT, PLAYER_MIN, AVATARS, deckSize, CHAOS, CHAOS_KEYS, CHAOS_LEVELS, isChaos,
  DOOM, DOOM_KEYS, DOOM_LEVELS, isDoom, isSpecial, WHEEL, THEME_EVENTS, EVENT_EVERY, EVENT_CHANCE,
} from '../shared/rules.js';
import { botDecide, botCallChance, botCatchChance, botDelay } from './bot.js';

export const HELL_ID_START = 2_000_000;
export { AVATARS };
const BOT_NAMES = ['Kiki', 'Bruno', 'Lotte', 'Pixel', 'Fiete', 'Mira', 'Ozzy', 'Nala', 'Toni', 'Wanda', 'Rocco', 'Zora',
  'Paule', 'Greta', 'Juno', 'Kalle', 'Romy', 'Fritzi', 'Bodo', 'Ilse', 'Momo', 'Hugo', 'Tilda', 'Ede'];

const isMirror = (c) => c.kind === 'chaos' && c.effect === 'mirror';
const rint = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pickOne = (arr) => arr[Math.floor(Math.random() * arr.length)];

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

  deckOpts() { return { acid: this.settings.acid, lottery: this.settings.lottery }; }

  /** Eventuell eine Sonderkarte statt einer normalen: erst DOOM (selten), dann Chaos. */
  maybeChaos() {
    const doom = this.settings.doom;
    if (doom && Math.random() * 100 < doom) {
      return { id: this.chaosId++, color: 'd', kind: 'doom', effect: pickOne(DOOM_KEYS) };
    }
    const pct = this.settings.chaos;
    if (!pct || Math.random() * 100 >= pct) return null;
    return { id: this.chaosId++, color: 'x', kind: 'chaos', effect: pickOne(CHAOS_KEYS) };
  }

  /** Neue, zufällige normale Karten "aus dem Höllenportal". */
  hellCards(n) {
    const tpl = buildDeck(0, this.deckOpts());
    return Array.from({ length: n }, () => ({ ...pickOne(tpl), id: this.hellId++ }));
  }

  // ---------- Spieler ----------

  byId(id) { return this.players.find((p) => p.id === id); }
  indexOf(p) { return this.players.indexOf(p); }
  humans() { return this.players.filter((p) => !p.isBot); }
  connectedHumans() { return this.players.filter((p) => !p.isBot && p.session?.ws); }

  addHuman(session) {
    if (this.phase !== 'lobby') fail('Das Spiel läuft bereits.');
    if (this.players.length >= this.settings.maxPlayers) fail(`Der Raum ist voll (${this.settings.maxPlayers} Plätze).`);
    const p = this.newPlayer({ name: session.name, avatar: session.avatar, isBot: false });
    p.session = session;
    this.players.push(p);
    if (!this.hostId) this.hostId = p.id;
    this.ev({ type: 'join', player: p.id });
    return p;
  }

  addBot() {
    if (this.players.length >= this.settings.maxPlayers) fail(`Der Raum ist voll (${this.settings.maxPlayers} Plätze).`);
    const used = new Set(this.players.map((p) => p.name));
    const free = BOT_NAMES.filter((n) => !used.has(n));
    const name = free[Math.floor(Math.random() * free.length)] ?? `Bot ${this.players.length + 1}`;
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
          if (Number.isInteger(msg.settings?.maxPlayers) && msg.settings.maxPlayers < this.players.length) {
            fail(`Es sind schon ${this.players.length} Spieler im Raum – erst Bots entfernen.`);
          }
          this.settings = sanitizeSettings(this.settings, msg.settings ?? {});
          return this.afterAction(false);
        case 'addBot':
          if (!isHost || this.phase !== 'lobby') fail('Nur der Host kann Bots hinzufügen.');
          this.addBot();
          return this.afterAction(false);
        case 'fillBots':
          if (!isHost || this.phase !== 'lobby') fail('Nur der Host kann Bots hinzufügen.');
          while (this.players.length < this.settings.maxPlayers) this.addBot();
          return this.afterAction(false);
        case 'clearBots':
          if (!isHost || this.phase !== 'lobby') fail('Nur der Host kann Bots entfernen.');
          this.players = this.players.filter((q) => !q.isBot);
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
        case 'mirror': return this.mirrorDecision(p, !!msg.use);
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

  /** Einschränkungen für einen Spieler: eingefrorene Farbe (Eiszeit), Fluch-Farbe. */
  restrictFor(p) {
    const g = this.game;
    return {
      frozen: g?.frozen?.color ?? null,
      curse: p?.curse?.turns > 0 ? p.curse.color : null,
    };
  }

  startRound() {
    this.clearTimers();
    const n = this.players.length;
    // Genug Decks für alle Startkarten + Reserve (bei 20 Spielern reicht ein Deck nicht)
    const decks = Math.max(1, Math.ceil((n * this.settings.handSize + 40) / deckSize(this.settings)));
    const draw = [];
    for (let k = 0; k < decks; k++) draw.push(...buildDeck(k * 1000 + 1, this.deckOpts()));
    shuffle(draw);
    for (const p of this.players) {
      p.hand = [];
      for (let i = 0; i < this.settings.handSize; i++) p.hand.push(this.maybeChaos() ?? draw.pop());
      p.called = false;
      p.vulnerable = false;
      p.skipTurns = 0;
      p.hallu = 0;
      p.pact = 0;
      p.curse = null;
    }
    const idx = draw.findIndex(isNumber);
    const first = draw.splice(idx, 1)[0];
    this.round += 1;
    const turn = this.round === 1 ? Math.floor(Math.random() * n) : (this.startSeat + 1) % n;
    this.startSeat = turn;
    this.game = {
      draw, discard: [first], color: first.color, turn, dir: 1, pending: 0, awaiting: null, deadline: 0,
      decks, maxDecks: decks + 5, actions: 0, dirChaos: 0,
      lastAttacker: null, attackQueue: [], attackResume: null,
      bomb: null, frozen: null, ice: false, wet: null, blackoutUntil: 0, eventIn: EVENT_EVERY,
    };
    this.prevTurnId = null;
    this.phase = 'playing';
    this.result = null;
    this.ev({ type: 'deal', round: this.round });
    this.afterAction(true);
  }

  requirePlaying() { if (this.phase !== 'playing') fail('Gerade läuft keine Runde.'); }

  playError(p, card) {
    const r = this.restrictFor(p);
    if (r.frozen && card.color === r.frozen) return 'Diese Farbe ist eingefroren (Eiszeit).';
    if (r.curse && card.color !== r.curse) return 'Du bist verflucht und darfst nur deine Fluch-Farbe spielen.';
    return 'Diese Karte passt nicht.';
  }

  play(p, cardId, opts = {}) {
    this.requirePlaying();
    const g = this.game;
    const card = p.hand.find((c) => c.id === cardId);
    if (!card) fail('Diese Karte hast du nicht.');
    const top = this.top();
    const actor = this.actor();
    const restrict = this.restrictFor(p);
    let jumpIn = false;

    if (isSpecial(card)) return this.playChaos(p, card, opts);

    if (g.awaiting) {
      if (g.awaiting.player !== p.id) fail('Du bist nicht dran.');
      if (g.awaiting.type === 'mirror') fail('Erst entscheiden: Spiegel einsetzen oder nicht.');
      if (g.awaiting.type === 'drawn' && card.id !== g.awaiting.cardId) fail('Du kannst nur die gezogene Karte spielen.');
      if (g.awaiting.type === 'challenge' && !(this.settings.stacking && card.kind === 'wild4')) {
        fail('Erst entscheiden: anzweifeln oder annehmen.');
      }
    } else if (actor !== p) {
      if (!(this.settings.jumpIn && g.pending === 0 && isSameCard(card, top) && canPlay(card, top, g.color, 0, this.settings, restrict))) {
        fail('Du bist nicht dran.');
      }
      jumpIn = true;
    }
    if (!jumpIn && !canPlay(card, top, g.color, g.pending, this.settings, restrict)) fail(this.playError(p, card));
    if (isWild(card)) {
      if (!COLORS.includes(opts.color)) fail('Bitte eine Farbe wählen.');
      if (g.frozen && opts.color === g.frozen.color) fail('Diese Farbe ist eingefroren – wähle eine andere.');
    }

    // --- Ausführen ---
    const prevColor = g.color;
    p.hand.splice(p.hand.indexOf(card), 1);
    g.color = isWild(card) ? opts.color : card.color;
    let placed = card;
    // Glatteis: die Karte rutscht aus und bekommt eine zufällige andere Farbe
    if (g.ice) {
      g.ice = false;
      const from = g.color;
      const to = pickOne(COLORS.filter((c) => c !== from && c !== g.frozen?.color));
      if (!isWild(card)) placed = { ...card, color: to, slidFrom: card.color };
      g.color = to;
      this.ev({ type: 'iceSlide', player: p.id, from, to, cardId: card.id });
    }
    g.discard.push(placed);
    g.awaiting = null;
    const idx = this.indexOf(p);
    g.turn = idx;
    this.clearVulnerable(p);
    this.ev({ type: 'play', player: p.id, card: placed, jumpIn, color: g.color });

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
        g.lastAttacker = p.id;
        if (this.settings.stacking) {
          g.turn = next;
        } else {
          const amount = g.pending;
          g.pending = 0;
          // Wird gespiegelt, spielt das Opfer normal weiter; sonst setzt es aus.
          return this.startAttacks([{ victim: this.players[next].id, attacker: p.id, amount, source: 'draw2', reflectResume: next }], this.nextIndex(idx, 2));
        }
        break;
      case 'wild4': {
        const stacked = g.pending > 0;
        g.pending += 4;
        g.lastAttacker = p.id;
        g.turn = next;
        if (!stacked) {
          const guilty = p.hand.some((c) => c.color === prevColor);
          g.awaiting = { type: 'challenge', player: this.players[next].id, offender: p.id, guilty };
        }
        break;
      }
      case 'lottery':
        this.lottery(p);
        g.turn = next;
        break;
      default:
        g.turn = next;
    }
    this.afterAction(true);
  }

  /** Lotterie: alle würfeln – niedrigster Wurf zieht 3, höchster darf 1 Karte abwerfen. */
  lottery(p) {
    const g = this.game;
    const rolls = this.players.map((q) => ({ id: q.id, roll: rint(1, 6) }));
    const min = Math.min(...rolls.map((r) => r.roll));
    const max = Math.max(...rolls.map((r) => r.roll));
    const losers = min < max ? rolls.filter((r) => r.roll === min).map((r) => r.id) : [];
    const winners = min < max ? rolls.filter((r) => r.roll === max).map((r) => r.id) : [];
    this.ev({ type: 'lottery', player: p.id, rolls, losers, winners });
    for (const id of losers) this.drawCards(this.byId(id), 3, true);
    for (const id of winners) {
      const q = this.byId(id);
      if (q.hand.length < 2) continue; // letzte Karte wird nie abgeworfen
      const c = q.hand.splice(Math.floor(Math.random() * q.hand.length), 1)[0];
      if (!isSpecial(c)) g.draw.unshift(c);
      q.called = false;
      q.vulnerable = false;
      this.ev({ type: 'lotteryDrop', player: q.id });
    }
  }

  // ---------- Angriffe & Spiegel ----------
  //
  // Alle Zieh-Angriffe (+2 ohne Stapeln, +50, Alle +4, +100, Meteore, gespiegelte Stapel) laufen über eine
  // Warteschlange. Hält das Opfer einen Spiegel, pausiert das Spiel (awaiting 'mirror') und das Opfer
  // entscheidet. Gespiegelt wird der Angriff zum Absender umgedreht – der kann seinerseits zurückspiegeln.

  startAttacks(list, resume) {
    const g = this.game;
    g.attackQueue = list.map((a) => ({ ...a }));
    g.attackResume = resume;
    this.continueAttacks();
  }

  continueAttacks() {
    const g = this.game;
    while (g.attackQueue.length) {
      const a = g.attackQueue[0];
      const victim = this.byId(a.victim);
      const attacker = this.byId(a.attacker);
      if (!victim) { g.attackQueue.shift(); continue; }
      if (attacker && victim !== attacker && victim.hand.some(isMirror)) {
        g.awaiting = { type: 'mirror', player: victim.id, attacker: attacker.id, amount: a.amount, source: a.source };
        return this.afterAction(true);
      }
      g.attackQueue.shift();
      this.applyAttack(a);
    }
    g.awaiting = null;
    const empty = this.players.find((q) => q.hand.length === 0);
    if (empty) return this.endRound(empty);
    g.turn = g.attackResume;
    this.afterAction(true);
  }

  applyAttack(a) {
    const v = this.byId(a.victim);
    if (a.hell) {
      v.hand.push(...this.hellCards(a.amount));
      v.called = false;
      v.vulnerable = false;
      this.ev({ type: 'draw', player: v.id, n: a.amount, penalty: true, hell: true, chaos: 0, doom: 0 });
    } else {
      this.drawCards(v, a.amount, true);
    }
  }

  mirrorDecision(p, use) {
    this.requirePlaying();
    const g = this.game;
    if (g.awaiting?.type !== 'mirror' || g.awaiting.player !== p.id) fail('Gerade gibt es nichts zu spiegeln.');
    const a = g.attackQueue[0];
    g.awaiting = null;
    if (use) {
      const mi = p.hand.findIndex(isMirror);
      if (mi < 0) fail('Du hast keinen Spiegel.');
      const [m] = p.hand.splice(mi, 1);
      this.ev({ type: 'play', player: p.id, card: m, chaos: true });
      this.ev({ type: 'mirror', by: p.id, to: a.attacker, amount: a.amount, source: a.source });
      if (a.reflectResume != null) g.attackResume = a.reflectResume;
      g.attackQueue[0] = { ...a, victim: a.attacker, attacker: p.id, reflectResume: null };
      if (p.hand.length === 0) return this.endRound(p); // Spiegel war die letzte Karte
    } else {
      g.attackQueue.shift();
      this.applyAttack(a);
    }
    this.continueAttacks();
  }

  /** Spiegel im eigenen Zug: gegen offene Strafkarten (Stapeln) oder eine +4 (statt anzweifeln). */
  playMirror(p, card) {
    const g = this.game;
    if (this.actor() !== p) fail('Den Spiegel setzt du ein, wenn dich ein Angriff trifft – das Spiel fragt dich dann.');
    const vsChallenge = g.awaiting?.type === 'challenge';
    if (!(g.pending > 0 || vsChallenge)) fail('Der Spiegel wirkt nur gegen Angriffe (+2, +4, +50, +100 …).');
    const attacker = this.byId(vsChallenge ? g.awaiting.offender : g.lastAttacker);
    if (!attacker || attacker === p) fail('Hier gibt es niemanden zum Zurückspiegeln.');
    const amount = g.pending;
    p.hand.splice(p.hand.indexOf(card), 1);
    g.pending = 0;
    g.awaiting = null;
    const idx = this.indexOf(p);
    g.turn = idx;
    this.clearVulnerable(p);
    this.ev({ type: 'play', player: p.id, card, chaos: true });
    this.ev({ type: 'mirror', by: p.id, to: attacker.id, amount, source: vsChallenge ? 'wild4' : 'stack' });
    if (p.hand.length === 0) return this.endRound(p);
    if (p.hand.length === 1 && !p.called) p.vulnerable = true;
    this.startAttacks([{ victim: attacker.id, attacker: p.id, amount, source: 'stack' }], this.nextIndex(idx));
  }

  // ---------- Chaos & DOOM ----------

  /** Chaos- und DOOM-Karten. */
  playChaos(p, card, opts) {
    const g = this.game;
    if (isMirror(card)) return this.playMirror(p, card);
    const doom = isDoom(card);
    const fx = doom ? DOOM[card.effect] : CHAOS[card.effect];
    const label = doom ? 'DOOM-Karten' : 'Chaos-Karten';
    if (this.actor() !== p) fail(`${label} kannst du nur spielen, wenn du dran bist.`);
    if (g.awaiting?.type === 'challenge') fail('Erst entscheiden: anzweifeln oder annehmen.');
    if (g.awaiting?.type === 'mirror') fail('Erst entscheiden: Spiegel einsetzen oder nicht.');
    if (g.awaiting?.type === 'drawn' && card.id !== g.awaiting.cardId) fail('Du kannst nur die gezogene Karte spielen.');
    if (g.pending > 0) fail(`Erst ${g.pending} Karten ziehen oder stapeln.`);
    let target = null;
    if (fx.target) {
      target = this.byId(opts.target);
      if (!target || target === p) fail('Wähle einen Spieler als Ziel.');
      if (card.effect === 'thief' && target.hand.length < 2) fail('Bei diesem Spieler gibt es nichts zu holen (weniger als 2 Karten).');
    }
    if (fx.color && !COLORS.includes(opts.color)) fail('Bitte eine Farbe wählen.');
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
    if (card.effect === 'freeze') chaosEv.color = opts.color;
    this.ev(chaosEv);
    switch (card.effect) {
      case 'dirChaos':
        if (!dirActive) g.dirChaos = 10;
        else if (opts.dirChoice === 'cancel') g.dirChaos = 0;
        else g.dirChaos += 10;
        g.dirChaosFresh = true; // in diesem Zug noch nicht würfeln
        break;
      case 'plus50':
        if (p.hand.length === 1 && !p.called) p.vulnerable = true;
        return this.startAttacks([{ victim: target.id, attacker: p.id, amount: 50, source: 'plus50' }], this.nextIndex(idx));
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
        if (p.hand.length === 1 && !p.called) p.vulnerable = true;
        return this.startAttacks(
          this.players.filter((q) => q !== p).map((q) => ({ victim: q.id, attacker: p.id, amount: 4, source: 'plus4All' })),
          this.nextIndex(idx),
        );
      case 'dump2':
        // Karten kommen unter den Ziehstapel; Chaos-Karten verschwinden ganz
        for (const c of randomCards(p, 2)) if (!isSpecial(c)) g.draw.unshift(c);
        break;
      case 'bomb':
        if (g.bomb) { g.bomb.power += 10; g.bomb.fuse = rint(3, 8); } else g.bomb = { holder: null, fuse: rint(3, 8), power: 10 };
        this.ev({ type: 'bombArm', player: p.id, power: g.bomb.power });
        break;
      case 'thief': {
        const [c] = randomCards(target, 1);
        p.hand.push(c);
        reset(p); reset(target);
        this.ev({ type: 'steal', from: target.id, to: p.id });
        break;
      }
      case 'xray':
        // Nur der Spieler selbst sieht die Karten (private Nachricht), alle anderen sehen nur, dass geschaut wird
        p.session?.send({ t: 'xray', target: target.id, name: target.name, cards: target.hand, ms: 5000 });
        break;
      case 'freeze':
        g.frozen = { color: opts.color, turns: 2 * this.players.length };
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
    const g = this.game;
    const reset = (q) => { q.called = false; q.vulnerable = false; };
    const ev = { type: 'doom', effect: card.effect, player: p.id, target: target?.id ?? null };
    switch (card.effect) {
      case 'plus100':
        ev.n = 100;
        this.ev(ev);
        if (p.hand.length === 1 && !p.called) p.vulnerable = true;
        return this.startAttacks([{ victim: target.id, attacker: p.id, amount: 100, hell: true, source: 'plus100' }], this.nextIndex(idx));
      case 'meteor': {
        const victims = shuffle(this.players.filter((q) => q !== p)).slice(0, 3);
        ev.hits = victims.map((q) => ({ id: q.id, n: rint(5, 15) }));
        this.ev(ev);
        if (p.hand.length === 1 && !p.called) p.vulnerable = true;
        return this.startAttacks(ev.hits.map((h) => ({ victim: h.id, attacker: p.id, amount: h.n, hell: true, source: 'meteor' })), this.nextIndex(idx));
      }
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
      case 'pact': {
        const n = Math.floor(p.hand.length / 2);
        for (let i = 0; i < n; i++) {
          const c = p.hand.splice(Math.floor(Math.random() * p.hand.length), 1)[0];
          if (!isSpecial(c)) g.draw.unshift(c);
        }
        p.pact = 6; // der aktuelle Zug zählt beim Weitergeben gleich mit → danach noch 5 eigene Züge
        reset(p);
        ev.n = n;
        break;
      }
      case 'curse': {
        // schwächste Farbe des Ziels (wenigste Karten, aber mindestens eine) – sonst zufällig
        const counts = COLORS.map((c) => ({ c, n: target.hand.filter((x) => x.color === c).length })).filter((x) => x.n > 0);
        const min = Math.min(...counts.map((x) => x.n));
        const color = counts.length ? pickOne(counts.filter((x) => x.n === min)).c : pickOne(COLORS);
        target.curse = { color, turns: 5 };
        ev.color = color;
        break;
      }
    }
    this.ev(ev);
    this.finishSpecial(p, idx);
  }

  // ---------- Zähler pro Zug ----------

  /** Richtungschaos: nach jedem Zug 50 % Richtungswechsel. */
  rollDirChaos() {
    const g = this.game;
    if (!g.dirChaos || g.awaiting) return;
    if (g.dirChaosFresh) { g.dirChaosFresh = false; return; }
    g.dirChaos--;
    const flipped = Math.random() < 0.5;
    if (flipped) {
      // Wer gerade gezogen hat, war prevTurnId. Wurde normal weitergegeben, geht es jetzt in die andere Richtung.
      const prevIdx = this.players.findIndex((q) => q.id === this.prevTurnId);
      const wasNormal = prevIdx >= 0 && g.turn === this.nextIndex(prevIdx);
      g.dir *= -1;
      if (wasNormal) g.turn = this.nextIndex(prevIdx);
    }
    this.ev({ type: 'dirRoll', flipped, left: g.dirChaos, dir: g.dir });
  }

  /** Zeitbombe wandert zum Spieler, der dran ist; nach Ablauf der Zündschnur explodiert sie. */
  tickBomb() {
    const g = this.game;
    if (!g.bomb || g.awaiting) return;
    const holder = this.players[g.turn];
    if (!holder || g.bomb.holder === holder.id) return;
    g.bomb.holder = holder.id;
    g.bomb.fuse--;
    if (g.bomb.fuse <= 0) {
      const power = g.bomb.power;
      g.bomb = null;
      this.ev({ type: 'bombBoom', player: holder.id, n: power });
      this.drawCards(holder, power, true);
    } else {
      this.ev({ type: 'bombMove', player: holder.id, danger: g.bomb.fuse <= 2 });
    }
  }

  /** Eiszeit läuft pro Zug ab. */
  tickFreeze() {
    const g = this.game;
    if (!g.frozen || g.awaiting) return;
    g.frozen.turns--;
    if (g.frozen.turns <= 0) {
      this.ev({ type: 'thaw', color: g.frozen.color });
      g.frozen = null;
    }
  }

  /** Zähler, die pro eigenem Zug eines Spielers ablaufen: Halluzination, Fluch, Dämonenpakt. */
  tickPlayerCounters() {
    const g = this.game;
    if (g.awaiting?.type === 'mirror') return;
    const cur = this.players[g.turn];
    if (this.prevTurnId != null && this.prevTurnId !== cur?.id) {
      const prev = this.byId(this.prevTurnId);
      if (prev?.hallu > 0) {
        prev.hallu--;
        if (!prev.hallu) this.ev({ type: 'halluEnd', player: prev.id });
      }
      if (prev?.curse?.turns > 0) {
        prev.curse.turns--;
        if (!prev.curse.turns) { this.ev({ type: 'curseEnd', player: prev.id }); prev.curse = null; }
      }
      if (prev?.pact > 0) {
        prev.pact--;
        if (!prev.pact) {
          // Pakt gebrochen: das Portal fordert seinen Preis
          prev.hand.push(...this.hellCards(20));
          prev.called = false;
          prev.vulnerable = false;
          this.ev({ type: 'pactDoom', player: prev.id, n: 20 });
          this.ev({ type: 'draw', player: prev.id, n: 20, penalty: true, hell: true, chaos: 0, doom: 0 });
        }
      }
    }
    this.prevTurnId = cur?.id ?? null;
  }

  // ---------- Tisch-Ereignisse ----------

  maybeTableEvent() {
    const g = this.game;
    const level = this.settings.events;
    if (!level || g.awaiting) return;
    if (--g.eventIn > 0) return;
    g.eventIn = EVENT_EVERY;
    if (Math.random() < EVENT_CHANCE[level]) this.triggerEvent();
  }

  /** Glücksrad oder Themen-Ereignis (Glatteis / Stromausfall / Regen). `kind` erzwingt eines (Debug). */
  triggerEvent(kind) {
    const g = this.game;
    if (!g || this.phase !== 'playing') return;
    const themeEv = THEME_EVENTS[this.settings.theme] ?? THEME_EVENTS.neon;
    const k = kind ?? (Math.random() < 0.5 ? 'wheel' : themeEv.key);
    const reset = (q) => { q.called = false; q.vulnerable = false; };
    if (k === 'wheel') {
      const index = Math.floor(Math.random() * WHEEL.length);
      const result = WHEEL[index].key;
      this.ev({ type: 'tableEvent', kind: 'wheel', result, index });
      switch (result) {
        case 'allPlus1':
          for (const q of this.players) this.drawCards(q, 1, true);
          break;
        case 'reverse':
          g.dir *= -1;
          this.ev({ type: 'reverse', dir: g.dir });
          break;
        case 'passLeft': {
          const gifts = this.players.map((q) => (q.hand.length > 1 ? q.hand.splice(Math.floor(Math.random() * q.hand.length), 1)[0] : null));
          gifts.forEach((c, i) => { if (c) this.players[this.nextIndex(i)].hand.push(c); });
          for (const q of this.players) reset(q);
          this.ev({ type: 'rotate', dir: g.dir, single: true });
          break;
        }
        case 'swapNeighbors':
          for (let i = 0; i + 1 < this.players.length; i += 2) {
            const a = this.players[i], b = this.players[i + 1];
            [a.hand, b.hand] = [b.hand, a.hand];
            reset(a); reset(b);
          }
          this.ev({ type: 'rotate', dir: g.dir, pairs: true });
          break;
        case 'underdog': {
          const q = this.players.reduce((m, x) => (x.hand.length > m.hand.length ? x : m));
          if (q.hand.length >= 4) {
            for (let i = 0; i < 3; i++) {
              const c = q.hand.splice(Math.floor(Math.random() * q.hand.length), 1)[0];
              if (!isSpecial(c)) g.draw.unshift(c);
            }
            reset(q);
            this.ev({ type: 'underdog', player: q.id, n: 3 });
          }
          break;
        }
      }
    } else if (k === 'ice') {
      g.ice = true;
      this.ev({ type: 'tableEvent', kind: 'ice' });
    } else if (k === 'blackout') {
      g.blackoutUntil = Date.now() + 10000;
      this.ev({ type: 'tableEvent', kind: 'blackout', until: g.blackoutUntil });
    } else if (k === 'rain') {
      g.wet = pickOne(COLORS);
      this.ev({ type: 'tableEvent', kind: 'rain', color: g.wet });
    }
  }

  // ---------- Ziehen, Passen, Anzweifeln ----------

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
    if (g.awaiting?.type === 'mirror') return this.mirrorDecision(p, false);
    if (g.awaiting?.type === 'drawn') fail('Spiele die gezogene Karte oder behalte sie.');
    this.clearVulnerable(p);
    if (g.pending > 0) {
      this.drawCards(p, g.pending, true);
      g.pending = 0;
      g.turn = this.nextIndex(g.turn);
      return this.afterAction(true);
    }
    const restrict = this.restrictFor(p);
    const ok = (c) => canPlay(c, this.top(), g.color, 0, this.settings, restrict);
    let last = null;
    for (let i = 0; i < 30; i++) {
      const [c] = this.drawCards(p, 1);
      if (!c) break;
      last = c;
      if (ok(c) || !this.settings.drawToMatch) break;
    }
    if (last && ok(last)) {
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
      if (g.decks >= g.maxDecks) return;
      g.draw = shuffle(buildDeck(g.decks * 1000 + 1, this.deckOpts()));
      g.decks += 1;
      this.ev({ type: 'newDeck' });
      return;
    }
    const top = g.discard.pop();
    // Auf Glatteis gerutschte Karten bekommen ihre echte Farbe zurück
    g.draw = shuffle(g.discard.map(({ slidFrom, ...c }) => (slidFrom ? { ...c, color: slidFrom } : c)));
    g.discard = [top];
    this.ev({ type: 'shuffle' });
  }

  endRound(winner, { timeLimit = false } = {}) {
    this.clearTimers();
    const g = this.game;
    g.awaiting = null;
    g.pending = 0;
    g.attackQueue = [];
    // Regen: nasse Karten zählen doppelt
    const pts = (c) => cardPoints(c) * (g.wet && c.color === g.wet ? 2 : 1);
    const hands = this.players.map((q) => ({
      id: q.id, cards: q.hand, points: q.hand.reduce((s, c) => s + pts(c), 0),
    }));
    const points = hands.reduce((s, h) => s + h.points, 0);
    winner.score += points;
    const limit = this.settings.scoreLimit;
    this.phase = 'roundOver';
    this.result = { winnerId: winner.id, points, hands, gameOver: limit > 0 && winner.score >= limit, round: this.round, timeLimit, wet: g.wet };
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
        if (++this.game.actions > Math.max(2000, this.players.length * 150)) {
          const best = this.players.reduce((m, q) => (q.hand.length < m.hand.length ? q : m));
          this.ev({ type: 'timeLimit' });
          return this.endRound(best, { timeLimit: true });
        }
        this.rollDirChaos();
        this.applySkips();
        this.tickPlayerCounters();
        this.tickFreeze();
        this.tickBomb();
        this.maybeTableEvent();
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
      // Viele Spieler: Bots ziehen schneller, damit eine Runde nicht ewig dauert
      const tempo = Math.max(0.35, Math.min(1, 6 / this.players.length));
      this.timer(() => this.botAct(a), botDelay(this.settings.botLevel) * tempo + (anyVulnerable ? 700 : 0));
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
    if (g.awaiting?.type === 'mirror') return this.mirrorDecision(p, false);
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
      else if (g.awaiting?.type === 'mirror') this.mirrorDecision(p, false);
      else this.draw(p);
    }
  }

  // ---------- Ansicht ----------

  playableIds(p) {
    const g = this.game;
    if (this.phase !== 'playing' || !g) return [];
    const top = this.top();
    const a = this.actor();
    const restrict = this.restrictFor(p);
    if (a === p) {
      if (g.awaiting?.type === 'drawn') return [g.awaiting.cardId];
      if (g.awaiting?.type === 'mirror') return [];
      if (g.awaiting?.type === 'challenge') {
        return p.hand.filter((c) => isMirror(c) || (this.settings.stacking && c.kind === 'wild4')).map((c) => c.id);
      }
      return p.hand.filter((c) => canPlay(c, top, g.color, g.pending, this.settings, restrict)).map((c) => c.id);
    }
    if (this.settings.jumpIn && !g.awaiting && g.pending === 0) {
      return p.hand.filter((c) => isSameCard(c, top) && canPlay(c, top, g.color, 0, this.settings, restrict)).map((c) => c.id);
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
        pact: p.pact ?? 0,
        curse: p.curse?.turns > 0 ? { color: p.curse.color, turns: p.curse.turns } : null,
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
        frozen: g.frozen,
        wet: g.wet,
        ice: g.ice,
        blackoutUntil: g.blackoutUntil,
        bomb: g.bomb ? { holder: g.bomb.holder, danger: g.bomb.fuse <= 2, power: g.bomb.power } : null,
        awaiting: g.awaiting ? {
          type: g.awaiting.type,
          player: g.awaiting.player,
          offender: g.awaiting.offender,
          attacker: g.awaiting.attacker,
          amount: g.awaiting.amount,
          source: g.awaiting.source,
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
  if (Number.isInteger(s.maxPlayers) && s.maxPlayers >= PLAYER_MIN && s.maxPlayers <= PLAYER_LIMIT) out.maxPlayers = s.maxPlayers;
  if (Number.isInteger(s.handSize) && s.handSize >= 3 && s.handSize <= 10) out.handSize = s.handSize;
  for (const k of ['stacking', 'zeroPass', 'jumpIn', 'drawToMatch', 'acid', 'lottery']) if (typeof s[k] === 'boolean') out[k] = s[k];
  if ([0, 200, 300, 500].includes(s.scoreLimit)) out.scoreLimit = s.scoreLimit;
  if ([0, 15, 30, 60].includes(s.turnTime)) out.turnTime = s.turnTime;
  if (['easy', 'normal', 'hard'].includes(s.botLevel)) out.botLevel = s.botLevel;
  if (CHAOS_LEVELS.includes(s.chaos)) out.chaos = s.chaos;
  if (DOOM_LEVELS.includes(s.doom)) out.doom = s.doom;
  if ([0, 1, 2].includes(s.events)) out.events = s.events;
  return out;
}
