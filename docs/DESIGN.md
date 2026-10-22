# Product design system

The visual direction follows the supplied Mayraviq v2 design reference: navy navigation, cobalt actions, teal context cues, white work surfaces and neutral backgrounds. The dashboard emphasizes rooms and visual collaboration, while discussions and canvas keep their working area prominent.

`apps/web/src/app/product-design.css` is the canonical product theme. `globals.css` provides reset/basic primitives; `ui.css`, `collaboration.css` and feature CSS provide the existing component structures. Import the theme after these shared styles. New visual changes should use the shared tokens rather than append competing palettes to older files. A later component-by-component stylesheet consolidation can remove superseded legacy presentation rules without changing interactions.

Use the shared button, panel, heading and form classes. Primary actions use cobalt; secondary actions use white with a visible border. Navy belongs to navigation and the call stage. Teal accents indicate context or positive states. Status must always include text, not color alone. Keep body content at 13–15px, supporting text at 11–12px, and avoid faint pastel text on white. Prefer 8-point spacing and 10–20px radii with restrained shadows.

The illustration in the home hero is decorative product artwork, hidden from assistive technology; it is not a real room, participant list or saved canvas. Actual counts and content come from authorized workspace records.

Verify at the specification's desktop, tablet and mobile breakpoints. Discussions use a full-height timeline and composer with a channel directory on larger screens; mobile shows either the directory or selected thread. Canvas keeps its desktop workbench and accessible notes view on small screens. Live room tabs scroll when needed. Keyboard focus and reduced-motion support remain available.

## Canvas refinements

The canvas library renders authorized saved nodes using the same renderer as the editor, including inherited visibility. Active projects are the default; archived projects remain accessible through the filter. Board previews, counts, search, and empty states use saved project data. The editor opens with the board fitted to the available viewport, supports manual zoom and Fit board to view, and docks layers/properties on desktop. These view changes do not modify saved coordinates or content.

## Product wording

Use descriptive feature labels such as canvas, shapes, text, layers, connectors, rooms and notes. Avoid using another product's brand, logo, or named feature as our own feature name, and avoid claims of affiliation. Keep truthful provider identification, dependency licenses, copyright notices and technical documentation where required. A wording review does not establish trademark availability for Mayraviq or clearance of patented functionality. Obtain brand clearance in intended markets before public launch.

Canvas Live save exposes saving/conflict states and preserves drafts. Project editors keep a stable identity across saved versions. The calendar now has month and agenda views with localized dates and small-screen day selection.

## Drawing canvas (22 October 2026)

The drawing workspace uses a sketch-first interaction: choose a tool, then drag on the board rather than immediately inserting a preset shape. Tools include freehand, directional arrows, line, rectangle, ellipse, diamond, frame, sticky notes and text. Hand dragging or Space-drag pans the board; drag on an empty area in Select mode to select a group. Double-click a text-bearing shape to edit its text directly. Ink and weight controls apply to new drawings; the selection inspector handles existing elements. Focus mode enlarges the workspace, and Fit brings visible content into view. Layer controls start collapsed.

Keyboard shortcuts: V select, H hand, P draw, R rectangle, E ellipse, D diamond, A arrow, L line, T text, N sticky note, X eraser. Command/Control-Z undoes, Shift-Command/Control-Z redoes, Command/Control-D duplicates, Command/Control-A selects visible elements, Command/Control-S saves, Delete removes and Escape exits focus/deselects. Inside text editing, Command/Control-Enter commits and Escape cancels. Undo history survives acknowledgement of this client's own saves; genuine peer updates clear local history to avoid undoing another person's edits.

Normalized freehand/arrow points travel through the existing authenticated room/project canvas API and merge/export/render pipeline. A stroke is bounded to 256 points; a board is bounded to 200 elements and 2,000 drawing points. The existing bounded artboard remains 1,600 × 1,000 units; an infinite canvas, rotation, image imports and a CRDT collaboration engine are not part of this change. Live room previews retain their existing payload limits.

The interaction reference was the public [Excalidraw project](https://github.com/excalidraw/excalidraw); Mayraviq uses its own editor implementation and product labels.

Validation: browser checks exercised drag creation, freehand persistence, inline text, box selection, eraser/undo, undo after live save, hand panning, focus and content fitting. Contract/API tests cover normalized points, reverse arrows, resize geometry and rejection of oversized/nonfinite/out-of-range stroke data.
