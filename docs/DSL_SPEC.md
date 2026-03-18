# Render Layer Specification

Version 1.1

---

## 1. Overview

The render layer translates engine and orchestrator state into DOM. It is built on **Lit** (~6 kB gzipped) and follows a strict separation between:

- **Components** (`src/components/`) — Lit custom elements. Purely declarative. They receive data as properties, emit custom events, and manage their own DOM lifecycle. No knowledge of the engine, orchestrator, or session state.
- **Controller** (`src/controller.js`) — The single wiring layer. Reads from the engine and orchestrator, mounts and updates components, handles component events, calls back into the engine.
- **Helpers** (`src/helpers/`) — Reusable DOM-adjacent utilities. No business logic. Currently: `gestures.js`.

Components are independently testable in isolation (set properties, observe events). The controller can be tested by mocking components.

---

## 2. Architecture

### 2.1 Data flow

```
Orchestrator ──┐
               ├──▶ Controller ──▶ Components (Lit) ──▶ DOM
Engine ────────┘         ▲
                         │
                    Custom events
```

The controller is the only place where engine/orchestrator methods are called in response to DOM events. Components never import or reference engine or orchestrator.

### 2.2 Component contract

Every item component:
- Accepts a resolved `item` property (fully resolved — no `optionSetId`, no template strings)
- Accepts a `selected` property (`any | null`) — the current answer value, or `null`
- Fires an `answer` custom event with `detail: { value: any }` when the user makes a selection
- Fires an `advance` custom event when the user signals they want to move forward
- Manages its own internal interaction state (hover, focus, swipe preview) without calling out

`selected` and `answer.detail.value` are typed as `any` to accommodate current item types (single numeric value) and future types (arrays for select-many, objects for value+time, etc.).

The controller listens for `answer` and `advance` and calls:
```js
engine.recordAnswer(item.id, e.detail.value); // on answer
engine.advance();                              // on advance
```

For instructions items there is no `answer` event — only `advance`.

### 2.3 Item resolution

Before mounting a component, the controller runs the item through a resolution pipeline:

```js
function resolveItem(item, context) {
  return [
    resolveOptions,
    // future resolvers added here (e.g. template string substitution, conditional display rules)
  ].reduce((item, fn) => fn(item, context), item);
}
```

`context` carries everything resolvers may need:
```js
{
  questionnaire,   // for option set lookup
  session,         // for future use (e.g. patient name substitution in item text)
}
```

Each resolver is a pure function `(item, context) → item`. Components always receive a fully resolved item and never perform resolution themselves.

**`resolveOptions`** — for select items without inline `options`, looks up `item.optionSetId ?? questionnaire.defaultOptionSetId` in `questionnaire.optionSets` and inlines the result. Throws if the reference cannot be resolved (should not happen post-loader-validation).

### 2.4 Duplicate option values

Two options with the same `value` in the same item are a config error. Caught at load time by the loader's semantic validation (`ConfigError`). Components may assume option values are unique within an item.

### 2.5 Option order

Options are rendered in author-defined order — the order they appear in the config. No reordering is applied.

### 2.6 Controller responsibilities

```
controller.mount(container, orchestrator)
  — Calls orchestrator.start()
  — On onQuestionnaireStart: stores engine reference, mounts first item
  — Mounts and updates:
      <progress-bar>  (battery + item progress)
      <item-*>        (current item component, resolved)
      back button     (visibility + enabled state)
  — On answer event:  engine.recordAnswer(item.id, e.detail.value)
  — On advance event: result = engine.advance()
                      if result === null → orchestrator.engineComplete()
                      else → mount next item
  — On back:          engine.canGoBack()
                        ? engine.back() → mount previous item
                        : orchestrator.engineCrossBack()
  — On onSessionComplete: navigate to completion screen
```

### 2.7 Item mounting

Each time the engine returns a new item (from `advance()` or `back()`), the controller:

1. Resolves the item through the pipeline
2. Determines the component tag from `item.type` (`item-select`, `item-binary`, `item-instructions`)
3. If the mounted component is the same type, updates its properties in place
4. If the type changes, replaces the component entirely
5. Sets `selected` from `engine.answers()[item.id] ?? null`

Updating in place is preferred — it lets Lit animate between items without a full remount.

### 2.8 Auto-advance delay

After the `answer` event fires, the controller waits **150 ms** before calling `engine.advance()`. This gives the selection highlight time to render visibly before the screen transitions. The delay is a named constant in the controller (`ADVANCE_DELAY_MS = 150`). Instructions advance immediately on tap — no delay.

---

## 3. Styling

### 3.1 Approach

