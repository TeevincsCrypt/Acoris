/**
 * Shared request-validation schemas used by every negotiation-adjacent API
 * route (run, marketplace) — kept in one place so the same loan-request
 * shape can't silently drift between routes.
 */

import { z } from "zod";

export const LoanRequestSchema = z.object({
  amount: z.number().positive(),
  collateralValue: z.number().positive(),
  durationDays: z.number().positive(),
  maxApr: z.number().positive(),
  preferredRepaymentConditions: z.string().optional(),
});
