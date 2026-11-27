// npm entry: mount(el, options) and the <hot-dog-run> custom element.
import Phaser from './phaser.js';
import { createGame } from '../game.js';

/** Runs Hot Dog Run inside `el`, at el's size. Returns { pause, resume, destroy }. */
export function mount(el, options) {
  if (!el || typeof el.appendChild !== 'function') throw new TypeError('hot-dog-run: mount(el) needs a DOM element');
  return createGame(Phaser, el, options);
}

// <hot-dog-run storage-key="..." capture-keys></hot-dog-run>
// Defaults to display:block, 100% wide (up to 800px) and 360px tall; size it with CSS.
// For custom images, use mount(el, options) or the React component instead.
export class HotDogRunElement extends HTMLElement {
  connectedCallback() {
    if (this._game) return;  // moved within the page: keep playing
    if (!this.shadowRoot) {
      this.attachShadow({ mode: 'open' }).innerHTML =
        '<style>:host{display:block;max-width:800px;height:360px}:host([hidden]){display:none}' +
        '.board{width:100%;height:100%}</style><div class="board" part="board"></div>';
    }
    this._game = mount(this.shadowRoot.querySelector('.board'), {
      storageKey: this.getAttribute('storage-key') || undefined,
      captureKeys: this.hasAttribute('capture-keys')
    });
  }

  disconnectedCallback() {
    // Wait a tick: a remove + re-insert (a move) shouldn't restart the game
    queueMicrotask(() => {
      if (this.isConnected || !this._game) return;
      this._game.destroy();
      this._game = null;
    });
  }

  pause() { if (this._game) this._game.pause(); }
  resume() { if (this._game) this._game.resume(); }
}

if (!customElements.get('hot-dog-run')) customElements.define('hot-dog-run', HotDogRunElement);
