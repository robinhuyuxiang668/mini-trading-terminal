import { useState, useRef, useCallback, useEffect } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { EnhancedToken } from "@codex-data/sdk/dist/sdk/generated/graphql";
import { useBalance } from "@/hooks/use-balance";
import { useTrade } from "@/hooks/use-trade";
import {
  confirmTransaction,
  createConnection,
  createKeypair,
  sendTransaction,
  signTransaction,
} from "@/lib/solana";
import { Zap, X } from "lucide-react";

interface FloatingInstantTradePanelProps {
  token: EnhancedToken;
  isVisible: boolean;
  position: { x: number; y: number; width: number; height: number };
  onPositionChange: (position: {
    x: number;
    y: number;
    width: number;
    height: number;
  }) => void;
  onClose: () => void;
  currentPrice?: number;
  volume24h?: string;
}

export function FloatingInstantTradePanel({
  token,
  isVisible,
  position,
  onPositionChange,
  onClose,
  currentPrice = 0.0314,
  volume24h = "$174",
}: FloatingInstantTradePanelProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [tradeMode, setTradeMode] = useState<"buy" | "sell">("buy");
  const [buyAmount, setBuyAmount] = useState("0.1");
  const [sellPercentage, setSellPercentage] = useState("100");

  const panelRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);

  const {
    nativeBalance: solanaBalance,
    tokenBalance,
    tokenAtomicBalance,
    loading,
    refreshBalance,
  } = useBalance(
    token.address,
    Number(token.decimals),
    9,
    Number(token.networkId)
  );

  const { createTransaction } = useTrade(
    token.address,
    tokenAtomicBalance,
    Number(token.decimals)
  );

  const keypair = createKeypair(import.meta.env.VITE_SOLANA_PRIVATE_KEY);
  const connection = createConnection();

  // Handle drag start
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (
        headerRef.current &&
        headerRef.current.contains(e.target as Node) &&
        !(e.target as HTMLElement).closest("button")
      ) {
        setIsDragging(true);
        setDragStart({
          x: e.clientX - position.x,
          y: e.clientY - position.y,
        });
      }
    },
    [position]
  );

  // Handle drag
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newX = e.clientX - dragStart.x;
      const newY = e.clientY - dragStart.y;

      // Constrain to viewport
      const maxX = window.innerWidth - position.width;
      const maxY = window.innerHeight - position.height;

      onPositionChange({
        ...position,
        x: Math.max(0, Math.min(newX, maxX)),
        y: Math.max(0, Math.min(newY, maxY)),
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, dragStart, position, onPositionChange]);

  // Handle resize
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    setDragStart({
      x: e.clientX,
      y: e.clientY,
    });
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - dragStart.x;
      const deltaY = e.clientY - dragStart.y;

      const newWidth = Math.max(250, Math.min(500, position.width + deltaX));
      const newHeight = Math.max(180, Math.min(400, position.height + deltaY));

      // Adjust position to keep top-left corner fixed
      const newX = position.x;
      const newY = position.y;

      onPositionChange({
        x: newX,
        y: newY,
        width: newWidth,
        height: newHeight,
      });

      setDragStart({ x: e.clientX, y: e.clientY });
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing, dragStart, position, onPositionChange]);

  // Handle instant trade
  const handleInstantTrade = useCallback(async () => {
    const toastId = toast.loading("Executing instant trade...");
    try {
      const value =
        tradeMode === "buy"
          ? parseFloat(buyAmount)
          : parseFloat(sellPercentage);

      if (value <= 0) {
        throw new Error("Invalid trade amount");
      }

      const transaction = await createTransaction({
        direction: tradeMode,
        value,
        signer: keypair.publicKey,
      });

      toast.loading("Signing transaction...", { id: toastId });
      const signedTransaction = signTransaction(keypair, transaction);

      toast.loading("Sending transaction...", { id: toastId });
      const signature = await sendTransaction(signedTransaction, connection);

      toast.loading("Confirming transaction...", { id: toastId });
      const confirmation = await confirmTransaction(signature, connection);

      if (confirmation.value.err) {
        throw new Error("Trade failed");
      }

      toast.success(`Trade successful! TX: ${signature.slice(0, 8)}...`, {
        id: toastId,
      });

      setTimeout(refreshBalance, 1000);
    } catch (error) {
      toast.error((error as Error).message, { id: toastId });
    }
  }, [
    tradeMode,
    buyAmount,
    sellPercentage,
    createTransaction,
    keypair,
    connection,
    refreshBalance,
  ]);

  if (!isVisible) return null;

  // Format price and volume display
  const priceDisplay = `$${currentPrice.toFixed(4)}`;
  const volumeDisplay = volume24h;

  return (
    <div
      ref={panelRef}
      className="fixed z-50 bg-background border border-border rounded-lg shadow-2xl"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: `${position.width}px`,
        height: `${position.height}px`,
        cursor: isDragging ? "grabbing" : "default",
      }}
    >
      {/* Header - draggable */}
      <div
        ref={headerRef}
        onMouseDown={handleMouseDown}
        className="flex items-center justify-between p-3 border-b border-border cursor-grab active:cursor-grabbing bg-muted/30"
      >
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold">Instant Trade</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-muted rounded transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Content */}
      <div className="p-4 space-y-3 h-[calc(100%-48px)] flex flex-col">
        {/* Price Display */}
        <div className="text-center space-y-1">
          <div className="text-2xl font-bold">{priceDisplay}</div>
          <div className="text-xs text-muted-foreground">{volumeDisplay}</div>
        </div>

        {/* Trade Mode Toggle */}
        <div className="flex gap-2">
          <button
            onClick={() => setTradeMode("buy")}
            className={cn(
              "flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all",
              tradeMode === "buy"
                ? "bg-green-500/20 text-green-500 border border-green-500/50"
                : "bg-muted/30 text-muted-foreground hover:bg-muted/50"
            )}
          >
            Buy
          </button>
          <button
            onClick={() => setTradeMode("sell")}
            className={cn(
              "flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all",
              tradeMode === "sell"
                ? "bg-red-500/20 text-red-500 border border-red-500/50"
                : "bg-muted/30 text-muted-foreground hover:bg-muted/50"
            )}
          >
            Sell
          </button>
        </div>

        {/* Trade Input */}
        {tradeMode === "buy" ? (
          <div className="space-y-2">
            <div className="flex gap-1">
              {[0.0001, 0.001, 0.1, 1].map((preset) => (
                <button
                  key={preset}
                  onClick={() => setBuyAmount(preset.toString())}
                  className={cn(
                    "flex-1 py-1 px-2 rounded text-xs font-medium transition-all",
                    buyAmount === preset.toString()
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted/30 text-muted-foreground hover:bg-muted/50"
                  )}
                >
                  {preset}
                </button>
              ))}
            </div>
            <input
              type="number"
              value={buyAmount}
              onChange={(e) => setBuyAmount(e.target.value)}
              placeholder="0.00"
              className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm"
              min="0"
              step="0.01"
            />
            <div className="text-xs text-muted-foreground text-center">
              Available: {solanaBalance.toFixed(4)} SOL
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex gap-1">
              {[10, 25, 50, 100].map((preset) => (
                <button
                  key={preset}
                  onClick={() => setSellPercentage(preset.toString())}
                  className={cn(
                    "flex-1 py-1 px-2 rounded text-xs font-medium transition-all",
                    sellPercentage === preset.toString()
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted/30 text-muted-foreground hover:bg-muted/50"
                  )}
                >
                  {preset}%
                </button>
              ))}
            </div>
            <div className="text-xs text-muted-foreground text-center">
              Selling:{" "}
              {tokenBalance > 0
                ? (
                    (tokenBalance * parseFloat(sellPercentage)) /
                    100
                  ).toLocaleString()
                : 0}{" "}
              {token.symbol}
            </div>
          </div>
        )}

        {/* Instant Trade Button */}
        <button
          onClick={handleInstantTrade}
          disabled={
            loading ||
            (tradeMode === "buy" &&
              (!buyAmount || parseFloat(buyAmount) <= 0)) ||
            (tradeMode === "sell" &&
              (!sellPercentage || parseFloat(sellPercentage) <= 0))
          }
          className={cn(
            "w-full py-3 px-4 rounded-lg font-semibold transition-all flex items-center justify-center gap-2",
            tradeMode === "buy"
              ? "bg-green-500 hover:bg-green-600 text-white disabled:bg-green-500/30 disabled:text-green-500/50"
              : "bg-red-500 hover:bg-red-600 text-white disabled:bg-red-500/30 disabled:text-red-500/50",
            "disabled:cursor-not-allowed"
          )}
        >
          <Zap className="w-4 h-4" />
          Instant {tradeMode === "buy" ? "Buy" : "Sell"}
        </button>
      </div>

      {/* Resize Handle */}
      <div
        onMouseDown={handleResizeStart}
        className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize bg-border/50 hover:bg-border rounded-tl-lg"
        style={{
          clipPath: "polygon(100% 0, 0 100%, 100% 100%)",
        }}
      />
    </div>
  );
}

