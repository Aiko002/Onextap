# Onextap — UI / UX Design

The design system and interaction model as implemented at commit `9b01adb`
(2026-09-09), with the signed-in dashboard updated for the DEMO_DASH
integration (2026-09-26; §2.1, §3.2, §3.4, the tour, §6, §9). Every token, dimension and behaviour here is read from
`tailwind.config.js`, `src/index.css` and the components under
`src/components/`
— this is documentation of a built interface, not a proposal.

**Related:** [`prd.md`](prd.md) · [`app-flow.md`](app-flow.md) · [`trd.md`](trd.md)

---

## 1. Design principles

1. **The popup does one thing.** It is 400×600 and appears over someone
   else's form. It fills, it does not edit. Editing lives in the dashboard.
2. **Never destroy user input.** Autofill skips fields that already have a
   value; resume parsing merges over the profile instead of replacing it.
   The one deliberate exception is cover-letter fill, where overwriting is
   the point.
3. **Say what happened, with a number.** "Filled 12 fields", not "Done".
   "Generated without job-page context" instead of a silently worse answer.
4. **Failure is inline and actionable.** Errors render where the action was,
   carry the underlying message, and offer a retry — not a toast that
   vanishes.
5. **Warm, not corporate.** Cream and olive, a serif display face, generous
   spacing. It is a tool used during a stressful task; it should not read
   like an HR portal.
6. **One codebase, two surfaces.** Every component must survive both a 400px
   popup and a full-width browser tab.

---

## 2. Design tokens

### Palette (`tailwind.config.js` → `colors.onextap`)

| Token | Hex | Role |
|---|---|---|
| `primary` | `#2D4A2D` | Primary actions, active nav, brand accents |
| `primary-dark` | `#3D5C3D` | Gradient end, hover |
| `primary-light` | `#5A7A3A` | Eyebrow labels, dark-mode accents |
| `olive-muted` | `#E8EFD8` | Badge and icon-tile backgrounds |
| `olive-pale` | `#C8D8A8` | Dark-mode text accent, numerals |
| `dark` | `#1A1A14` | Primary text on light |
| `secondary` | `#4A4A38` | Body text |
| `muted` | `#7A7A64` | Meta, placeholders |
| `cream` | `#F5F2EC` | App background (light) |
| `cream-dark` | `#EDE9E0` | Alternating sections, sidebar |
| `bark` / `bark-mid` | `#3A2E1C` / `#5C4A2A` | Warm neutral accents |
| `night` | `#1A2414` | App background (dark) |
| `night-surface` | `#1E2A18` | Panels, sidebar (dark) |
| `night-card` | `#243020` | Cards (dark) |

Semantic colours come from Tailwind defaults: red for errors, amber for
warnings and Premium, green for success.

These are the landing page's and the popup's tokens. Each one is written as
`rgb(var(--ox-<name>, <this hex>) / <alpha-value>)`, so everywhere the
variable is unset it resolves to exactly the hex above.

### 2.1 Signed-in dashboard (`src/components/dashboard/dashboard.css`)

The dashboard is ported from **UncannySteel/DEMO_DASH** and uses that
design's own palette and faces, scoped under the `.oxd` root so nothing leaks
into the landing page or the popup. One committed visual world — not a
light/dark theme: forest-black chrome, an oat workspace sheet, citrine as the
one loud note.

| Token | Hex | Role |
|---|---|---|
| `--ink` | `#0C1710` | Top bar, dock, hero stage; solid buttons |
| `--ink-2` / `--moss` | `#121E14` / `#223019` | Raised surfaces on ink |
| `--moss-line` | `#31432A` | Hairlines on ink |
| `--bone` / `--bone-2` | `#E9E4D4` / `#DDD7C4` | The workspace sheet; one step down |
| `--bone-line` | `#C8C1AC` | Hairlines and field borders on oat |
| `--citrine` / `--citrine-deep` | `#C6DA43` / `#9FB52C` | Active nav thumb, accents, numerals |
| `--ash` / `--ash-deep` | `#8C9585` / `#5E6858` | Secondary type on ink / on oat |
| `--i1`…`--i6` (+ `bg`) | olive, clay, slate, plum, teal, amber | Muted tints: chips and notices; clay is "danger" |

