---
name: Dev Toolbox
description: A compact local workspace for inspecting and reusing developer artifacts.
colors:
  background: "#f6f8fb"
  foreground: "#1c2736"
  card: "#ffffff"
  primary: "#3868ab"
  primary-foreground: "#ffffff"
  secondary: "#e9eef5"
  secondary-foreground: "#233b59"
  muted: "#edf1f6"
  muted-foreground: "#58697e"
  accent: "#e5edf8"
  accent-foreground: "#254f87"
  destructive: "#bf3c45"
  border: "#d7dfe9"
  input: "#c7d2e0"
  ring: "#5b86c0"
  sidebar: "#edf1f6"
  sidebar-foreground: "#53667c"
  sidebar-accent: "#d9e5f5"
  sidebar-accent-foreground: "#28538e"
  dark-background: "#14191f"
  dark-foreground: "#e5edf3"
  dark-card: "#1b222b"
  dark-popover: "#202833"
  dark-primary: "#93b8ef"
  dark-primary-foreground: "#142235"
  dark-secondary: "#283444"
  dark-secondary-foreground: "#d6e4f6"
  dark-muted: "#222c38"
  dark-muted-foreground: "#a4b3c6"
  dark-accent: "#27394f"
  dark-accent-foreground: "#c7ddfa"
  dark-destructive: "#ff929b"
  dark-border: "#303d4c"
  dark-input: "#435166"
  dark-ring: "#93b8ef"
  dark-sidebar: "#11161d"
  dark-sidebar-accent: "#263e5c"
  dark-sidebar-accent-foreground: "#b9d5fb"
  dark-sidebar-border: "#2b3645"
typography:
  home-heading:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "clamp(30px, 3.2vw, 48px)"
    fontWeight: 650
    lineHeight: 1.18
    letterSpacing: "-0.025em"
  workspace-heading:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "24px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  body:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "14px"
  pane-heading:
    fontSize: "13px"
    fontWeight: 600
  artifact:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
    fontSize: "15px"
    lineHeight: 1.8
  editor:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
    fontSize: "14px"
rounded:
  control: "calc(0.5rem - 2px)"
  badge: "4px"
  notice: "5px"
  rail-target: "7px"
  pane: "8px"
spacing:
  control-gap: "8px"
  toolbar-gap: "10px"
  pane-heading-inline: "18px"
  workbench-gap: "20px"
  pane-body: "22px"
  workspace: "24px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.control}"
    height: "2.25rem"
  button-secondary:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.secondary-foreground}"
    rounded: "{rounded.control}"
  pane:
    backgroundColor: "{colors.card}"
    rounded: "{rounded.pane}"
  rail-link:
    textColor: "{colors.sidebar-foreground}"
    rounded: "{rounded.rail-target}"
    width: "44px"
    height: "44px"
  rail-link-active:
    backgroundColor: "{colors.sidebar-accent}"
    textColor: "{colors.sidebar-accent-foreground}"
  type-badge:
    textColor: "{colors.muted-foreground}"
    rounded: "{rounded.badge}"
    padding: "2px 8px"
---

# Design System: Dev Toolbox

## Overview

**Creative North Star: "Review workspace"**

Dev Toolbox uses a continuous working surface: a quiet navigation rail, a compact header, and source/result panes with history available alongside them. Thin dividers and restrained blue states organize dense developer work. The user selected system UI typography; monospace identifies the actual artifacts being inspected or reused.

This records the implemented React interface inside the Tauri desktop shell. The source of truth is `src/App.css`, with shared controls in `src/components/ui/` and editor colors in `src/features/formatter/monaco.ts`. `PRODUCT.md` supplies the confirmed identity and interaction constraints. The existing native app icon is preserved through `src/assets/app-icon-rail.png`; it is not a new identity asset.

**Key Characteristics:**

