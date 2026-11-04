# Legacy site chrome

The launcher and game use the shared `s2u-*` design tokens and components. These internal identifiers are stable APIs,
not a public product name. Public branding is **SOCOM 2 Legacy**.

The three reading pages use `socomlegacy/packages/viewer/src/projectSite/components.ts` for their shared header,
navigation, main landmark, skip link and footer. Keep News, Roadmap and Archive links inside the launcher's
`#disc-page`; do not add them to the gameplay bar or HUD. Links respect Vite's `BASE_URL`.

The gameplay bar retains the local Legacy home link, settings, controls and Legacy repository link. The About panel
may acknowledge SOCOM Unzipped only as a sister project. External links must identify the destination honestly.

Use local fonts and the token colors. Page-specific layout belongs in `projectSite/site.css`; the disc page's
project links belong in the viewer's `styles.css`. Neither public reading pages nor their content collections import
game bootstrap modules.

The console launcher's pushed pages (part K, 2.1.0) each carry a header Back, `.cx-back` inside `.cx-screenhead__id`,
and a history entry. Back, Circle, that header control and the browser's Back are one action. A category change
replaces that entry; a nested page still pushes. A dialog closes on Back and has no path of its own. Overlay mode
(the launcher in an iframe) never pushes history. Home hides the control. On a pad, Circle is Back; the header
control is mouse and touch.
