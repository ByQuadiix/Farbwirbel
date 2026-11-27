// Regel-Seite: Übersicht aller Karten mit Bildern.
import { faceDataUrl } from './cards.js';
import { CHAOS, DOOM, WHEEL, THEME_EVENTS, EVENT_EVERY } from '../../shared/rules.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const img = (card) => `<img src="${faceDataUrl(card)}" alt="" loading="lazy" />`;

function entry(cards, title, text, meta = '') {
  return `<article class="rule-card">
    <div class="rule-imgs">${cards.map(img).join('')}</div>
    <div class="rule-text">
      <h4>${title}${meta ? ` <span class="rule-meta">${meta}</span>` : ''}</h4>
      <p>${text}</p>
    </div>
  </article>`;
}

function status(settings, key) {
  if (!settings) return '';
  const on = !!settings[key];
  return `<span class="rule-state ${on ? 'on' : 'off'}">${on ? 'in diesem Raum an' : 'in diesem Raum aus'}</span>`;
}

/** settings: aktuelle Raum-Einstellungen oder null (Startseite). */
export function rulesHtml(settings) {
  const chaosPct = settings ? (settings.chaos ? `in diesem Raum ${settings.chaos} %` : 'in diesem Raum aus') : '';
  return `
  <div class="overlay rules-overlay" data-act="rulesBackdrop">
    <div class="panel rules" role="dialog" aria-modal="true" aria-labelledby="rules-title">
      <div class="rules-head">
        <h2 id="rules-title">Regeln &amp; Karten</h2>
        <button class="icon-btn" data-act="rules" aria-label="Regeln schließen">✕</button>
      </div>
      <nav class="rules-nav">
        <a href="#r-basis">Grundregeln</a><a href="#r-aktion">Aktionskarten</a><a href="#r-joker">Joker</a>
        <a href="#r-haus">Hausregeln</a><a href="#r-chaos">Chaos-Karten</a><a href="#r-doom" class="doom-link">☠ DOOM</a><a href="#r-events">Ereignisse</a><a href="#r-punkte">Punkte</a>
      </nav>
      <div class="rules-body">

        <section id="r-basis">
          <h3>Grundregeln</h3>
          <ul>
            <li>Lege eine Karte in der <b>gleichen Farbe</b> oder mit der <b>gleichen Zahl bzw. Art</b> wie die oberste Karte.</li>
            <li>Kannst oder willst du nicht, <b>ziehst</b> du eine Karte (Stapel anklicken oder <kbd>Leertaste</kbd>). Passt sie, darfst du sie sofort spielen – sonst ist der Nächste dran.</li>
            <li>Wer zuerst keine Karten mehr hat, gewinnt die Runde.</li>
            <li><b>Letzte Karte!</b> Bei 2 Karten den Button drücken (oder <kbd>L</kbd>), bevor du die vorletzte legst. Vergessen und jemand klickt bei dir auf <b>„Erwischt!“</b>, bevor der Nächste zieht oder legt → du ziehst 2. Nachrufen geht, solange dich keiner erwischt hat.</li>
          </ul>
        </section>

        <section id="r-aktion">
          <h3>Farbige Aktionskarten</h3>
          <p class="rules-intro">Gibt es in Rot, Gelb, Grün und Blau. Passen auf dieselbe Farbe oder dieselbe Kartenart.</p>
          ${entry([{ color: 'r', kind: 'skip' }], 'Aussetzen', 'Der nächste Spieler wird übersprungen.', '2× pro Farbe')}
          ${entry([{ color: 'y', kind: 'rev' }], 'Richtungswechsel', 'Die Spielrichtung dreht sich um. Bei 2 Spielern wirkt sie wie Aussetzen – du bist direkt nochmal dran.', '2× pro Farbe')}
          ${entry([{ color: 'g', kind: 'draw2' }], '+2', 'Der nächste Spieler zieht 2 Karten und setzt aus. Mit der Hausregel <i>Stapeln</i> darf er stattdessen eine +2 oder +4 drauflegen – dann zieht der Nächste die Summe.', '2× pro Farbe')}
          ${entry([{ color: 'b', kind: 'acid' }, { color: 'r', kind: 'acid' }], 'Säure', `Du wirfst <b>alle deine Karten dieser Farbe</b> mit ab. Die Säure bleibt oben liegen – als Nächstes muss dieselbe Farbe oder eine andere Säure kommen. ${status(settings, 'acid')}`, '1× pro Farbe')}
          ${entry([{ color: 'y', kind: 'lottery' }, { color: 'g', kind: 'lottery' }], 'Lotterie', `Alle würfeln: Wer am niedrigsten würfelt, zieht <b>3 Karten</b>, wer am höchsten würfelt, wirft <b>1 Karte</b> ab (nie die letzte). Würfeln alle gleich, passiert nichts. ${status(settings, 'lottery')}`, '1× pro Farbe')}
        </section>

        <section id="r-joker">
          <h3>Joker</h3>
          <p class="rules-intro">Passen immer – außer es sind noch Strafkarten offen.</p>
          ${entry([{ color: 'w', kind: 'wild' }], 'Farbwahl', 'Du bestimmst die nächste Farbe.', '4× im Deck')}
          ${entry([{ color: 'w', kind: 'wild4' }], '+4 Farbwahl', `Du bestimmst die Farbe, der Nächste zieht 4 und setzt aus.<br>
            <b>Bluff anzweifeln:</b> Die +4 ist nur erlaubt, wenn du <i>keine</i> Karte in der Farbe hattest, die vorher galt.
            Zweifelt der Nächste an und du hattest doch eine solche Karte, ziehst <b>du</b> 4 und er spielt normal weiter. War alles korrekt, zieht <b>er</b> 6.
            Nimmt er an, zieht er 4. Mit <i>Stapeln</i> kann er stattdessen selbst eine +4 drauflegen (gestapelte +4 kann man nicht anzweifeln).`, '4× im Deck')}
        </section>

        <section id="r-haus">
          <h3>Hausregeln</h3>
          <p class="rules-intro">Stellt der Host in der Lobby ein.</p>
          ${entry([{ color: 'b', kind: '0' }], '0 – Hände weiterreichen', `Wer eine <b>0</b> legt, lässt alle Hände einen Platz in Spielrichtung weiterwandern. ${status(settings, 'zeroPass')}`)}
          ${entry([{ color: 'g', kind: 'draw2' }, { color: 'w', kind: 'wild4' }], 'Stapeln', `+2 auf +2, +4 auf +2 oder +4. Wer nicht stapeln kann, zieht alles. ${status(settings, 'stacking')}`)}
          ${entry([{ color: 'y', kind: '5' }, { color: 'y', kind: '5' }], 'Reinwerfen', `Eine <b>exakt gleiche</b> Karte (Farbe und Zahl/Art) darfst du jederzeit dazwischenwerfen – auch wenn du nicht dran bist. Danach geht es bei dir weiter. ${status(settings, 'jumpIn')}`)}
          ${entry([{ color: 'b', kind: '3' }], 'Ziehen bis passt', `Du ziehst so lange, bis eine Karte passt. ${status(settings, 'drawToMatch')}`)}
        </section>

        <section id="r-chaos">
          <h3>Chaos-Karten ${chaosPct ? `<span class="rule-state ${settings?.chaos ? 'on' : 'off'}">${chaosPct}</span>` : ''}</h3>
          <ul class="rules-intro">
            <li>Mit der eingestellten Chance (5–35 %) wird jede gezogene oder ausgeteilte Karte zur Chaos-Karte – nicht bei Strafkarten.</li>
            <li>Passen <b>immer, wenn du dran bist</b>, egal welche Farbe oben liegt – nur nicht, solange Strafkarten offen sind.</li>
            <li>Nach dem Spielen verschwinden sie (nicht auf dem Ablagestapel).</li>
            <li>Alle sehen, wer Chaos-Karten hält: lila Rauch und „✦ Chaos ×N“ am Namensschild. Welche es ist, bleibt geheim.</li>
          </ul>
          ${Object.entries(CHAOS).map(([k, fx]) => entry([{ color: 'x', kind: 'chaos', effect: k }], fx.name.includes(fx.icon) ? esc(fx.name) : `${esc(fx.icon)} ${esc(fx.name)}`, esc(fx.desc), fx.target ? 'Ziel wählen' : '')).join('')}
        </section>

        <section id="r-doom">
          <h3 class="doom-h">☠ DOOM-Karten ${settings ? `<span class="rule-state ${settings.doom ? 'on' : 'off'}">${settings.doom ? `in diesem Raum ${settings.doom} %` : 'in diesem Raum aus'}</span>` : ''}</h3>
          <ul class="rules-intro">
            <li>Die seltenste und fieseste Kartenart (Standard: 1 % jeder gezogenen Karte).</li>
            <li>Wer eine zieht, löst für alle eine riesige Warnung aus. Solange er sie hält, steigt roter Rauch mit Glutfunken auf und am Namensschild steht „☠ DOOM ×N“.</li>
            <li>Spielen wie Chaos-Karten: immer, wenn du dran bist (nicht bei offenen Strafkarten).</li>
            <li>Karten, die durch DOOM ins Spiel kommen, steigen aus dem <b>Höllenportal</b> in der Tischmitte.</li>
            <li>Übrig auf der Hand zählt eine DOOM-Karte <b>100 Punkte</b>.</li>
          </ul>
          ${Object.entries(DOOM).map(([k, fx]) => entry([{ color: 'd', kind: 'doom', effect: k }], fx.name.includes(fx.icon) ? esc(fx.name) : `${esc(fx.icon)} ${esc(fx.name)}`, esc(fx.desc), fx.target ? 'Ziel wählen' : '')).join('')}
        </section>

        <section id="r-events">
          <h3>🎡 Tisch-Ereignisse ${settings ? `<span class="rule-state ${settings.events ? 'on' : 'off'}">${['in diesem Raum aus', 'in diesem Raum selten', 'in diesem Raum oft'][settings.events ?? 0]}</span>` : ''}</h3>
          <p class="rules-intro">Alle ${EVENT_EVERY} Züge kann ohne Karte ein Ereignis passieren (Chance: selten 35 %, oft 75 %) – das Glücksrad oder das Ereignis des Tisches.</p>
          <article class="rule-card"><div class="rule-text"><h4>🎡 Glücksrad</h4>
            <p>${WHEEL.map((w) => `<b>${esc(w.label)}:</b> ${esc(w.desc)}`).join('<br>')}</p></div></article>
          ${Object.entries(THEME_EVENTS).map(([theme, ev]) => `<article class="rule-card"><div class="rule-text"><h4>${esc(ev.icon)} ${esc(ev.name)} <span class="rule-meta">${{ neon: 'Neon-Arena', winter: 'Winter', garden: 'Garten' }[theme]}</span></h4><p>${esc(ev.desc)}</p></div></article>`).join('')}
        </section>

        <section id="r-punkte">
          <h3>Punkte &amp; Rundenende</h3>
          <ul>
            <li>Der Gewinner einer Runde bekommt die Werte aller Restkarten der anderen.</li>
            <li>Zahlenkarten: ihr Wert · Aussetzen, Richtungswechsel, +2, Säure, Lotterie: je <b>20</b> · Joker und Chaos-Karten: je <b>50</b> · DOOM-Karten: <b>100</b>. Bei Regen zählen nasse Karten doppelt.</li>
            <li>Wer das Punkteziel (200 / 300 / 500) erreicht, gewinnt das Spiel. „Aus“ = endlos weiterspielen.</li>
            <li>Notbremsen bei viel Chaos: Sind alle Karten verteilt, kommt ein frisches Deck ins Spiel. Nach 2000 Zügen gewinnt, wer die wenigsten Karten hat.</li>
          </ul>
          <h3>Tastatur</h3>
          <p><kbd>←</kbd> / <kbd>→</kbd> oder Mausrad: Karte auswählen · <kbd>↑</kbd> / <kbd>↓</kbd> Reihe wechseln (bei großer Hand) · <kbd>Enter</kbd> ausgewählte Karte spielen<br>
          <kbd>Leertaste</kbd> / <kbd>D</kbd> Karte ziehen · <kbd>L</kbd> Letzte Karte! · <kbd>Esc</kbd> Auswahl abbrechen / Fenster schließen</p>
          <h3>Große Hand</h3>
          <ul>
            <li>Die Karte unter dem Mauszeiger und ihre Nachbarn rücken auseinander (Lupe) – so bleibt auch bei 50+ Karten jede Karte auswählbar.</li>
            <li>Bist du dran und hast mehr als 12 Karten, stehen die <b>spielbaren Karten vorne</b> in einer eigenen Reihe, der Rest kompakt dahinter.</li>
            <li>Auf dem Handy: erster Tipp wählt die Karte aus, zweiter Tipp spielt sie.</li>
          </ul>
        </section>
      </div>
    </div>
  </div>`;
}
