import '@fontsource/fredoka/500.css';
import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';
import './style.css';
import { Vector3 } from 'three';
import { Stage } from './stage.js';
import { Board } from './board.js';
import { Net, store } from './net.js';
import { sfx, isMuted, setMuted } from './audio.js';
import { initCards, faceDataUrl } from './cards.js';
import { rulesHtml } from './rules.js';
import {
  COLORS, COLOR_NAMES, COLOR_HEX, PLAYER_LIMIT, PLAYER_MIN, AVATARS, CHAOS, CHAOS_LEVELS, DOOM, DOOM_LEVELS,
  EVENT_LEVELS, WHEEL, THEME_EVENTS, specialInfo,
} from '../../shared/rules.js';

// Halluzinationen: Quatsch statt echter Infos
const SILLY_NAMES = ['Herr Toast', 'Karl der Löffel', 'Frau Gurke', 'Sir Quietschi', 'Der Kühlschrank', 'Tante Pudding', 'Bernd Brot', 'Lord Socke', 'Kaktus-Klaus', 'Pommes-Paula', 'Der Mond', 'Wackelpeter', 'Oma Turbo', 'Käpt’n Keks'];
const SILLY_COUNTS = ['🍌×7', '∞', '-3', 'Dienstag', 'ja', 'zu viele', '🦆', '3,14', 'blau', '42', '½', 'nö', '🍕🍕', '???', 'Pi mal Daumen', '0,5 Enten'];
const SILLY_AVATARS = ['🦆', '🍕', '🍌', '🐟', '🍩', '🌭', '🥒', '🧀', '🦄', '👽', '🧦', '🍄', '🥨', '🐙', '🎺', '🪿'];
const rndOf = (a) => a[Math.floor(Math.random() * a.length)];

const EMOTES = ['👍', '😂', '😱', '😡', '🎉', '🙏'];
const THEMES = [['neon', 'Neon-Arena'], ['winter', 'Winter'], ['garden', 'Garten']];

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const state = {
  connected: false,
  welcomed: false,
  view: null,
  pick: null, // {type:'color'|'swap', card}
  timeOffset: 0,
  lastActor: null,
  name: store.get('fw.name', ''),
  avatar: store.get('fw.avatar') || AVATARS[Math.floor(Math.random() * AVATARS.length)],
  joinCode: new URLSearchParams(location.search).get('room')?.toUpperCase() ?? '',
  debug: false,
  debugOpen: store.get('fw.debugOpen') === '1',
  debugTarget: null, // null = ich selbst
  debugColor: 'r',
  debugKind: '7',
};
store.set('fw.avatar', state.avatar);

// ---------- 3D ----------

const stage = new Stage(document.getElementById('stage'));
initCards(stage.renderer);
stage.setTheme(store.get('fw.theme', 'neon'));
const board = new Board(stage, { onCardClick, onPileClick, onHover: showTip, onShake: shake });

function shake() {
  document.body.classList.remove('shake');
  void document.body.offsetWidth;
  document.body.classList.add('shake');
  setTimeout(() => document.body.classList.remove('shake'), 900);
}
window.__fw = { stage, board, state, send: (m) => net.send(m), doomAlert: (...a) => doomAlert(...a) };

// ---------- DOM-Gerüst ----------

const ui = document.getElementById('ui');
ui.innerHTML = `
  <div id="screen"></div>
  <div id="hud" hidden>
    <div class="topbar">
      <div class="chips" id="chips"></div>
      <div class="tools">
        <button class="icon-btn debug-btn" data-act="debugToggle" id="btn-debug" title="Debug-Menü" aria-label="Debug-Menü" hidden>🛠</button>
        <button class="icon-btn" data-act="rules" title="Regeln & Karten" aria-label="Regeln und Karten">?</button>
        <button class="icon-btn" data-act="sound" id="btn-sound" title="Ton an/aus" aria-label="Ton an/aus"></button>
        <button class="icon-btn" data-act="fullscreen" title="Vollbild" aria-label="Vollbild">⛶</button>
        <button class="icon-btn" data-act="leave" title="Spiel verlassen" aria-label="Spiel verlassen">✕</button>
      </div>
    </div>
    <div id="banner" class="banner"></div>
    <div id="seats"></div>
    <div id="me" class="me-panel"></div>
    <div id="emotes" class="emotes">${EMOTES.map((e) => `<button data-act="emote" data-e="${e}" aria-label="Emote ${e}">${e}</button>`).join('')}</div>
    <div id="actions" class="actions"></div>
    <div id="decision"></div>
    <div id="tip" class="tip" hidden></div>
    <div id="debug"></div>
  </div>
  <div id="fx"></div>
  <div id="modal"></div>
  <div id="rules"></div>
  <div id="alert"></div>
  <div id="toasts"></div>
  <div id="conn" class="conn" hidden>Verbinde mit Server …</div>
`;
const $ = (id) => document.getElementById(id);

// ---------- Netzwerk ----------

// Verbindung erst nach dem Laden der Schrift, damit die Kartentexturen sie nutzen.
let net = { send() {} };
const connect = () => {
  net = new Net(onMessage, (s) => {
    state.connected = s === 'online';
    $('conn').hidden = state.connected;
  });
};
Promise.race([
  Promise.all(['500', '700'].map((w) => document.fonts?.load(`${w} 100px Fredoka`))),
  new Promise((r) => setTimeout(r, 2500)),
]).finally(connect);

function onMessage(msg) {
  switch (msg.t) {
    case 'welcome':
      state.welcomed = true;
      state.debug = !!msg.debug;
      if (!state.name && msg.name !== 'Spieler') state.name = msg.name;
      render();
      break;
    case 'noroom':
      state.view = null;
      state.pick = null;
      board.sync({ phase: 'lobby', players: [], hand: [] });
      render();
      break;
    case 'room':
      onRoom(msg);
      break;
    case 'error':
      toast(msg.msg, 'error');
      sfx('error');
      break;
    case 'xray':
      showXray(msg);
      break;
  }
}

/** Röntgenblick: Karten eines Gegners für ein paar Sekunden zeigen (nur für dich). */
function showXray(msg) {
  sfx('xray');
  const el = document.createElement('div');
  el.className = 'xray panel';
  const secs = Math.round((msg.ms ?? 5000) / 1000);
  el.innerHTML = `<div class="xray-head">👁 Röntgenblick: <b>${esc(msg.name)}</b> <span class="xray-timer">${secs}</span></div>
    <div class="xray-cards">${msg.cards.map((c) => `<img src="${faceDataUrl(c)}" alt="" />`).join('') || '<i>keine Karten</i>'}</div>`;
  $('alert').appendChild(el);
  let left = secs;
  const iv = setInterval(() => {
    left--;
    const t = el.querySelector('.xray-timer');
    if (t) t.textContent = String(Math.max(0, left));
    if (left <= 0) { clearInterval(iv); el.classList.add('out'); setTimeout(() => el.remove(), 400); }
  }, 1000);
}

function onRoom(v) {
  const prev = state.view;
  state.view = v;
  if (v.game) state.timeOffset = v.game.serverNow - Date.now();
  if (v.settings.theme !== stage.themeName) {
    stage.setTheme(v.settings.theme);
    store.set('fw.theme', v.settings.theme);
  }
  if (prev?.code !== v.code) history.replaceState(null, '', `?room=${v.code}`);
  if (v.phase !== 'playing') state.pick = null;
  if (state.pick && !v.hand.some((c) => c.id === state.pick.card.id)) state.pick = null;

  board.sync(v, v.events);
  // Stromausfall: verbleibende Zeit vom Server übernehmen (auch nach Neuladen)
  const g = v.game;
  if (g?.blackoutUntil && g.blackoutUntil > g.serverNow) {
    const secs = (g.blackoutUntil - g.serverNow) / 1000;
    board.setBlackout(secs);
    document.body.classList.add('blackout');
    clearTimeout(state.blackoutTimer);
    state.blackoutTimer = setTimeout(() => { document.body.classList.remove('blackout'); render(); }, secs * 1000);
  }
  handleEvents(v, prev);
  const actor = v.game?.actorId;
  if (v.phase === 'playing' && actor === v.me && state.lastActor !== v.me) sfx('turn');
  state.lastActor = actor;
  render();
}

// ---------- Aktionen ----------

