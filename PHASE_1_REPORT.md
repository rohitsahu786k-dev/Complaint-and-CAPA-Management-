# Phase 1 Report — Secure MERN Foundation

Status: complete. Verified with lint, typecheck and tests. The production bundle (`npm run build`) was deliberately not produced at the request of the project owner.

## Architecture chosen

A single Vercel-compatible repository holding a Vite + React SPA and an Express API, sharing one `shared/` layer of Zod schemas, constants and types. The API is mounted at `/api` through `api/index.ts`, which wraps the same Express app used by the local dev server (`server/dev.ts`). No Next.js migration.

```
src/        React SPA (components, layouts, routes, hooks, lib, assets, styles, types)
server/     Express API (app, config, domain, middleware, models, routes, services, scripts, utils, types)
shared/     Zod schemas, permission and domain constants, API types
api/        Vercel serverless entry that re-exports the Express app
docs/       Legacy audit, parity matrix, reference architecture notes
```

Business rules live in `server/domain/` as pure functions with no Mongoose imports, so they are unit-testable and reusable by services, routes and future cron jobs. React components hold no domain logic.

## Files created in Phase 1

Configuration: `package.json`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `vite.config.ts`, `vitest.config.ts`, `tailwind.config.ts`, `postcss.config.js`, `eslint.config.js`, `.prettierrc.json`, `vercel.json`, `.gitignore`, `.env.example`, `index.html`.

Server foundation: `server/app.ts`, `server/dev.ts`, `server/config/env.ts`, `server/config/db.ts`, `server/middleware/auth.ts`, `server/middleware/error.ts`, `server/utils/{http,crypto,async-handler}.ts`, `server/types/express.d.ts`.

Models: `User`, `Role`, `Permission`, `Company`, `Department`, `Employee`, `AuditLog`.

Services: `auth.service.ts`, `audit.service.ts`, `email.service.ts`, `upload.service.ts`.

Routes: `health.routes.ts`, `auth.routes.ts`, `master.routes.ts`.

Shared: `constants/permissions.ts`, `constants/legacy.ts`, `schemas/auth.ts`, `schemas/master-data.ts`, `types/api.ts`.

Frontend: `main.tsx`, `routes/router.tsx`, `routes/ProtectedRoute.tsx`, login / forgot / reset pages, `layouts/AppShell.tsx`, `layouts/AuthLayout.tsx`, dashboard / profile / unauthorized / 404 pages, and the UI kit (`Button`, `Input`, `Field` with `Select`, `Textarea`, `Spinner`, `EmptyState`, `Modal`, `ConfirmDialog`, `Toast`, `StatusBadge`, `TableShell`, `PageHeader`, `ErrorBoundary`).

Docs: `docs/LEGACY_FEATURE_INVENTORY.md`, `docs/FEATURE_PARITY.md`, `docs/6S_REFERENCE_ARCHITECTURE.md`.

Bootstrap: `server/scripts/seed.ts` (`npm run seed`).

## Dependencies

Runtime: react, react-dom, react-router-dom, @tanstack/react-query, react-hook-form, @hookform/resolvers, zod, tailwindcss, lucide-react, recharts, date-fns, @radix-ui/react-dialog, @radix-ui/react-dropdown-menu, express, mongoose, bcryptjs, jsonwebtoken, cookie-parser, cors, helmet, nodemailer, cloudinary, dotenv.

Tooling: typescript, vite, vitest, eslint, typescript-eslint, prettier, tsx, @vercel/node, autoprefixer, postcss, and the matching `@types/*` packages.

## Security decisions

- Passwords are stored only as bcrypt hashes (cost 12); `passwordHash` is `select: false` and never leaves the API. The prototype behaviour where a Master Admin could read a password was removed outright.
- Sessions are JWTs in an HttpOnly cookie (`onepws_session`), 8 hour lifetime, `secure` in production, `SameSite=Lax`, signed cookie parser.
- Login answers with one generic message for an unknown user, a wrong password and a locked account. Five failures lock the account for 15 minutes.
- Password reset stores only a SHA-256 hash of the token with a one hour expiry; the forgot-password endpoint always answers the same way whether or not the account exists.
- Authorization is checked server side on every protected route via `requirePermission`; hiding a button in React is never treated as a control.
- Environment variables are validated with Zod at startup (`server/config/env.ts`); the server refuses to run with a missing or too-short `JWT_SECRET` / `COOKIE_SECRET`.
- `.env`, `.env.local`, `.env.production` and `*.local` are gitignored. `.env.example` carries names only. No credential appears in any tracked file, seed file, README or test.
- The first Master Admin is created by `npm run seed`, which reads `SEED_ADMIN_USERNAME` / `SEED_ADMIN_PASSWORD` from the environment, requires at least 12 characters, forces a password change on first sign-in, and prints nothing sensitive.
- `MONGODB_URI` and the Cloudinary secret are server-only; no `VITE_*` variable holds a secret.

## Features completed

Authentication (login, logout, current user, forgot, reset, change password, account lockout, active/inactive users), database-driven roles and permissions with 18 permission keys across the 10 legacy roles, the base master-data models and API, cached serverless Mongo connection, health and health/db routes, the authenticated app shell with a collapsible desktop sidebar and mobile drawer, all auth and shell pages, the shared UI kit, toast and confirm systems, a global error boundary, and the complete legacy audit documentation.

## Remaining after Phase 1

The complaint and CAPA domain itself, which is the subject of `PHASE_2_REPORT.md`, plus reporting, exports, PDF generation, email automation and the master-data admin screens, which remain tracked in `docs/FEATURE_PARITY.md`.

## Commands executed

| Command | Result |
| --- | --- |
| `npm install` | Succeeded. `prettier` added as a dev dependency during the gap fix. |
| `npx tsc -b` | Passes with no errors. |
| `npx eslint .` | Passes with no errors and no warnings. |
| `npx vitest run` | 5 files, 56 tests, all passing. |
| `npx prettier --write` | Applied across `server`, `shared`, `src` and `api`. |
| `npm run build` | Not run. The project owner asked for no production build in this session. |
| Secret scan of tracked files | No connection string, password or API secret found. |

## Gaps found during the Phase 1 audit and fixed here

1. `vite.config.ts` had no `resolve.alias`, so every `@/` and `@shared/` import would have failed at dev and build time. Aliases added to `vite.config.ts` and `vitest.config.ts`.
2. `tsconfig.node.json` included `eslint.config.js` while `allowJs` was false, which broke `tsc -b`. The entry was removed.
3. `errorHandler` declared three parameters, so Express treated it as ordinary middleware and never used it as an error handler. It now declares four.
4. `optionalUser` queried MongoDB without calling `connectDB()`; with `bufferCommands: false` that fails on a cold serverless start. The connection is now established first.
5. There was no way to create the first Master Admin, so nobody could sign in. `server/scripts/seed.ts` and `npm run seed` were added.
6. `ApiUser["role"]` was optional but indexed as if it were not, which failed the first typecheck. An `ApiRole` type was extracted.
7. Missing UI foundations from the Phase 1 brief were added: toast system, confirm dialog, global error boundary, and the reusable `Field`, `Select`, `Textarea`, `Spinner` and `EmptyState` controls.
8. Formatting was not configured. Prettier plus `npm run format` and `npm run format:check` were added.

## Known blockers

None that are internal. Running the API against a real database needs `MONGODB_URI`, `JWT_SECRET` and `COOKIE_SECRET` in a local `.env`; email needs the SMTP variables and file upload needs the Cloudinary variables. All are environment configuration, not code.
