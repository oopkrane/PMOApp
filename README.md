# PMO Workspace

A local, Notion-inspired project and action management application. The supplied PMO export is bundled as the initial workspace and all ten original columns are preserved.

## Features

- Editable table with all imported columns
- Kanban board grouped by imported Status values
- Project navigation, search, status filters, and priority filters
- Detailed action drawer with all properties
- New actions, deletion, CSV import/export, and drag-and-drop status changes
- Browser-local persistence with one-click restore of the original import
- Runtime schema validation for CSV and browser-stored data

## Run locally

```powershell
npm install
npm run dev
```

Open the local URL printed by Vite. Generate production assets with `npm run build`.

## Data handling

The imported data stays in the browser and is never sent to an external service. Edits are stored in `localStorage`. The restore button beside the filters clears edits and reloads `public/data/pmo-actions.csv`.

## Verification

```powershell
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
```
