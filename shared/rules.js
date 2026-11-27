// Gemeinsame Spielregeln für Server und Client.
// Karte: { id, color: 'r'|'y'|'g'|'b'|'w', kind: '0'..'9'|'skip'|'rev'|'draw2'|'wild'|'wild4' }

export const COLORS = ['r', 'y', 'g', 'b'];
export const COLOR_NAMES = { r: 'Rot', y: 'Gelb', g: 'Grün', b: 'Blau', w: 'Schwarz' };
export const COLOR_HEX = { r: '#e8364a', y: '#ffc21a', g: '#1fb35a', b: '#1f7fe8', w: '#24203a' };

export const MAX_PLAYERS = 6;

export const DEFAULT_SETTINGS = {
  theme: 'neon',        // neon | winter | garden
  handSize: 7,
  stacking: false,      // +2 auf +2, +4 auf +2/+4
  zeroPass: false,      // 0 = alle Hände wandern einen Platz in Spielrichtung weiter
  jumpIn: false,        // identische Karte außerhalb des Zuges reinwerfen
  drawToMatch: false,   // so lange ziehen, bis eine Karte passt
  scoreLimit: 500,      // 0 = ohne Limit
  turnTime: 0,          // Sekunden, 0 = aus
  botLevel: 'normal',   // easy | normal | hard
  chaos: 0,             // % Chance, dass eine gezogene Karte eine Chaos-Karte ist
  acid: true,           // Säure-Karten (je 1 pro Farbe) im Deck
  doom: 1,              // % Chance auf eine DOOM-Karte (sehr selten, sehr fies)
};

export const DOOM_LEVELS = [0, 1, 3];

/** DOOM-Karten: { id, color: 'd', kind: 'doom', effect } */
export const DOOM = {
  plus100: { name: '+100', icon: '+100', desc: 'Ein Spieler deiner Wahl zieht 100 Karten – direkt aus dem Höllenportal.', target: true },
  tornado: { name: 'Höllen-Tornado', icon: '🌪', desc: 'Alle Handkarten wirbeln durcheinander und werden gleichmäßig verteilt. Zusätzlich speit das Höllenportal 10 Karten pro Gegner in den Wirbel – die bekommen nur die anderen.' },
  hallu: { name: 'Halluzinationen', icon: '🍄', desc: 'Alle anderen halluzinieren 3 eigene Züge lang: Statt Karten sehen sie Gummienten und Essen, Quatsch-Zahlen und falsche Namen.' },
};
export const DOOM_KEYS = Object.keys(DOOM);
export const isDoom = (c) => c.kind === 'doom';
export const specialInfo = (c) => (isDoom(c) ? DOOM[c.effect] : CHAOS[c.effect]);

export const CHAOS_LEVELS = [0, 5, 10, 20, 35];

/** Chaos-Karten: { id, color: 'x', kind: 'chaos', effect } */
export const CHAOS = {
  plus50: { name: '+50', icon: '+50', desc: 'Ein Spieler deiner Wahl zieht 50 Karten.', target: true },
  skip3: { name: '3× Aussetzen', icon: '⏸', desc: 'Ein Spieler deiner Wahl setzt die nächsten 3 Runden aus.', target: true },
  swapHand: { name: 'Handtausch', icon: '⇄', desc: 'Tausche deine Hand mit einem Spieler deiner Wahl.', target: true },
  gift: { name: 'Geschenk', icon: '🎁', desc: 'Schenke einem Spieler deiner Wahl 3 zufällige Karten.', target: true },
  shuffleHands: { name: 'Kartenwirbel', icon: '🌀', desc: 'Alle Handkarten werden eingesammelt, gemischt und neu verteilt.' },
  tornado: { name: 'Tornado', icon: '🌪', desc: 'Ein Tornado wirbelt alle Handkarten durcheinander – danach hat jeder etwa gleich viele.' },
  colorShift: { name: 'Farbrotation', icon: '🎨', desc: 'Alle Farben auf allen Händen wechseln: Rot → Gelb → Grün → Blau → Rot.' },
  plus4All: { name: 'Alle +4', icon: '+4', desc: 'Alle anderen ziehen 4 Karten.' },
  dump2: { name: 'Ausmisten', icon: '🗑', desc: 'Zwei zufällige Karten aus deiner Hand verschwinden.' },
  dirChaos: { name: 'Richtungschaos', icon: '🔀', desc: '10 Züge lang wird nach jedem Zug gewürfelt: 50 % Richtungswechsel. Läuft es schon, entscheidest du: aufheben oder +10 Züge.' },
};
export const CHAOS_KEYS = Object.keys(CHAOS);
export const isChaos = (c) => c.kind === 'chaos';

export const deckSize = (settings) => 108 + (settings?.acid ? 4 : 0);

export function buildDeck(firstId = 1, { acid = false } = {}) {
  const deck = [];
  let id = firstId;
  for (const color of COLORS) {
    if (acid) deck.push({ id: id++, color, kind: 'acid' });
    deck.push({ id: id++, color, kind: '0' });
    for (let n = 1; n <= 9; n++) {
      deck.push({ id: id++, color, kind: String(n) });
      deck.push({ id: id++, color, kind: String(n) });
    }
    for (const kind of ['skip', 'rev', 'draw2']) {
      deck.push({ id: id++, color, kind });
      deck.push({ id: id++, color, kind });
    }
  }
  for (let i = 0; i < 4; i++) deck.push({ id: id++, color: 'w', kind: 'wild' });
  for (let i = 0; i < 4; i++) deck.push({ id: id++, color: 'w', kind: 'wild4' });
  return deck;
}

export function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export const isNumber = (c) => c.kind.length === 1;
export const isWild = (c) => c.color === 'w';

/** Darf `card` auf `top` gespielt werden? */
export function canPlay(card, top, currentColor, pending, settings) {
  if (!top) return true;
  if (card.kind === 'chaos' || card.kind === 'doom') return pending === 0;
  if (pending > 0) {
    if (!settings.stacking) return false;
    if (top.kind === 'draw2') return card.kind === 'draw2' || card.kind === 'wild4';
    if (top.kind === 'wild4') return card.kind === 'wild4';
    return false;
  }
  if (isWild(card)) return true;
  if (card.color === currentColor) return true;
  return card.kind === top.kind;
}

/** Identische Karte (für Reinwerfen). Jokerkarten zählen nicht. */
export function isSameCard(a, b) {
  return !!a && !!b && COLORS.includes(a.color) && a.color === b.color && a.kind === b.kind;
}

export function cardPoints(c) {
  if (isNumber(c)) return Number(c.kind);
  if (isDoom(c)) return 100;
  if (isWild(c) || isChaos(c)) return 50;
  return 20;
}

export function cardLabel(c) {
  if (isChaos(c)) return `Chaos: ${CHAOS[c.effect]?.name}`;
  if (isDoom(c)) return `DOOM: ${DOOM[c.effect]?.name}`;
  const k = { skip: 'Aussetzen', rev: 'Richtungswechsel', draw2: '+2', wild: 'Farbwahl', wild4: '+4 Farbwahl', acid: 'Säure' }[c.kind] ?? c.kind;
  return isWild(c) ? k : `${COLOR_NAMES[c.color]} ${k}`;
}
