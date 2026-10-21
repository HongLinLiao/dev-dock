# DevDock design system

Source: UI UX Pro Max, installed globally at ~/.codex/skills/ui-ux-pro-max.
Verified query: `system monitoring dashboard --design-system -p DevDock`.
The initial developer-tool query returned an unrelated FAQ landing pattern; it was discarded.

## Product adaptation

A macOS local development service monitor, not a marketing page. Adapt the verified real-time operations guidance to a desktop workspace: sidebar navigation, metrics, TCP service table, project grouping, history, preferences, and a native menu bar utility.

- Default: charcoal surfaces with a slate hierarchy; green for running state and completed actions, amber for long runtime, red for destructive operations.
- Runtime duration is a reminder, never a claim that a service is idle or abandoned.
- Data is live only after a successful scan. Show update time, scan failures, and explicit browser preview labeling.
- Native macOS typography fallback, IBM Plex Sans for Latin text, JetBrains Mono for ports, process IDs and commands. Network fonts are optional; system fonts work offline.
- 4/8px spacing rhythm. Surfaces 8–14px radii. One consistent Lucide icon family; original DevDock monogram.
- Content hierarchy: workspace context → page title → three metrics → duration reminder → service filters and table → freshness footer.
- Native confirmation before sending SIGTERM, separate confirmation for SIGKILL. Protect app and related processes; revalidate PID identity after confirmation.
- Keyboard navigation, labeled icon controls, visible focus, semantic table, native dialog focus trapping, Escape to dismiss, reduced-motion support.
- Electron minimum size 980×700. Browser layout adapts at 1180/950/720px; service table retains an explicit horizontal scroll region on narrow viewports.

## Semantic colors

Background #101419; sidebar #14191f; surface #171d24; raised surface #1c242d; border #29313a; body #e9edf0; muted text #929eab; running #6cdbaf; long runtime #e7ba77; destructive #f38c91.

## Validation

Verify desktop layout, browser narrow layout, empty/filter/error states, project/history/settings navigation, native menu bar actions, process identity validation and protected process rejection.

## Interface copy preference

Keep the product functional and concise. Use page names as headings. Omit slogans, welcome metaphors, promotional sidebar cards, redundant descriptions and repeated privacy statements. Keep labels, real service data, freshness/error states, destructive-action confirmations and concise setting guidance. Put extended instructions in the help dialog rather than the dashboard.
