# SANDBOX

A live stock-market simulation web application built for a college Business Club
competition. Teams compete across three timed rounds by buying and selling virtual
shares, while an administrator controls the market in real time from a central console.

> **LIVE MARKET · LIVE MONEY · LIVE RANKINGS** — every screen converges on the same
> authoritative state within seconds, with no manual refreshes.

---

## How it works

SANDBOX has exactly two interfaces:

| Interface | Purpose |
|---|---|
| `/participant` | Trading dashboard — market table, buy/sell modal, holdings, portfolio P/L, live leaderboard, transaction log |
| `/admin` | Control center — rounds manager, market/trading controls, price editor with private pending changes, dividends, stock management (full CRUD), team manager, cash ledger, reset |

### Competition format

| Round | Name | Duration | Notes |
|---|---|---|---|
| 1 | Portfolio Building | 15 min | Free trading at active prices |
| 2 | Newspaper Trading | 15 min | Admin prepares price changes privately, then applies them atomically |
| 3 | Video Trading | 15 min | External content on a TV; SANDBOX manages only the trading mechanics |

Every team starts with **₹1,00,000** virtual cash. Rounds end automatically the moment
their server-authoritative timer expires.

### Core principle

The browser is a view and an input device — nothing more.

```text
USER ACTION → Supabase RPC → PostgreSQL TRANSACTION → COMMITTED STATE
            → realtime signal → ALL CLIENTS REFETCH AUTHORITATIVE DATA
```

- All money is integer paise (`BIGINT`) inside Postgres; all financial math happens in
  SECURITY DEFINER RPCs behind row-level security.
- Pending price changes are admin-only state and never broadcast to participants.
- Every mutation is idempotent; expired rounds reject trades at the database level even
  if a browser timer disagrees.

---

## Tech stack

- **Next.js 16** (App Router, React Compiler) + **React 19**
- **TypeScript**, **Tailwind CSS v4**, **shadcn/ui**, **Lucide**, **Sonner**, **Recharts**
- **Supabase** — Postgres, Auth, Realtime (`postgres_changes` over a notifications
  outbox), Row Level Security on every exposed table
- Package manager: **Bun**

Fonts: self-hosted Google Sans + EB Garamond (see `docs/DESIGN.md`).

---

## Getting started

### Prerequisites

- [Bun](https://bun.sh) 1.1+
- A Supabase project (hosted or local via `supabase start`)
- Node 18+ for tooling

### Setup

```bash
# 1. Install dependencies
bun install

# 2. Configure environment
cp .env.example .env.local   # then fill in the values below

# 3. Apply migrations (hosted project)
supabase link --project-ref <ref>
supabase db push

# 4. Provision the admin account
bun run bootstrap:admin

# 5. (optional) seed test teams/participants for development
bun run seed:test-participants

# 6. Run
bun dev
```

Open http://localhost:3000.

### Environment variables

| Variable | Scope | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | client + server | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | client + server | Anon/publishable key |
| `SUPABASE_URL` | server only | Same URL for service-role calls |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** — never expose to the browser | Auth admin API (team provisioning/removal) |
| `SANDBOX_ADMIN_EMAIL` / `SANDBOX_ADMIN_PASSWORD` | scripts | Admin bootstrap credentials |

`.env*` files are gitignored.

---

## Scripts

| Command | Description |
|---|---|
| `bun dev` | Development server (Turbopack) |
| `bun run build` | Production build |
| `bun run start` | Serve the production build |
| `bun run lint` | ESLint |
| `bunx tsc --noEmit` | Type check |
| `bun run bootstrap:admin` | Create/promote the admin account |
| `bun run seed:test-participants` | Seed dev test accounts (see `docs/TEST_ACCOUNTS.md`) |

## Database workflow

All schema lives in versioned migrations under `supabase/migrations/` — never edit the
production database through the dashboard without a matching migration file.

```bash
supabase migration new <name>   # author SQL in supabase/migrations/
supabase db push                # apply to the linked project
supabase db reset               # rebuild local database from migrations
```

Key RPCs: `execute_trade`, `apply_price_changes`, `start_round`, `end_round`,
`auto_end_expired_rounds` (pg_cron, 30 s), `reset_competition_run`, `add_stock`,
`remove_stock`, `rename_stock`, `create_dividend`, `adjust_team_cash`,
`set_team_blocked`, `rename_team`, `set_team_starting_cash`, `remove_team`.

---

## Running a competition (operator guide)

1. **Reset** — Admin → *Reset Competition*: rounds go pending, every team is re-funded
   ₹1,00,000, prices snap back to opening values, stocks reactivate, blocks clear.
2. **Start Round 1** — opens the market and enables trading automatically.
3. During any round:
   - Queue price changes in the Price Editor → **Apply Price Changes** broadcasts them atomically.
   - Pay dividends per share; credit/debit team cash with a reason (fully audited ledger).
   - Manage stocks live: add, rename (name + symbol), deactivate/reactivate, or remove permanently.
   - Add/rename/block/remove teams; starting cash locks after a team's first trade.
4. Rounds **end themselves** at 00:00 (instant via any open browser, 30 s cron backstop).
5. Repeat through Round 3. Final leaderboard ranks by total portfolio value.

---

## Documentation

| Document | Contents |
|---|---|
| [`docs/AGENTS.md`](docs/AGENTS.md) | Frontend specification + full production backend contract |
| [`docs/BACKEND.md`](docs/BACKEND.md) | Backend architecture, rules, phased implementation |
| [`docs/SANDBOX_REALTIME_ARCHITECTURE.md`](docs/SANDBOX_REALTIME_ARCHITECTURE.md) | Canonical realtime design: channels, outbox, payloads, reconciliation |
| [`docs/DESIGN.md`](docs/DESIGN.md) | UI design system |
| [`docs/REMEDIATION_PLAN.md`](docs/REMEDIATION_PLAN.md) | Audit findings, fix log, verification record |
| [`docs/CODING_PRIORITY.md`](docs/CODING_PRIORITY.md) | Working agreements for agents/contributors |

## Project structure

```text
src/
├── app/                    # App Router pages + /api/admin/teams route
├── components/
│   ├── admin/              # AdminPanel, TeamManager
│   ├── participant/        # Dashboard, MarketTable, TradeModal, Portfolio…
│   ├── shared/             # Header, LeaderboardTable, guards, landing, login
│   └── ui/                 # shadcn/ui primitives
├── context/                # SandboxContext — single app-wide store
├── hooks/                  # useMarketData, usePortfolio, useTradeExecution…
├── lib/
│   ├── realtime/           # Channel model, provider, refetch hooks
│   ├── supabase/           # Browser/server clients
│   └── competition-context.tsx
└── types/
supabase/
└── migrations/             # Versioned SQL schema + RPCs
```

## Security notes

- RLS is mandatory everywhere; participants can never read pending prices or another
  team's finances, and cannot write authoritative tables directly.
- Admin authorization derives from `teams.role = 'admin'` checked inside each RPC —
  never from anything the browser sends.
- The service-role key is used exclusively inside `/api/admin/teams` (server route).
- Blocked teams are rejected at the database trigger level, not just in the UI.

See `docs/BACKEND.md §97` for the full security checklist.
