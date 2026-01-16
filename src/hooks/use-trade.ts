import { useCallback } from "react";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { NATIVE_MINT } from "@solana/spl-token";
import Decimal from "decimal.js";
import BN from "bn.js";
import {
  createRaydiumCPMMSwapTransaction,
  getRaydiumCPMMPool,
} from "@/lib/raydium";
import { getCodexClient } from "@/lib/codex";
import { createConnection } from "@/lib/solana";

export const useTrade = (
  tokenAddress: string,
  tokenAtomicBalance: Decimal,
  tokenDecimals: number = 9
) => {
  const createTransaction = useCallback(
    async (params: {
      direction: "buy" | "sell";
      value: number;
      signer: PublicKey;
    }) => {
      const { direction, value, signer } = params;

      const connection = createConnection();
      const codexClient = getCodexClient();

      // Determine input and output mints
      const inputMint =
        direction === "buy" ? NATIVE_MINT : new PublicKey(tokenAddress);
      const outputMint =
        direction === "buy" ? new PublicKey(tokenAddress) : NATIVE_MINT;

      // Calculate input amount in atomic units
      let amountAtomic: BN;
      if (direction === "buy") {
        // Buy: SOL -> Token
        amountAtomic = new BN(value * LAMPORTS_PER_SOL);
      } else {
        // Sell: Token -> SOL (percentage-based)
        amountAtomic = new BN(
          tokenAtomicBalance.mul(value).div(100).toFixed(0)
        );
      }

      // Get Raydium CPMM pool info from Codex API
      const poolInfo = await getRaydiumCPMMPool(
        connection,
        codexClient,
        tokenAddress
      );

      if (!poolInfo) {
        throw new Error("No Raydium CPMM pool found for this token pair");
      }

      // Validate pool contains target token pair
      const poolHasInput =
        poolInfo.mintA.equals(inputMint) || poolInfo.mintB.equals(inputMint);
      const poolHasOutput =
        poolInfo.mintA.equals(outputMint) || poolInfo.mintB.equals(outputMint);

      if (!poolHasInput || !poolHasOutput) {
        throw new Error("Pool does not contain the requested token pair");
      }

      // Create Raydium CPMM swap transaction
      const slippageBps = 50; // Default 0.5% slippage
      const priorityFeeMicroLamports = 1000; // Default priority fee

      const transaction = await createRaydiumCPMMSwapTransaction(
        connection,
        signer,
        poolInfo,
        inputMint,
        outputMint,
        amountAtomic,
        slippageBps,
        priorityFeeMicroLamports
      );

      return transaction;
    },
    [tokenAddress, tokenAtomicBalance, tokenDecimals]
  );

  return {
    createTransaction,
  };
};
