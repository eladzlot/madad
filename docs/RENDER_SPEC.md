# RENDER_SPEC.md
**Status:** Current — derived from `controller.js`, `app-shell.js`, `item-likert.js`, `item-binary.js`, `item-instructions.js`, `progress-bar.js`, `welcome-screen.js`, `completion-screen.js`, `results-screen.js`, `gestures.js`, and their test files.

---

## 1. Architecture

The rendering layer is split into two parts with a strict boundary between them.

**Components** (`src/components/`) are Lit web components. They are passive: they receive data as properties, render it, and fire custom events. They contain no navigation logic and hold no session state.

**Controller** (`src/controller.js`) is a plain JS module. It creates and mutates components, handles their events, drives the engine and orchestrator, and manages the History API stack through the router. It is the only place where engine calls, orchestrator calls, and DOM mutations coexist.

Nothing in `src/engine/` or `src/config/` touches the DOM.

---

## 2. Controller

```js
import { createController } from './controller.js';

const controller = createController(container, router);
controller.start(config, batteryId, { createOrchestrator, session });
```

`container` is the host element the controller appends into. `router` is the router instance (see §3). All components must be registered (imported) in `app.js` before `start()` is called.

### 2.1 Internal State

| Variable | Type | Purpose |
|---|---|---|
| `_orchestrator` | orchestrator | Battery-level lifecycle |
| `_engine` | engine | Current questionnaire navigation |
| `_questionnaire` | object | Current questionnaire definition (for option resolution) |
| `_config` | object | Resolved config (for PDF report and results title lookup) |
| `_session` | object | `{ name, pid }` (for PDF report) |
| `_shellEl` | `<app-shell>` | Persistent shell mounted once |
| `_progressEl` | `<progress-bar>` | Mounted in shell progress slot |
| `_itemEl` | item component | Currently active item element; replaced on type change |
| `_advanceTimer` | timer ID | 150ms delay timer between answer and engine advance |
| `_locked` | boolean | True once patient proceeds to results; all navigation ignored |

### 2.2 Startup Sequence

`start()` runs in this order:
1. Stores `_config`, `_session`
2. Registers `router.onBack` and `router.onForward` handlers
3. Calls `mountShell()` — creates `<app-shell>` and `<progress-bar>`, appends to container
4. Creates the orchestrator with the three callbacks
5. Calls `orchestrator.start()` — synchronously fires `onQuestionnaireStart` for the first questionnaire

### 2.3 Item Element Lifecycle

`getOrCreateItemEl(tag)` reuses the existing item element if its tag matches, otherwise removes the old one and creates a new one. The `answer` and `advance` event listeners are attached once on creation.

`mountItem(item)`:
1. Resolves the item's options via `resolveItem()` (inlines the option set if needed — see §2.4)
2. Gets or creates the element for the item's type
3. Sets `el.item = resolvedItem` and `el.selected = answers[item.id] ?? null`
4. Calls `updateNav()`

### 2.4 Option Resolution

Items in config may reference a shared option set by ID rather than inlining options. The controller resolves this before passing the item to a component:

- If `item.type` is not `likert` or `binary`, the item is returned unchanged.
- If `item.options` already exists, the item is returned unchanged.
- Otherwise: `setId = item.optionSetId ?? questionnaire.defaultOptionSetId`, then `options = questionnaire.optionSets[setId] ?? []` is merged into a new item object.

Components always receive a fully resolved item with an `options` array inline.

### 2.5 Nav State (`updateNav`)

Called after every answer event and after every `mountItem`. Sets:

```js
_shellEl.canGoBack    = engine.canGoBack() || orchestrator.currentEngine() !== _engine;
_shellEl.canGoForward = hasAnswer && !engine.isComplete();

_progressEl.itemProgress      = engine.progress();
_progressEl.batteryProgress   = orchestrator.progress();
_progressEl.questionnaireName = questionnaire.title ?? '';
```

The `canGoBack` expression is true when the engine can go back within the questionnaire, or when the patient is not on the first questionnaire (cross-battery back is possible).

### 2.6 Answer and Advance Flow

**`answer` event** fires from item components when the patient selects a response. The controller:
1. Calls `engine.recordAnswer(item.id, value)`
2. Sets `_itemEl.selected = value` immediately (no wait for re-render)
3. Calls `updateNav()`