- Cool light surfaces and graphite/navy dark surfaces, with blue selection and focus.
- Flat panes, horizontal launcher/history rows, and compact controls.
- Artifact text gets space to wrap, scroll, compare, and copy.

## Colors

The frontmatter records the light palette and its dark counterparts; runtime components use semantic CSS variables so the theme changes together.

### Primary

- **Workspace blue:** primary actions, active tabs, copy affordances, and the small launcher arrow. Dark mode uses a lighter blue with a dark foreground for filled actions.
- **Quiet blue selection:** accent surfaces mark selected records; dedicated sidebar accent tokens mark the current tool. Focus uses the ring token rather than an unrelated accent.

### Neutral

- **Cool paper:** light background with white work panes and popovers. Muted tones support field hints, dates, borders, and secondary actions.
- **Graphite and navy:** dark background, slightly lighter work panes, and a darker rail. Dark popovers sit one tonal step above panes.
- **Error red:** destructive controls and error text. Errors also carry explanatory text; color alone does not identify the problem.

**The Semantic Theme Rule.** Reuse the matching CSS variables in both themes. Editor backgrounds, gutters, text, cursor, selections, and active lines have explicit light/dark Monaco definitions; new editor surfaces should use those definitions.

## Typography

The system stack serves headings, controls, descriptions, and keyboard hints. The artifact stack serves branch names, PR titles, recent artifact labels, code values, and editors. There is no separate display typeface.

- **Home heading:** responsive size from the frontmatter; overridden to (34px) below (900px) and (29px) below (767px).
- **Launcher titles:** (23px, 600), reducing to (18px) in compact windows.
- **Workspace heading:** (24px, 600), reducing to (22px) in compact windows. Descriptions use (13px) with (1.5) line height.
- **Pane headings and labels:** compact (13px); headings use (600), labels typically (500).
- **Hints, dates, and metadata:** (12px), muted, with tabular numerals for dates and numeric outputs.
- **Artifacts:** output text uses the frontmatter artifact role; Monaco uses its editor role. Long output values wrap anywhere; history rows truncate with ellipsis, while detail views wrap.

**The Artifact Type Rule.** Keep interface language in system UI type and apply monospace to the artifact itself. Keyboard hints inherit the UI family.

## Layout

The shell fills the window (100dvh). The rail remains fixed in width while the workspace consumes remaining space and scrolls independently. Desktop measurements are a (64px) rail, (49px) header, and (24px) workspace padding. Rail glyphs are (22px) within (44px × 44px) navigation and utility targets, separated by (8px). The preserved app icon renders at (32px).

Home has a centered maximum width of (1180px), three horizontal tool launchers, and real recent activity rows. Launchers use dividers instead of separate raised cards; recent rows reserve room for artifact type and date. Empty history shows a factual empty state.

Tool screens use a heading/action row, a wrapping toolbar where needed, and a flexible workbench. Tasks use resizable source/result panes with an initial desktop split of (43% / 57%) and optional history. Formatter starts with equal resizable panes; comparison supports split and inline views. Codes use Single, Batch, and History tabs, with source/preview workspaces and a list/detail history view. About and updates opens in a dialog.

Spacing is contextual rather than one strict mathematical scale: (8–10px) within controls/toolbars, (18–22px) in panes and between work areas, and (24px) around the desktop workspace. Pane headings have a minimum height of (48px).

- Below (1100px), optional history narrows from (320px) to (280px), and workbench gaps reduce to (14px).
- Below (900px), a workbench with history wraps history beneath the primary work area.
- Below (767px), the rail becomes (56px), workspace padding becomes (18px 14px), panes stack, and history list/detail stacks. Home shortcut hints disappear and recent rows wrap. Source/result resizers switch to vertical layouts.

## Elevation & Depth

Working panes are flat at rest, separated by tonal surfaces and single-pixel borders. Selection changes the surface color. Dialogs retain the shared component's shadow and a half-opacity black overlay; this elevation is reserved for an overlaid interaction rather than repeated across the workbench. Focus rings are state indicators, not ambient decoration.

