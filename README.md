# FairTicket — Refundable NFT-Based Event Ticketing System

## Program ID
`D1548vVyMfbzCC1Hkqb5pPWBJCLrXG8xCKcQ2SipGuGQ` (devnet)

## Overview
FairTicket issues event tickets as NFTs on Solana using Token-2022.
- Buy a ticket → receive NFT
- Can't attend → burn NFT for 70% USDC refund
- Scalping detected → organizer claws back ticket

## Instructions
| Instruction | Description |
|-------------|-------------|
| `initialize_mint` | Create NFT mint with event metadata |
| `initialize_delegate` | Set up permanent delegate PDA for clawback |
| `initialize_vault` | Create USDC vault for refund pool |
| `deposit_to_vault` | Organizer deposits USDC into vault |
| `mint_ticket` | Buyer pays USDC, receives NFT ticket |
| `burn_for_refund` | Buyer burns NFT, receives 70% USDC back |
| `clawback` | Organizer moves NFT from scalper to treasury |

## PDAs
| PDA | Seeds |
|-----|-------|
| Mint Authority | `["mint-auth"]` |
| Permanent Delegate | `["delegate"]` |
| Vault Authority | `["vault", organizer_pubkey]` |
| Ticket Config | `["ticket-config", mint_pubkey]` |

## Deploy to Devnet from Scratch
```bash
git clone https://github.com/NArayan1703/fairticket.git
cd fairticket
anchor build --no-idl
solana airdrop 2
anchor deploy
```

## Devnet Signatures
Final deploy: `27sdavQcgjrJNoSQLeHWabw8TiKfkhoMLHgU66pfjhJ82Bya3w2YVayqt88gHfeAy62xfRMBaKLcNRw3cMXDcxbd`

## Team
- Blockchain: Dipendra
- Frontend: Nayan
- Networking: Friend 2