| Face | Variable | Use |
|---|---|---|
| Archivo (condensed, 62%) | `--display` | Uppercase display: user name, workspace titles, prices |
| Instrument Serif | `--voice` | Card labels, panel titles, tagline (italic) |
| Instrument Sans | `--ui` | Everything else |
| DM Mono | `--mono` | Field labels, numerals, credits, the dialog address bar |

The shell loads these from Google Fonts when it mounts. Inside `.oxd` the
`--ox-*` variables are set to this palette, which is how the shared
components rendered in a workspace (profile and resume switchers, the
cover-letter panel, the fabrication notice) take it on without a prop.
**Never set an `--ox-*` variable outside `.oxd`** — that would restyle the
landing page and popup.

### Typography

| Face | Stack | Use |
|---|---|---|
| Display | `Instrument Serif`, Georgia, ui-serif | Headings, hero, big numerals |
| Sans | `DM Sans`, ui-sans-serif, system-ui | Everything else |

Loaded from Google Fonts in `index.html`. Base body is 15px with relaxed
leading. Headings run 32–56px with `-0.02em` tracking; eyebrow labels are
11px uppercase at `0.12em`. The serif is used sparingly — headings and the
big step numerals — and italic-but-not-italic emphasis (`<em class="not-italic">`)
in a contrasting green is the recurring headline device.

### Shape and depth

- Radii: `10px` icon tiles, `14px` cards and panels, `2xl` buttons and
  modals, `rounded-full` badges.
- Borders: `rgba(42,60,28,0.12)` on light, `rgba(200,216,168,0.15)` on dark.
- Shadows are soft and green-tinted: `0 8px 32px rgba(42,60,28,0.06)` at rest,
  deeper on hover. Dark mode swaps to black at higher opacity.
- Depth comes from tinted blur orbs behind hero and card corners, not from
  heavy elevation.

---

## 3. Surfaces

### 3.1 Extension popup — 400 × 600

```text
┌────────────────────────────────────────┐
│ [icon] Onextap            [Dashboard]  │  header
│ ┌────────────────────────────────────┐ │
│ │ Application type          ▾        │ │  select
│ ├────────────────────────────────────┤ │
│ │ Profile: Default          ▾        │ │  ProfileSwitcher (compact)
│ ├────────────────────────────────────┤ │
│ │ Autofill │ Saved Answers │ Cover   │ │  segmented tabs
│ └────────────────────────────────────┘ │
├────────────────────────────────────────┤
│  What to fill                      ▾   │  detected sections only
│   ☑ 👤 Personal Info                   │
│   ☑ 🎓 Education                       │
│   ☑ 💼 Work Experience                 │
│                                        │
│  ┌──────────────────────────────────┐  │
│  │  ✎  Open Answer Studio           │  │  primary, filled
│  └──────────────────────────────────┘  │
│  ┌──────────────────────────────────┐  │
│  │  📋 Autofill Application         │  │  secondary, outlined
│  └──────────────────────────────────┘  │
└────────────────────────────────────────┘
```

- The document is forced to 400×600 in `popup.jsx`; the layout is a flex
  column with one scrolling region, capped at 360px content width.
- Tabs are driven by the application type's feature flags. If the active tab
  is disabled by a type change, the first allowed tab takes over.
- Without a profile, everything collapses to a single empty state pointing at
  the dashboard.
- The autofill button doubles as the status line: `Autofill Application` →
  `Loading...` → `Filled 12 fields` → back after 2s. When some sections are
  off it reads `Autofill (2 of 4 sections)`.
