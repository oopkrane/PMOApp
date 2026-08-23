# PMO Workspace

A local, Notion-inspired project and action management application. The supplied PMO export is bundled as the initial workspace and all ten original columns are preserved.

## Features

- Editable table with all imported columns
- Kanban board grouped by imported Status values
- Project navigation, search, status filters, and priority filters
- Detailed action drawer with all properties
- Local **Ask PMO** chat for questions about project actions, with confidence and clickable Action ID references
- Ollama model discovery and one shared model selection for every AI feature
- New actions, deletion, CSV import/export, and drag-and-drop status changes
- Durable browser-local persistence with IndexedDB, a versioned local backup, and one-click restore of the original import
- Runtime schema validation for CSV and browser-stored data
- Local AI Focus board powered by Ollama `qwen3.5:9b`, showing the top three actions per project with evidence-based rationale
- Gmail processing for unread project emails, with local AI matching and automatic action updates
- In-app Gmail setup page for OAuth configuration, connection testing, session disconnect, and privacy details

## Run locally

```powershell
npm install
npm run dev
```

Open the local URL printed by Vite. Generate production assets with `npm run build`.

## Data handling

The imported data stays in the browser and is never sent to an external service. Every action change and update history entry is validated and written to IndexedDB, with a versioned `localStorage` backup. Existing `v1` browser data is migrated automatically without losing actions. The app also requests persistent browser storage when supported. The restore button beside the filters clears both saved copies and reloads `public/data/pmo-actions.csv`.

AI requests are sent only to the local Ollama service at `127.0.0.1:11434`. Open **AI model setup** to scan installed Ollama models and select the shared model used by AI Focus, Ask PMO, and Gmail action matching. `qwen3.5:9b` remains the default until another installed model is selected.

## Gmail configuration

The Gmail integration uses Google Identity Services and the official Gmail API. It requests `gmail.modify` only when **Process Gmail** is selected. A valid short-lived access token is reused in browser memory, and subsequent token requests do not force consent after the first grant. Tokens are never written to browser storage or disk. Email content is sent only to local Ollama.

1. Create or select a Google Cloud project and enable the Gmail API.
2. Configure the Google Auth consent screen for testing and add `oopkrane@gmail.com` as a test user.
3. Create an OAuth client with application type **Web application**.
4. Add `http://127.0.0.1:5173` as an Authorized JavaScript origin.
5. Open **Gmail setup** in the application, enter the account and OAuth client ID, then select **Test connection**. The client ID can alternatively be supplied through `.env` as a default.
6. Return to the action workspace and select **Process Gmail**.

The Gmail setup is stored locally in the browser. A client ID is public OAuth configuration; never enter or store a Google client secret in this browser application. OAuth access tokens remain memory-only.

Only unread messages in Gmail's Primary category with an existing project name in the subject are fetched in full. A confidently matched action is updated; when no existing action matches, a new sequentially numbered action is created in that project. Successfully processed messages are marked read. The integration never sends email.

## Verification

```powershell
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
```
