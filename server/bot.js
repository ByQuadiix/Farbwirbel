import { canPlay, isWild, isNumber, isDoom, isSpecial, COLORS, CHAOS, DOOM } from '../shared/rules.js';

export const botDelay = (level) => ({ easy: 1300, normal: 1100, hard: 950 }[level] ?? 1100) + Math.random() * 700;
export const botCallChance = (level) => ({ easy: 0.6, normal: 0.88, hard: 1 }[level] ?? 0.88);
export const botCatchChance = (level) => ({ easy: 0.15, normal: 0.35, hard: 0.6 }[level] ?? 0.35);

const isMirror = (c) => c.kind === 'chaos' && c.effect === 'mirror';

function bestColor(hand, avoid) {
  const counts = { r: 0, y: 0, g: 0, b: 0 };
  for (const c of hand) if (counts[c.color] != null) counts[c.color] += 1 + (isNumber(c) ? 0 : 0.5);
  const options = COLORS.filter((c) => c !== avoid);
  const max = Math.max(...options.map((c) => counts[c]));
  if (max === 0) return options[Math.floor(Math.random() * options.length)];
  const best = options.filter((c) => counts[c] === max);
  return best[Math.floor(Math.random() * best.length)];
}

/** Farbe, von der wir am wenigsten haben (für Eiszeit – trifft uns selbst am wenigsten). */
function weakestColor(hand) {
  const counts = COLORS.map((c) => ({ c, n: hand.filter((x) => x.color === c).length }));
  const min = Math.min(...counts.map((x) => x.n));
  const opts = counts.filter((x) => x.n === min);
  return opts[Math.floor(Math.random() * opts.length)].c;
}

/**
 * Entscheidet den nächsten Zug eines Bots.
 * Gibt eine Client-Nachricht zurück: {t:'play'|'draw'|'pass'|'challenge'|'mirror', ...}
 */
