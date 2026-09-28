# UI overhaul implementation plan

**Status:** In progress  
**Research basis:** [UI overhaul research](./ui-overhaul-research.md)  
**Scope:** Refresh the authenticated attendance and workforce admin experience, using documented patterns from Deputy, When I Work, Homebase, and Rippling.

## Implementation notes — 2026-09-28

- The app now uses the warm-neutral / navy / teal palette, explicit semantic colors, Clash Grotesk, and shared Solar Linear icons. The shared shell, navigation, buttons, cards, badges, controls, and chart theme use the new system across the routed pages.
- The desktop sidebar now stays expanded with labels visible. The mobile drawer controls have accessible names and larger hit areas.
- The dashboard now has a clear date/title hierarchy, direct attendance log and clock links, and a late-count card that links to attendance review. Existing charts and recent activity remain below the primary summary.
- The implementation intentionally does not add new attendance queries or infer no-shows, expected headcount, or absence state without reliable schedule data. Per the reference pattern, the current data-backed count and existing notification panel route users to follow-up work.
- The schedule, attendance, people, leave, payroll, reporting, and settings pages now share the visual tokens and Solar icon family; their existing workflow logic and route structure are preserved.
- Build and TypeScript checks have passed for the current foundation. Full page-by-page workflow and responsive/accessibility review remains in progress.

## Goal

Give managers a fast operational overview, make attendance exceptions and pending work easy to act on, and apply one coherent visual system across dashboard, scheduling, people, attendance, leave, payroll, reports, and settings. Preserve existing routes, data behavior, role checks, and clock/kiosk flows while the interface changes.

## Product decisions to hold constant during the UI work

- The dashboard is an action center, not a second copy of every module.
- Manager overview prioritizes team attendance state and actionable exceptions. Employee-facing views prioritize the employee's own next shift, request state, and clock action where those capabilities exist.
- Schedule controls always show the selected date range, location/team, and view. Actions apply only to the displayed scope.
- Tables remain the main tool for reviewing, filtering, and acting on records.
- Solar icons and Clash Grotesk are the chosen icon family and typeface. Resolve the exact package/artwork attribution and font license before shipping assets.
- Use WCAG 2.2 AA text contrast as a design requirement; do not rely on color alone for record state.

## Implementation phases

### Phase 0 — Baseline and guardrails

**Purpose:** Record the current state and avoid accidental behavior changes while reskinning.

1. Inventory all routes and visible screens from `src/App.tsx`, including public login, license page, standalone clock station, and role-gated admin pages.
2. Identify current page-level headers, filters, tables, dialogs, loading/empty/error states, and responsive behavior. Build a tracking checklist so every route is covered.
3. Record key workflows to preserve: manager sign-in, dashboard navigation, clock in/out, kiosk, schedule filtering, member create/edit/import, timesheet review, leave review, payroll, reports, notifications, and sign-out.
4. Resolve asset decisions before adding dependencies:
   - Select the Solar React package or use repository-owned SVG components; review the exact package code license and icon artwork license, and add attribution to a third-party notices file.
   - Download/self-host Clash Grotesk from Fontshare; retain the license text with project notices and confirm web embedding terms.
5. Take reference screenshots at wide desktop and narrow mobile sizes for representative pages.

**Exit criteria:** Route/workflow inventory exists; chosen font and icon source have recorded licenses; screenshots establish a visual baseline.

### Phase 1 — Design tokens and shared primitives

**Purpose:** Make later page work consistent and low-risk.

1. Consolidate design tokens in `src/index.css`'s Tailwind v4 `@theme` layer: page canvas, surface, sidebar, primary/secondary text, borders, primary action, semantic states, focus ring, shadows, radii, and font families.
2. Reconcile/remove conflicting legacy values in `tailwind.config.ts` after confirming which values are still consumed. There are currently competing definitions (for example sidebar and semantic colors), so avoid leaving two sources of truth.
3. Add licensed Clash Grotesk font files under a project asset path (for example `src/assets/fonts/`) and define `@font-face` with a system fallback. Apply tabular numerals to time/count columns and chart labels.
4. Update `src/lib/chartColors.ts` to reference the same semantic palette and font tokens as the UI; preserve stable meaning for present/approved, warning/pending, and danger/absent/rejected states.
5. Create or refine shared UI primitives: page heading, primary/secondary/destructive button, labeled input/select, status badge, card/surface, table header/row, empty state, loading state, and inline error.
6. Ensure the shared primitives include visible focus, disabled, hover, pressed, and reduced-motion behavior.

