import { AppError } from '../middleware/error.middleware';
import * as taskRepo    from '../repositories/task.repository';
import * as teamRepo    from '../repositories/team.repository';
import * as projectRepo from '../repositories/project.repository';
import type { TeamRole } from '../repositories/team.repository';
import type { CreateTaskInput, UpdateTaskInput } from '../validators/task.validator';
import { emitToTeam } from '../websocket/emit';
import { WS_EVENTS } from '../websocket/events';
import { scheduleTaskDeadlineJob, removeTaskDeadlineJob } from '../jobs/queues/notification.queue';
import { isRedisReady } from '../config/redis';

// ---------------------------------------------------------------------------
// Helper — auth chain: taskId → task.team_id → team.project_id → project role
// ---------------------------------------------------------------------------

async function resolveTaskAndRole(
  taskId: string,
  userId: string
): Promise<{ task: taskRepo.Task; role: TeamRole }> {
  const task = await taskRepo.findTaskById(taskId);
  if (!task) throw new AppError(404, 'Task not found');

  const role = await teamRepo.findMemberRole(task.team_id, userId);
  if (!role) throw new AppError(403, 'You are not a member of the team that owns this task');

  return { task, role };
}

// ---------------------------------------------------------------------------
// Create task — any team member (OWNER, ADMIN, MEMBER)
// ---------------------------------------------------------------------------

export async function createTask(
  userId: string,
  teamId: string,
  input: CreateTaskInput
) {
  const team = await teamRepo.findTeamById(teamId);
  if (!team) throw new AppError(404, 'Team not found');

  const role = await teamRepo.findMemberRole(teamId, userId);
  if (!role) throw new AppError(403, 'You are not a member of this team');

  // If assigned_to is provided, verify that user is in the same team
  if (input.assigned_to) {
    const assigneeRole = await teamRepo.findMemberRole(teamId, input.assigned_to);
    if (!assigneeRole) {
      throw new AppError(400, 'assigned_to user is not a member of this team');
    }
  }

  const task = await taskRepo.createTask({
    name:        input.name,
    description: input.description,
    team_id:     teamId,
    created_by:  userId,
    assigned_to: input.assigned_to,
    status:      input.status,
    priority:    input.priority,
    due_date:    input.due_date,
  });

  emitToTeam(teamId, WS_EVENTS.TASK_CREATED, {
    teamId,
    projectId: team.project_id,
    taskId:    task.id,
    name:      task.name,
    status:    task.status,
    priority:  task.priority,
  });

  // Schedule a deadline notification job if due_date is set
  if (task.due_date && isRedisReady()) {
    const dueMs   = new Date(task.due_date).getTime();
    const nowMs   = Date.now();
    const delayMs = Math.max(0, dueMs - nowMs);

    await scheduleTaskDeadlineJob(
      `deadline:${task.id}`,
      {
        taskId:     task.id,
        taskName:   task.name,
        projectId:  team.project_id,
        teamId,
        assignedTo: task.assigned_to,
        createdBy:  task.created_by,
        dueDate:    task.due_date.toISOString(),
        type:       'TASK_DUE_SOON',
      },
      delayMs
    );
  }

  return task;
}

// ---------------------------------------------------------------------------
// Get tasks by team — any team member
// ---------------------------------------------------------------------------

export async function getTasksByTeam(userId: string, teamId: string) {
  const role = await teamRepo.findMemberRole(teamId, userId);
  if (!role) throw new AppError(403, 'You are not a member of this team');

  return taskRepo.findTasksByTeamId(teamId);
}

// ---------------------------------------------------------------------------
// Get single task — any team member
// ---------------------------------------------------------------------------

export async function getTask(userId: string, taskId: string) {
  const { task } = await resolveTaskAndRole(taskId, userId);
  return task;
}

// ---------------------------------------------------------------------------
// Update task — any member; only OWNER/ADMIN can delete
// ---------------------------------------------------------------------------

export async function updateTask(
  userId: string,
  taskId: string,
  input: UpdateTaskInput
) {
  const { task, role: _role } = await resolveTaskAndRole(taskId, userId);

  // Validate new assigned_to is a team member
  if (input.assigned_to !== undefined && input.assigned_to !== null) {
    const assigneeRole = await teamRepo.findMemberRole(task.team_id, input.assigned_to);
    if (!assigneeRole) {
      throw new AppError(400, 'assigned_to user is not a member of this team');
    }
  }

  const updated = await taskRepo.updateTask(task.id, {
    name:        input.name,
    description: input.description,
    assigned_to: input.assigned_to,
    status:      input.status,
    priority:    input.priority,
    due_date:    input.due_date,
  });

  const team = await teamRepo.findTeamById(task.team_id);
  if (team) {
    emitToTeam(team.id, WS_EVENTS.TASK_UPDATED, {
      teamId:    team.id,
      projectId: team.project_id,
      taskId:    task.id,
      changes:   input,
    });
  }

  // Reschedule or remove deadline job when due_date changes
  if (isRedisReady() && input.due_date !== undefined) {
    if (input.due_date === null) {
      await removeTaskDeadlineJob(`deadline:${updated.id}`);
    } else {
      const dueMs   = new Date(input.due_date).getTime();
      const nowMs   = Date.now();
      const delayMs = Math.max(0, dueMs - nowMs);

      await scheduleTaskDeadlineJob(
        `deadline:${updated.id}`,
        {
          taskId:     updated.id,
          taskName:   updated.name,
          projectId:  team?.project_id ?? '',
          teamId:     updated.team_id,
          assignedTo: updated.assigned_to,
          createdBy:  updated.created_by,
          dueDate:    input.due_date,
          type:       'TASK_DUE_SOON',
        },
        delayMs
      );
    }
  }

  return updated;
}

// ---------------------------------------------------------------------------
// Delete task — OWNER or ADMIN only
// ---------------------------------------------------------------------------

export async function deleteTask(userId: string, taskId: string) {
  const { task, role } = await resolveTaskAndRole(taskId, userId);

  if (role === 'MEMBER') {
    throw new AppError(403, 'Only OWNER or ADMIN can delete tasks');
  }

  const team = await teamRepo.findTeamById(task.team_id);
  await taskRepo.deleteTask(task.id);

  if (isRedisReady()) {
    await removeTaskDeadlineJob(`deadline:${task.id}`);
  }

  if (team) {
    emitToTeam(team.id, WS_EVENTS.TASK_DELETED, {
      teamId:    team.id,
      projectId: team.project_id,
      taskId:    task.id,
    });
  }
}

