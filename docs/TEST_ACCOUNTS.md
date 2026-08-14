# Development Test Accounts

Test accounts for local/integration testing. These are **NOT** real competition participants.

## Accounts

| Email | Display Name | Role | Team |
|-------|-------------|------|------|
| `sandbox-test-alpha-1@dev.local` | Test Alpha 1 | participant | SANDBOX Test — Alpha |
| `sandbox-test-alpha-2@dev.local` | Test Alpha 2 | participant | SANDBOX Test — Alpha |
| `sandbox-test-beta-1@dev.local` | Test Beta 1 | participant | SANDBOX Test — Beta |
| `sandbox-test-beta-2@dev.local` | Test Beta 2 | participant | SANDBOX Test — Beta |
| `sandbox-test-gamma-1@dev.local` | Test Gamma 1 | participant | SANDBOX Test — Gamma |

## Teams

| Team Name | Members |
|-----------|---------|
| SANDBOX Test — Alpha | alpha-1, alpha-2 |
| SANDBOX Test — Beta | beta-1, beta-2 |
| SANDBOX Test — Gamma | gamma-1 |

## Provisioning

```bash
bun run seed:test-participants
```

Requires environment variables:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SANDBOX_TEST_PASSWORD` (optional — generated if not set)

The script is idempotent — safe to run multiple times.

## Security

- Accounts use `role = 'participant'` only
- Passwords are never committed or printed to logs
- `SERVICE_ROLE` key is server-side only (never in `src/`)
- No frontend test-account bypass exists
- RLS policies are unchanged
- Existing admin account is never modified