**Likely files:** `src/index.css`, `tailwind.config.ts`, `src/lib/chartColors.ts`, font assets, potentially `src/components/ui/*`.

**Exit criteria:** A small style reference page or representative screen demonstrates the palette and controls; color pairs and focus indicators are checked; current pages still render against the new tokens.

### Phase 2 — Shared app shell and icon migration

**Purpose:** Establish the new visual frame once for every authenticated page.

1. Redesign `src/components/Layout.tsx`: sidebar spacing and grouping, selected-route treatment, top bar, avatar/account control, notification panel, and page content gutters.
2. Keep primary routes visible and group lower-frequency system routes so the product's broad navigation remains scannable. Retain compact/expanded desktop and mobile drawer behavior, improving mobile close affordance and accessible labels.
3. Replace Lucide icons in the shell with Solar icons, using one consistent default style and consistent size/stroke. Preserve readable text labels; icons supplement labels.
4. Add a shared page heading pattern with title, optional context, and one primary action aligned consistently.
5. Make notification rows visibly state the event and link to the related workflow where a safe route exists; retain dismiss behavior and keyboard access.

**Likely files:** `src/components/Layout.tsx`, icon adapter/re-export module, shared shell styles.

**Exit criteria:** All authenticated routes inherit a coherent shell; selected route is clear; collapsed and mobile navigation are usable by keyboard; no icon style mixing in the shell.

### Phase 3 — Dashboard as a role-aware action center

**Purpose:** Transfer the strongest reference pattern from Deputy and When I Work: actionable team state first, deeper work in dedicated modules.

1. Reorganize `src/pages/DashboardPage.tsx` into:
   - page title plus date context;
   - core attendance summary (present, late, absent, active/expected as available from current data);
   - actionable exception list (late arrivals, missing clock-outs, no-shows/absences, pending leave), each linking to a relevant filtered page when supported;
   - recent clock activity table;
   - supporting trend charts below the immediate-action area.
2. Keep metrics grounded in existing queries and definitions. Do not invent a scheduled/expected denominator unless the app has reliable schedule data and a clear rule for it.
3. Align status colors, labels, and chart colors with the semantic tokens. Give chart summaries and accessible text alternatives.
4. Use role-aware content only where supported by the existing profile/role and routes; do not expose new sensitive data through the overview.
5. Add useful loading, no-data, and error states for each dashboard section instead of a blank block or undifferentiated page error.

**Likely files:** `src/pages/DashboardPage.tsx`, `src/lib/attendanceAnalytics.ts`, `src/lib/chartColors.ts`.

**Exit criteria:** A manager can understand today's state and open the relevant follow-up in one step; charts are secondary to operational exceptions; existing summary values retain their current domain meaning.

### Phase 4 — Schedule and attendance workspaces

**Purpose:** Apply Deputy's visible scope controls and review progress patterns to the busiest operational pages.

1. In `src/pages/SchedulesPage.tsx`, group date, location/team, and view controls in a stable toolbar; keep the active scope readable. Distinguish open/empty shifts and coverage issues with both label and shape/color.
2. Improve schedule density and responsive behavior: preserve readable shift text, provide team-member search/filtering, and choose a deliberate narrow-screen strategy (horizontal schedule scroll or simplified list).
3. In `src/pages/TimesheetsPage.tsx`, make search/date/status filters easy to find; organize records by clear state where supported; provide per-record review actions and bulk actions only where the existing behavior permits.
4. Make completion/progress visible (for example pending count and approved count) and show warnings before approval. Keep payroll data behind its existing permission boundaries.
5. In `src/pages/ClockPage.tsx`, reskin the authenticated clock flow and kiosk as a focused task surface. Keep `/clock/station` standalone, high-contrast, touch-friendly, and visually distinct from admin chrome when run in kiosk mode.

**Likely files:** `src/pages/SchedulesPage.tsx`, `src/pages/TimesheetsPage.tsx`, `src/pages/ClockPage.tsx`, plus shared filters/tables.

**Exit criteria:** Schedule scope is obvious; status and approval progress are scannable; kiosk controls remain easy to use on a touch display; narrow layouts preserve all necessary actions.

### Phase 5 — People and workflow modules

**Purpose:** Extend the shared patterns without creating page-specific design languages.

1. Apply page header, filter bar, table, status, and form patterns to `MembersPage`, `VisitorsPage`, `UsersPage`, and `LeavePage`.
2. Use consistent row density, column alignment, action placement, search/filter location, and empty states. On smaller screens, provide purposeful cards or horizontal overflow with key identifiers retained.
3. For forms and dialogs, use visible labels, grouped sections, clear required/optional status, inline validation, and preserve entries after recoverable errors.
4. Keep sensitive actions (delete, revoke, suspend, payroll-related changes) visually distinct and make confirmation language describe the affected record.
5. Make leave requests and approvals show status, date range, requester, and next action together.