Rail transitions last (140ms), launcher surface transitions (160ms), and the launcher arrow translates (4px) over (180ms). Dialog entry/exit uses the shared (200ms) fade/zoom treatment. Reduced-motion preferences suppress movement and reduce animation/transition durations.

## Shapes

Small corners keep controls compact: shared controls derive their radius from the root (0.5rem) radius; standalone pane corners use (8px), rail targets (7px), notices (5px), and type badges (4px). Pane contents clip within their border, with scrolling inside long content regions. QR and barcode canvases retain a white image stage in both themes for the generated artifact.

## Components

### Navigation and launchers

Rail navigation uses thin Lucide SVG strokes (1.7), accessible names, and right-side tooltips with a (250ms) delay. Exactly one destination receives the current-page state and blue selected surface. Home launchers are full-row links with an icon, title, description, shortcut, and small arrow. Pointer hover and keyboard focus share the launcher highlight.

### Buttons and tabs

Use the shared primary, outline, secondary, ghost, link, and destructive variants. Buttons have compact padding, medium weight, disabled opacity, and a visible focus ring. Rail targets explicitly override ordinary icon-button sizing. Tabs use a bottom rule; the active tab gains primary text and a primary underline rather than a floating pill. Keep primary work actions near their workspace heading or toolbar.

### Fields and editors

Fields pair a persistent label with the control and optional muted hint. Shared inputs/selects use a thin input border and small corners; dark fields add a subdued input surface. Focus changes the border and adds a ring, invalid state uses destructive border/ring, and disabled controls reduce opacity. Textareas allow vertical resizing and disable spelling/autocorrection for technical input. Monaco has no minimap, uses two-space tabs, and exposes find and keyboard focus support.

### Panes, history, and results

Pane headings separate source, result, and history with a bottom rule; footer actions use a top rule. Results keep copy actions next to the artifact label. History rows use a full-width selection control with separate delete action, selected-surface feedback, and explicit read-only saved task details. Code history uses a list/detail arrangement without a redundant detail eyebrow. Batch errors remain visible alongside successful results while the workspace draft survives tool navigation.

### Feedback and accessibility

Loading messages use status semantics; validation and load errors use alert semantics and explain recovery. Empty states distinguish no saved records from no search matches. Copy feedback and notices remain compact. A skip link becomes visible on focus and targets the main workspace. Native links/buttons, labeled icon actions, current-page navigation, selected history states, tab semantics, and focus indicators are part of the implemented interaction vocabulary.

Global navigation uses Cmd/Ctrl+0–3. Formatting exposes Cmd/Ctrl+Shift+F and editor find uses Cmd/Ctrl+F. Unsaved drafts remain in memory across tool navigation; saved history is a separate persisted record. Do not imply restart persistence for drafts.

## Do's and Don'ts

### Do:

- **Do** use semantic theme variables and the existing Monaco theme definitions.
- **Do** preserve the (22px) rail glyphs and (44px) targets in both window densities.
- **Do** keep output labels, copy actions, error text, and actual artifact values easy to inspect together.
- **Do** retain keyboard focus, accessible icon labels, reduced-motion handling, and honest empty/loading/error states.

### Don't:

- **Don't** replace the preserved app icon or introduce a new brand treatment without an explicit identity change.
- **Don't** substitute illustrative activity for real history or present unsaved drafts as durable records.
- **Don't** add decorative sequence numbers to parallel tool launchers or redundant eyebrows to history detail.
- **Don't** generalize overlay shadows into the flat working panes.

Verification boundary: `.impeccable/review/finish-review.md` records a ship disposition for four resolved findings, supported by current dark native and compact light captures plus source checks. This document does not assert a final numerical pixel match, Windows packaging validation, actual updater installation, or unexercised native backup round trips. Those are evidence limits, not design patterns to inherit.