function onCardClick(card) {
  const v = state.view;
  if (!v || v.phase !== 'playing' || state.pick) return;
  if (!v.playable.includes(card.id)) {
    board.shake(card.id);
    sfx('error');
    if (v.game.actorId !== v.me) toast('Du bist gerade nicht dran.');
    else if (v.game.awaiting?.type === 'drawn') toast('Du kannst nur die gezogene Karte spielen – oder sie behalten.');
    else if (v.game.pending > 0) toast(`Stapeln oder ${v.game.pending} Karten ziehen.`);
    return;
  }
  if (card.kind === 'chaos' || card.kind === 'doom') {
    if (card.effect === 'dirChaos' && v.game.dirChaos > 0) { state.pick = { type: 'dir', card }; sfx('click'); return render(); }
    if (specialInfo(card)?.target) { state.pick = { type: 'swap', card }; sfx('click'); return render(); }
    if (specialInfo(card)?.color) { state.pick = { type: 'color', card }; sfx('click'); return render(); }
    return net.send({ t: 'play', cardId: card.id });
  }
  if (card.color === 'w') { state.pick = { type: 'color', card }; sfx('click'); return render(); }
  net.send({ t: 'play', cardId: card.id });
}

function onPileClick() {
  const v = state.view;
  if (!v || v.phase !== 'playing' || state.pick) return;
  if (v.game.actorId !== v.me) { toast('Du bist gerade nicht dran.'); return sfx('error'); }
  if (v.game.awaiting?.type === 'drawn') return toast('Spiele die gezogene Karte oder behalte sie.');
  net.send({ t: 'draw' });
}

function showTip(card) {
  const el = $('tip');
  if ((card?.kind === 'chaos' || card?.kind === 'doom') && !state.pick && !board.isBlackout()) {
    const fx = specialInfo(card);
    el.innerHTML = `<b>${card.kind === 'doom' ? '☠ DOOM' : 'Chaos'}: ${esc(fx.name)}</b><span>${esc(fx.desc)}</span>`;
    el.classList.toggle('doom', card.kind === 'doom');
    el.hidden = false;
  } else {
    el.hidden = true;
  }
}

function profile() {
  store.set('fw.name', state.name);
  store.set('fw.avatar', state.avatar);
  net.send({ t: 'profile', name: state.name || 'Spieler', avatar: state.avatar });
}

function toggleRules(open = !$('rules').innerHTML) {
  $('rules').innerHTML = open ? rulesHtml(state.view?.settings ?? null) : '';
  if (open) $('rules').querySelector('.rules-head .icon-btn')?.focus();
}

ui.addEventListener('click', (e) => {
  // Sprungmarken in der Regel-Seite: scrollen, ohne die URL zu ändern
  const navLink = e.target.closest('.rules-nav a');
  if (navLink) {
    e.preventDefault();
    $('rules').querySelector(navLink.getAttribute('href'))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  const b = e.target.closest('[data-act]');
  if (!b || b.disabled) return;
  const act = b.dataset.act;
  const v = state.view;
  switch (act) {
    case 'avatar': state.avatar = b.dataset.av; store.set('fw.avatar', state.avatar); sfx('pop'); return render();
    case 'quick': profile(); sfx('click'); return net.send({ t: 'quick', bots: 3, theme: store.get('fw.theme', 'neon'), chaos: Number(store.get('fw.chaos', '0')) });
    case 'quickChaos': store.set('fw.chaos', b.dataset.val); sfx('click'); return render();
    case 'create': profile(); sfx('click'); return net.send({ t: 'create' });
    case 'join': {
      const code = ($('join-code')?.value || '').trim().toUpperCase();
      if (code.length !== 4) { toast('Der Raumcode hat 4 Buchstaben.', 'error'); return $('join-code')?.focus(); }
      profile(); sfx('click');
      return net.send({ t: 'join', code });
    }
    case 'copy': return copyLink();
    case 'addBot': sfx('pop'); return net.send({ t: 'addBot' });
    case 'fillBots': sfx('pop'); return net.send({ t: 'fillBots' });
    case 'clearBots': sfx('click'); return net.send({ t: 'clearBots' });
    case 'removeBot': return net.send({ t: 'removeBot', id: Number(b.dataset.id) });
    case 'set': {
      let val = b.dataset.val;
      if (/^\d+$/.test(val)) val = Number(val);
      sfx('click');
      return net.send({ t: 'settings', settings: { [b.dataset.key]: val } });
    }
    case 'start': sfx('click'); return net.send({ t: 'start' });
    case 'leave':
      if (v?.phase === 'playing' && !confirm('Spiel wirklich verlassen? Ein Bot übernimmt deinen Platz.')) return;
      history.replaceState(null, '', location.pathname);
      return net.send({ t: 'leave' });
    case 'sound': setMuted(!isMuted()); return render();
    case 'fullscreen':
      if (document.fullscreenElement) document.exitFullscreen?.();
      else document.documentElement.requestFullscreen?.().catch(() => {});
      return;
    case 'callLast': sfx('call'); return net.send({ t: 'callLast' });
    case 'draw': return onPileClick();
    case 'pass': return net.send({ t: 'pass' });
    case 'challenge': return net.send({ t: 'challenge', challenge: true });
    case 'accept': return net.send({ t: 'challenge', challenge: false });
    case 'mirrorUse': sfx('mirror'); return net.send({ t: 'mirror', use: true });
    case 'mirrorSkip': return net.send({ t: 'mirror', use: false });
    case 'mirrorPlay': {
      // Spiegel gegen +4 / Stapel im eigenen Zug
      const m = state.view?.hand.find((c) => c.kind === 'chaos' && c.effect === 'mirror');
      if (m) { sfx('mirror'); net.send({ t: 'play', cardId: m.id }); }
      return;
    }
    case 'debugEvent': sfx('pop'); return net.send({ t: 'debugEvent', kind: b.dataset.kind });
    case 'catch': return net.send({ t: 'catch', target: Number(b.dataset.id) });
    case 'color': {
      const card = state.pick?.card;
      state.pick = null;
      render();
      if (card) net.send({ t: 'play', cardId: card.id, color: b.dataset.color });
      return;
    }
    case 'swapTarget': {
      const card = state.pick?.card;
      state.pick = null;
      render();
      if (card) net.send({ t: 'play', cardId: card.id, target: Number(b.dataset.id) });
      return;
    }
    case 'cancelPick': state.pick = null; return render();
    case 'dirChoice': {
      const card = state.pick?.card;
      state.pick = null;
      render();
      if (card) net.send({ t: 'play', cardId: card.id, dirChoice: b.dataset.val });
      return;
    }
    case 'rules': sfx('click'); return toggleRules();
    case 'rulesBackdrop': if (e.target === b) toggleRules(false); return;
    case 'debugToggle':
      state.debugOpen = !state.debugOpen;
      store.set('fw.debugOpen', state.debugOpen ? '1' : '0');
      return render();
    case 'debugTarget': state.debugTarget = b.dataset.id ? Number(b.dataset.id) : null; return render();
    case 'debugColor': state.debugColor = b.dataset.val; return render();
    case 'debugGive': {
      let cards;
      try { cards = JSON.parse(b.dataset.cards); } catch { return; }
      sfx('pop');
      return net.send({ t: 'debugGive', cards, target: state.debugTarget ?? undefined });
    }
    case 'debugCustom': {
      const kind = $('debug-kind')?.value ?? '7';
      const n = Math.max(1, Math.min(10, Number($('debug-n')?.value) || 1));
      state.debugKind = kind;
      sfx('pop');
      return net.send({ t: 'debugGive', cards: Array.from({ length: n }, () => ({ color: state.debugColor, kind })), target: state.debugTarget ?? undefined });
    }
    case 'emote': return net.send({ t: 'emote', emote: b.dataset.e });
    case 'nextRound': return net.send({ t: 'nextRound' });
    case 'toLobby': return net.send({ t: 'toLobby' });
  }
});

ui.addEventListener('change', (e) => {
  const el = e.target;
  if (el.id === 'name') { state.name = el.value.trim().slice(0, 16); store.set('fw.name', state.name); if (state.view) profile(); }
  if (el.id === 'debug-kind') state.debugKind = el.value;
  if (el.id === 'debug-n') state.debugN = Math.max(1, Math.min(10, Number(el.value) || 1));
  if (el.dataset.toggle) net.send({ t: 'settings', settings: { [el.dataset.toggle]: el.checked } });
  if (el.dataset.select) net.send({ t: 'settings', settings: { [el.dataset.select]: Number(el.value) } });
});
ui.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.id === 'join-code') ui.querySelector('[data-act="join"]')?.click();
  if (e.key === 'Enter' && e.target.id === 'name') e.target.blur();
});
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && $('rules').innerHTML) { toggleRules(false); return; }
  if (e.target.matches('input, select, textarea')) return;
  if ($('rules').innerHTML) return; // Regeln offen: keine Spiel-Tastenkürzel
  const v = state.view;
  if (!v || v.phase !== 'playing') return;
  if (e.key === 'Escape' && state.pick) { state.pick = null; render(); }
  if (e.key === ' ' || e.key.toLowerCase() === 'd') { e.preventDefault(); onPileClick(); }
  if (e.key.toLowerCase() === 'l') net.send({ t: 'callLast' });
  // Karten per Tastatur auswählen: ←/→ Karte, ↑/↓ Reihe (bei großer Hand), Enter spielen
  if (state.pick || e.target.closest?.('button, [role="button"]')) return;
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); board.moveHover(e.key === 'ArrowRight' ? 1 : -1); }
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); board.moveHoverRow(e.key === 'ArrowUp' ? 1 : -1); }
  if (e.key === 'Enter') {
    const card = board.hoveredCard();
    if (card) { e.preventDefault(); onCardClick(card); }
  }
});

