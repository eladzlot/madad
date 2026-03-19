import { LitElement, html, css } from 'lit';
import { resetCSS } from '../styles/reset.js';
import { attachSwipe, SWIPE_THRESHOLD } from '../helpers/gestures.js';

export class ItemBinary extends LitElement {
  static properties = {
    item:       { type: Object },
    selected:   {},
    _dragDx:    { type: Number, state: true },
    _dragPhase: { type: String, state: true },
  };

  static styles = [resetCSS, css`
    :host {
      display: flex;
      flex-direction: column;
      min-block-size: 60dvh;
    }

    .question {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: var(--font-size-xl);
      font-weight: var(--font-weight-bold);
      color: var(--color-text);
      line-height: var(--line-height-tight);
      text-align: center;
      padding-block: var(--space-xl);
    }

    .card {
      will-change: transform;
      transition: transform 0.25s ease;
    }

    .card.dragging {
      transition: none;
    }

    .buttons {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--space-md);
    }

    .opt-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      min-block-size: calc(var(--item-min-touch) * 2.5);
      padding-block: var(--space-lg);
      padding-inline: var(--space-sm);
      border: 2px solid transparent;
      border-radius: var(--radius-lg);
      font-size: var(--font-size-lg);
      font-weight: var(--font-weight-bold);
      font-family: inherit;
      cursor: pointer;
      transition:
        background var(--transition-fast),
        border-color var(--transition-fast),
        opacity var(--transition-fast),
        transform var(--transition-fast);
    }

    .opt-btn.positive {
      background: color-mix(in srgb, var(--color-yes) 12%, transparent);
      color: var(--color-yes);
      border-color: color-mix(in srgb, var(--color-yes) 30%, transparent);
    }
    .opt-btn.positive:hover,
    .opt-btn.positive.drag-target {
      background: color-mix(in srgb, var(--color-yes) 22%, transparent);
      transform: scale(1.03);
    }
    .opt-btn.positive.selected,
    .opt-btn.positive.drag-commit {
      background: var(--color-yes);
      color: #fff;
      border-color: var(--color-yes);
    }

    .opt-btn.negative {
      background: color-mix(in srgb, var(--color-no) 12%, transparent);
      color: var(--color-no);
      border-color: color-mix(in srgb, var(--color-no) 30%, transparent);
    }
    .opt-btn.negative:hover,
    .opt-btn.negative.drag-target {
      background: color-mix(in srgb, var(--color-no) 22%, transparent);
      transform: scale(1.03);
    }
    .opt-btn.negative.selected,
    .opt-btn.negative.drag-commit {
      background: var(--color-no);
      color: #fff;
      border-color: var(--color-no);
    }

    .opt-btn:focus-visible {
      outline: 2px solid var(--color-border-focus);
      outline-offset: 2px;
    }

    .buttons.has-selection .opt-btn:not(.selected) {
      opacity: 0.4;
    }
  `];

  constructor() {
    super();
    this.item       = null;
    this.selected   = null;
    this._dragDx    = 0;
    this._dragPhase = 'idle';
    this._detachSwipe = null;
  }

  firstUpdated() {
    // Attach to host so entire component area is swipeable
    this._detachSwipe = attachSwipe(this, {
      onSwipeRight: () => this._selectByIndex(0),
      onSwipeLeft:  () => this._selectByIndex(1),
      onDrag: ({ dx, phase }) => {
        this._dragDx    = dx;
        this._dragPhase = phase;
      },
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._detachSwipe?.();
    this._detachSwipe = null;
  }

  _selectByIndex(index) {
    const opt = this.item?.options?.[index];
    if (opt == null) return;
    this._select(opt.value);
  }

  _select(value) {
    this.dispatchEvent(new CustomEvent('answer', {
      detail: { value },
      bubbles: true,
      composed: true,
    }));
    this.dispatchEvent(new CustomEvent('advance', {
      bubbles: true,
      composed: true,
    }));
  }

  render() {
    if (!this.item) return html``;

    const [opt0, opt1] = this.item.options ?? [];
    const hasSelection  = this.selected !== null && this.selected !== undefined;
    const dragging      = this._dragPhase === 'move';
    const width         = this.offsetWidth || 300;
    const commitThresh  = width * SWIPE_THRESHOLD;
    const dragRight     = dragging && this._dragDx > commitThresh;
    const dragLeft      = dragging && this._dragDx < -commitThresh;

    const cardStyle = dragging && this._dragDx !== 0
      ? `transform: translateX(${this._dragDx}px) rotate(${clamp(this._dragDx * 0.04, -12, 12)}deg);`
      : '';

    return html`
      <p class="question" id="binary-question">${this.item.text}</p>
      <div class="card ${dragging ? 'dragging' : ''}" style=${cardStyle}>
        <div
          class="buttons ${hasSelection ? 'has-selection' : ''}"
          role="group"
          aria-labelledby="binary-question"
        >
          <button
            class="opt-btn positive
              ${this.selected === opt0?.value ? 'selected' : ''}
              ${dragRight ? 'drag-commit' : ''}
              ${dragging && !dragRight && this._dragDx > 10 ? 'drag-target' : ''}"
            aria-pressed=${this.selected === opt0?.value ? 'true' : 'false'}
            @click=${() => opt0 && this._select(opt0.value)}
          >${opt0?.label}</button>
          <button
            class="opt-btn negative
              ${this.selected === opt1?.value ? 'selected' : ''}
              ${dragLeft ? 'drag-commit' : ''}
              ${dragging && !dragLeft && this._dragDx < -10 ? 'drag-target' : ''}"
            aria-pressed=${this.selected === opt1?.value ? 'true' : 'false'}
            @click=${() => opt1 && this._select(opt1.value)}
          >${opt1?.label}</button>
        </div>
      </div>
    `;
  }
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

customElements.define('item-binary', ItemBinary);
