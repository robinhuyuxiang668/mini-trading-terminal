import { useState, useCallback } from "react";

interface PanelPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

const DEFAULT_POSITION: PanelPosition = {
  x: window.innerWidth - 320, // Default to right side
  y: 200,
  width: 280,
  height: 200,
};

const STORAGE_KEY = "floating-panel-position";

/**
 * Hook for managing floating panel state and position
 */
export function useFloatingPanel() {
  // Load initial position from localStorage
  const loadPosition = (): PanelPosition => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Validate position is within viewport
        if (
          parsed.x >= 0 &&
          parsed.y >= 0 &&
          parsed.width > 200 &&
          parsed.height > 150
        ) {
          return parsed;
        }
      }
    } catch (error) {
      console.error("Failed to load panel position:", error);
    }
    return DEFAULT_POSITION;
  };

  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState<PanelPosition>(loadPosition);

  // Save position to localStorage
  const savePosition = useCallback((pos: PanelPosition) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(pos));
    } catch (error) {
      console.error("Failed to save panel position:", error);
    }
  }, []);

  const togglePanel = useCallback(() => {
    setIsVisible((prev) => !prev);
  }, []);

  const updatePosition = useCallback(
    (newPosition: Partial<PanelPosition>) => {
      setPosition((prev) => {
        const updated = { ...prev, ...newPosition };
        savePosition(updated);
        return updated;
      });
    },
    [savePosition]
  );

  return {
    isVisible,
    position,
    togglePanel,
    updatePosition,
  };
}