async function copyLink() {
  const url = `${location.origin}/?room=${state.view.code}`;
  try {
    await navigator.clipboard.writeText(url);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = url;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch {}
    ta.remove();
  }
  toast('Einladungslink kopiert!');
}

// ---------- Rendering ----------

function render() {
  const v = state.view;
  const inGame = v && v.phase !== 'lobby';
  $('hud').hidden = !inGame;
  if (!v) renderStart();
  else if (v.phase === 'lobby') renderLobby(v);
  else $('screen').innerHTML = '';
  if (inGame) renderHud(v);
  renderModal(v);
  renderDebug(v);
  $('btn-sound').textContent = isMuted() ? '🔇' : '🔊';
}

// ---------- Debug-Menü (nur wenn der Server mit FW_DEBUG=1 läuft) ----------

const DEBUG_KIND_LABELS = [['0', '0'], ['1', '1'], ['2', '2'], ['3', '3'], ['4', '4'], ['5', '5'], ['6', '6'], ['7', '7'], ['8', '8'], ['9', '9'],
  ['skip', 'Aussetzen'], ['rev', 'Richtungswechsel'], ['draw2', '+2'], ['acid', 'Säure'], ['lottery', 'Lotterie']];

function renderDebug(v) {
  const show = state.debug && v && v.phase !== 'lobby';
  $('btn-debug').hidden = !state.debug;
  $('btn-debug').classList.toggle('on', state.debugOpen);
  document.body.classList.toggle('debug-open', !!(show && state.debugOpen));
  if (!show || !state.debugOpen) { $('debug').innerHTML = ''; state.debugKey = ''; return; }
  const playing = v.phase === 'playing';
  if (state.debugTarget && !v.players.some((p) => p.id === state.debugTarget)) state.debugTarget = null;
  // Nur neu zeichnen, wenn sich etwas Relevantes geändert hat (sonst schließt sich z. B. das Dropdown bei jedem Zug)
  const key = JSON.stringify([playing, state.debugTarget, state.debugColor, v.me, v.players.map((p) => [p.id, p.name, p.avatar])]);
  if (key === state.debugKey) return;
  state.debugKey = key;
  const give = (cards, label, cls = '', style = '') =>
    `<button class="dbg-card ${cls}" style="${style}" data-act="debugGive" data-cards='${esc(JSON.stringify(cards))}' ${playing ? '' : 'disabled'}>${label}</button>`;
  const targets = v.players.map((p) => {
    const sel = (state.debugTarget ?? v.me) === p.id;
    return `<button class="${sel ? 'sel' : ''}" data-act="debugTarget" data-id="${p.id === v.me ? '' : p.id}">${p.avatar} ${p.id === v.me ? 'Du' : esc(p.name)}</button>`;
  }).join('');
  $('debug').innerHTML = `
    <div class="debug-panel panel">
      <div class="dbg-head"><b>🛠 Debug</b><button class="icon-btn small" data-act="debugToggle" aria-label="Debug-Menü schließen">✕</button></div>
      ${playing ? '' : '<p class="dbg-note">Karten gibt es nur während einer laufenden Runde.</p>'}
      <div class="dbg-sec"><span>Empfänger</span><div class="seg dbg-targets">${targets}</div></div>
      <div class="dbg-sec"><span>Säure</span><div class="dbg-row">
        ${COLORS.map((c) => give([{ color: c, kind: 'acid' }], `💧 ${COLOR_NAMES[c]}`, 'colored', `--c:${COLOR_HEX[c]}`)).join('')}
        ${give(COLORS.map((c) => ({ color: c, kind: 'acid' })), 'Alle 4')}
      </div></div>
      <div class="dbg-sec"><span>Lotterie</span><div class="dbg-row">
        ${COLORS.map((c) => give([{ color: c, kind: 'lottery' }], `🎲 ${COLOR_NAMES[c]}`, 'colored', `--c:${COLOR_HEX[c]}`)).join('')}
      </div></div>
      <div class="dbg-sec"><span>Tisch-Ereignis auslösen</span><div class="dbg-row">
        ${[['wheel', '🎡 Glücksrad'], ['ice', '🧊 Glatteis'], ['blackout', '🔌 Stromausfall'], ['rain', '🌧 Regen']].map(([k, l]) => `<button class="dbg-card" data-act="debugEvent" data-kind="${k}" ${playing ? '' : 'disabled'}>${l}</button>`).join('')}
      </div></div>
      <div class="dbg-sec"><span>Chaos-Karten</span><div class="dbg-grid">
        ${Object.entries(CHAOS).map(([k, fx]) => give([{ kind: 'chaos', effect: k }], `<i>${esc(fx.icon)}</i>${esc(fx.name)}`, 'chaos')).join('')}
      </div></div>
      <div class="dbg-sec"><span>☠ DOOM-Karten</span><div class="dbg-grid">
        ${Object.entries(DOOM).map(([k, fx]) => give([{ kind: 'doom', effect: k }], `<i>${esc(fx.icon)}</i>${esc(fx.name)}`, 'doom')).join('')}
      </div></div>
      <div class="dbg-sec"><span>Joker</span><div class="dbg-row">
        ${give([{ kind: 'wild' }], '🌈 Farbwahl')}
        ${give([{ kind: 'wild4' }], '+4 Farbwahl')}
      </div></div>
      <div class="dbg-sec"><span>Eigene Karte</span>
        <div class="dbg-row">${COLORS.map((c) => `<button class="dbg-swatch ${state.debugColor === c ? 'sel' : ''}" style="--c:${COLOR_HEX[c]}" data-act="debugColor" data-val="${c}" aria-label="${COLOR_NAMES[c]}"></button>`).join('')}</div>
        <div class="dbg-row">
          <select id="debug-kind" aria-label="Kartenart">${DEBUG_KIND_LABELS.map(([k, l]) => `<option value="${k}" ${k === state.debugKind ? 'selected' : ''}>${l}</option>`).join('')}</select>
          <input id="debug-n" type="number" min="1" max="10" value="${state.debugN ?? 1}" aria-label="Anzahl" />
          <button class="btn primary small" data-act="debugCustom" ${playing ? '' : 'disabled'}>Geben</button>
        </div>
      </div>
    </div>`;
}

function logo(small = false) {
  const letters = 'FARBWIRBEL'.split('');
  const cols = ['r', 'y', 'g', 'b'];
  return `<h1 class="logo ${small ? 'small' : ''}" aria-label="Farbwirbel">${letters.map((l, i) => `<span style="--c:${COLOR_HEX[cols[i % 4]]};--i:${i}">${l}</span>`).join('')}</h1>`;
}

