# Architecture

## Requested stack
- `enterprise` (Angular 19 SPA + NestJS/tRPC/Prisma/PostgreSQL) — this is the platform's fixed stack for this project, chosen at app-creation time. It was applied regardless of any different technology choices named in the feature plan (the plan's FastAPI/Python suggestion is not used for scaffolding — features are implemented on top of this Angular + NestJS stack).

## Newly scaffolded
- `frontend/` — Angular 19 SPA (standalone components), copied from `template-enterprise/frontend`. Fingerprint: `frontend/angular.json` (project name: `frontend`).
- `backend/` — NestJS + tRPC + Prisma, copied from `template-enterprise/backend`. Fingerprint: `backend/nest-cli.json`. Includes a `health` module, a `users` module/router (tRPC), and Prisma wiring.
- `docker-compose.yml`, `.gitignore`, `.pipeline/surface.json` — copied from the template root.

Nothing was already present in the project directory (only `.git`, `.github`, and a placeholder `README.md` existed before scaffolding), so this was a full greenfield scaffold — no existing code was preserved/skipped.

## Where things live
- Frontend source: `frontend/src/app/` (root shell `app.component.ts`, routes `app.routes.ts`, config `app.config.ts`, feature `home/home.component.ts`, tRPC client types `trpc-client.types.ts`).
- Backend source: `backend/src/` (`main.ts`, `app.module.ts`, `health/`, `users/`, `trpc/`, `prisma/`).
- Prisma schema: `backend/prisma/`.
- Build/deploy manifest: `colossus.yaml` (read by deploy agents instead of framework auto-detection).
- Test-surface contract: `.pipeline/surface.json` (routes, components, `data-testid`s — kept in sync as features are added).
- Acceptance contract for the render gate: `.colossus-acceptance.json`.

## Next steps for the developer / build agents
1. Populate real env files: no `.env.template` shipped with this template revision, so create `.env` (root) and `backend/.env` directly with `DATABASE_URL`, and any JWT/session secrets the plan's auth layer needs.
2. `docker compose up` to bring up PostgreSQL (and any other declared services) for local dev.
3. `cd backend && npx prisma migrate dev` once the Prisma schema is extended for the CNC quoting domain (materials, drawings, quotes, orders, etc. per the plan) — do not run this automatically from the scaffolder.
4. `npm install` in both `frontend/` and `backend/` before running dev servers. Keep `frontend/package.json` deps VERBATIM unless a feature genuinely requires a new package — the frontend Dockerfile relies on a prebaked `node_modules` seed matching the template's exact dependency set.
5. Build out the plan's feature set (auth, DXF upload/parsing, nesting, pricing, checkout, admin console, etc.) inside this Angular + NestJS/tRPC/Prisma structure, updating `.pipeline/surface.json` and `.colossus-acceptance.json` (`expect_text`) as real routes/components/test-ids are added.

## Template sources
- `/app/scaffold-templates/template-enterprise/` (copied wholesale into the project root).
