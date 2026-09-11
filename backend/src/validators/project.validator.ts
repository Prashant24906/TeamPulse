import { z } from 'zod';

// ---------------------------------------------------------------------------
// Create project
// ---------------------------------------------------------------------------

export const createProjectSchema = z.object({
  name: z
    .string({ required_error: 'Project name is required' })
    .trim()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name must be at most 100 characters'),
});

// ---------------------------------------------------------------------------
// Update project
// ---------------------------------------------------------------------------

export const updateProjectSchema = z
  .object({
    name:   z.string().trim().min(2).max(100).optional(),
    status: z.enum(['ACTIVE', 'ARCHIVED']).optional(),
  })
  .refine((d) => d.name !== undefined || d.status !== undefined, {
    message: 'Provide at least one field to update (name or status)',
  });

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