**`advance` event** fires from item components when the patient commits a response (tap on Likert/binary, continue button on instructions). The controller:
1. Clears any pending timer
2. Immediately sets `_shellEl.canGoForward = false` (prevents a flash of the forward button during the delay)
3. Sets a timer: 0ms for instructions items, 150ms for all others
4. On timer: calls `engine.advance()`
   - If the result is a leaf node: calls `router.push('q')`, then `mountItem(next)`
   - If the result is `null`: calls `orchestrator.engineComplete()`

The 150ms delay gives the selected-state animation time to play before the screen transitions.

### 2.7 Navigation via popstate

The shell's `back` and `forward` buttons call `history.back()` / `history.forward()` — they never call engine or orchestrator directly. All navigation is driven by the router's `onBack` / `onForward` callbacks, which the controller registers at startup.

**`_onPopBack(screen)`:**
- Returns immediately if `_locked`
- If `screen === 'welcome'`: calls `location.reload()` (restarts the session)
- Removes any `<completion-screen>` present and re-enables gestures
- Calls `engine.back()` if `engine.canGoBack()`, otherwise calls `orchestrator.engineCrossBack()`

**`_onPopForward(screen)`:**
- Returns immediately if `_locked`
- If `screen === 'complete'`: remounts the completion screen if it isn't already present
- If `screen === 'q'`: re-advances the engine (subject to the same 150ms/0ms delay as a normal advance event) — does nothing if the current item is unanswered

### 2.8 Orchestrator Callbacks

**`onQuestionnaireStart(engine, sessionKey, questionnaire)`:**
Stores `_engine` and `_questionnaire`. Calls `engine.advance()` for the first item. If it returns null (empty questionnaire), calls `orchestrator.engineComplete()` immediately. Otherwise calls `router.push('q')` and `mountItem(first)`.

**`onSessionComplete(sessionState)`:**
1. Removes `_itemEl` and `_progressEl`
2. Sets `_shellEl.canGoBack = true`, `canGoForward = false`
3. Disables gestures for 400ms to absorb any trailing touch from the last answer tap, then re-enables
4. Calls `router.push('complete')`
5. Creates and appends `<completion-screen>`
6. Attaches a `{ once: true }` listener for the `view-results` event → `_onViewResults(sessionState)`

**`_onViewResults(sessionState)`:**
1. Removes `<completion-screen>`
2. Sets `_locked = true`
3. Calls `router.replace('results')` — replaces rather than pushes so back from results goes to `'complete'`'s `pendingBefore`, not back to `'complete'`
4. Sets `_shellEl.canGoBack = false`, `canGoForward = false`
5. Builds the results array: `[{ title, total }]` for each score in `sessionState.scores`
6. Creates `<results-screen>`, sets `results`, `canShare`, and `onDownload`
7. Appends to shell

**`onError(err)`:** Replaces container `innerHTML` with an RTL error message, `console.error`s.

### 2.9 PDF Delivery

The `onDownload` function set on `<results-screen>`:
1. Calls `generateReport(sessionState, _config, _session)` → `{ blob, filename }`
2. If `navigator.canShare?.({ files: [...] })` is true: calls `navigator.share(...)`. On `AbortError` (user cancelled), returns without fallback.
3. Otherwise (desktop or share failed for non-abort reason): creates an `<a download>`, appends to body, clicks it, removes it, revokes the object URL.

---

## 3. Router

The router is a History API wrapper. The controller registers two handlers: `router.onBack(fn)` and `router.onForward(fn)`. Both receive a screen name string.

Screen names are stored as `state.screen` in the history entry. A monotonic `pos` counter is embedded in every entry to determine direction on `popstate`.

| Method | Behaviour |
|---|---|
| `router.push(screen)` | `history.pushState({ screen, pos }, '')` |
| `router.replace(screen)` | `history.replaceState({ screen, pos }, '')` |
| `router.onBack(fn)` | Registers back handler; called with screen name when pop goes backward |
| `router.onForward(fn)` | Registers forward handler; called with screen name when pop goes forward |

Screen name values used by the controller: `'welcome'`, `'q'`, `'complete'`, `'results'`.

`'welcome'` is pushed by `app.js` before the welcome screen is shown, so popping back from the first question reloads the page.

`'results'` is reached via `router.replace('complete' → 'results')`, so there is no history entry for `'complete'` that the patient can pop forward into from results.

---

## 4. Components Reference

All components use Lit, are defined as custom elements, use shadow DOM, and support RTL layout via CSS logical properties. All custom events bubble and compose.

---

### 4.1 `<app-shell>`

**File:** `src/components/app-shell.js`  
**Tag:** `app-shell`

The persistent chrome. Renders a sticky header with back/forward navigation buttons and a progress slot, and a scrollable main content area with a default slot for item components.

