import { z } from "zod";

export const idempotencyKeySchema = z.string().uuid();

export const tradeRequestSchema = z.object({
  stockId: z.string().uuid(),
  quantity: z.number().int().positive(),
  type: z.enum(["BUY", "SELL"]),
  idempotencyKey: idempotencyKeySchema,
});

export const priceChangeSchema = z.object({
  stockId: z.string().uuid(),
  newPrice: z.number().int().positive(),
});

export const createPriceBatchSchema = z.object({
  changes: z.array(priceChangeSchema).min(1),
  idempotencyKey: idempotencyKeySchema,
});

export const applyPriceBatchSchema = z.object({
  batchId: z.string().uuid(),
  idempotencyKey: idempotencyKeySchema,
});

export const dividendSchema = z.object({
  stockId: z.string().uuid(),
  amountPerShare: z.number().int().positive(),
  idempotencyKey: idempotencyKeySchema,
});

export const cashAdjustmentSchema = z.object({
  action: z.enum(["CREDIT", "DEBIT"]),
  teamId: z.string().uuid(),
  amount: z.number().int().positive(),
  reason: z.string().min(1),
  idempotencyKey: idempotencyKeySchema,
});

export const roundSchema = z.object({
  round: z.number().int().min(1).max(3),
  idempotencyKey: idempotencyKeySchema,
});

export const marketActionSchema = z.object({
  action: z.enum(["OPEN", "CLOSED", "PAUSED", "RESUMED"]),
});

export const resetSchema = z.object({
  confirm: z.boolean(),
  idempotencyKey: idempotencyKeySchema,
});

export const playVideoSchema = z.object({
  videoId: z.string().uuid(),
});
