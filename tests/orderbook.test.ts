import { describe, expect, it } from "vitest";
import { OrderBook } from "../src/sim/orderbook";

describe("OrderBook", () => {
  it("rests limit orders and reports best bid/ask", () => {
    const book = new OrderBook();
    book.submit(1, 1, "buy", "limit", 990, 10);
    book.submit(1, 2, "sell", "limit", 1010, 5);
    expect(book.bestBid()).toBe(990);
    expect(book.bestAsk()).toBe(1010);
    expect(book.mid()).toBe(1000);
    expect(book.spread()).toBe(20);
  });

  it("matches a crossing limit at the resting order's price", () => {
    const book = new OrderBook();
    book.submit(1, 1, "sell", "limit", 1000, 10);
    const res = book.submit(2, 2, "buy", "limit", 1005, 10);
    expect(res.trades).toHaveLength(1);
    expect(res.trades[0]!.price).toBe(1000);
    expect(res.trades[0]!.qty).toBe(10);
    expect(res.trades[0]!.aggressor).toBe("buy");
    expect(res.restingId).toBeUndefined();
    expect(book.bestAsk()).toBeUndefined();
  });

  it("handles partial fills and rests the remainder", () => {
    const book = new OrderBook();
    book.submit(1, 1, "sell", "limit", 1000, 4);
    const res = book.submit(2, 2, "buy", "limit", 1002, 10);
    expect(res.trades[0]!.qty).toBe(4);
    expect(res.restingId).toBeDefined();
    expect(book.bestBid()).toBe(1002);
    expect(book.depth("buy", 1)[0]!.qty).toBe(6);
  });

  it("respects price priority across levels", () => {
    const book = new OrderBook();
    book.submit(1, 1, "sell", "limit", 1002, 5);
    book.submit(2, 2, "sell", "limit", 1001, 5);
    const res = book.submit(3, 3, "buy", "market", 0, 6);
    expect(res.trades[0]!.price).toBe(1001);
    expect(res.trades[1]!.price).toBe(1002);
    expect(res.trades[1]!.qty).toBe(1);
  });

  it("respects time priority within a level", () => {
    const book = new OrderBook();
    const first = book.submit(1, 1, "sell", "limit", 1000, 5);
    book.submit(2, 2, "sell", "limit", 1000, 5);
    const res = book.submit(3, 3, "buy", "market", 0, 5);
    expect(res.fills.find((f) => !f.taker)!.orderId).toBe(first.restingId);
  });

  it("walks the book with market orders and discards the unfilled remainder", () => {
    const book = new OrderBook();
    book.submit(1, 1, "sell", "limit", 1000, 3);
    book.submit(2, 2, "sell", "limit", 1005, 3);
    const res = book.submit(3, 3, "buy", "market", 0, 10);
    expect(res.trades.map((t) => t.qty)).toEqual([3, 3]);
    expect(res.restingId).toBeUndefined();
    expect(book.bestAsk()).toBeUndefined();
    expect(book.bestBid()).toBeUndefined();
  });

  it("cancels orders and cleans up empty levels", () => {
    const book = new OrderBook();
    const res = book.submit(1, 1, "buy", "limit", 990, 10);
    expect(book.cancel(res.restingId!)).toBe(true);
    expect(book.bestBid()).toBeUndefined();
    expect(book.cancel(res.restingId!)).toBe(false);
  });

  it("cancelAll removes only that agent's orders", () => {
    const book = new OrderBook();
    book.submit(1, 1, "buy", "limit", 990, 10);
    book.submit(1, 1, "buy", "limit", 985, 10);
    book.submit(1, 2, "buy", "limit", 980, 10);
    expect(book.cancelAll(1)).toBe(2);
    expect(book.bestBid()).toBe(980);
  });

  it("prevents self-trades by cancelling the resting order", () => {
    const book = new OrderBook();
    book.submit(1, 1, "sell", "limit", 1000, 5);
    book.submit(1, 2, "sell", "limit", 1001, 5);
    const res = book.submit(2, 1, "buy", "limit", 1002, 5);
    expect(res.stpCancelled).toHaveLength(1);
    expect(res.trades).toHaveLength(1);
    expect(res.trades[0]!.price).toBe(1001);
    expect(res.trades[0]!.sellerId).toBe(2);
  });

  it("tracks open exposure per agent", () => {
    const book = new OrderBook();
    book.submit(1, 7, "buy", "limit", 100, 10);
    book.submit(1, 7, "sell", "limit", 200, 4);
    expect(book.openExposure(7)).toEqual({ buyValue: 1000, sellQty: 4 });
  });
});
