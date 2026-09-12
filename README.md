# CircUIt

CircUIt is a PowerApps-style, low-code app builder for [Circuit](../../workflow_builder) workflows. Drag screens together from labels, buttons, inputs, tables, and images, then bind any component to a Circuit workflow: a button can trigger a run, a label or table can display its output.

CircUIt does not re-implement workflow execution. It is a thin app-building layer that calls the existing workflow_builder API to list, inspect, and run workflows, and only owns its own data: apps, screens, and the components placed on them.

## Architecture

```text
React + Vite screen builder (127.0.0.1:8091)
              |
              | HTTP JSON
              v
FastAPI app-builder API (127.0.0.1:8020)
              |
              +-- MongoDB Atlas: CircuitApp / Screen / Component documents
              |
              | HTTP JSON (forwards the caller's Clerk bearer token)
              v
Circuit workflow_builder API (127.0.0.1:8010)
              +-- lists workflows, returns input schemas, runs workflows
```

Both services trust the same Clerk issuer, so a user signs in once and CircUIt forwards their session token to workflow_builder rather than holding a separate service credential.

## Data model

- **CircuitApp**: `{id, owner_id, name, description, screens[]}`
- **Screen**: `{id, name, components[]}`
- **Component**: `{id, type, name, position, size, props, binding?}`
- **ComponentBinding**: `{workflow_id, trigger: "on_click" | "on_load", input_mapping, output_key}` — the seam between a screen component and a Circuit workflow.

See [`backend/app/models/app.py`](backend/app/models/app.py) for the full schema.

## What's scaffolded

- FastAPI backend (`backend/`) with Clerk auth, Mongo-backed CRUD for apps/screens/components (`api/apps.py`), and a proxy router (`api/workflows.py`) that forwards to workflow_builder.
- React + Vite frontend (`frontend/`) with a Dashboard (list/create/delete apps) and a Builder (drag-and-drop screen canvas + component palette + properties/binding panel), mirroring the Dashboard/Editor split already proven out in workflow_builder.
- Dev scripts (`start-dev.ps1` / `stop-dev.ps1`) matching workflow_builder's conventions, on the next free ports (8020 backend, 8091 frontend) so both projects can run side by side.

## Not yet built (next steps)

- Rendering a *published* app for end users (today's Builder is edit-mode only; there is no runtime/viewer mode yet).
- Executing `on_load` bindings and wiring `input_mapping` to other components' live values instead of static strings.
- Multi-select, resize handles, undo/redo, and alignment guides on the canvas.
- Permissions/sharing beyond single-owner (no org/team model, same as workflow_builder today).

## Requirements

- Python 3.11+, Node.js 20+, a MongoDB Atlas cluster, and a running workflow_builder backend to bind against.

## Local development

1. Copy `.env.example` to `.env` and fill in `MONGO_URI`, `WORKFLOW_BUILDER_API_URL`, and the Clerk keys (reuse the same Clerk app as workflow_builder).
2. `cd backend && python -m venv .venv && .venv\Scripts\pip install -e .`
3. `cd frontend && npm install`
4. From the repo root: `./start-dev.ps1` (stop with `./stop-dev.ps1`).
