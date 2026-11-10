# Attendance system UI overhaul research

**Date:** 2026-09-28  
**Scope:** Visual direction, color system, iconography, typography, and interaction patterns for the existing React attendance and workforce admin app.

## Recommendation

Move toward a calm, high-clarity workforce operations interface: warm near-white work surfaces, deep ink text, one distinctive brand color, and restrained semantic colors. Keep the dashboard information-dense but give tables, filters, and actions a consistent hierarchy. Use Solar icons as the single pictogram family and Clash Grotesk as the interface typeface. The research below is translated to this repo's current structure, not intended as a generic brand system.

The product-pattern research now draws directly from current workforce dashboards and scheduling products: Deputy and When I Work, with Homebase and Rippling as adjacent references. The vendor help pages are useful for documenting real workflows and screen structure; their marketing pages are treated only as product context, not evidence that a particular visual choice is effective.

## Dashboard references

### Deputy: manager action dashboard and schedule workspace

Deputy's manager dashboard is described as a snapshot of actionable scheduling, task, leave, and timesheet-approval items; its action cards deep-link to the item needing attention. Deputy also distinguishes manager content from the employee's personal calendar and shifts. Its schedule workspace exposes location, date range, and view selectors, and supports area-based or team-member-based views. The documented schedule includes a team member list, scheduled hours, and (where permissions allow) cost information. The newer timesheet approval flow tracks pending, approved, and discarded records, communicates progress, and supports individual or bulk approval.

**Useful pattern for this app:** Make the Overview page an action center: show only today's key counts and exceptions, and link each exception directly to the relevant attendance record. Keep attendance history and approval work in dedicated table pages. For schedule screens, put date, location/team, and view controls in a stable toolbar and visibly summarize the scope those controls affect. Keep pay-sensitive details permission-aware.

