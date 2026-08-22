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
- Local AI Focus board powered by Ollama `qwen3.5:9b`, showing the top three actions per project with evidence-based rationale
- Gmail processing for unread project emails, with local AI matching and automatic action updates

## Run locally

```powershell
npm install
npm run dev
```

Open the local URL printed by Vite. Generate production assets with `npm run build`.

## Data handling

The imported data stays in the browser and is never sent to an external service. Edits are stored in `localStorage`. The restore button beside the filters clears edits and reloads `public/data/pmo-actions.csv`.

AI Focus requests are sent only to the local Ollama service at `127.0.0.1:11434`. Start Ollama and ensure `qwen3.5:9b` is installed before generating the focus board.

## Gmail configuration

The Gmail integration uses Google Identity Services and the official Gmail API. It requests `gmail.modify` only when **Process Gmail** is selected. A valid short-lived access token is reused in browser memory, and subsequent token requests do not force consent after the first grant. Tokens are never written to browser storage or disk; only a non-sensitive previous-authorization flag is retained. Email content is sent only to local Ollama.

1. Create or select a Google Cloud project and enable the Gmail API.
2. Configure the Google Auth consent screen for testing and add `oopkrane@gmail.com` as a test user.
3. Create an OAuth client with application type **Web application**.
4. Add `http://127.0.0.1:5173` as an Authorized JavaScript origin.
5. Copy `.env.example` to `.env` and replace the example value with the OAuth client ID.
6. Restart `npm run dev`, then select **Process Gmail**.

Only unread messages in Gmail's Primary category with an existing project name in the subject are fetched in full. A confidently matched action is updated; when no existing action matches, a new sequentially numbered action is created in that project. Successfully processed messages are marked read. The integration never sends email.

## Verification

```powershell
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
```