- "What to fill" is collapsed by default and lists only sections the page
  actually appears to contain; cover letter additionally requires a saved
  template.

### 3.2 Dashboard — home hero and docked workspaces

```text
Home (#/)                                  Workspace (#/<slug>)
┌ ONEXTAP ─────────────────────── ⚙ ┐      ┌ ONEXTAP ───────────────────────── ⚙ ┐
│                                   │      │ ⠿      ▢ ▣ ▢ │ ─────────────────────── │
│             ( AL )                │      │ (AL) ADA …   │ 01 WORKSPACE             │
│         ADA LOVELACE              │      │      STANDARD│    JOB MATCHES           │
│           [STANDARD]              │      │ ──────────── │    Roles from the live … │
│  Welcome back, Ada. Pick up …     │      │ ▢ Overview   │  ┌ A · RESUME ─────────┐ │
│ ┌01────┐┌02────┐┌03────┐┌04────┐ │      │█ Job Matches█│  │ Your resume         │ │
│ │ Job  ││ My   ││Answer││Cover │ │      │ ▢ My Profiles│  └─────────────────────┘ │
│ │Match…││Prof… ││Studio││Letter│ │      │ ▢ Answer …   │  ┌ B · FILTERS ────────┐ │
│ └──────┘└──────┘└──────┘└──────┘ │      │ ▢ Cover …    │  …                       │
├ CONTACT US ─────── PRIVACY POLICY ┤      └──────────────┴──────────────────────────┘
```

- **Home** is the hero: avatar (device-stored upload, else the OAuth
  picture, else initials), the name in condensed display type rising word
  by word, the verified plan tag, and one card per enabled workspace.
  Hovering a card lifts it, wipes a citrine edge along its top and rolls
  its label into citrine italic.
- **Opening a workspace** turns the same profile block and cards into a
  **dock**: left, right, or floating (drag the grip bar; drop near an edge
  to re-dock; double-click to toggle). Its inner edge resizes it (200–480px,
  arrow keys / Home / End when focused; double-click resets). The layout
  persists through `src/storage.js` as `onextap_dashboard_dock`. A citrine
  thumb slides to the open workspace.
- **The sheet** is oat, with a chapter head (numbered label, display title,
  one-line description) and the content column aligned to the title.
  Content is built from `ws-panel` cards with a lettered eyebrow and a serif
  title, `field` / `field-input` controls (mono label above, white field,
  citrine focus ring), pill buttons, `chip`s and `notice`s. Long forms get a
  sticky pill toolbar (profile switcher + Save).
- Route changes run in a View Transition where available: the sheet is dealt
  in from home, dealt over the previous one between workspaces, and slid away
  on the way home.
- Workspaces are filtered by the application type's feature flags; a route
  to a disabled one falls back home.

### 3.3 Landing page

Sections in order: sticky nav (`68–72px`) → hero → features → how it works →
pricing → FAQ → CTA band → auth. Content is capped at `1100px` with 6/12
gutters. Alternating cream and white bands separate sections.

The hero's right half is a mock browser chrome showing a LinkedIn apply URL
with fields visibly filling — the product demo *is* the illustration.

Section content: 6 feature cards, 3 numbered steps (dashed connectors between
them on desktop), 2 pricing cards (Free / Premium, Premium in solid green
with a "Most Popular" chip), 6 accordion FAQs, and an inline auth panel at
`#auth` so sign-up never leaves the page.

### 3.4 Modals

| Modal | Surface | Purpose | Notable |
|---|---|---|---|
| `PremiumModal` | Landing page | $5/month upsell | Gradient header, 4 benefit ticks, "Secure payment powered by Dodo Payments" |
| `SettingsMenu` | Dashboard | Email, live credits, account actions | A small ink window under the gear; rows rise in on a stagger; full arrow-key / Home / End / Escape handling |
| `SubscriptionDialog` | Dashboard | Current plan, both plans, upgrade or cancel | Native `<dialog>` dressed as an oat window under a browser bar; cancel needs an in-panel confirm |
| `DeleteAccountDialog` | Dashboard | Local wipe + sign-out | Requires typing `DELETE`; says plainly that the server account and any Premium subscription remain |

