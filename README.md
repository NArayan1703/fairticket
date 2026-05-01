# FairTicket

FairTicket is a Solana + Anchor ticketing dApp where:

- organizers create event tickets as Token-2022 NFTs,
- buyers purchase tickets using an SPL payment token (USDT-style),
- resale price can be capped (anti-scalping),
- buyers can burn a ticket and receive a partial refund (default 70%).

This repository is configured for **Devnet**.

---

## 1) Tech stack

- Solana (Devnet)
- Anchor framework (on-chain program)
- Token-2022 for ticket NFTs + transfer hook
- SPL Token for payment token (USDT-style mint)
- React + Vite frontend

---

## 2) What is implemented

- Organizer event setup (name, image, price, max resale, royalty, refund bps)
- Ticket mint creation via PDA
- Purchase flow: buyer pays SPL token, receives NFT
- Burn/refund flow: buyer burns NFT and receives refund from treasury token account
- Transfer validation and resale ceiling enforcement

---

## 3) Prerequisites

Install the following:

- Rust + Cargo
- Solana CLI
- Anchor CLI
- Node.js (18+ recommended) and npm

Recommended checks:

```bash
solana --version
anchor --version
rustc --version
node --version
npm --version
```

---

## 4) Clone and install

```bash
git clone https://github.com/NArayan1703/fairticket.git
cd fairticket
npm install
```

---

## 5) Solana/Anchor environment (Devnet)

Set CLI cluster and wallet:

```bash
solana config set --url devnet
solana config set --keypair ~/.config/solana/id.json
```

Fund wallet for fees:

```bash
solana airdrop 2
```

Build/check program:

```bash
cargo check -p secure_pass
anchor build
```

Deploy program (if needed):

```bash
anchor deploy
```

Important:

- Program ID in `programs/secure_pass/src/lib.rs` must match deployed keypair/address.
- `Anchor.toml` is set to Devnet.

---

## 6) Payment token (USDT-style on Devnet)

You need a **Devnet SPL token mint address** for the `Payment mint` field.

### Option A: Use an existing Devnet test mint

- Paste that mint address into `Payment mint`.
- Use its decimals (commonly `6`).

### Option B: Create your own Devnet test mint (USDT-like)

Using SPL Token CLI:

```bash
spl-token create-token --decimals 6
spl-token create-account <YOUR_MINT_ADDRESS>
spl-token mint <YOUR_MINT_ADDRESS> 1000000
```

Use that mint address in the app as `Payment mint`.

Notes:

- Mainnet USDT should not be used on Devnet.
- Keep `Payment decimals` consistent with the mint.

---

## 7) Run frontend

```bash
npm run dev
```

Open URL shown by Vite (usually `http://localhost:5173`, sometimes `http://localhost:5174` if 5173 is busy).

Production build:

```bash
npm run build
```

---

## 8) UI field guide (what to enter)

- **RPC endpoint**: `https://api.devnet.solana.com`
- **Organizer address**: organizer wallet public key
- **Event ID**: any unique number (keep stable for the same event)
- **Ticket name**: display name
- **Image URL**: public image URL
- **Payment mint**: Devnet SPL mint address (USDT-style test token)
- **Payment decimals**: mint decimals (usually `6`)
- **Ticket price (payment units)**: e.g. `10`
- **Max resale (payment units)**: e.g. `20`
- **Royalty (bps)**: e.g. `500` = 5%
- **Refund (bps)**: e.g. `7000` = 70%
- **Resale destination wallet**: destination buyer pubkey for resale validation tests

---

## 9) Exact action order in app

Connect organizer wallet first, then run:

1. **Initialize Wallet Vault**
2. **Create Ticket Mint**
3. **Initialize Event**
4. **Setup Hook Metadata**

Buyer flow:

5. **Buy Ticket NFT**
6. **Burn for 70% Refund**

Resale check:

7. **Validate Resale Cap**

If `Payment mint`, `Treasury authority`, `Treasury ATA`, or `Buyer payment ATA` shows **Not set**, the payment mint is missing/invalid or prerequisite step not completed.

---

## 10) Anti-scalping and refund rules

- Resale price cannot exceed `max_resale_price_payment_units`.
- Refund amount is:

$$
	ext{refund} = \text{ticket\_price} \times \frac{\text{refund\_bps}}{10000}
$$

For `refund_bps = 7000`, refund is $70\%$.

---

## 11) Project structure

```text
programs/secure_pass/   Anchor program
src/                    React frontend
tests/                  integration tests
migrations/             Anchor migration scripts
```

---

## 12) Troubleshooting

- **Blank page**
	- Make sure frontend is opened on the correct Vite URL/port.
	- Check browser console for wallet extension errors.

- **Port 5173 already in use**
	- Vite auto-switches (example: 5174). Use the shown URL.

- **Initialize Event fails**
	- Verify `Payment mint` is valid on Devnet.
	- Verify `Payment decimals` matches mint.

- **Buy ticket fails**
	- Buyer payment token account may be missing or unfunded.
	- Mint test tokens to buyer token account for payment mint.

- **Program instruction/account mismatch**
	- Rebuild/redeploy program and make sure frontend is using matching program ID.

---

## 13) Current status checklist

- `npm run build` ✅
- `cargo check -p secure_pass` ✅
- Devnet config ✅
- End-to-end flow available once payment mint is configured ✅