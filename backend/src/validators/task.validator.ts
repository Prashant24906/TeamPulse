import { z } from 'zod';

const taskStatus   = z.enum(['TODO', 'IN_PROGRESS', 'COMPLETED']);
const taskPriority = z.enum(['LOW', 'MEDIUM', 'HIGH']);

// ---------------------------------------------------------------------------
// Create task
// ---------------------------------------------------------------------------

export const createTaskSchema = z.object({
  name: z
    .string({ required_error: 'Task name is required' })
    .trim()
    .min(2, 'Name must be at least 2 characters')
    .max(200, 'Name must be at most 200 characters'),

  description: z.string().trim().max(2000).optional(),

  assigned_to: z.string().uuid('assigned_to must be a valid UUID').optional(),

  status: taskStatus.default('TODO'),

  priority: taskPriority.default('MEDIUM'),

  due_date: z
    .string()
    .datetime({ message: 'due_date must be an ISO 8601 datetime string' })
    .optional(),
});

// ---------------------------------------------------------------------------
// Update task
// ---------------------------------------------------------------------------

export const updateTaskSchema = z
  .object({
    name:        z.string().trim().min(2).max(200).optional(),
    description: z.string().trim().max(2000).optional(),
    assigned_to: z.string().uuid().nullable().optional(),
    status:      taskStatus.optional(),
    priority:    taskPriority.optional(),
    due_date:    z.string().datetime().nullable().optional(),
  })
  .refine(
    (d) => Object.values(d).some((v) => v !== undefined),
    { message: 'Provide at least one field to update' }
  );

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
