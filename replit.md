# Certxa Pro

Native booking and point-of-sale UX for independent health and beauty professionals.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/certxa-pro run eas:login` — authenticate the Replit workspace with EAS
- `pnpm --filter @workspace/certxa-pro run eas:init` — link this app to an EAS project once
- `pnpm --filter @workspace/certxa-pro run eas:ios:preview` — create an internal iOS device build
- `pnpm --filter @workspace/certxa-pro run eas:ios:production` — create an iOS store build
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/certxa-pro/app/` — Expo Router screens
- `artifacts/certxa-pro/contexts/BookingContext.tsx` — in-memory booking and client state for the prototype

## Architecture decisions

- Keep Certxa API, authentication, persistence, Stripe Connect, and Tap to Pay wiring out of scope unless the owner explicitly asks for it.
- Demo bookings and client data are local preview state; payment screens must not imply that transactions are real.

## Product

Certxa Pro helps home-based, booth-renting, and mobile beauty professionals manage a calendar, clients, availability, bookings, and checkout.

## User preferences

- The owner is building the UX and will wire it to Certxa and payments; do not add integrations without a direct request.

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
