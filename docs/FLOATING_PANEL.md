# Floating Instant Trade Panel

## Overview

A draggable and resizable floating panel for instant token trading on the Token Page.

## Features

- ✅ **Toggle Visibility**: Show/hide button below the chart
- ✅ **Draggable**: Drag by clicking and holding the header
- ✅ **Resizable**: Resize by dragging the bottom-right corner
- ✅ **One-Click Trading**: Instant buy/sell functionality
- ✅ **Buy Mode**: Amount in SOL
- ✅ **Sell Mode**: Percentage of token balance
- ✅ **State Persistence**: Panel position saved to localStorage
- ✅ **Desktop Only**: Optimized for desktop devices

## Components

### `FloatingInstantTradePanel`

Main component for the floating trade panel.

**Props:**

- `token`: Token information
- `isVisible`: Panel visibility state
- `position`: Panel position and size `{ x, y, width, height }`
- `onPositionChange`: Callback when position changes
- `onClose`: Callback to close the panel
- `currentPrice`: Optional current token price
- `volume24h`: Optional 24h volume

### `useFloatingPanel` Hook

Custom hook for managing panel state and position.

**Returns:**

- `isVisible`: Boolean visibility state
- `position`: Panel position object
- `togglePanel`: Function to toggle visibility
- `updatePosition`: Function to update position

## Usage

The panel is automatically integrated into `TokenPage`. Users can:

1. Click the "Show Instant Trade Panel" button below the chart
2. Drag the panel by clicking and holding the header
3. Resize the panel by dragging the bottom-right corner
4. Select buy/sell mode
5. Enter amount (SOL for buy, percentage for sell)
6. Click "Instant Buy/Sell" to execute trade

## Implementation Details

- Uses native mouse events for drag and resize (no external dependencies)
- Position persisted in localStorage
- Efficient DOM rendering with conditional rendering
- State management via custom React hook
- Integrates with existing `useTrade` and `useBalance` hooks
