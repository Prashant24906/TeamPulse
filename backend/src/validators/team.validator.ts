import { z } from 'zod';

// ---------------------------------------------------------------------------
// Create team
// ---------------------------------------------------------------------------

export const createTeamSchema = z.object({
  name: z
    .string({ required_error: 'Team name is required' })
    .trim()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name must be at most 100 characters'),

  max_size: z
    .number()
    .int()
    .min(2, 'Team must allow at least 2 members')
    .max(500, 'Team cannot exceed 500 members')
    .default(50),
});

// ---------------------------------------------------------------------------
// Update team
// ---------------------------------------------------------------------------

export const updateTeamSchema = z
  .object({
    name: z.string().trim().min(2).max(100).optional(),
    max_size: z.number().int().min(2).max(500).optional(),
  })
  .refine((d) => d.name !== undefined || d.max_size !== undefined, {
    message: 'Provide at least one field to update (name or max_size)',
  });

// ---------------------------------------------------------------------------
// Add member
// ---------------------------------------------------------------------------

export const addMemberSchema = z.object({
  userId: z.string().uuid('userId must be a valid UUID'),
  role: z.enum(['ADMIN', 'MEMBER'], {
    errorMap: () => ({ message: 'Role must be ADMIN or MEMBER' }),
  }),
});

// ---------------------------------------------------------------------------
// Update member role
// ---------------------------------------------------------------------------

export const updateMemberRoleSchema = z.object({
  role: z.enum(['ADMIN', 'MEMBER'], {
    errorMap: () => ({ message: 'Role must be ADMIN or MEMBER' }),
  }),
});

export type CreateTeamInput      = z.infer<typeof createTeamSchema>;
export type UpdateTeamInput      = z.infer<typeof updateTeamSchema>;
export type AddMemberInput       = z.infer<typeof addMemberSchema>;
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;
