import {
  Connection,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import BN from "bn.js";
import Decimal from "decimal.js";
import { Codex } from "@codex-data/sdk";
import { PairFilterResult } from "@codex-data/sdk/dist/sdk/generated/graphql";

/**
 * Raydium CPMM program ID (Mainnet)
 */
export const RAYDIUM_CPMM_PROGRAM_ID = new PublicKey(
  "CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C"
);

/**
 * Raydium CPMM pool account structure
 *
 * Account layout offsets:
 * 0-7: discriminator (8 bytes)
 * 8-39: ammConfig (32 bytes)
 * 40-71: poolCoinTokenAccount / vaultA (32 bytes) - base token vault
 * 72-103: poolPcTokenAccount / vaultB (32 bytes) - quote token vault
 * 104-135: poolWithdrawQueue (32 bytes)
 * 136-167: poolTargetOrders (32 bytes)
 * 168-199: poolTempLpTokenAccount (32 bytes)
 * 200-231: poolOwner (32 bytes)
 * 232-263: mintA (32 bytes) - base mint
 * 264-295: mintB (32 bytes) - quote mint
 * 296-327: lpMint (32 bytes)
 */
export interface CPMMPoolInfo {
  poolId: PublicKey;
  mintA: PublicKey; // base mint
  mintB: PublicKey; // quote mint (usually USDC/USDT)
  vaultA: PublicKey; // base token vault
  vaultB: PublicKey; // quote token vault
  lpMint: PublicKey;
  ammConfig: PublicKey;
  poolCoinTokenAccount: PublicKey; // same as vaultA
  poolPcTokenAccount: PublicKey; // same as vaultB
  poolWithdrawQueue: PublicKey;
  poolTargetOrders: PublicKey;
  poolTempLpTokenAccount: PublicKey;
  poolOwner: PublicKey;
}

/**
 * Parse CPMM pool account data from on-chain account
 */
export function parseCPMMPoolAccount(
  accountData: Buffer,
  poolId: PublicKey
): CPMMPoolInfo | null {
  try {
    if (accountData.length < 328) {
      console.error("Pool account data too short");
      return null;
    }

    const ammConfig = new PublicKey(accountData.slice(8, 40));
    const poolCoinTokenAccount = new PublicKey(accountData.slice(40, 72));
    const poolPcTokenAccount = new PublicKey(accountData.slice(72, 104));
    const poolWithdrawQueue = new PublicKey(accountData.slice(104, 136));
    const poolTargetOrders = new PublicKey(accountData.slice(136, 168));
    const poolTempLpTokenAccount = new PublicKey(accountData.slice(168, 200));
    const poolOwner = new PublicKey(accountData.slice(200, 232));
    const mintA = new PublicKey(accountData.slice(232, 264));
    const mintB = new PublicKey(accountData.slice(264, 296));
    const lpMint = new PublicKey(accountData.slice(296, 328));

    return {
      poolId,
      mintA,
      mintB,
      vaultA: poolCoinTokenAccount,
      vaultB: poolPcTokenAccount,
      lpMint,
      ammConfig,
      poolCoinTokenAccount,
      poolPcTokenAccount,
      poolWithdrawQueue,
      poolTargetOrders,
      poolTempLpTokenAccount,
      poolOwner,
    };
  } catch (error) {
    console.error("Error parsing CPMM pool account:", error);
    return null;
  }
}

/**
 * Fetch CPMM pool info from on-chain account
 */
export async function getCPMMPoolInfo(
  connection: Connection,
  poolId: PublicKey
): Promise<CPMMPoolInfo | null> {
  try {
    const accountInfo = await connection.getAccountInfo(poolId);
    if (!accountInfo) {
      return null;
    }

    return parseCPMMPoolAccount(accountInfo.data, poolId);
  } catch (error) {
    console.error("Error fetching CPMM pool info:", error);
    return null;
  }
}

/**
 * Find Raydium CPMM pool address from Codex API
 */
export async function findCPMMPoolFromCodex(
  codexClient: Codex,
  tokenAddress: string
): Promise<PublicKey | null> {
  try {
    const pairsResponse = await codexClient.queries.filterPairs({
      filters: { tokenAddress: [tokenAddress] },
      limit: 100,
    });

    if (!pairsResponse?.filterPairs?.results) {
      return null;
    }

    const raydiumCPMMPool = pairsResponse.filterPairs.results
      .filter((pair): pair is PairFilterResult => pair != null)
      .find((pair) => {
        const exchangeName = pair.exchange?.name?.toLowerCase() || "";
        return (
          exchangeName.includes("raydium") &&
          (exchangeName.includes("cpmm") || exchangeName.includes("cpm"))
        );
      });

    if (!raydiumCPMMPool || !raydiumCPMMPool.pair?.address) {
      return null;
    }

    return new PublicKey(raydiumCPMMPool.pair.address);
  } catch (error) {
    console.error("Error finding CPMM pool from Codex:", error);
    return null;
  }
}

/**
 * Get Raydium CPMM pool info from Codex API and on-chain data
 */
export async function getRaydiumCPMMPool(
  connection: Connection,
  codexClient: Codex,
  tokenAddress: string
): Promise<CPMMPoolInfo | null> {
  try {
    // Query pool pairs from Codex API
    const pairsResponse = await codexClient.queries.filterPairs({
      filters: { tokenAddress: [tokenAddress] },
      limit: 100,
    });

    if (!pairsResponse?.filterPairs?.results) {
      return null;
    }

    // Find Raydium CPMM pool
    const raydiumCPMMPool = pairsResponse.filterPairs.results
      .filter((pair): pair is PairFilterResult => pair != null)
      .find((pair) => {
        const exchangeName = pair.exchange?.name?.toLowerCase() || "";
        return (
          exchangeName.includes("raydium") &&
          (exchangeName.includes("cpmm") || exchangeName.includes("cpm"))
        );
      });

    if (!raydiumCPMMPool || !raydiumCPMMPool.pair?.address) {
      return null;
    }

    const poolId = new PublicKey(raydiumCPMMPool.pair.address);

    // Fetch and parse pool account from chain
    return await getCPMMPoolInfo(connection, poolId);
  } catch (error) {
    console.error("Error fetching Raydium CPMM pool:", error);
    return null;
  }
}

/**
 * Calculate pool output amount using constant product formula
 * Note: Simplified version without fee consideration
 */
export async function calculatePoolOutput(
  connection: Connection,
  poolInfo: CPMMPoolInfo,
  amountIn: BN,
  isBaseIn: boolean
): Promise<BN> {
  try {
    // Fetch pool reserves
    const vaultAInfo = await connection.getTokenAccountBalance(poolInfo.vaultA);
    const vaultBInfo = await connection.getTokenAccountBalance(poolInfo.vaultB);

    const reserveA = new BN(vaultAInfo.value.amount);
    const reserveB = new BN(vaultBInfo.value.amount);

    // Constant product formula: x * y = k
    // Output = (amountIn * reserveOut) / (reserveIn + amountIn)
    const reserveIn = isBaseIn ? reserveA : reserveB;
    const reserveOut = isBaseIn ? reserveB : reserveA;

    const numerator = amountIn.mul(reserveOut);
    const denominator = reserveIn.add(amountIn);
    const amountOut = numerator.div(denominator);

    return amountOut;
  } catch (error) {
    console.error("Error calculating pool output:", error);
    throw error;
  }
}

/**
 * Build Raydium CPMM swap_base_input instruction
 *
 * Instruction format:
 * - Instruction index: 9 (swap_base_input)
 * - Data: amount_in (u64, 8 bytes) + amount_out_minimum (u64, 8 bytes)
 *
 * Account list (8 accounts):
 * 0. poolState (writable)
 * 1. user (signer)
 * 2. userSourceToken (writable) - user input token account
 * 3. userDestinationToken (writable) - user output token account
 * 4. poolSourceToken (writable) - pool input token account
 * 5. poolDestinationToken (writable) - pool output token account
 * 6. ammConfig (readonly)
 * 7. tokenProgram (readonly)
 */
export function createSwapBaseInputInstruction(
  poolInfo: CPMMPoolInfo,
  user: PublicKey,
  amountIn: BN,
  amountOutMinimum: BN,
  isBaseIn: boolean
): TransactionInstruction {
  // Get user token accounts (ATA)
  const userTokenIn = getAssociatedTokenAddressSync(
    isBaseIn ? poolInfo.mintA : poolInfo.mintB,
    user
  );
  const userTokenOut = getAssociatedTokenAddressSync(
    isBaseIn ? poolInfo.mintB : poolInfo.mintA,
    user
  );

  // Determine pool input/output token accounts
  const poolTokenIn = isBaseIn ? poolInfo.vaultA : poolInfo.vaultB;
  const poolTokenOut = isBaseIn ? poolInfo.vaultB : poolInfo.vaultA;

  // Build instruction data
  const instructionData = Buffer.alloc(17);
  instructionData.writeUInt8(9, 0); // Instruction index
  amountIn.toArrayLike(Buffer, "le", 8).copy(instructionData, 1);
  amountOutMinimum.toArrayLike(Buffer, "le", 8).copy(instructionData, 9);

  const keys = [
    { pubkey: poolInfo.poolId, isSigner: false, isWritable: true },
    { pubkey: user, isSigner: true, isWritable: false },
    { pubkey: userTokenIn, isSigner: false, isWritable: true },
    { pubkey: userTokenOut, isSigner: false, isWritable: true },
    { pubkey: poolTokenIn, isSigner: false, isWritable: true },
    { pubkey: poolTokenOut, isSigner: false, isWritable: true },
    { pubkey: poolInfo.ammConfig, isSigner: false, isWritable: false },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
  ];

  return new TransactionInstruction({
    programId: RAYDIUM_CPMM_PROGRAM_ID,
    keys,
    data: instructionData,
  });
}

/**
 * Create complete Raydium CPMM swap transaction
 */
export async function createRaydiumCPMMSwapTransaction(
  connection: Connection,
  user: PublicKey,
  poolInfo: CPMMPoolInfo,
  inputMint: PublicKey,
  outputMint: PublicKey,
  amountIn: BN,
  slippageBps: number, // Slippage in basis points (50 = 0.5%)
  priorityFeeMicroLamports?: number
): Promise<VersionedTransaction> {
  // Determine if base or quote token is input
  const isBaseIn = poolInfo.mintA.equals(inputMint);

  // Validate input/output mints match pool
  if (!poolInfo.mintA.equals(inputMint) && !poolInfo.mintB.equals(inputMint)) {
    throw new Error("Input mint does not match pool");
  }
  if (
    !poolInfo.mintA.equals(outputMint) &&
    !poolInfo.mintB.equals(outputMint)
  ) {
    throw new Error("Output mint does not match pool");
  }

  // Calculate expected output amount
  const estimatedAmountOut = await calculatePoolOutput(
    connection,
    poolInfo,
    amountIn,
    isBaseIn
  );

  // Calculate minimum output with slippage
  const slippageMultiplier = new Decimal(10000 - slippageBps).div(10000);
  const amountOutMinimumBN = new Decimal(estimatedAmountOut.toString()).mul(
    slippageMultiplier
  );
  const amountOutMinimum = new BN(amountOutMinimumBN.toFixed(0));

  // Create swap instruction
  const swapInstruction = createSwapBaseInputInstruction(
    poolInfo,
    user,
    amountIn,
    amountOutMinimum,
    isBaseIn
  );

  // Get latest blockhash
  const { blockhash } = await connection.getLatestBlockhash("finalized");

  // Build instruction list
  const instructions: TransactionInstruction[] = [];

  // Add priority fee instruction if provided
  if (priorityFeeMicroLamports && priorityFeeMicroLamports > 0) {
    instructions.push(
      ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: priorityFeeMicroLamports,
      })
    );
  }

  // Add swap instruction
  instructions.push(swapInstruction);

  // Create versioned transaction
  const messageV0 = new TransactionMessage({
    payerKey: user,
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message();

  return new VersionedTransaction(messageV0);
}
