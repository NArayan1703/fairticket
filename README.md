# FairTicket

FairTicket is a Solana anti-scalping ticketing prototype built with Anchor and Token-2022.

It uses PDA-backed user vaults, event policy accounts, hook-enabled ticket mints, and resale validation to explore how event tickets can become programmable assets with enforceable ownership and transfer rules.

## What It Does

- Creates wallet-linked `UserVault` PDAs.
- Creates Token-2022 ticket mint PDAs with this program configured as the transfer hook.
- Stores event policy in an `Event` PDA.
- Sets up Token-2022 extra account metas for hook execution.
- Mints one ticket at a time into a user's Token-2022 token account.
- Validates resale attempts against event price ceilings.
- Includes a browser console for local wallet testing.

## Project Layout

```text
programs/secure_pass/src/lib.rs  Anchor program
tests/secure_pass.ts             TypeScript integration tests
src/main.ts                      Frontend console logic
src/styles.css                   Frontend styling
docs/                            Grant/application notes
```

## Local Checks

```bash
cargo fmt --check
cargo check
yarn lint
yarn build
```

## Frontend

```bash
yarn dev
```

Open:

```text
http://localhost:5173/
```

The UI defaults to localnet RPC:

```text
http://127.0.0.1:8899
```

Use a wallet/RPC setup that points at the same cluster where the `secure_pass` program is deployed.

## Current Status

The prototype includes the core program flow and a frontend testing console. The next major step is a full localnet demo path with real Token-2022 transfer-hook execution and a polished walkthrough.