- **Component styles** — defined inline in each Lit component using the `css` tagged template. Scoped to shadow DOM. No bleed between components.
- **Design tokens** — CSS custom properties in `src/styles/tokens.css`, loaded globally. Components reference tokens via `var(--token)`.
- **Global styles** — `src/styles/main.css` imports `tokens.css`, applies base reset, `html`/`body` layout, font stack, and `dir="rtl"`. Nothing component-specific lives here.

No CSS preprocessor. Vite handles the imports.

### 3.2 Design tokens

Minimal initial values — enough to look reasonable during development. Visual design passes replace values without touching component code.

```css
/* Colour */
--color-bg:              #ffffff;
--color-surface:         #f5f5f5;
--color-border:          #d0d0d0;
--color-text:            #1a1a1a;
--color-text-muted:      #6b6b6b;
--color-primary:         #2563eb;
--color-primary-text:    #ffffff;
--color-selected-bg:     #eff6ff;
--color-selected-border: #2563eb;
--color-yes:             #16a34a;
--color-no:              #dc2626;

/* Spacing */
--space-xs:  4px;
--space-sm:  8px;
--space-md:  16px;
--space-lg:  24px;
--space-xl:  40px;

/* Typography */
--font-family:        system-ui, -apple-system, sans-serif;
--font-size-sm:       14px;
--font-size-md:       16px;
--font-size-lg:       20px;
--font-size-xl:       24px;
--font-weight-normal: 400;
--font-weight-bold:   600;
--line-height:        1.5;

/* Shape */
--radius-sm:    6px;
--radius-md:    10px;
--radius-lg:    16px;
--border-width: 1.5px;

/* Motion */
--transition-fast: 120ms ease;
--transition-med:  200ms ease;
```

All layout CSS uses logical properties (`inline-start`, `inline-end`, `block-start`, `block-end`). No `left`/`right` in layout rules.

---

## 4. Components

### 4.1 `<item-select>`

Renders a question with an ordered list of response options.

**Properties:**
| Property | Type | Description |
|---|---|---|
| `item` | object | Resolved item — `{ id, text, options: [{label, value}, ...] }` |
| `selected` | any\|null | Currently selected value, or null |

**Options:** ≥ 2 entries, author-defined order, values unique within the item.

**Rendering:**
- Question text as a prominent block at the top
- Options as a vertical list of tappable rows
- Selected option: filled background (`--color-selected-bg`), coloured border (`--color-selected-border`), plus a non-colour indicator (checkmark or bold label)
- Touch targets min 44px height, full width

**Interaction:**
- Tap/click → fires `answer`; controller waits 150 ms then calls `advance`
- Arrow keys up/down → move focus between options (wraps)
- Space on focused option → fires `answer` only (selects without advancing — allows review)
- Enter on focused option → fires `answer`; controller advances after delay

**ARIA:**
- `role="radiogroup"` on container, `aria-label` = question text
- Each option `role="radio"`, `aria-checked` reflects selected state

**Events:**
- `answer` — `detail: { value }` — on selection
- `advance` — no detail — on tap or Enter (controller fires after 150 ms delay)

**UI strings (inlined for now, extract to `src/strings.js` before release):**
- No additional UI strings beyond item content for this component

---

### 4.2 `<item-binary>`

Renders a yes/no question with two large answer targets.

**Properties:** same as `<item-select>`. Options always exactly two entries with values `0` (No) and `1` (Yes).

**Rendering:**
- Question text centered and prominent
- Two large answer zones; vertical stack on mobile, side-by-side on wide screens
- Yes zone accented with `--color-yes`; No zone with `--color-no`
- During drag: card rotates (`calc(var(--drag-x) * 0.05deg)`), target zone opacity increases proportionally

**Interaction:**
- Tap answer zone → `answer` + `advance` (via controller delay)
- Swipe right → Yes (1); swipe left → No (0) — via gesture utility, free horizontal swipe
- Overscroll down (at top of scroll) → back; overscroll up (at bottom) → forward (only if already answered)
- Arrow keys left/right → move focus; Enter → `answer` + `advance`

**Swipe preview:** `onDrag` sets `--drag-x` CSS custom property on the host element. CSS responds to it via `transform` and opacity. On `phase: 'end'` below threshold, element transitions back to neutral.

**ARIA:** same `radiogroup`/`radio` pattern.

**Events:** same as `<item-select>`.

---

### 4.3 `<item-instructions>`

Renders a non-scored instruction screen.

**Properties:**
| Property | Type | Description |
|---|---|---|
| `item` | object | `{ id, text }` |

No `selected` property.

**Rendering:**
- Text block, multi-paragraph (split on `\n`)
- "המשך" continue button, full width