function renderStart() {
  const focused = document.activeElement?.id;
  $('screen').innerHTML = `
    <div class="start">
      ${logo()}
      <p class="tagline">Das bunte 3D-Kartenspiel – mit Freunden oder gegen Bots</p>
      <div class="panel start-panel">
        <label class="field">
          <span>Dein Name</span>
          <input id="name" maxlength="16" placeholder="z. B. Lukas" value="${esc(state.name)}" autocomplete="nickname" />
        </label>
        <div class="field">
          <span>Avatar</span>
          <div class="avatars">${AVATARS.map((a) => `<button data-act="avatar" data-av="${a}" class="${a === state.avatar ? 'sel' : ''}" aria-label="Avatar ${a}">${a}</button>`).join('')}</div>
        </div>
        <div class="field">
          <span>Chaos-Karten im schnellen Spiel</span>
          <div class="seg full">${CHAOS_LEVELS.map((l) => `<button data-act="quickChaos" data-val="${l}" class="${String(l) === store.get('fw.chaos', '0') ? 'sel' : ''}">${l ? `${l} %` : 'Aus'}</button>`).join('')}</div>
        </div>
        <button class="btn primary big" data-act="quick" ${state.welcomed ? '' : 'disabled'}>▶ Schnelles Spiel gegen 3 Bots</button>
        <div class="row">
          <button class="btn secondary" data-act="create" ${state.welcomed ? '' : 'disabled'}>Raum erstellen</button>
        </div>
        <div class="divider"><span>oder Raum beitreten</span></div>
        <div class="row join">
          <label class="field grow">
            <span>Raumcode</span>
            <input id="join-code" maxlength="4" placeholder="ABCD" value="${esc(state.joinCode)}" autocapitalize="characters" spellcheck="false" />
          </label>
          <button class="btn ${state.joinCode ? 'primary' : 'secondary'}" data-act="join" ${state.welcomed ? '' : 'disabled'}>Beitreten</button>
        </div>
        <button class="btn ghost" data-act="rules">📖 Regeln &amp; Karten</button>
      </div>
    </div>`;
  if (focused) $(focused)?.focus();
  $('join-code')?.addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, ''); state.joinCode = e.target.value; });
}

function seg(key, value, options, enabled) {
  return `<div class="seg">${options.map(([val, label]) => `<button data-act="set" data-key="${key}" data-val="${val}" class="${String(value) === String(val) ? 'sel' : ''}" ${enabled ? '' : 'disabled'}>${label}</button>`).join('')}</div>`;
}

function toggle(key, value, title, desc, enabled) {
  return `<label class="toggle ${enabled ? '' : 'disabled'}">
    <input type="checkbox" data-toggle="${key}" ${value ? 'checked' : ''} ${enabled ? '' : 'disabled'} />
    <span class="switch"></span>
    <span class="tl"><b>${title}</b><small>${desc}</small></span>
  </label>`;
}

function renderLobby(v) {
  const isHost = v.hostId === v.me;
  const s = v.settings;
  const max = s.maxPlayers;
  const free = Math.max(0, max - v.players.length);
  const slots = v.players.map((p) => `<li class="slot">
        <span class="av">${p.avatar}</span>
        <span class="nm">${esc(p.name)}</span>
        ${p.id === v.hostId ? '<span class="badge host">Host</span>' : ''}
        ${p.id === v.me ? '<span class="badge you">Du</span>' : ''}
        ${p.isBot ? '<span class="badge bot">Bot</span>' : ''}
        ${!p.connected ? '<span class="badge off">offline</span>' : ''}
        ${isHost && p.isBot ? `<button class="icon-btn small" data-act="removeBot" data-id="${p.id}" title="Bot entfernen" aria-label="Bot ${esc(p.name)} entfernen">✕</button>` : ''}
      </li>`);
  // Freie Plätze nicht einzeln auflisten (bei 20 Plätzen zu lang) – eine Zeile mit Aktionen
  if (free > 0) {
    slots.push(`<li class="slot empty">
      <span>${free} ${free === 1 ? 'Platz' : 'Plätze'} frei</span>
      ${isHost ? `<button class="btn ghost small" data-act="addBot">+ Bot</button>${free > 1 ? `<button class="btn ghost small" data-act="fillBots">Alle mit Bots füllen</button>` : ''}` : ''}
    </li>`);
  }
  const botCount = v.players.filter((p) => p.isBot).length;
  const stepBtn = (val, label, aria) => `<button data-act="set" data-key="maxPlayers" data-val="${val}" aria-label="${aria}" ${isHost && val >= Math.max(PLAYER_MIN, v.players.length) && val <= PLAYER_LIMIT ? '' : 'disabled'}>${label}</button>`;
  $('screen').innerHTML = `
    <div class="lobby">
      <div class="lobby-head">
        ${logo(true)}
        <div class="code-box">
          <span>Raumcode</span>
          <b>${v.code}</b>
          <button class="btn secondary small" data-act="copy">Link kopieren</button>
        </div>
      </div>
      <div class="lobby-grid">
        <section class="panel">
          <h2>Spieler <small>${v.players.length}/${max}</small></h2>
          <ul class="slots">${slots.join('')}</ul>
          ${isHost && botCount > 1 ? '<button class="btn ghost small clear-bots" data-act="clearBots">Alle Bots entfernen</button>' : ''}
          <p class="hint">Teile den Code oder Link mit Freunden im selben Netzwerk. Leere Plätze kannst du mit Bots füllen.</p>
        </section>
        <section class="panel settings">
          <h2>Einstellungen ${isHost ? '' : '<small>(nur Host)</small>'}</h2>
          <div class="set"><span>Spielerplätze</span>
            <div class="stepper">
              ${stepBtn(max - 1, '−', 'Einen Platz weniger')}
              <b>${max}</b>
              ${stepBtn(max + 1, '+', 'Einen Platz mehr')}
            </div>
          </div>
          <div class="set"><span>Tisch</span>${seg('theme', s.theme, THEMES, isHost)}</div>
          <div class="set"><span>Bot-Stärke</span>${seg('botLevel', s.botLevel, [['easy', 'Leicht'], ['normal', 'Normal'], ['hard', 'Schwer']], isHost)}</div>
          <div class="set"><span>Startkarten</span>${seg('handSize', s.handSize, [[5, '5'], [7, '7'], [10, '10']], isHost)}</div>
          <div class="set"><span>Punkteziel</span>${seg('scoreLimit', s.scoreLimit, [[0, 'Aus'], [200, '200'], [300, '300'], [500, '500']], isHost)}</div>
          <div class="set"><span>Zugzeit</span>${seg('turnTime', s.turnTime, [[0, 'Aus'], [15, '15 s'], [30, '30 s'], [60, '60 s']], isHost)}</div>
          <div class="set chaos-set"><span>Chaos-Karten</span>${seg('chaos', s.chaos, CHAOS_LEVELS.map((l) => [l, l ? `${l} %` : 'Aus']), isHost)}</div>
          <p class="hint chaos-hint">Chance pro gezogener Karte auf eine Chaos-Karte: ${Object.values(CHAOS).map((c) => esc(c.name)).join(' · ')}</p>
          <div class="set doom-set"><span>☠ DOOM-Karten</span>${seg('doom', s.doom, DOOM_LEVELS.map((l) => [l, l ? `${l} %` : 'Aus']), isHost)}</div>
          <p class="hint doom-hint">Sehr selten und sehr fies: ${Object.values(DOOM).map((c) => esc(c.name)).join(' · ')}</p>
          <div class="set"><span>🎡 Tisch-Ereignisse</span>${seg('events', s.events, EVENT_LEVELS, isHost)}</div>
          <p class="hint">Ab und zu dreht sich das Glücksrad oder der Tisch schlägt zu – hier: ${esc((THEME_EVENTS[s.theme] ?? THEME_EVENTS.neon).icon)} ${esc((THEME_EVENTS[s.theme] ?? THEME_EVENTS.neon).name)}.</p>
          <h3>Hausregeln</h3>
          ${toggle('acid', s.acid, 'Säure-Karten', 'Je eine pro Farbe: Wer z. B. rote Säure legt, wirft alle seine roten Karten mit ab.', isHost)}
          ${toggle('lottery', s.lottery, 'Lotterie-Karten', 'Je eine pro Farbe: Alle würfeln – niedrigster Wurf zieht 3, höchster wirft 1 Karte ab.', isHost)}
          ${toggle('stacking', s.stacking, 'Stapeln', '+2 auf +2 und +4 auf +2/+4 – der Nächste zieht alles.', isHost)}
          ${toggle('zeroPass', s.zeroPass, '0 – Hände weiterreichen', 'Wer eine 0 legt, lässt alle Hände einen Platz in Spielrichtung weiterwandern.', isHost)}
          ${toggle('jumpIn', s.jumpIn, 'Reinwerfen', 'Exakt gleiche Karte jederzeit dazwischenwerfen.', isHost)}
          ${toggle('drawToMatch', s.drawToMatch, 'Ziehen bis passt', 'So lange ziehen, bis eine Karte passt.', isHost)}
        </section>
      </div>
      <div class="lobby-foot">
        <div class="row">
          <button class="btn ghost" data-act="leave">Verlassen</button>
          <button class="btn ghost" data-act="rules">📖 Regeln &amp; Karten</button>
        </div>
        ${isHost
          ? `<button class="btn primary big" data-act="start" ${v.players.length < 2 ? 'disabled' : ''}>Spiel starten</button>`
          : '<p class="wait">Warte, bis der Host das Spiel startet …</p>'}
      </div>
    </div>`;
}

