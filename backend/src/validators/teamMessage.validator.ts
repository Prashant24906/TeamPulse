import { z } from 'zod';

// ---------------------------------------------------------------------------
// Send message — content only; sender/team come from JWT + route
// ---------------------------------------------------------------------------

export const sendMessageSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, 'Message cannot be empty')
    .max(2000, 'Message cannot exceed 2000 characters'),
});

// ---------------------------------------------------------------------------
// List messages — query params
// ---------------------------------------------------------------------------

export const listMessagesSchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(50),
  before: z.string().uuid('before must be a valid message UUID').optional(),
});

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type SendMessageInput   = z.infer<typeof sendMessageSchema>;
export type ListMessagesInput  = z.infer<typeof listMessagesSchema>;