`PremiumModal`: `bg-black/50` scrim, click-outside to close. The dashboard's
dialogs are native `<dialog>`s opened with `showModal()`, so focus is trapped,
Escape closes them, and focus returns to the opener.

---

## 4. Component patterns

### Toast

Fixed bottom-centre, `z-[100]`, `role="status"`. Three types: `success`
(green tick), `error` (red triangle), `loading` (spinning `Activity`).
Success and error self-dismiss after 3s; loading persists until the caller
clears it — used for "AI is thinking…" across a 90-second call.

### Profile switcher

Same component in both surfaces via a `compact` prop. Inline create, rename
and delete with per-action validation messages, and a confirm step before
delete. Errors render in the dropdown, not as toasts, because the user is
mid-edit.

### Empty states

Every list ships one: no profile in the popup (→ dashboard), no saved
answers, no cover-letter templates. Each names the next action rather than
describing the emptiness.

### Inline error blocks

The credits panel is the reference implementation: amber block, the actual
error text, a hint naming the likely configuration cause, and a "Try again"
button. Nothing is swallowed and nothing is a dead end.

### Guided tour

Four steps on the home view, anchored by `data-tour` attributes: the
workspace cards → My Profiles → Answer Studio → the settings gear. A citrine-
ringed spotlight marks the target and a small ink window sits beside it;
Escape skips. "Take the tour" in the settings menu replays it.

It fires **only** for accounts created within the last 2 minutes and only if
`onextap_tutorial_seen` is unset; existing accounts get the flag set silently
so a returning user is never interrupted.

### Splash

2 seconds on dashboard boot: logo bounce, wordmark fade, progress bar, then a
0.5s exit fade. Suppressed under `prefers-reduced-motion` (animations set to
`none`, elements to full opacity).

---

## 5. Motion

| Class | Effect | Where |
|---|---|---|
| `animate-fade-in` | 0.3s fade + rise | Page and tab transitions |
| `reveal` / `reveal-scale` / `reveal-left` | Scroll-triggered entrance | Landing sections |
| `stagger-1…7` | 50ms increments | Card grids |
| `oxd-word-rise` / `[data-rise]` | Masked words rise; blocks rise on a stagger | Dashboard names and chapter heads |
| View Transitions (`html[data-vt]`) | Sheet dealt in / over / away | Dashboard routing |
| `feature-card-hover` | Lift + shadow | Feature and shortcut cards |
| `animate-soft-pulse` | 2.5s pulse | Attention accents |
| `toastSlideIn` / `toastFadeOut` | 0.3s / 0.2s | Toasts |
| `splashLogoBounce` | Spring curve | Splash |

Easing is consistent: `cubic-bezier(0.16, 1, 0.3, 1)` for entrances,
`cubic-bezier(0.34, 1.56, 0.64, 1)` where a slight overshoot is wanted.
Hovers are 300ms; nothing decorative exceeds 600ms.

`prefers-reduced-motion: reduce` disables the splash animation set and flips
all reveal classes to their final state with no transition.

---

## 6. Dark mode

Class-based (`darkMode: 'class'`), toggled on `documentElement` and persisted
to `onextap_dark_mode`. First run defaults to
`window.matchMedia('(prefers-color-scheme: dark)')`.

Not an inversion — a separate palette. Cream backgrounds become `night`
(`#1A2414`), panels `night-surface`, cards `night-card`; text becomes
`#E8EFD8` with `#9AB07A` for secondary; the primary green stays but accents
shift to `olive-pale` for contrast against dark ground. Shadows deepen to
black at higher opacity. Scrollbar thumbs have their own dark variants.