function playerById(v, id) { return v.players.find((p) => p.id === id); }

function renderHud(v) {
  const g = v.game;
  const me = playerById(v, v.me);
  const actor = g?.actorId;
  const myTurn = v.phase === 'playing' && actor === v.me;
  const awaiting = g?.awaiting;
  const limit = v.settings.scoreLimit;

  $('chips').innerHTML = `
    <span class="chip">Raum <b>${v.code}</b></span>
    <span class="chip">Runde <b>${g?.round ?? 1}</b>${limit ? ` · Ziel <b>${limit}</b>` : ''}</span>
    ${g ? `<span class="chip color-chip" style="--c:${COLOR_HEX[g.color]}">Farbe <b>${COLOR_NAMES[g.color]}</b></span>` : ''}
    ${g?.pending ? `<span class="chip warn">+${g.pending} offen</span>` : ''}
    ${g?.dirChaos ? `<span class="chip dirchaos">🔀 Richtungschaos <b>${g.dirChaos}</b></span>` : ''}
    ${me?.hallu && v.phase === 'playing' ? `<span class="chip hallu">🍄 Du halluzinierst – noch <b>${me.hallu}</b> ${me.hallu === 1 ? 'Zug' : 'Züge'}</span>` : ''}
    ${g?.frozen ? `<span class="chip frozen">❄ <b>${COLOR_NAMES[g.frozen.color]}</b> eingefroren · ${g.frozen.turns}</span>` : ''}
    ${g?.wet ? `<span class="chip wet">🌧 <b>${COLOR_NAMES[g.wet]}</b> ist nass – zählt doppelt</span>` : ''}
    ${g?.ice ? '<span class="chip ice">🧊 Glatteis – die nächste Karte rutscht</span>' : ''}
    ${g?.bomb ? `<span class="chip bomb ${g.bomb.danger ? 'danger' : ''}">💣 Zeitbombe tickt${g.bomb.power > 10 ? ` (+${g.bomb.power})` : ''}</span>` : ''}
    ${me?.curse ? `<span class="chip cursed">🩸 Verflucht: nur <b>${COLOR_NAMES[me.curse.color]}</b> · ${me.curse.turns}</span>` : ''}
    ${me?.pact ? `<span class="chip pact">😈 Pakt: noch <b>${me.pact}</b> ${me.pact === 1 ? 'Zug' : 'Züge'} zum Sieg</span>` : ''}`;

  // Sitze der Gegner (beim Halluzinieren: nur Quatsch)
  const swapMode = state.pick?.type === 'swap';
  const hallu = v.phase === 'playing' && (me?.hallu ?? 0) > 0;
  if (hallu && !state.halluNames) state.halluNames = {};
  if (!hallu) state.halluNames = null;
  $('seats').innerHTML = v.players.filter((p) => p.id !== v.me).map((p) => {
    const active = v.phase === 'playing' && actor === p.id;
    if (hallu && !state.halluNames[p.id]) {
      const used = new Set(Object.values(state.halluNames));
      state.halluNames[p.id] = rndOf(SILLY_NAMES.filter((n) => !used.has(n)));
    }
    const nameHtml = hallu ? esc(state.halluNames[p.id]) : `${esc(p.name)}${p.isBot ? ' <i>Bot</i>' : ''}${!p.connected ? ' <i class="off">offline</i>' : ''}`;
    return `<div class="seat ${active ? 'active' : ''} ${swapMode ? 'selectable' : ''} ${hallu ? 'hallu' : ''}" data-seat="${p.id}" ${swapMode ? `data-act="swapTarget" data-id="${p.id}" role="button" tabindex="0"` : ''}>
      <div class="name">${nameHtml}</div>
      <div class="body">
        <span class="av" ${hallu ? 'data-hallu-av' : ''}>${hallu ? rndOf(SILLY_AVATARS) : p.avatar}</span>
        <span class="count" title="Karten" ${hallu ? 'data-hallu-count' : ''}>${hallu ? rndOf(SILLY_COUNTS) : p.count}</span>
      </div>
      <div class="sub">${hallu ? '¿ Pkt.' : `${p.score} Pkt.`}</div>
      ${!hallu && p.count === 1 && p.called ? '<div class="flag">Letzte Karte!</div>' : ''}
      ${p.skipTurns ? `<div class="flag skip">⏸ setzt ${p.skipTurns}× aus</div>` : ''}
      ${!hallu && p.doom ? `<div class="flag doomflag">☠ DOOM ×${p.doom}</div>` : ''}
      ${!hallu && p.chaos ? `<div class="flag chaosflag">✦ Chaos ×${p.chaos}</div>` : ''}
      ${!hallu && p.hallu ? '<div class="flag halluflag">🍄 halluziniert</div>' : ''}
      ${g?.bomb?.holder === p.id ? `<div class="flag bombflag ${g.bomb.danger ? 'danger' : ''}">💣 Bombe!</div>` : ''}
      ${!hallu && p.curse ? `<div class="flag curseflag">🩸 nur ${COLOR_NAMES[p.curse.color]} · ${p.curse.turns}</div>` : ''}
      ${!hallu && p.pact ? `<div class="flag pactflag">😈 Pakt ${p.pact}</div>` : ''}
      ${!hallu && p.vulnerable ? `<button class="btn danger small catch" data-act="catch" data-id="${p.id}">Erwischt!</button>` : ''}
      <div class="timer" data-timer="${p.id}"></div>
    </div>`;
  }).join('');

  // eigenes Panel
  $('me').innerHTML = me ? `
    <span class="av">${me.avatar}</span>
    <div class="info"><b>${esc(me.name)}</b><span>${me.count} Karten · ${me.score} Pkt.</span>${me.skipTurns ? `<span class="flag skip">⏸ setzt ${me.skipTurns}× aus</span>` : ''}${me.hallu && v.phase === 'playing' ? '<span class="flag halluflag">🍄 halluziniert</span>' : ''}</div>
    <div class="timer" data-timer="${me.id}"></div>` : '';
  $('me').classList.toggle('active', myTurn);

  // Banner
  let banner = '';
  if (v.phase === 'playing') {
    if (swapMode) banner = '';
    else if (myTurn) {
      if (awaiting?.type === 'drawn') banner = 'Gezogene Karte spielen oder behalten?';
      else if (awaiting?.type === 'challenge' || awaiting?.type === 'mirror') banner = '';
      else if (g.pending > 0) banner = `Du bist dran – stapeln oder ${g.pending} ziehen`;
      else banner = 'Du bist dran!';
    } else {
      const a = playerById(v, actor);
      if (awaiting?.type === 'challenge') banner = `${esc(a?.name)} überlegt, ob die +4 ein Bluff war …`;
      else if (awaiting?.type === 'mirror') banner = `🪞 ${esc(a?.name)} überlegt, ob der Angriff zurückgespiegelt wird …`;
      else banner = `${esc(a?.name)} ist dran`;
    }
  }
  $('banner').innerHTML = banner ? `<span class="${myTurn ? 'mine' : ''}">${banner}</span>` : '';

  // Aktionen
  const acts = [];
  if (v.phase === 'playing' && me) {
    if (me.count <= 2) {
      const hot = (me.count === 2 && myTurn && !me.called) || me.vulnerable;
      acts.push(`<button class="btn call ${hot ? 'hot' : ''}" data-act="callLast" ${me.called && !me.vulnerable ? 'disabled' : ''}>${me.called && !me.vulnerable ? '✓ Gerufen' : 'Letzte Karte!'}</button>`);
    }
    if (myTurn && awaiting?.type === 'drawn') acts.push('<button class="btn secondary" data-act="pass">Behalten</button>');
    else if (myTurn && !awaiting && !state.pick) acts.push(`<button class="btn primary" data-act="draw">${g.pending ? `${g.pending} Karten ziehen` : 'Karte ziehen'}</button>`);
  }
  $('actions').innerHTML = acts.join('');

  // Entscheidung bei +4
  let decision = '';
  const hasMirror = v.hand.some((c) => c.kind === 'chaos' && c.effect === 'mirror');
  if (v.phase === 'playing' && myTurn && awaiting?.type === 'challenge') {
    const off = playerById(v, awaiting.offender);
    const canStack = v.settings.stacking && v.hand.some((c) => c.kind === 'wild4');
    decision = `<div class="decision panel">
      <p><b>${esc(off?.name)}</b> hat eine <b>+4</b> gespielt.</p>
      <p class="small">Zweifelst du an und ${esc(off?.name)} hatte doch eine passende Farbe, zieht ${esc(off?.name)} 4 Karten. Sonst ziehst du ${g.pending + 2}.</p>
      ${canStack ? '<p class="small">… oder leg selbst eine +4 drauf!</p>' : ''}
      <div class="row">
        <button class="btn danger" data-act="challenge">Bluff anzweifeln</button>
        <button class="btn secondary" data-act="accept">Annehmen (+${g.pending})</button>
        ${hasMirror ? `<button class="btn mirror" data-act="mirrorPlay">🪞 Zurückspiegeln (+${g.pending} an ${esc(off?.name)})</button>` : ''}
      </div>
    </div>`;
  } else if (v.phase === 'playing' && awaiting?.type === 'mirror' && awaiting.player === v.me) {
    const att = playerById(v, awaiting.attacker);
    const what = { draw2: '+2', plus50: '+50', plus4All: 'Alle +4', plus100: '☠ +100', meteor: '☄ Meteor', stack: 'Zurückgespiegelt' }[awaiting.source] ?? 'Angriff';
    decision = `<div class="decision panel mirror-panel">
      <p>🪞 <b>${esc(att?.name)}</b> greift dich an: <b>${what}</b> – du müsstest <b>${awaiting.amount}</b> Karten ziehen.</p>
      <p class="small">Du hast einen Spiegel! Setzt du ihn ein, trifft der Angriff ${esc(att?.name)} selbst.</p>
      <div class="row">
        <button class="btn mirror big" data-act="mirrorUse">🪞 Zurückspiegeln</button>
        <button class="btn secondary" data-act="mirrorSkip">Annehmen (+${awaiting.amount})</button>
      </div>
    </div>`;
  } else if (v.phase === 'playing' && myTurn && g.pending > 0 && hasMirror) {
    decision = `<div class="decision panel slim"><p>🪞 Du kannst die <b>+${g.pending}</b> mit deinem Spiegel zurückschicken.</p><button class="btn mirror small" data-act="mirrorPlay">Zurückspiegeln</button></div>`;
  } else if (swapMode) {
    const pc = state.pick.card;
    const text = pc.kind === 'chaos' || pc.kind === 'doom'
      ? `<b>${pc.kind === 'doom' ? '☠ ' : ''}${esc(specialInfo(pc).name)}</b>: Klicke auf den Spieler, den es treffen soll.`
      : 'Klicke auf einen Spieler.';
    decision = `<div class="decision panel slim"><p>${text}</p><button class="btn ghost small" data-act="cancelPick">Abbrechen</button></div>`;
  }
  $('decision').innerHTML = decision;
  if (v.phase !== 'playing' || state.pick) $('tip').hidden = true;

  board.setInteraction({
    playable: v.phase === 'playing' && !state.pick ? v.playable : [],
    myTurn,
    canDraw: myTurn && !awaiting && !state.pick,
  });
  // Zweite Kartenreihe (große Hand) → Banner, Hinweise und Dialoge weiter nach oben
  document.body.classList.toggle('hand-tall', (board.handRows?.length ?? 0) > 1);
  // Viele Gegner → kompaktere Namensschilder
  const opp = v.players.length - 1;
  document.body.classList.toggle('seats-many', opp > 6);
  document.body.classList.toggle('seats-crowded', opp > 11);
}