**Likely files:** `src/pages/MembersPage.tsx`, `src/pages/VisitorsPage.tsx`, `src/pages/UsersPage.tsx`, `src/pages/LeavePage.tsx`, `src/pages/AdminControlsPage.tsx`.

**Exit criteria:** Lists and forms share a consistent hierarchy; no role-gated action is exposed by styling changes; mobile use does not hide essential record identity or actions.

### Phase 6 — Payroll, reports, settings, and public/special screens

1. Apply shared page and table patterns to `PayrollPage`, `ReportsPage`, `SettingsPage`, and `AdminControlsPage`.
2. Consolidate chart axes, legends, tooltips, and numeric typography through shared chart theme tokens.
3. Update `LoginPage`, `LicensePage`, and loading/empty/error views so they belong to the same brand, while preserving the separate kiosk treatment.
4. Review notification popovers, dialogs, CSV import flow, face capture, and avatar upload for focus, text contrast, control sizing, and consistent surfaces.

**Likely files:** `src/pages/PayrollPage.tsx`, `src/pages/ReportsPage.tsx`, `src/pages/SettingsPage.tsx`, `src/pages/AdminControlsPage.tsx`, `src/pages/LoginPage.tsx`, `src/pages/LicensePage.tsx`, `src/App.tsx`, `src/components/*`.

**Exit criteria:** Every route has the shared visual grammar; charts and special-purpose flows remain legible and usable.

### Phase 7 — Responsive and accessibility review

1. Review each representative page at desktop, tablet, and narrow mobile widths; include keyboard-only navigation and zoom/text enlargement.
2. Check text contrast against final rendered surfaces, including muted text, badges, disabled controls, sidebar labels, and focus rings.
3. Check keyboard order, visible focus, accessible names for icon-only buttons, dialog/drawer focus handling, and reduced-motion preference.
4. Check charts and status presentation without color perception; make sure status has text labels and data charts have a textual equivalent.
5. Review long names, empty/loading/error states, large data sets, and realistic permission variants.

**Exit criteria:** No clipped essential content or inaccessible control in supported viewport sizes; key tasks remain possible with keyboard; status is understandable without color.

## Rollout order

Deliver this in reviewable slices: (1) tokens/font/icon proof, (2) app shell, (3) dashboard, (4) schedule and attendance, (5) people and leave, (6) payroll/reports/settings and special screens, (7) final accessibility/responsive pass. Review the representative dashboard and table screen before applying the same patterns broadly, so major visual decisions can be corrected early.

## Verification checklist

- Confirm every route in `src/App.tsx` still renders and respects its current auth/admin/license gate.
- Confirm clock and kiosk routes retain their existing punch, face verification, offline, and station-link behavior.
- Confirm schedule filters and record links preserve their query/path parameters.
- Confirm member CRUD, CSV import, leave requests, timesheet actions, notifications, payroll, reports, and settings still invoke the same underlying handlers.
- Check computed contrast for text/background pairs after actual opacity/compositing; target WCAG 2.2 AA.
- Check accessible names, keyboard focus, reduced-motion settings, and touch targets.
- Review the browser console for missing assets, font failures, and runtime errors during manual workflow walkthroughs.

## Risks and decisions

- **Palette uncertainty:** Teal/navy is a research-informed proposal, not an established brand decision. Confirm the desired brand character before converting every screen.
- **License compatibility:** Solar artwork attribution is required; package code terms vary. Clash Grotesk needs official web embedding/license confirmation. Do this in Phase 0.
- **Dashboard data semantics:** “Absent” and “no-show” depend on a known expected schedule. Reuse existing business logic or label what the system can prove; don't infer attendance from incomplete data.
- **Broad route surface:** This app has many modules and unusual special screens. Shared tokens/components first keep cross-page drift under control.
- **Large page components:** Some pages combine loading, data, and presentation. Keep this effort primarily visual; avoid unrelated domain/data refactors during reskinning.
- **Utility conflicts:** `src/index.css` uses Tailwind v4 `@theme`, while `tailwind.config.ts` still has overlapping palette/font definitions. Reconcile deliberately to prevent stale class output or divergent colors.

## Not in this proposal

This is an implementation plan, not a request to change the app now. It does not assume new backend queries, new attendance policies, route changes, a theme switcher, or feature expansion beyond visual hierarchy and navigation to existing work.
