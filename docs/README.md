# Mini Trading Terminal - Raydium CPMM Implementation Guide

## 📖 Table of Contents

1. [Requirements](#requirements)
2. [Implementation Goals](#implementation-goals)
3. [Technical Architecture](#technical-architecture)
4. [Environment Configuration](#environment-configuration)
5. [Core Implementation](#core-implementation)
6. [Usage Instructions](#usage-instructions)
7. [Code Examples](#code-examples)
8. [Important Notes](#important-notes)

---

## Requirements

### Goal

Replace the **Jupiter aggregator** in the current project with direct calls to **Raydium CPMM**'s `swap_base_input` function to enable trading for all Solana tokens with Raydium CPMM pools.

### Core Requirements

1. ✅ **Remove Jupiter dependency**: No longer use Jupiter Swap API
2. ✅ **Direct Raydium CPMM calls**: Use `RaydiumCPMM::swap_base_input` function
3. ✅ **Use Helius RPC**: Fetch required data directly from blockchain
4. ✅ **Create VersionedTransaction**: Manually build transactions calling `swap_base_input`
5. ✅ **No Raydium SDK**: Do not use Raydium SDK or other third-party APIs
6. ✅ **Pure TypeScript implementation**: Use basic Solana libraries (e.g., `@solana/web3.js`, `@solana/spl-token`)

### Example Tokens

Supports all tokens with Raydium CPMM pools, such as:

- **SOL** (Native token)
- **USDC** (EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v)
- **USDT** (Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB)
- And all other tokens with Raydium CPMM pools

### Example Transactions

Reference Raydium CPMM transactions on Solscan:

- https://solscan.io/tx/Di58Xkhcv4UPUhVmLPwt2pCiXSbJDy2WX91H1dG2598Fvx4EaZ5YEwpWjSgXmMqFzXTsdJ5n3A4En3vCuFRPHGv
- https://solscan.io/tx/g72KBuk5tw8sjSumWJiWbMn753k7Kxcpm55pehk1Bp6uVPSqNfRHvF9oVkRMZkiFxijcaqTeR26SLsjjMRVZKyJ

### Reference Platforms

The following platforms support in-house Raydium CPMM trading:

- o1.exchange
- Axiom
- Padre
- GMGN

---

## Implementation Goals

### Current Architecture (Jupiter)

```
User Input → Jupiter API → Get Quote → Generate Transaction → Sign & Send
```

### New Architecture (Raydium CPMM)

```
User Input → Codex API Get Pool → Read Pool Info from Chain →
Build swap_base_input Instruction → Create VersionedTransaction → Sign & Send
```

---

## Technical Architecture

### Core Components

1. **Pool Discovery**: Get Raydium CPMM pool address from Codex API
2. **Pool Parsing**: Read and parse pool account data from chain
3. **Transaction Building**: Manually build `swap_base_input` instruction
4. **Transaction Sending**: Send transaction using Helius RPC

### Data Flow

```
1. User selects token pair (e.g., SOL → USDC)
   ↓
2. Query Raydium CPMM pool for the token from Codex API
   ↓
3. Read pool account from chain, parse mintA, mintB, vaultA, vaultB, etc.
   ↓
4. Calculate input amount (considering token decimals)
   ↓
5. Read pool reserves from chain, calculate expected output (considering slippage)
   ↓
6. Build swap_base_input instruction
   ↓
7. Create VersionedTransaction
   ↓
8. User signs and sends transaction
```

---

## Environment Configuration

### Required Environment Variables

Create a `.env` file (do not commit to Git):

```bash
# Codex API key (for fetching token and pool information)
VITE_CODEX_API_KEY=d61ad864e7d13b0be7eab68bf5981a9daf315fc0

# Helius RPC endpoint (for on-chain interactions)
VITE_HELIUS_RPC_URL=https://lena-m4kqyf-fast-mainnet.helius-rpc.com

# Solana wallet private key (Base58 format, for testing only)
# ⚠️ Warning: Do not use in production, do not commit to Git
VITE_SOLANA_PRIVATE_KEY=6WKgVRUNAg6BiMq8wC9Tq43B3sJo93ZVKsd4RvM7MBSAHSB7oWSH7S67eSTt1CCTcuNgNQC6DBR8AaeZcSWtgBF
```

### Install Dependencies

```bash
npm install
```

### Run Project

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the result.

---

## Core Implementation

### 1. Raydium CPMM Program Information

- **Program ID**: `CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C`
- **Instruction**: `swap_base_input` (Instruction index: 9)
- **Network**: Solana Mainnet

### 2. Pool Account Layout

Raydium CPMM pool account structure (read from chain):

```
Offset 0-7:   discriminator (8 bytes)
Offset 8-39:  ammConfig (32 bytes)
Offset 40-71: poolCoinTokenAccount / vaultA (32 bytes) - base token vault
Offset 72-103: poolPcTokenAccount / vaultB (32 bytes) - quote token vault
Offset 104-135: poolWithdrawQueue (32 bytes)
Offset 136-167: poolTargetOrders (32 bytes)
Offset 168-199: poolTempLpTokenAccount (32 bytes)
Offset 200-231: poolOwner (32 bytes)
Offset 232-263: mintA (32 bytes) - base mint
Offset 264-295: mintB (32 bytes) - quote mint
Offset 296-327: lpMint (32 bytes)
```

### 3. swap_base_input Instruction Format

**Instruction Data**:

```
- Instruction index: 1 byte (value: 9)
- amount_in: 8 bytes (u64, little-endian)
- amount_out_minimum: 8 bytes (u64, little-endian)
```

**Account List** (8 accounts):

```
0. poolState (writable) - Pool state account
1. user (signer) - User wallet address
2. userSourceToken (writable) - User input token account (ATA)
3. userDestinationToken (writable) - User output token account (ATA)
4. poolSourceToken (writable) - Pool input token account (vault)
5. poolDestinationToken (writable) - Pool output token account (vault)
6. ammConfig (readonly) - AMM config account
7. tokenProgram (readonly) - Token program ID
```

---

## Usage Instructions

### Basic Flow

1. **Select Token**: Choose the token to trade on the token page
2. **Enter Amount**: Enter the amount to buy or sell
3. **Click Trade**: The system will automatically:
   - Find Raydium CPMM pool from Codex API
   - Read pool information from chain
   - Calculate expected output and minimum output (considering slippage)
   - Build and send transaction

### Trade Types

- **Buy**: Use SOL to purchase tokens (SOL → Token)
- **Sell**: Sell tokens for SOL (Token → SOL)

### Slippage Protection

Default slippage: **0.5%** (50 bps)

Slippage calculation formula:

```
Minimum Output = Expected Output × (10000 - Slippage BPS) / 10000
```

---

## Code Examples

### Core File Structure

```
src/
├── lib/
│   ├── raydium.ts          # Raydium CPMM core implementation
│   ├── solana.ts           # Solana utility functions
│   └── codex.ts            # Codex API client
├── hooks/
│   └── use-trade.ts        # Trade Hook (updated to use Raydium)
└── components/
    └── TradingPanel.tsx    # Trading panel (updated)
```

### Key Code Snippets

#### 1. Get Pool Information

```typescript
import { getRaydiumCPMMPool } from "@/lib/raydium";
import { getCodexClient } from "@/lib/codex";
import { createConnection } from "@/lib/solana";

const connection = createConnection();
const codexClient = getCodexClient();

// Get Raydium CPMM pool
const poolInfo = await getRaydiumCPMMPool(
  connection,
  codexClient,
  tokenAddress // Token address
);
```

#### 2. Create Swap Transaction

```typescript
import { createRaydiumCPMMSwapTransaction } from "@/lib/raydium";

const transaction = await createRaydiumCPMMSwapTransaction(
  connection,
  userPublicKey,
  poolInfo,
  inputMint, // Input token mint
  outputMint, // Output token mint
  amountAtomic, // Input amount (BN)
  slippageBps, // Slippage (50 = 0.5%)
  priorityFee // Priority fee (optional)
);
```

#### 3. Sign and Send

```typescript
import {
  signTransaction,
  sendTransaction,
  confirmTransaction,
} from "@/lib/solana";

// Sign
const signedTransaction = signTransaction(keypair, transaction);

// Send
const signature = await sendTransaction(signedTransaction, connection);

// Confirm
const confirmation = await confirmTransaction(signature, connection);
```