function renderModal(v) {
  let html = '';
  if (state.pick?.type === 'dir') {
    html = `<div class="overlay">
      <div class="panel picker dirpick">
        <h2>🔀 Richtungschaos läuft schon</h2>
        <p>Noch <b>${v?.game?.dirChaos ?? 0}</b> Züge wird nach jedem Zug gewürfelt. Was soll deine Karte tun?</p>
        <div class="row">
          <button class="btn secondary big" data-act="dirChoice" data-val="cancel">Effekt aufheben</button>
          <button class="btn danger big" data-act="dirChoice" data-val="extend">+10 Züge</button>
        </div>
        <button class="btn ghost small" data-act="cancelPick">Abbrechen</button>
      </div>
    </div>`;
  } else if (state.pick?.type === 'color') {
    const isFreeze = state.pick.card.effect === 'freeze';
    const frozen = v?.game?.frozen?.color;
    html = `<div class="overlay">
      <div class="panel picker">
        <h2>${isFreeze ? '❄ Welche Farbe einfrieren?' : 'Farbe wählen'}</h2>
        <div class="wheel">${COLORS.map((c) => {
          const blocked = !isFreeze && c === frozen;
          return `<button data-act="color" data-color="${c}" style="--c:${COLOR_HEX[c]}" aria-label="${COLOR_NAMES[c]}" ${blocked ? 'disabled title="eingefroren"' : ''}><span>${blocked ? '❄ ' : ''}${COLOR_NAMES[c]}</span></button>`;
        }).join('')}</div>
        <button class="btn ghost small" data-act="cancelPick">Abbrechen</button>
      </div>
    </div>`;
  } else if (v?.phase === 'roundOver' && v.result) {
    const r = v.result;
    const winner = playerById(v, r.winnerId);
    const isHost = v.hostId === v.me;
    const sorted = [...v.players].sort((a, b) => b.score - a.score);
    const handOf = (id) => r.hands.find((h) => h.id === id);
    const title = r.gameOver
      ? (r.winnerId === v.me ? 'Du gewinnst das Spiel! 🏆' : `${esc(winner?.name)} gewinnt das Spiel! 🏆`)
      : (r.winnerId === v.me ? 'Du gewinnst die Runde! 🎉' : `${esc(winner?.name)} gewinnt die Runde`);
    html = `<div class="overlay">
      <div class="panel results">
        <h2>${title}</h2>
        <p class="pts">+${r.points} Punkte</p>
        <table>
          <thead><tr><th>Spieler</th><th>Restkarten</th><th>Gesamt</th></tr></thead>
          <tbody>${sorted.map((p) => {
            const h = handOf(p.id);
            return `<tr class="${p.id === r.winnerId ? 'win' : ''}">
              <td><span class="av">${p.avatar}</span> ${esc(p.name)}</td>
              <td class="minis">${(h?.cards ?? []).slice(0, 12).map((c) => `<img src="${faceDataUrl(c)}" alt="" />`).join('')}${(h?.cards.length ?? 0) > 12 ? ' …' : ''}</td>
              <td><b>${p.score}</b></td>
            </tr>`;
          }).join('')}</tbody>
        </table>
        <div class="row">
          ${isHost
            ? `<button class="btn ghost" data-act="toLobby">Zur Lobby</button>
               <button class="btn primary big" data-act="nextRound">${r.gameOver ? 'Neues Spiel' : 'Nächste Runde'}</button>`
            : '<p class="wait">Warte auf den Host …</p>'}
        </div>
      </div>
    </div>`;
  }
  $('modal').innerHTML = html;
}

// ---------- Effekte ----------

function posOf(v, id) {
  if (id === v.me) return { x: stage.width / 2, y: stage.height * 0.62 };
  return board.seatScreen(id) ?? { x: stage.width / 2, y: stage.height * 0.3 };
}
function centerPos() { return stage.toScreen(new Vector3(0, 0.5, 0)); }

function pop(text, at, cls = '') {
  const el = document.createElement('div');
  el.className = `pop ${cls}`;
  el.textContent = text;
  el.style.left = `${at.x}px`;
  el.style.top = `${at.y}px`;
  $('fx').appendChild(el);
  setTimeout(() => el.remove(), 1700);
  return el;
}