Sources: [Deputy manager dashboard](https://help.deputy.com/hc/en-au/articles/4657365737231-Managing-the-Dashboard-on-the-Deputy-website), [Deputy schedule overview](https://help.deputy.com/hc/en-au/articles/4688713423759-Schedule-overview), [Deputy timesheet approvals](https://help.deputy.com/hc/en-au/articles/6997348381327-Approving-your-team-s-timesheets).

### When I Work: role-specific dashboard and attendance notices

When I Work documents separate dashboard content for employees and managers. Managers can see attendance notices for early/late arrivals, absences, and no-shows, while employees see their next shift, coworkers scheduled with them, schedules, and request states. The content shown depends on role and workplace settings. Its schedule page supports viewing shifts by week, and shift details expose time, position, location, and notes.

**Useful pattern for this app:** Treat role as a content hierarchy, not just a permissions gate. Management Overview should prioritize team state and exceptions; an employee-facing view should prioritize the next shift and clock action. Put the event and its implication into the notice itself (for example, “Late · Ama Mensah · 09:18”) and make the notice a route to the record. Keep this as a design reference; this app's existing route permissions and product scope still determine what is available.

Sources: [When I Work dashboard guide](https://help.wheniwork.com/articles/using-dashboard-iphoneipad/), [When I Work personal schedule guide](https://help.wheniwork.net/articles/viewing-your-personal-schedule-computer/).

### Homebase: hourly-work scheduling and exception concepts

Homebase's official scheduling page groups the hourly-team workflow around building schedules, shift coverage, time off and swaps, team communication, time tracking, overtime alerts, and labor cost visibility. Its described schedule builder uses reusable templates and drag-and-drop, and calls out conflict detection and shift-coverage tools.

**Useful pattern for this app:** Make the Schedule page answer staffing questions efficiently: who is assigned, where the gap is, which shift is open, and whether a conflict or overtime risk needs attention. Use compact visual schedule blocks with clear start/end times and member names, plus a text-based filterable view for precise scanning. Put schedule coverage problems ahead of secondary trend graphics.

Source: [Homebase employee scheduling](https://www.joinhomebase.com/employee-scheduling).

### Rippling: broader HR operations dashboard

Rippling's official HRIS page presents employee data as a shared base for HR workflows and describes automations around onboarding and employee changes. Its public product illustration highlights task options and a to-do list alongside employee and app areas. This is a broad HR platform rather than a pure attendance dashboard, so it is an adjacent reference for task-oriented entry points and connected modules, not a direct visual blueprint.

**Useful pattern for this app:** Make pending work discoverable from the Overview, while keeping the full workflow in its dedicated module (leave, payroll, settings, etc.). Use a small number of clear “needs attention” groups, each with a count and a direct route, instead of turning the Overview into a second copy of every module.

Source: [Rippling HRIS](https://www.rippling.com/en-GB/products/hr/hris).

## Cross-reference synthesis

| Product reference | Observed product pattern | Apply here |
|---|---|---|
| Deputy | Action cards deep-link to operational work; schedule has explicit scope/view controls; approvals show progress and exceptions | Actionable attendance overview, scoped schedule toolbar, approval queue with pending count and progress |
| When I Work | Role-specific dashboard; attendance notices surface early/late/absent/no-show cases | Manager overview centered on team exceptions; employee view centered on next shift and clock action |
| Homebase | Hourly scheduling is organized around coverage, swaps, conflicts, time tracking, and overtime | Surface open shifts and coverage risks in schedule workflow |
| Rippling | Cross-module to-dos and shared employee context support HR operations | Compact pending-work panel linking to existing modules |

The recommendations are pattern transfers from the documented product workflows, not claims that these products' visual designs are universally best. No private or authenticated dashboards were inspected. Public product documentation and marketing material were used; production screen details can differ by plan, role, and release.

## What the app has today

- The app already has a desktop sidebar, responsive mobile navigation, dashboard metrics and charts, schedules, clocking, people, payroll, reports, and settings. The many destinations make persistent, clearly grouped navigation valuable.
- `src/index.css` currently defines a pale blue page (`#F4F7FC`), near-white cards (`#FAFAFA`), saturated blue actions (`#2563EB`), and very dark ink (`#080402`). It also has several reusable button, card, badge, and navigation classes.
- `src/lib/chartColors.ts` separately defines chart colors and uses Geist Variable in chart labels. `Layout.tsx` and `DashboardPage.tsx` currently use Lucide icons. A full redesign should consolidate these tokens and icon usage so charts and application UI stay visually consistent.
- This product's core jobs are operational: check who is present, review exceptions, find a person or shift, approve/manage records, and act quickly from tables. Status should be readable at a glance without making every panel colorful.

## Visual direction and palette

### Direction

Use a restrained editorial/operations style: flat, legible surfaces; clear alignment; compact but breathable data rows; crisp borders; and a single strong action color. Clash Grotesk's geometric character already brings personality, so pair it with simple surfaces and avoid decorative gradients, multiple competing accents, or oversized display typography in data-heavy screens. Reserve shadow for overlays and raised interactive layers; use borders and tonal difference for ordinary cards.

### Starting palette to prototype

These are design starting points, not final contrast-verified tokens. Check each actual text/background pairing as components are built.

| Role | Suggested value | Use |
|---|---:|---|
| App canvas | `#F6F7F5` | Main shell background; neutral with a slight warm cast |
| Surface | `#FFFFFF` | Tables, forms, cards, dialogs |
| Sidebar | `#172B3A` | Persistent navigation; creates a distinct frame |
| Sidebar text | `#E8F0F3` | Primary sidebar labels |
| Main ink | `#17212B` | Headings, values, primary text |
| Muted ink | `#5E6B75` | Secondary labels and metadata |
| Border | `#DCE3E5` | Dividers, controls, table outlines |
| Brand/action | `#087E8B` | Primary actions, selected navigation, links; teal gives the system identity without over-coloring every surface |
| Success | `#18794E` | Present, approved, completed |
| Warning | `#A85D00` | Late, pending, needs attention |
| Danger | `#B4233A` | Absent/failed, destructive actions, rejected |
| Info | `#245DB2` | Neutral informational status |

Keep status colors semantically stable across badges, filters, charts, and alerts. Don't use color alone: pair it with a word, icon, or shape. Ensure text meets WCAG 2.2 AA contrast: at least 4.5:1 for normal text and 3:1 for large text. For controls and focus states, test component boundaries and focus indicators as well. The current palette's `#08040299` muted text is alpha-based, so its contrast changes with the surface; replace with explicit, checked colors for predictable accessibility.

## Icon system: Solar

Use Solar consistently for navigation, inline actions, status cues, and dashboard metric illustrations. Pick one base style for most of the interface; Solar Linear is a good default for a precise admin UI, with Bold reserved for emphasis or active states. Do not mix multiple Solar styles in one context. Keep icons at consistent optical sizes (commonly 16 px for dense table actions, 20 px for navigation, 24 px for prominent controls) and pair unfamiliar actions with visible labels or accessible names.

Solar artwork is attributed to 480 Design and is licensed CC BY 4.0, which requires attribution. Package licenses differ: for example, `@solar-icons/react` currently documents MIT-licensed code but CC BY 4.0 icons; the original 480-Design React package lists GPL-3.0. Confirm the exact package and version license before installation. Put required icon attribution and license link in a third-party notices document or app credits. The existing code uses `lucide-react`; migration can be incremental by replacing the shared shell/navigation first, then page icons, while preventing mixed icon families in the final UI.

## Typography: Clash Grotesk

Use Clash Grotesk across the interface, with weight doing most of the hierarchy work: Regular for body and table content, Medium/Semibold for labels and controls, and Semibold/Bold for page titles and key values. Keep small table labels and helper text at practical sizes; a distinctive face should not become an excuse to compress essential attendance data. Use tabular numerals for time, dates, hours, and counts where supported (`font-variant-numeric: tabular-nums`) so columns align.

Fontshare identifies Clash Grotesk as designed by Indian Type Foundry and offers variable styles. Its official family page explains that Clash Grotesk is the more optically monolinear text companion to Clash Grotesk Display. Prefer the regular Clash Grotesk family for UI and data, reserving Clash Display for large marketing-style headings only if the project later needs them. Self-host the official webfont files (including the required license terms) rather than relying on an external stylesheet at runtime; define a system fallback. Verify the specific Fontshare/ITF Free Font License terms for the intended product distribution and embedding.

## Patterns for this app

### Navigation and page structure

- Retain the persistent desktop sidebar and grouped destinations because the product has many frequent, unrelated areas. Visually emphasize the current destination and keep less frequent administration routes lower in the hierarchy.
- At mobile widths, use a clear menu/drawer or compact navigation affordance; ensure the drawer can be dismissed and keyboard focus remains understandable.
- Give each page a consistent header with a descriptive title, optional short context, and one primary action. Put filters/search close to the table or report they control.

### Dashboard and operational overview

- Lead with a small set of useful counts (present, late, absent, pending) and a clear date/period context. Keep trend charts secondary to today's actionable attendance state.
- Use charts only where they reveal a trend or distribution; pair them with a text summary and accessible data alternative. Keep chart color meanings consistent with status colors and provide labels/tooltips that don't rely on color alone.
- Make exceptions actionable: show the person, issue, time, and next step in a scan-friendly list.

### Tables, filters, forms, and feedback

- For attendance, members, schedules, payroll, and reports, use real data tables with clear column headers, aligned numeric/time values, row actions, and stable sorting/filter controls. On small screens, prioritize critical columns and provide a usable overflow strategy rather than shrinking text until it is unreadable.
- Use visible labels and concise helper text for forms; show validation adjacent to the relevant field and preserve entered values on errors.
- Use status chips for record state, not decoration. Provide text alongside color. Confirm destructive actions and make success/error feedback explicit.
- Provide visible keyboard focus, logical tab order, keyboard access to menus/dialogs, and respect reduced-motion preferences. WCAG 2.2 also defines a 24 by 24 CSS pixel minimum target size (with exceptions); aim for comfortable touch targets, especially on mobile.

## Suggested implementation sequence

1. Define CSS custom properties for canvas, surfaces, text, border, brand, semantic states, shadows, and font; make chart tokens consume the same palette.
2. Add the official Clash Grotesk webfont and switch the base font, chart labels, and numeric treatments.
3. Adopt one Solar package/source after checking its license; add a third-party notice for attribution. Convert the shared layout and navigation first.
4. Redesign shared primitives (buttons, inputs, badges, cards, table headers, empty/loading/error states) and use them to update the dashboard and one high-traffic table page as a representative slice.
5. Apply the approved visual system across remaining pages, then review desktop and mobile states and verify text contrast and keyboard operation.

## Sources

- W3C, [Web Content Accessibility Guidelines (WCAG) 2.2](https://www.w3.org/TR/WCAG22/) — contrast, text resizing, target size, and related requirements.
- W3C WAI, [Understanding Contrast Minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) — practical explanation of text contrast thresholds.
- Fontshare, [Clash Grotesk family](https://www.fontshare.com/fonts/clash-grotesk) — official font family, styles, designer, and license entry point.
- Fontshare, [Clash Display family](https://www.fontshare.com/fonts/clash-display) — foundry's description of the Display/Grotesk relationship and license.
- Indian Type Foundry, [official site](https://www.indiantypefoundry.com/) — foundry identity and font catalog.
- Solar Icons v2, [React package README](https://github.com/saoudi-h/solar-icons) — supported styles/frameworks and package/artwork license distinction.
- Solar Icons, [license documentation](https://solar-icons.vercel.app/docs/v1/community/license) — attribution terms for artwork and wrapper library licensing.
- 480 Design, [Solar Icon Set React package metadata](https://github.com/480-Design/Solar-Icon-Set-React/blob/main/package.json) — package's declared GPL-3.0 license; check before choosing this implementation.
- Material Design, [data tables guidance](https://m1.material.io/components/data-tables.html) — sorting, row selection, query/manipulation, and enterprise table structure.
- Material Design, [navigation guidance](https://m1.material.io/patterns/navigation.html) — selecting prominent destinations and de-emphasizing secondary destinations.
- Deputy Help Center, [manager dashboard](https://help.deputy.com/hc/en-au/articles/4657365737231-Managing-the-Dashboard-on-the-Deputy-website), [schedule overview](https://help.deputy.com/hc/en-au/articles/4688713423759-Schedule-overview), and [timesheet approvals](https://help.deputy.com/hc/en-au/articles/6997348381327-Approving-your-team-s-timesheets) — live manager workflows and schedule/approval structure.
- When I Work Help Center, [dashboard guide](https://help.wheniwork.com/articles/using-dashboard-iphoneipad/) and [personal schedule guide](https://help.wheniwork.net/articles/viewing-your-personal-schedule-computer/) — role-specific dashboard content, attendance notices, and shift detail.
- Homebase, [employee scheduling](https://www.joinhomebase.com/employee-scheduling) — current hourly-work scheduling and coverage concepts.
- Rippling, [HRIS product overview](https://www.rippling.com/en-GB/products/hr/hris) — shared employee data and HR task/automation context.

## Limits and follow-up

The proposed palette is an informed starting point rather than a tested final brand choice. Validate contrast across actual tokens and all component states before shipping. Solar attribution and package terms need to be recorded for the exact source/version adopted. Font licensing should likewise be checked against the official license linked from Fontshare before bundling.