**Properties:**

| Property | Type | Default | Description |
|---|---|---|---|
| `canGoBack` | Boolean | `false` | Back button visibility |
| `canGoForward` | Boolean | `false` | Forward button visibility |
| `gesturesEnabled` | Boolean | `true` | Whether overscroll gestures are active |

Both nav buttons are rendered always. When their corresponding property is false, they have `opacity: 0; pointer-events: none` — they do not reflow.

**Events fired:**

| Event | When |
|---|---|
| `back` | Back button tapped or overscroll pull-down committed |
| `forward` | Forward button tapped or overscroll pull-up committed |

**Gesture integration:** On `firstUpdated`, attaches `attachOverscroll` to the `.content` scroll element. Pull-down fires `back`; pull-up fires `forward`. Both are gated by `gesturesEnabled` and the corresponding `canGo*` property.

**Slots:**

| Slot | Used for |
|---|---|
| `progress` | `<progress-bar>` |
| (default) | item components, `<completion-screen>`, `<results-screen>` |

---

### 4.2 `<progress-bar>`

**File:** `src/components/progress-bar.js`  
**Tag:** `progress-bar`

Display-only. Shows item position within the current questionnaire and questionnaire position within the battery.

**Properties:**

| Property | Type | Description |
|---|---|---|
| `itemProgress` | `{ current: number, total: number\|null }` | From `engine.progress()` |
| `batteryProgress` | `{ current: number, total: number\|null }` | From `orchestrator.progress()` |
| `questionnaireName` | String | Questionnaire title |

Rendering rules:
- Item count (`שאלה N מתוך M`) is shown only when `itemProgress.total != null`.
- The fill track is shown only when `itemProgress.total != null`.
- Battery row (`שאלון N מתוך M`) is shown only when `batteryProgress.total != null` AND `batteryProgress.total > 1` (suppressed for single-questionnaire sessions).

---

### 4.3 `<item-likert>`

**File:** `src/components/item-likert.js`  
**Tag:** `item-likert`

Renders a Likert-scale question with selectable option buttons.

**Properties:**

| Property | Type | Description |
|---|---|---|
| `item` | Object | Resolved item: `{ id, text, options: [{ label, value }, ...] }` |
| `selected` | any | Currently selected value, or `null` |

**Events fired:**

| Event | Payload | When |
|---|---|---|
| `answer` | `CustomEvent({ detail: { value } })` | A button is clicked or Enter is pressed on a focused button |
| `advance` | `CustomEvent` | Immediately after `answer`, on the same interaction |

Space bar on a focused button fires `answer` only (select without advancing). This allows reviewing or changing a selection via keyboard without immediately navigating forward.

**ARIA:** The option list has `role="radiogroup"` with `aria-labelledby` pointing to the question text. Each button has `role="radio"` and `aria-checked`.

**Keyboard navigation:** Arrow keys move focus between options (wrapping). Enter commits and advances. Space selects without advancing. Focus follows selection.

---

### 4.4 `<item-binary>`

**File:** `src/components/item-binary.js`  
**Tag:** `item-binary`

Renders a binary yes/no question with two large buttons and swipe gesture support.

**Properties:**

| Property | Type | Description |
|---|---|---|
| `item` | Object | Resolved item: `{ id, text, options: [{ label, value }, { label, value }] }` — always exactly 2 options |
| `selected` | any | Currently selected value, or `null` |

The first option (`options[0]`) is the positive/yes button (green tones); the second (`options[1]`) is the negative/no button (red tones). When one is selected, the other fades to 40% opacity.

**Events fired:** Same as `<item-likert>` — `answer` then `advance` on selection.

**Swipe gesture:** On `firstUpdated`, attaches `attachSwipe(this, ...)`. Swipe right → selects `options[0]`; swipe left → selects `options[1]`. The card translates and rotates during dragging (via `_dragDx` and `_dragPhase` internal state). Commitment threshold: 40% of element width (`SWIPE_THRESHOLD`). The visual drag transform uses `translateX(dx) rotate(dx * 0.04deg)` clamped to ±12°.

---

### 4.5 `<item-instructions>`

**File:** `src/components/item-instructions.js`  
**Tag:** `item-instructions`

Renders a non-scored instruction block with a continue button.

**Properties:**

| Property | Type | Description |
|---|---|---|
| `item` | Object | `{ id, text }` |

`item.text` is split on `\n` and each non-empty fragment rendered as a `<p>`.

**Events fired:** `advance` only (no `answer` event — instruction items are not scored).

