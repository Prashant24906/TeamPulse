import { z } from 'zod';

// ---------------------------------------------------------------------------
// URL validator — accepts only http: and https: protocols, max 2048 chars
// ---------------------------------------------------------------------------

const urlValidator = z
  .string({ error: 'URL is required' })
  .trim()
  .min(1, 'URL cannot be empty')
  .max(2048, 'URL must be at most 2048 characters')
  .refine(
    (val) => {
      try {
        const parsed = new URL(val);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
      } catch {
        return false;
      }
    },
    { message: 'URL must be a valid HTTP or HTTPS URL' }
  );

// ---------------------------------------------------------------------------
// Create resource schema
// ---------------------------------------------------------------------------

export const createResourceSchema = z.object({
  name: z
    .string({ error: 'Resource name is required' })
    .trim()
    .min(1, 'Resource name cannot be empty')
    .max(100, 'Resource name must be at most 100 characters'),
  url: urlValidator,
});

// ---------------------------------------------------------------------------
// Update resource schema
// ---------------------------------------------------------------------------

export const updateResourceSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Resource name cannot be empty')
      .max(100, 'Resource name must be at most 100 characters')
      .optional(),
    url: urlValidator.optional(),
  })
  .refine((data) => data.name !== undefined || data.url !== undefined, {
    message: 'Provide at least one field to update (name or url)',
  });

export type CreateResourceInput = z.infer<typeof createResourceSchema>;
export type UpdateResourceInput = z.infer<typeof updateResourceSchema>;