The landing page carries its own copy of the toggle so a signed-out visitor
can switch themes.

The signed-in dashboard does not use it: it is DEMO_DASH's single visual
world. While the shell is mounted it removes `dark` from `<html>` (so shared
components on the oat sheet take their light variants) and puts it back on
unmount, leaving the stored preference untouched for the landing page.

---

## 7. Content and voice

- **Sentence case** everywhere except eyebrow labels.
- **Concrete over vague:** "Filled 12 fields", "3 credits", "$5.00/month".
- **Errors name the fix:** "Open the dashboard from the extension popup
  (Dashboard button) to link it", not "Sync failed".
- **The vocabulary follows the application type.** "Cover Letter" becomes
  "Personal Statement" for college and "Scholarship Essay" for scholarships;
  "Answer Studio" becomes "Application Essays". The relabelling reaches the
  AI instructions too, not just the chrome.
- **AI is framed as a draft, never an authority.** The output lands in an
  editable field beside the original, and the FAQ says plainly that the user
  reviews everything.

---

## 8. Accessibility

### Implemented

- `role="status"` on toasts, so status changes are announced.
- `aria-label` on icon-only controls (theme toggle, close buttons).
- Native `<button>`, `<select>` and `<input>` elements throughout — keyboard
  and screen-reader behaviour comes for free.
- `prefers-reduced-motion` honoured for the splash and every reveal class.
- Disabled states carry a `title` explaining why (e.g. "Select at least one
  section to fill.").
- Body text meets AA against cream and night backgrounds in both themes.

### Gaps

| Gap | Impact |
|---|---|
| No `aria-live` on the autofill status line | The result count is not announced; it is only visible text on a button |
| Modals do not trap focus or restore it on close | Keyboard users can tab behind the scrim |
| No `Escape`-to-close on modals | Click-outside is the only dismissal besides the ✕ |
| Tour overlay is not keyboard-navigable | Steps advance only by click |
| FAQ accordions lack `aria-expanded` / `aria-controls` | State is not exposed to assistive tech |
| Dropdowns are custom, not `role="listbox"` | Arrow-key navigation is absent in the profile switcher |
| Focus-visible styling is inconsistent | Some custom buttons rely on the browser default only |

---

## 9. Responsive behaviour

| Surface | Breakpoints |
|---|---|
| Popup | Fixed 400×600. No breakpoints; content capped at 360px |
| Dashboard | Home fits one screen down to ~540px tall; cards go 4 → 2 columns under 760px. In a workspace, the dock collapses to a 64px icon rail under 760px and floating is disabled |
| Landing | Fully responsive: `md:` switches hero, features, steps and pricing from 1 to 2–3 columns; a hamburger replaces the nav on mobile |


---

## 10. Known UI gaps

| # | Gap | Note |
|---|---|---|
| U1 | Section toggles do not affect the fill | The UI implies a partial fill; `autofill()` ignores the `sections` payload |
| U2 | Premium benefits listed in the modal and pricing card are not differentiated in code | "Two-pass rewrites", "priority processing" — the generation path is identical for both tiers |
| U3 | The credit model is never explained in the UI | One credit buys a generation plus three improvements; only the counter hints at it |
| U4 | ~~The dashboard has no mobile layout~~ **Resolved** | The DEMO_DASH shell collapses the dock to an icon rail under 760px |
| U5 | ~~`OnextapDashboard.jsx` holds every screen in ~4.4k lines~~ **Resolved** | Split into 15 files; components rendered by both surfaces now live in `src/components/shared/` and are reusable |
| U6 | Modal focus management is absent on the landing page's `PremiumModal` | The dashboard's dialogs are native `<dialog>`s; see §8 |
| U7 | Landing copy advertises unbuilt features | "Smart field mapping", "encrypted cloud backup & sync" — see [`prd.md` §11](prd.md#11-known-divergences) |