**Keyboard:** Enter and Space on the continue button fire `advance`.

**Controller timing:** The controller applies a 0ms delay (not 150ms) for instructions advances, because there is no selected-state animation to wait for.

---

### 4.6 `<welcome-screen>`

**File:** `src/components/welcome-screen.js`  
**Tag:** `welcome-screen`

Shown before the session. Displays the battery title, introductory text, a name input, and a begin button. Not managed by the controller — used directly by `app.js`.

**Properties:**

| Property | Type | Description |
|---|---|---|
| `batteryTitle` | String | Shown as `<h1>` if non-empty |

**Events fired:**

| Event | Payload | When |
|---|---|---|
| `begin` | `CustomEvent({ detail: { name: string } })` | Begin button tapped or Enter pressed in name input |

`name` is trimmed before dispatch. May be an empty string (name field is optional).

---

### 4.7 `<completion-screen>`

**File:** `src/components/completion-screen.js`  
**Tag:** `completion-screen`

Shown after all questions are answered. Confirms completion, reminds the patient they can still go back, and offers a button to proceed to results.

**No properties.**

**Events fired:**

| Event | Payload | When |
|---|---|---|
| `view-results` | `CustomEvent` | "צפה בתוצאות" tapped |

The controller listens with `{ once: true }`. Navigation lock (`_locked = true`) is set by the controller in response to this event, not by this component.

---

### 4.8 `<results-screen>`

**File:** `src/components/results-screen.js`  
**Tag:** `results-screen`

Shown after session lock. Displays one score row per questionnaire and a PDF delivery button.

**Properties:**

| Property | Type | Description |
|---|---|---|
| `results` | `Array<{ title: string, total: number\|null }>` | One entry per completed questionnaire |
| `canShare` | Boolean | If true, button label is "שתף דוח PDF"; if false, "הורד דוח PDF" |
| `loading` | Boolean | If true, button label is "מכין דוח..." and button is disabled |
| `onDownload` | Function (async) | Assigned by the controller; called when button is tapped |

`loading` is managed internally by the component: set to `true` before calling `onDownload()`, reset to `false` in the `finally` block.

The component does not know about the Web Share API. That logic lives entirely in the `onDownload` function assigned by the controller.

Score rows: when `total` is `null`, displays "—" in muted style. When `total` is a number, displays in primary colour bold.

---

## 5. Gesture Utilities

**File:** `src/helpers/gestures.js`

Two exported functions, both returning a `detach()` function to remove all listeners.

### `attachSwipe(element, options) → detach`

Attaches touch listeners to `element`. Tracks horizontal pointer movement and fires committed-swipe callbacks when the drag exceeds a threshold.

**Options:**
- `onSwipeRight()` — committed rightward swipe
- `onSwipeLeft()` — committed leftward swipe
- `onDrag({ dx, phase })` — called on every move (`phase`: `'start'` | `'move'` | `'end'`)
- `threshold` — fraction of element width (default `SWIPE_THRESHOLD = 0.4`)

**Axis locking:** On the first touch movement exceeding 6px, the axis is determined by which delta is larger. If locked to vertical, no swipe callbacks fire and scroll is not prevented. If locked to horizontal, `e.preventDefault()` is called on `touchmove` to prevent scroll.

**Commitment:** On `touchend`, if the absolute `dx / element.offsetWidth >= threshold`, the appropriate swipe callback fires once. Repeated callbacks within one gesture are prevented by a `committed` flag.

Used by: `<item-binary>` (attached to the host element in `firstUpdated`).

### `attachOverscroll(scrollEl, options) → detach`

Attaches touch listeners to a scrollable element. Fires callbacks when the user pulls past a scroll boundary.

**Options:**
- `onPullDown()` — fired when user pulls down past the top boundary (go back)
- `onPullUp()` — fired when user pulls up past the bottom boundary (go forward)
- `threshold` — pixels past boundary (default `OVERSCROLL_THRESHOLD = 60`)

"Past the top boundary" means `scrollEl.scrollTop <= 0` at the moment `dy > threshold`. "Past the bottom boundary" means `scrollTop + clientHeight >= scrollHeight - 1` (handles both scrollable and non-scrollable content).

Each gesture fires at most one callback (`fired` flag, reset on `touchend`).

Used by: `<app-shell>` (attached to the `.content` scroll element in `firstUpdated`).

**Exported constants:**
```js
SWIPE_THRESHOLD      = 0.4   // 40% of element width
OVERSCROLL_THRESHOLD = 60    // 60px past boundary
```
