const EventEmitter = require('events');

const DEFAULT_ASSETS = {
  gold: { symbol: 'Au', price: 6143.57, volatility: 0.008, minPrice: 5600, maxPrice: 6800 },
  silver: { symbol: 'Ag', price: 267.21, volatility: 0.018, minPrice: 200, maxPrice: 340 },
  platinum: { symbol: 'Pt', price: 7358.14, volatility: 0.015, minPrice: 6000, maxPrice: 8600 },
  copper: { symbol: 'Cu', price: 423.96, volatility: 0.02, minPrice: 280, maxPrice: 540 },
};

const DEFAULT_WALLET = {
  balance: 100000,
  locked: 0,
  totalPnL: 0,
  dailyPnL: 0,
  winRate: 0,
  wins: 0,
  losses: 0,
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const formatAmount = (value) => parseFloat(value.toFixed(2));
const createId = (prefix = 'TR') => `${prefix}-${Math.floor(100000 + Math.random() * 900000)}`;

class MarketEngine extends EventEmitter {
  constructor() {
    super();
    this.assets = {};
    this.clientState = {};
    this.tradeTimers = {};
    this.tickCount = 0;
    this._initializeAssets();
  }

  _initializeAssets() {
    Object.entries(DEFAULT_ASSETS).forEach(([key, asset]) => {
      this.assets[key] = {
        id: key,
        symbol: asset.symbol,
        price: asset.price,
        open: asset.price,
        high: asset.price,
        low: asset.price,
        close: asset.price,
        volume: 0,
        volatility: asset.volatility,
        minPrice: asset.minPrice,
        maxPrice: asset.maxPrice,
        candles: [this._createInitialCandle(asset.price)],
      };
    });
  }

  _createInitialCandle(price) {
    return {
      time: this._currentTimeKey(),
      open: price,
      high: price,
      low: price,
      close: price,
      volume: 0,
    };
  }

  _currentTimeKey() {
    const now = new Date();
    now.setSeconds(0, 0);
    return Math.floor(now.getTime() / 1000);
  }

  _buildClientState(clientId) {
    if (!this.clientState[clientId]) {
      this.clientState[clientId] = {
        clientId,
        wallet: { ...DEFAULT_WALLET },
        openTrades: [],
        closedTrades: [],
        transactions: [],
      };
    }
    return this.clientState[clientId];
  }

  _randomPriceChange(asset) {
    const direction = Math.random() < 0.48 ? -1 : 1;
    const changeFactor = Math.random() * asset.volatility;
    const delta = asset.price * changeFactor * direction;
    const nextPrice = clamp(asset.price + delta, asset.minPrice, asset.maxPrice);
    return formatAmount(nextPrice);
  }

  _appendVolume(asset) {
    return Math.floor(Math.random() * 140 + 60) * 10;
  }

  _finalizeCurrentCandle(asset) {
    const candle = { ...asset.candles[asset.candles.length - 1] };
    asset.candles = [...asset.candles, candle].slice(-120);
    this.emit('candle:update', { assetId: asset.id, candle });
    asset.candles = [...asset.candles, this._createInitialCandle(asset.price)];
  }

  getMarketSnapshot() {
    return {
      assets: Object.values(this.assets).map((asset) => ({
        id: asset.id,
        symbol: asset.symbol,
        price: asset.price,
        change: formatAmount(asset.price - asset.open),
        pct: parseFloat((((asset.price - asset.open) / asset.open) * 100).toFixed(2)),
      })),
      candles: Object.fromEntries(
        Object.entries(this.assets).map(([key, asset]) => [key, [...asset.candles]])
      ),
    };
  }

  getClientSnapshot(clientId) {
    const state = this._buildClientState(clientId);
    return {
      wallet: { ...state.wallet },
      openTrades: [...state.openTrades],
      closedTrades: [...state.closedTrades],
      transactions: [...state.transactions],
    };
  }

  registerClient(clientId) {
    return this._buildClientState(clientId);
  }

  start() {
    this.tickInterval = setInterval(() => this._processTick(), 1000);
  }

  stop() {
    clearInterval(this.tickInterval);
  }

  _processTick() {
    this.tickCount += 1;
    const marketUpdate = { timestamp: Date.now(), assets: {} };

    Object.values(this.assets).forEach((asset) => {
      const nextPrice = this._randomPriceChange(asset);
      const volume = this._appendVolume(asset);
      asset.open = asset.open || nextPrice;
      asset.high = Math.max(asset.high, nextPrice);
      asset.low = Math.min(asset.low, nextPrice);
      asset.close = nextPrice;
      asset.price = nextPrice;
      asset.volume = volume;

      const currentCandle = asset.candles[asset.candles.length - 1];
      if (!currentCandle || currentCandle.time !== this._currentTimeKey()) {
        this._finalizeCurrentCandle(asset);
      }

      asset.candles[asset.candles.length - 1] = {
        ...asset.candles[asset.candles.length - 1],
        close: nextPrice,
        high: Math.max(asset.candles[asset.candles.length - 1].high, nextPrice),
        low: Math.min(asset.candles[asset.candles.length - 1].low, nextPrice),
        volume: asset.candles[asset.candles.length - 1].volume + volume,
      };

      marketUpdate.assets[asset.id] = {
        id: asset.id,
        symbol: asset.symbol,
        price: asset.price,
        open: asset.open,
        high: asset.high,
        low: asset.low,
        close: asset.close,
        volume: asset.volume,
        candle: asset.candles[asset.candles.length - 1],
      };
    });

    this.emit('market:update', marketUpdate);

    if (this.tickCount % 60 === 0) {
      this.emit('candle:batch', this.getMarketSnapshot().candles);
    }

    this._evaluateOpenPositions();
  }

  _evaluateOpenPositions() {
    Object.values(this.clientState).forEach((client) => {
      if (!client.openTrades.length) return;
      const updates = client.openTrades.map((trade) => {
        const asset = this.assets[trade.asset];
        if (!asset) return trade;
        const direction = trade.side === 'buy' ? 1 : -1;
        const unrealized = formatAmount((asset.price - trade.entryPrice) * trade.quantity * direction);
        return {
          ...trade,
          unrealized,
          currentPrice: asset.price,
        };
      });
      this.emit('pnl:update', {
        clientId: client.clientId,
        openTrades: updates,
        timestamp: Date.now(),
      });
    });
  }

  _buildTradePayload(clientId, params) {
    const asset = this.assets[params.asset];
    const entryPrice = asset.price;
    const quantity = formatAmount((params.amount / entryPrice) * Math.max(1, params.leverage || 1));
    const fee = formatAmount(params.amount * 0.0008);
    const gst = formatAmount(fee * 0.18);
    const netFees = formatAmount(fee + gst);
    return {
      id: createId('TR'),
      clientId,
      asset: params.asset,
      side: params.side,
      quantity,
      entryPrice,
      amount: formatAmount(params.amount),
      leverage: params.leverage || 1,
      durationSeconds: params.duration || 60,
      fee,
      gst,
      netFees,
      status: 'open',
      openedAt: new Date().toISOString(),
      closePrice: null,
      closeTime: null,
      grossPnl: 0,
      netPnl: 0,
      unrealized: 0,
      targetCloseTime: Date.now() + (params.duration || 60) * 1000,
    };
  }

  executeTrade(clientId, payload) {
    const client = this._buildClientState(clientId);
    if (client.wallet.balance < payload.amount) {
      throw new Error('Insufficient wallet balance for instant paper trade.');
    }

    const trade = this._buildTradePayload(clientId, payload);
    client.wallet.balance = formatAmount(client.wallet.balance - trade.amount);
    client.wallet.locked = formatAmount(client.wallet.locked + trade.amount);
    client.openTrades.push(trade);
    client.transactions.unshift({
      id: createId('TX'),
      type: 'trade-open',
      asset: trade.asset,
      side: trade.side,
      amount: trade.amount,
      quantity: trade.quantity,
      timestamp: new Date().toISOString(),
    });

    this.emit('trade:open', { clientId, trade, wallet: { ...client.wallet } });

    this.tradeTimers[trade.id] = setTimeout(() => {
      this.closeTrade(clientId, trade.id);
    }, trade.durationSeconds * 1000);

    return trade;
  }

  closeTrade(clientId, tradeId) {
    const client = this._buildClientState(clientId);
    const tradeIndex = client.openTrades.findIndex((trade) => trade.id === tradeId);
    if (tradeIndex === -1) {
      return null;
    }

    const trade = client.openTrades[tradeIndex];
    const asset = this.assets[trade.asset];
    const exitPrice = asset.price;
    const direction = trade.side === 'buy' ? 1 : -1;
    const grossPnl = formatAmount((exitPrice - trade.entryPrice) * trade.quantity * direction);
    const netPnl = formatAmount(grossPnl - trade.netFees);
    const payout = formatAmount(trade.amount + netPnl);

    client.wallet.locked = formatAmount(client.wallet.locked - trade.amount);
    client.wallet.balance = formatAmount(client.wallet.balance + Math.max(payout, 0));
    client.wallet.totalPnL = formatAmount(client.wallet.totalPnL + netPnl);
    if (netPnl >= 0) {
      client.wallet.wins += 1;
    } else {
      client.wallet.losses += 1;
    }
    client.wallet.winRate = client.wallet.wins + client.wallet.losses > 0
      ? parseFloat(((client.wallet.wins / (client.wallet.wins + client.wallet.losses)) * 100).toFixed(2))
      : 0;

    const completedTrade = {
      ...trade,
      status: 'closed',
      exitPrice,
      closeTime: new Date().toISOString(),
      grossPnl,
      netPnl,
      payout,
      closedAt: new Date().toISOString(),
    };

    client.openTrades.splice(tradeIndex, 1);
    client.closedTrades.unshift(completedTrade);
    client.transactions.unshift({
      id: createId('TX'),
      type: 'trade-close',
      asset: trade.asset,
      side: trade.side,
      amount: trade.amount,
      quantity: trade.quantity,
      grossPnl,
      netPnl,
      timestamp: new Date().toISOString(),
    });

    clearTimeout(this.tradeTimers[trade.id]);
    delete this.tradeTimers[trade.id];

    this.emit('trade:close', {
      clientId,
      trade: completedTrade,
      wallet: { ...client.wallet },
    });

    return completedTrade;
  }

  resetClient(clientId) {
    this.clientState[clientId] = {
      clientId,
      wallet: { ...DEFAULT_WALLET },
      openTrades: [],
      closedTrades: [],
      transactions: [],
    };
    this.emit('wallet:update', { clientId, wallet: { ...DEFAULT_WALLET } });
    return this.getClientSnapshot(clientId);
  }
}

module.exports = { MarketEngine };