export function botDecide(room, bot, level) {
  const g = room.game;
  const s = room.settings;
  const top = room.top();
  const hand = bot.hand;
  const idx = room.indexOf(bot);
  const next = room.players[room.nextIndex(idx)];
  const others = room.players.filter((p) => p !== bot);
  const restrict = room.restrictFor(bot);

  const fewest = others.reduce((m, p) => (p.hand.length < m.hand.length ? p : m), others[0]);
  const fewestWith2 = others.filter((p) => p.hand.length >= 2).reduce((m, p) => (!m || p.hand.length < m.hand.length ? p : m), null);
  const avgOthers = others.reduce((sum, p) => sum + p.hand.length, 0) / others.length;

  // Angriff zurückspiegeln? Fast immer ja.
  if (g.awaiting?.type === 'mirror') {
    return { t: 'mirror', use: level !== 'easy' || Math.random() < 0.7 };
  }

  // Wert einer Chaos-/DOOM-Karte aus Sicht des Bots (negativ = lieber nicht spielen)
  const chaosValue = (c) => {
    const handAfter = hand.length - 1;
    if (isDoom(c)) {
      switch (c.effect) {
        case 'plus100': return 120;
        case 'meteor': return 65;
        case 'curse': return 50;
        case 'tornado': return handAfter > avgOthers - 3 ? 70 : -100;
        case 'pact': return handAfter >= 4 && handAfter <= 12 ? 45 : -100;
        case 'hallu': return 22;
        default: return 0;
      }
    }
    switch (c.effect) {
      case 'mirror': return g.pending > 0 ? 80 : -100;
      case 'dirChaos': return 6;
      case 'plus50': return 60;
      case 'plus4All': return 35;
      case 'skip3': return 30;
      case 'dump2': return 28;
      case 'gift': return 26;
      case 'bomb': return 18;
      case 'freeze': return 14;
      case 'thief': return fewestWith2 && fewestWith2.hand.length <= 3 ? 20 : 5;
      case 'xray': return 3;
      case 'swapHand': return handAfter - fewest.hand.length >= 2 ? 45 : -100;
      case 'shuffleHands': return handAfter > avgOthers + 1 ? 25 : -100;
      case 'tornado': return handAfter > avgOthers + 1.5 ? 32 : -100;
      case 'colorShift': return 4;
      default: return 0;
    }
  };

  const withExtras = (card) => {
    const a = { t: 'play', cardId: card.id };
    if (isSpecial(card)) {
      const info = isDoom(card) ? DOOM[card.effect] : CHAOS[card.effect];
      if (info?.target) {
        let tgt = level === 'easy' ? others[Math.floor(Math.random() * others.length)] : fewest;
        if (card.effect === 'thief') tgt = fewestWith2 ?? tgt;
        a.target = tgt.id;
      }
      if (info?.color) a.color = weakestColor(hand.filter((c) => c !== card));
      if (card.effect === 'dirChaos' && g.dirChaos > 0) a.dirChoice = Math.random() < 0.5 ? 'cancel' : 'extend';
      return a;
    }
    if (isWild(card)) {
      a.color = level === 'easy' && Math.random() < 0.4
        ? COLORS.filter((c) => c !== g.frozen?.color)[Math.floor(Math.random() * (g.frozen ? 3 : 4))]
        : bestColor(hand.filter((c) => c !== card), g.frozen?.color);
    }
    return a;
  };

  // +4 anzweifeln? (oder zurückspiegeln / draufstapeln)
  if (g.awaiting?.type === 'challenge') {
    const mirror = hand.find(isMirror);
    if (mirror && (level !== 'easy' || Math.random() < 0.6)) return withExtras(mirror);
    if (s.stacking) {
      const w4 = hand.find((c) => c.kind === 'wild4');
      if (w4) return withExtras(w4);
    }
    const offender = room.byId(g.awaiting.offender);
    let chance = { easy: 0.15, normal: 0.3, hard: 0.25 }[level] ?? 0.3;
    if (level === 'hard') chance = offender.hand.length >= 5 ? 0.55 : offender.hand.length <= 2 ? 0.1 : 0.3;
    return { t: 'challenge', challenge: Math.random() < chance };
  }

  if (g.awaiting?.type === 'drawn') {
    const c = hand.find((x) => x.id === g.awaiting.cardId);
    if (c && isSpecial(c) && level !== 'easy' && chaosValue(c) < 0) return { t: 'pass' };
    if (c && !(level === 'hard' && c.kind === 'wild4' && hand.length > 3)) return withExtras(c);
    return { t: 'pass' };
  }

  const playable = hand.filter((c) => canPlay(c, top, g.color, g.pending, s, restrict)
    && !(c.effect === 'thief' && !fewestWith2));
  if (!playable.length) return { t: 'draw' };

  if (level === 'easy') return withExtras(playable[Math.floor(Math.random() * playable.length)]);

  const danger = next.hand.length <= 2;
  const minOpp = Math.min(...others.map((p) => p.hand.length));
  const colorCount = (col) => hand.filter((c) => c.color === col).length;

  const score = (c) => {
    if (isSpecial(c)) return chaosValue(c) + Math.random() * 4;
    let v = 0;
    if (isNumber(c)) v = 10 + Number(c.kind) * 0.3;
    else if (c.kind === 'acid') v = 12 + (colorCount(c.color) - 1) * 7; // je mehr gleiche Farbe, desto besser
    else if (c.kind === 'lottery') v = 14;
    else if (c.kind === 'skip' || c.kind === 'rev') v = danger ? 30 : 12;
    else if (c.kind === 'draw2') v = danger ? 35 : 13;
    else if (c.kind === 'wild') v = minOpp <= 1 ? 20 : 3;
    else if (c.kind === 'wild4') v = danger ? 40 : 1;
    if (!isWild(c)) v += colorCount(c.color) * (level === 'hard' ? 1.5 : 1);
    // Farbwechsel weg von Farben, die wir kaum haben
    if (!isWild(c) && c.color !== g.color) v += colorCount(c.color) - colorCount(g.color);
    // Nasse Farbe (Regen) zählt am Ende doppelt – lieber loswerden
    if (g.wet && c.color === g.wet) v += 4;
    if (level === 'hard' && c.kind === '0' && s.zeroPass) {
      // Wir bekommen die Hand des Spielers vor uns – lohnt sich, wenn die kleiner ist als unsere
      const prev = room.players[room.nextIndex(idx, -1)];
      v += hand.length - 1 - prev.hand.length > 1 ? 20 : -5;
    }
    return v + Math.random() * (level === 'hard' ? 0.5 : 3);
  };

  playable.sort((a, b) => score(b) - score(a));
  // Nur noch "schlechte" Chaos-Karten spielbar → lieber ziehen
  if (isSpecial(playable[0]) && chaosValue(playable[0]) < 0) return { t: 'draw' };
  return withExtras(playable[0]);
}