function confetti() {
  const cols = Object.values(COLOR_HEX).slice(0, 4);
  for (let i = 0; i < 90; i++) {
    const c = document.createElement('i');
    c.className = 'confetti';
    c.style.left = `${Math.random() * 100}vw`;
    c.style.background = cols[i % 4];
    c.style.animationDelay = `${Math.random() * 0.8}s`;
    c.style.animationDuration = `${2 + Math.random() * 1.5}s`;
    c.style.setProperty('--r', `${Math.random() * 720 - 360}deg`);
    $('fx').appendChild(c);
    setTimeout(() => c.remove(), 4000);
  }
}

/** Glücksrad: dreht sich in der Bildschirmmitte und bleibt auf dem Ergebnis stehen. */
function showWheel(index) {
  const n = WHEEL.length;
  const seg = 360 / n;
  const cols = ['#e8364a', '#ffc21a', '#1fb35a', '#1f7fe8', '#b44dff'];
  const grad = cols.map((c, i) => `${c} ${i * seg}deg ${(i + 1) * seg}deg`).join(', ');
  const el = document.createElement('div');
  el.className = 'wheel-event';
  el.innerHTML = `<div class="wheel-title">🎡 GLÜCKSRAD</div>
    <div class="wheel-wrap">
      <div class="wheel-pointer">▼</div>
      <div class="wheel-disc" style="background: conic-gradient(${grad})">
        ${WHEEL.map((w, i) => `<span style="transform: rotate(${i * seg + seg / 2}deg) translateY(calc(var(--wheel-size) * -0.3))">${esc(w.label)}</span>`).join('')}
      </div>
    </div>
    <div class="wheel-result"></div>`;
  $('alert').appendChild(el);
  const disc = el.querySelector('.wheel-disc');
  // Segment-Mitte des Ergebnisses nach oben (unter den Zeiger) drehen
  const final = 360 * 5 + (360 - (index * seg + seg / 2));
  requestAnimationFrame(() => requestAnimationFrame(() => { disc.style.transform = `rotate(${final}deg)`; }));
  setTimeout(() => {
    const w = WHEEL[index];
    el.querySelector('.wheel-result').innerHTML = `<b>${esc(w.label)}</b><span>${esc(w.desc)}</span>`;
    el.classList.add('done');
    sfx('pop');
  }, 2500);
  setTimeout(() => el.classList.add('out'), 4600);
  setTimeout(() => el.remove(), 5100);
}

/** Riesige DOOM-Warnung über den ganzen Bildschirm, für alle sichtbar. */
function doomAlert(title, sub, played = false) {
  if (!played) sfx('doomDraw');
  const el = document.createElement('div');
  el.className = `doom-alert ${played ? 'played' : ''}`;
  el.innerHTML = `<div class="doom-vignette"></div><div class="doom-text"><span class="doom-skull">☠</span><h1>${esc(title)}</h1><p>${esc(sub)}</p></div>`;
  $('alert').appendChild(el);
  document.body.classList.remove('shake');
  void document.body.offsetWidth; // Animation neu starten
  document.body.classList.add('shake');
  setTimeout(() => document.body.classList.remove('shake'), 900);
  setTimeout(() => el.classList.add('out'), played ? 1500 : 3000);
  setTimeout(() => el.remove(), played ? 2000 : 3500);
}

function toast(text, type = '') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = text;
  $('toasts').appendChild(el);
  setTimeout(() => el.classList.add('out'), 2600);
  setTimeout(() => el.remove(), 3000);
}

