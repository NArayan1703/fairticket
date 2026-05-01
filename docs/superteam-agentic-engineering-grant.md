# Superteam Agentic Engineering Grant Application Draft

## Grant

Agentic Engineering Grants by Superteam  
Listing: https://superteam.fun/earn/grants/agentic-engineering

## Project Title

FairTicket: Agent-Assisted Anti-Scalping Ticketing on Solana

## One-Line Summary

FairTicket is a Solana and Token-2022 ticketing prototype that uses PDAs, transfer hooks, and an agent-assisted engineering workflow to make event tickets wallet-linked, resale-aware, and harder to scalp.

## Short Application Pitch

FairTicket is a decentralized anti-scalping ticketing system built on Solana with Anchor and Token-2022. The current prototype implements wallet-linked User Vault PDAs, event policy PDAs, hook-enabled ticket mint creation, extra account meta setup for Token-2022 transfer hooks, authorized ticket minting, resale price validation, and a browser console for testing the flow.

The project is a strong fit for an Agentic Engineering Grant because the codebase was developed through an agent-assisted engineering loop: the agent helped harden account constraints, design PDA flows, add Token-2022 hook support, build tests, clean the repo structure, and ship a usable frontend console. The next step is to turn this into a polished demo and documented reference implementation for Solana builders exploring agent-assisted smart contract development.

## Problem

Ticket scalping breaks fan trust. Most ticketing systems separate identity, ownership, resale rules, and marketplace logic across opaque centralized systems. That makes fraud, bot purchasing, and predatory resale easier.

Solana Token-2022 gives builders programmable transfer hooks, but the developer path is still complex. FairTicket explores a practical architecture where event policies and user ownership state live on-chain and transfers can be validated against those rules.

## Solution

FairTicket introduces:

- User Vault PDAs derived from each wallet to track ticket ownership state.
- Event PDAs storing organizer, ticket mint, resale ceiling, royalty basis points, and tickets minted.
- Token-2022 ticket mint PDAs with this program configured as the transfer-hook program.
- Extra Account Meta List setup so Token-2022 transfers can resolve policy accounts.
- Authorized ticket minting into user token accounts.
- Resale validation against event price ceilings.
- A Vite TypeScript frontend console for wallet-based testing.

## Current Progress

Implemented:

- Anchor smart contract in `programs/secure_pass/src/lib.rs`
- Token-2022 mint creation with transfer-hook extension
- User Vault PDA initialization
- Event PDA initialization
- Extra account meta list setup for transfer-hook account resolution
- Ticket minting through Token-2022 CPI
- Resale price validation path
- TypeScript tests in `tests/secure_pass.ts`
- Frontend console in `src/main.ts` and `src/styles.css`
- Clean single Anchor project layout at repo root

Verified locally:

- `cargo fmt --check`
- `cargo check`
- `yarn lint`
- `yarn build`

## Why This Fits Agentic Engineering

FairTicket is not just a Solana app. It is a concrete example of agent-assisted engineering applied to a real blockchain system:

- The agent iteratively inspected the Anchor codebase and tightened account validation.
- It generated and refined Token-2022 transfer-hook flows.
- It built frontend tooling to let a human test the protocol quickly.
- It caught and cleaned repo-structure issues before submission.
- It produced reproducible commands and checks for handoff.

This grant would support turning that agent-assisted prototype into a better documented, demoable build that other Solana developers can learn from.

## Requested Grant Scope

Requested amount: 200 USDG

Use of funds:

- Polish the frontend testing console.
- Add screenshots and a short demo walkthrough.
- Improve README and architecture documentation.
- Add a localnet deployment guide.
- Add a transfer-hook integration test plan and known limitations.

## 1-Week Milestones

Day 1:

- Finalize README with architecture diagram text and setup steps.
- Add clear localnet instructions for Anchor, Solana CLI, and wallet RPC setup.

Day 2:

- Improve frontend copy, validation states, and transaction output.
- Add a buyer-wallet setup flow for resale validation.

Day 3:

- Add a demo script and screenshots/GIF.
- Document the Token-2022 transfer-hook account order and extra account metas.

Day 4:

- Run a clean localnet demo from fresh checkout.
- Fix gaps discovered during the demo.

Day 5:

- Publish final repo, demo notes, and submit grant update.

## Links

Repository:

TODO: Add GitHub URL after pushing `main`.

Demo:

TODO: Add hosted demo or short video link.

Frontend local URL:

`http://localhost:5173/`

## Suggested Superteam Form Answers

### What are you building?

I am building FairTicket, a Solana Token-2022 anti-scalping ticketing prototype. It uses Anchor, PDA-based User Vaults, Event policy PDAs, hook-enabled ticket mints, extra account metas, and resale price validation to demonstrate how event tickets can become programmable assets with enforceable transfer rules.

### Why are you the right person to build this?

I have already shipped a working prototype with an Anchor smart contract, Token-2022 mint and hook setup, tests, and a frontend console. I am using an agent-assisted engineering workflow to move quickly while keeping the implementation auditable and reproducible.

### What will you ship with this grant?

I will ship a polished public demo of FairTicket: improved docs, setup instructions, a frontend testing console, localnet walkthrough, screenshots or demo video, and a clear explanation of the Token-2022 transfer-hook architecture.

### How does this help the Solana ecosystem?

It gives Solana builders a practical reference for using Token-2022 transfer hooks with Anchor in a real consumer use case. It also demonstrates how agentic engineering can accelerate Solana development without skipping important checks like PDA validation, account constraints, and reproducible tests.

### Timeline

I can complete the grant scope in one week. The core contract and frontend already exist; the grant work is focused on polish, documentation, demo quality, and making the implementation easy for other builders to understand.

### Budget

200 USDG.

## Before Submitting

- Push the latest commits to GitHub.
- Add the GitHub repository link above.
- Record a short demo video or add screenshots.
- Confirm the preferred contact handle and wallet/payment profile in Superteam Earn.
- If asked for Telegram, use: TODO.