**Interaction:**
- Tap continue or Enter → `advance` immediately (no 150 ms delay)

**Events:** `advance` only.

---

### 4.4 `<progress-bar>`

Display-only.

**Properties:**
| Property | Type | Description |
|---|---|---|
| `batteryProgress` | `{ current: number, total: number\|null }` | From `orchestrator.progress()` |
| `itemProgress` | `{ current: number, total: number\|null }` | From `engine.progress()` |
| `questionnaireName` | string | Display name of current questionnaire |

**Rendering:**
- Questionnaire name
- "שאלה N מתוך M" — hidden when total is null
- Filled progress bar — shown only when total is known
- Battery position ("שאלון 2 מתוך 4") — shown only when battery total > 1

---

## 5. Gesture Helper (`src/helpers/gestures.js`)

### 5.1 API

```js
attachSwipeListener(element, options) → detach()
```

| Option | Type | Default | Description |
|---|---|---|---|
| `onLeft` | fn | — | Confirmed left swipe |
| `onRight` | fn | — | Confirmed right swipe |
| `onUp` | fn | — | Confirmed up swipe (overscroll) |
| `onDown` | fn | — | Confirmed down swipe (overscroll) |
| `onDrag` | fn({dx, dy, phase}) | — | During drag; `phase`: `'start'`\|`'move'`\|`'end'` |
| `threshold` | number | 40 | Min px delta to confirm |
| `overscrollOnly` | boolean | false | If true, only trigger vertical gestures when the scroll container is already at its limit |
| `scrollContainer` | Element\|null | null | The scrollable element to check scroll position against (required when `overscrollOnly: true`) |

Returns `detach()` — removes all listeners. Must be called in `disconnectedCallback`.

### 5.2 Direction semantics

| Gesture | Direction | Mode | Target | Condition |
|---|---|---|---|---|
| Binary answer | left / right | free swipe | `<item-binary>` element | — |
| Back navigation | down | overscroll | `document` | `scrollContainer.scrollTop === 0` |
| Forward navigation | up | overscroll | `document` | at bottom of scroll AND item already answered |

**Back:** user is at the top of the scrollable content and continues pulling down — overscroll triggers back navigation.

**Forward:** user is at the bottom of the scrollable content and continues pulling up — overscroll triggers forward (only if the current item already has an answer recorded).

Item screens must scroll freely. The gesture utility never suppresses vertical scroll. It only intercepts vertical movement when the scroll container has already reached its limit in that direction.

### 5.3 Overscroll detection

```js
const atTop    = container.scrollTop === 0;
const atBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 1;
```

On `touchstart`, the current scroll position is captured. On `touchmove`, if the container is at its limit and the drag direction matches, the gesture is recognised. `preventDefault()` is **not** called — the overscroll rubber-band effect (where present) may still occur visually, which is acceptable.

### 5.4 Horizontal scroll conflict

For binary swipes (horizontal), the gesture utility calls `preventDefault()` on `touchmove` once horizontal direction is confirmed (after 10 px of horizontal movement), suppressing vertical scroll for that touch. The `touchmove` listener must be registered as **non-passive** for binary items only.

### 5.5 Reduced motion

`onDrag` still fires under `prefers-reduced-motion: reduce` — state updates happen. Components suppress CSS transitions and transform animations via a `@media (prefers-reduced-motion: reduce)` block in their styles.

### 5.6 Lit integration

```js
firstUpdated() {
  this._detachSwipe = attachSwipeListener(this, { ... });
}
disconnectedCallback() {
  super.disconnectedCallback();
  this._detachSwipe?.();
}
```

---

## 6. RTL and Localisation

- `dir="rtl"` set on `<html>` at app load. Components inherit it automatically via shadow DOM.
- UI strings (button labels, ARIA labels, progress format) are inlined as Hebrew directly in components for now. They will be extracted to `src/strings.js` before the first non-development release. `strings.js` will export a plain object keyed by string ID — a single-file change enables localisation.
- All layout CSS uses logical properties exclusively.

---

## 7. Accessibility

WCAG 2.1 AA target:

- Touch targets ≥ 44×44 px
- `:focus-visible` ring always present, never suppressed
- Selected state communicated by shape/text in addition to colour
- All swipe gestures have keyboard equivalents
- `prefers-reduced-motion`: animations and transitions set to `0ms`

---

## 8. Implementation order

1. `src/styles/tokens.css` + `src/styles/main.css`
2. `<item-select>` + minimal controller wiring (no gestures)
3. `src/helpers/gestures.js`
4. `<item-binary>`
5. `<item-instructions>`
6. `<progress-bar>`
7. Full controller + app shell integration
