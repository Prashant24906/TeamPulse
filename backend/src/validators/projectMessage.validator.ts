import { z } from 'zod';

// ---------------------------------------------------------------------------
// Send message — content only; sender/project come from JWT + route
// ---------------------------------------------------------------------------

export const sendProjectMessageSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, 'Message cannot be empty')
    .max(2000, 'Message cannot exceed 2000 characters'),
});

// ---------------------------------------------------------------------------
// Update message — content only
// ---------------------------------------------------------------------------

export const updateProjectMessageSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, 'Message cannot be empty')
    .max(2000, 'Message cannot exceed 2000 characters'),
});

// ---------------------------------------------------------------------------
// List messages — query params
// ---------------------------------------------------------------------------

export const listProjectMessagesSchema = z.object({
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

export type SendProjectMessageInput   = z.infer<typeof sendProjectMessageSchema>;
export type UpdateProjectMessageInput = z.infer<typeof updateProjectMessageSchema>;
export type ListProjectMessagesInput  = z.infer<typeof listProjectMessagesSchema>;
