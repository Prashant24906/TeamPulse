import { z } from 'zod';

// ---------------------------------------------------------------------------
// Search query — minimum 2 characters so single-char queries are rejected
// ---------------------------------------------------------------------------

export const searchQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .max(100, 'Search query must be at most 100 characters')
    .default(''),
});

// ---------------------------------------------------------------------------
// Approve / Reject — only these two values are accepted from the client
// ---------------------------------------------------------------------------

export const updateJoinRequestSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED'] as const, {
    error: 'status must be APPROVED or REJECTED',
  }),
});

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type SearchQueryInput       = z.infer<typeof searchQuerySchema>;
export type UpdateJoinRequestInput = z.infer<typeof updateJoinRequestSchema>;