function handleEvents(v, prev) {
  const name = (id) => playerById(v, id)?.name ?? prev?.players.find((p) => p.id === id)?.name ?? '?';
  for (const e of v.events ?? []) {
    switch (e.type) {
      case 'deal': sfx('shuffle'); pop(`Runde ${e.round}`, centerPos(), 'big'); break;
      case 'play': {
        sfx('card');
        const at = centerPos();
        if (e.card.kind === 'wild4') { sfx('wild'); pop('+4', at, 'big plus'); setTimeout(() => pop(COLOR_NAMES[e.color], at, `color c-${e.color}`), 350); }
        else if (e.card.kind === 'wild') { sfx('wild'); pop(COLOR_NAMES[e.color], at, `big color c-${e.color}`); }
        else if (e.card.kind === 'draw2') { sfx('plus'); pop('+2', at, 'big plus'); }
        if (e.jumpIn) pop('Reingeworfen!', posOf(v, e.player), 'small');
        break;
      }
      case 'skip':
        sfx('skip');
        pop(e.chaos ? (e.left ? `Setzt aus! (noch ${e.left}×)` : 'Setzt aus! (letztes Mal)') : 'Aussetzen!', posOf(v, e.player), 'warn');
        break;
      case 'acid': {
        sfx('acid');
        const cn = COLOR_NAMES[e.color];
        const n = e.cards.length;
        pop('SÄURE!', centerPos(), `big acid c-${e.color}`);
        const sub = pop(n ? `${name(e.player)} wirft ${n} ${cn === 'Grün' ? 'grüne' : cn === 'Rot' ? 'rote' : cn === 'Gelb' ? 'gelbe' : 'blaue'} ${n === 1 ? 'Karte' : 'Karten'} ab` : `${name(e.player)}: keine weiteren ${cn}-Karten`, centerPos(), 'small acid-sub');
        sub.style.marginTop = '3.2rem';
        break;
      }
      case 'chaos': {
        const fx = CHAOS[e.effect];
        sfx(e.effect === 'tornado' ? 'tornado' : 'chaos');
        const who = e.target ? `${name(e.player)} → ${name(e.target)}` : name(e.player);
        pop(`CHAOS: ${fx.name}`, centerPos(), 'big chaos');
        const sub = pop(who, centerPos(), 'small chaos-sub');
        sub.style.marginTop = '3.2rem';
        if (e.effect === 'dirChaos') {
          const txt = { start: '10 Züge lang wird nach jedem Zug gewürfelt!', cancel: 'Richtungschaos aufgehoben!', extend: '+10 Züge Richtungschaos!' }[e.choice];
          toast(`${who}: ${txt}`, 'chaos');
        } else if (e.effect === 'freeze') {
          sfx('freeze');
          toast(`❄ ${name(e.player)} friert ${COLOR_NAMES[e.color]} ein – 2 Runden lang darf niemand diese Farbe spielen.`, 'chaos');
        } else if (e.effect === 'xray') {
          if (e.player !== v.me) toast(`👁 ${name(e.player)} wirft einen Röntgenblick in die Karten von ${e.target === v.me ? 'dir' : name(e.target)}!`, 'chaos');
        } else toast(`${who}: ${fx.name} – ${fx.desc}`, 'chaos');
        if (e.target) setTimeout(() => pop(fx.icon, posOf(v, e.target), 'warn'), 500);
        break;
      }
      case 'debug': toast(`🛠 Debug: ${e.n} ${e.n === 1 ? 'Karte' : 'Karten'} an ${e.player === v.me ? 'dich' : name(e.player)}`); break;
      case 'newDeck': sfx('shuffle'); toast('Alle Karten sind verteilt – ein frisches Deck kommt ins Spiel!', 'chaos'); break;
      case 'timeLimit': toast('Zuglimit erreicht – wer die wenigsten Karten hat, gewinnt die Runde.', 'chaos'); break;
      case 'reverse': sfx('reverse'); pop('⟲ Richtungswechsel', centerPos(), 'big'); break;
      case 'draw':
        if (e.penalty) pop(`+${e.n}`, posOf(v, e.player), 'warn');
        else sfx('draw');
        if (e.chaos) {
          setTimeout(() => {
            sfx('shimmer');
            pop(e.player === v.me ? '✦ Du hast eine Chaos-Karte!' : `✦ ${name(e.player)} hat eine Chaos-Karte!`, posOf(v, e.player), 'chaos small-chaos');
          }, 450);
        }
        if (e.doom) {
          const who = e.player === v.me ? 'Du hast' : `${name(e.player)} hat`;
          setTimeout(() => doomAlert(`${who} eine DOOM-Karte gezogen!`, 'Etwas Schreckliches wird geschehen …'), 300);
        }
        break;
      case 'doom': {
        const fx = DOOM[e.effect];
        const who = e.target ? `${name(e.player)} → ${name(e.target)}` : name(e.player);
        sfx(e.effect === 'meteor' ? 'meteor' : 'doomPlay');
        let sub = `${who} – ${fx.desc}`;
        if (e.effect === 'curse') sub = `${name(e.target)} darf 5 Züge lang nur noch ${COLOR_NAMES[e.color]} spielen!`;
        if (e.effect === 'pact') sub = `${name(e.player)} wirft ${e.n} Karten ab – und muss in 5 Zügen gewinnen, sonst +20!`;
        if (e.effect === 'meteor') sub = `Einschläge bei ${e.hits.map((h) => `${name(h.id)} (+${h.n})`).join(', ')}`;
        doomAlert(`DOOM: ${fx.name}`, sub, true);
        if (e.target) setTimeout(() => pop(fx.icon, posOf(v, e.target), 'warn doompop'), 900);
        if (e.effect === 'hallu' && e.player !== v.me) setTimeout(() => toast('🍄 Du halluzinierst! Traue deinen Augen nicht …', 'doom'), 1500);
        break;
      }
      case 'dirRoll':
        sfx('dice');
        if (e.flipped) pop(`🎲 Richtung gewechselt! (${e.left} übrig)`, centerPos(), 'small dirpop');
        else pop(`🎲 bleibt (${e.left} übrig)`, centerPos(), 'small dirpop dim');
        break;
      case 'halluEnd':
        if (e.player === v.me) toast('Die Halluzination lässt nach. Alles wieder normal … oder?');
        break;
      // --- Spiegel, Bombe, Dieb, Eiszeit, Fluch, Pakt ---
      case 'mirror': {
        sfx('mirror');
        pop('🪞 GESPIEGELT!', centerPos(), 'big mirrorpop');
        const sub = pop(`${name(e.by)} schickt +${e.amount} zurück an ${name(e.to)}`, centerPos(), 'small mirror-sub');
        sub.style.marginTop = '3.2rem';
        break;
      }
      case 'bombArm': sfx('tick'); pop(e.power > 10 ? `💣 Bombe verstärkt: +${e.power}!` : '💣 Zeitbombe scharf!', centerPos(), 'big bombpop'); break;
      case 'bombMove': sfx(e.danger ? 'tickFast' : 'tick'); if (e.player === v.me) pop('💣 Du hast die Bombe!', posOf(v, e.player), 'warn'); break;
      case 'bombBoom':
        sfx('boom');
        pop(`💥 BOOM! +${e.n}`, posOf(v, e.player), 'big doompop');
        toast(`💣 Die Bombe ist bei ${e.player === v.me ? 'dir' : name(e.player)} explodiert: +${e.n} Karten`, 'doom');
        break;
      case 'steal': sfx('steal'); pop('🧤 Geklaut!', posOf(v, e.from), 'warn'); break;
      case 'thaw': sfx('freeze'); toast(`❄ ${COLOR_NAMES[e.color]} ist wieder aufgetaut`); break;
      case 'curseEnd': if (e.player === v.me) toast('🩸 Der Fluch ist gebrochen – du darfst wieder alles spielen.'); break;
      case 'pactDoom':
        sfx('doomPlay');
        doomAlert('Der Pakt fordert seinen Preis!', `${e.player === v.me ? 'Du ziehst' : `${name(e.player)} zieht`} ${e.n} Karten aus dem Höllenportal`, true);
        break;
      // --- Lotterie ---
      case 'lottery': {
        sfx('dice');
        pop('🎲 LOTTERIE!', centerPos(), 'big lotterypop');
        e.rolls.forEach((r, i) => setTimeout(() => {
          const cls = e.losers.includes(r.id) ? 'warn' : e.winners.includes(r.id) ? 'dicewin' : 'small';
          pop(`🎲 ${r.roll}`, posOf(v, r.id), `dice ${cls}`);
        }, 350 + i * Math.min(120, 1500 / e.rolls.length)));
        if (e.losers.includes(v.me)) setTimeout(() => toast('🎲 Niedrigster Wurf – du ziehst 3 Karten.'), 1600);
        if (e.winners.includes(v.me)) setTimeout(() => toast('🎲 Höchster Wurf – du wirfst eine Karte ab!'), 1600);
        break;
      }
      case 'lotteryDrop': setTimeout(() => pop('−1', posOf(v, e.player), 'dicewin'), 1500); break;
      case 'underdog': pop('−3 Ausgleich', posOf(v, e.player), 'dicewin'); break;
      // --- Tisch-Ereignisse ---
      case 'iceSlide':
        sfx('freeze');
        pop(`🧊 Ausgerutscht! ${COLOR_NAMES[e.from]} → ${COLOR_NAMES[e.to]}`, centerPos(), 'big icepop');
        break;
      case 'tableEvent':
        if (e.kind === 'wheel') { sfx('wheel'); showWheel(e.index); }
        else if (e.kind === 'ice') { sfx('freeze'); pop('🧊 GLATTEIS!', centerPos(), 'big icepop'); toast('🧊 Glatteis: Die nächste gelegte Karte rutscht aus und bekommt eine zufällige Farbe.'); }
        else if (e.kind === 'blackout') { sfx('blackout'); pop('🔌 STROMAUSFALL!', centerPos(), 'big blackoutpop'); toast('🔌 Stromausfall: 10 Sekunden lang sind alle Karten verdeckt – du spielst blind!'); }
        else if (e.kind === 'rain') { sfx('rain'); pop(`🌧 REGEN: ${COLOR_NAMES[e.color]} ist nass!`, centerPos(), 'big rainpop'); toast(`🌧 Alle ${COLOR_NAMES[e.color]}-Karten zählen am Rundenende doppelt – schnell loswerden!`); }
        break;
      case 'call': if (e.player !== v.me) sfx('call'); pop('Letzte Karte!', posOf(v, e.player), 'call'); break;
      case 'caught': sfx('caught'); pop('Erwischt! +2', posOf(v, e.player), 'warn'); break;
      case 'challenge':
        sfx(e.guilty ? 'caught' : 'error');
        pop(e.guilty ? `Bluff! ${name(e.offender)} zieht 4` : `Kein Bluff! ${name(e.by)} zieht`, centerPos(), 'big');
        break;
      case 'swap': sfx('shuffle'); pop('Hände getauscht!', centerPos(), 'big'); break;
      case 'rotate': sfx('shuffle'); pop('Alle Hände wandern weiter!', centerPos(), 'big'); break;
      case 'shuffle': sfx('shuffle'); toast('Ablagestapel neu gemischt'); break;
      case 'timeout': pop('Zeit abgelaufen!', posOf(v, e.player), 'warn'); break;
      case 'emote': { sfx('pop'); const el = pop(e.emote, posOf(v, e.player), 'emote'); el.style.setProperty('--dy', '-40px'); break; }
      case 'win':
        if (e.player === v.me) { sfx('win'); confetti(); } else sfx('lose');
        break;
      case 'join': if (e.player !== v.me) toast(`${name(e.player)} ist beigetreten`); break;
      case 'leave': toast(`${name(e.player)} hat das Spiel verlassen`); break;
      case 'disconnect': if (v.phase !== 'lobby') toast(`${name(e.player)} hat die Verbindung verloren – ein Bot springt ein`); break;
      case 'reconnect': if (e.player !== v.me) toast(`${name(e.player)} ist wieder da`); break;
    }
  }
}

// ---------- Pro Frame: Sitz-Labels & Timer ----------

stage.updaters.push(() => {
  const v = state.view;
  if (!v || v.phase === 'lobby') return;
  for (const el of $('seats').children) {
    const p = board.seatScreen(Number(el.dataset.seat));
    if (!p) continue;
    el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) translate(-50%, -50%)`;
  }
  // Halluzination: Avatare und Zahlen wechseln ständig
  const nowMs = performance.now();
  if (state.halluNames && nowMs - (state.halluTick ?? 0) > 700) {
    state.halluTick = nowMs;
    for (const el of document.querySelectorAll('[data-hallu-av]')) if (Math.random() < 0.6) el.textContent = rndOf(SILLY_AVATARS);
    for (const el of document.querySelectorAll('[data-hallu-count]')) if (Math.random() < 0.45) el.textContent = rndOf(SILLY_COUNTS);
  }
  const g = v.game;
  const left = g?.deadline ? Math.max(0, Math.ceil((g.deadline - (Date.now() + state.timeOffset)) / 1000)) : 0;
  for (const el of document.querySelectorAll('[data-timer]')) {
    const show = v.phase === 'playing' && g?.deadline && Number(el.dataset.timer) === g.actorId;
    const txt = show ? `${left}s` : '';
    if (el.textContent !== txt) { el.textContent = txt; el.classList.toggle('low', show && left <= 5); }
  }
});

render();
