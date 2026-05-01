# FairTicket

A blockchain-based ticketing platform that ensures secure, transparent, and fair event ticket distribution and resale.

---

## Overview

FairTicket addresses common issues in traditional ticketing systems such as scalping, fake tickets, and lack of control for organizers. By leveraging blockchain technology, tickets are minted as unique digital assets and governed by smart contracts.

---

## Problem

* Fake or duplicated tickets
* Uncontrolled ticket scalping
* Lack of transparency in resale markets
* Organizers lose control after initial sale

---

## Solution

FairTicket uses blockchain to:

* Mint tickets as NFTs (unique and verifiable)
* Enforce maximum resale price
* Enable royalties for organizers on resales
* Provide transparent ownership tracking

---

## Tech Stack

* Blockchain: Solana
* Smart Contracts: Anchor Framework
* Frontend: React + Vite
* Wallet Integration: Solana Wallet Adapter

---

## Features

* Ticket minting as NFTs
* Tamper-proof ownership
* Controlled resale pricing
* Royalty-based resale system
* Transparent transaction history

---

## Testing (Devnet)

This project is deployed and tested on Solana Devnet.

### Tested Flow

1. Create Event
2. Mint Ticket
3. Transfer Ticket
4. Resell Ticket with constraints

All smart contract rules are enforced during testing.

---

## Primary KPI

Successful end-to-end ticket lifecycle on Devnet (mint → transfer → resale) with rule enforcement

---

## Setup and Installation

```bash
git clone https://github.com/NArayan1703/fairticket.git
cd fairticket

yarn install
yarn dev
```

---

## Project Structure

```
/programs      → Anchor smart contracts
/app           → Frontend (React + Vite)
/tests         → Contract tests
```

---

## Future Improvements

* Mainnet deployment
* Mobile-friendly UI
* Event analytics dashboard
* Multi-chain support