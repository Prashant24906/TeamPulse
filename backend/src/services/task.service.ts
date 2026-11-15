import { AppError } from '../middleware/error.middleware';
import * as taskRepo    from '../repositories/task.repository';
import * as teamRepo    from '../repositories/team.repository';
import * as projectRepo from '../repositories/project.repository';
import type { TeamRole } from '../repositories/team.repository';
import type { CreateTaskInput, UpdateTaskInput } from '../validators/task.validator';
import { emitToTeam } from '../websocket/emit';
import { WS_EVENTS } from '../websocket/events';
import { scheduleTaskDeadlineJob, removeAllDeadlineJobs } from '../jobs/queues/notification.queue';
import { isRedisReady } from '../config/redis';
import { assertTeamBelongsToProject } from './team.guard';

// ---------------------------------------------------------------------------
// Helper — schedule both TASK_DUE_SOON and TASK_OVERDUE jobs for a task
// ---------------------------------------------------------------------------

async function scheduleDeadlineNotifications(
  task: { id: string; name: string; due_date: Date | null; assigned_to: string | null; created_by: string },
  team: { id: string; project_id: string }
): Promise<void> {
  if (!task.due_date || !isRedisReady()) return;

  // Always remove any previous deadline jobs first
  await removeAllDeadlineJobs(task.id);

  const dueMs = new Date(task.due_date).getTime();
  const nowMs = Date.now();

  const baseData = {
    taskId:     task.id,
    taskName:   task.name,
    projectId:  team.project_id,
    teamId:     team.id,
    assignedTo: task.assigned_to,
    createdBy:  task.created_by,
    dueDate:    task.due_date instanceof Date ? task.due_date.toISOString() : String(task.due_date),
  };

  const ONE_HOUR_MS = 60 * 60 * 1000;

  // TASK_DUE_SOON — fire 1 hour before the deadline
  const dueSoonMs = dueMs - ONE_HOUR_MS;
  if (dueSoonMs > nowMs) {
    // More than 1 hour left → schedule 1hr before deadline
    await scheduleTaskDeadlineJob(
      `due_soon_${task.id}`,
      { ...baseData, type: 'TASK_DUE_SOON' },
      dueSoonMs - nowMs
    );
  } else if (dueMs > nowMs) {
    // Less than 1 hour left but not yet overdue → fire immediately
    await scheduleTaskDeadlineJob(
      `due_soon_${task.id}`,
      { ...baseData, type: 'TASK_DUE_SOON' },
      0
    );
  }
  // If dueMs <= nowMs, deadline already passed — skip DUE_SOON entirely

  // TASK_OVERDUE — fire exactly at the deadline
  if (dueMs > nowMs) {
    await scheduleTaskDeadlineJob(
      `overdue_${task.id}`,
      { ...baseData, type: 'TASK_OVERDUE' },
      dueMs - nowMs
    );
  }
}

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
  input: CreateTaskInput,
  projectId?: string
) {
  if (projectId) await assertTeamBelongsToProject(teamId, projectId);
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

  // Schedule deadline notification jobs if due_date is set
  await scheduleDeadlineNotifications(task, team);

  return task;
}

// ---------------------------------------------------------------------------
// Get tasks by team — any team member (excludes CLOSED tasks)
// ---------------------------------------------------------------------------

export async function getTasksByTeam(userId: string, teamId: string, projectId?: string) {
  if (projectId) await assertTeamBelongsToProject(teamId, projectId);
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

  // Reschedule when due_date OR assigned_to changes (new assignee needs fresh notification jobs)
  const dueDateChanged  = input.due_date !== undefined;
  const assigneeChanged = input.assigned_to !== undefined;

  if (isRedisReady() && (dueDateChanged || assigneeChanged)) {
    if (dueDateChanged && input.due_date === null) {
      // due_date cleared — cancel all jobs
      await removeAllDeadlineJobs(updated.id);
    } else if (team) {
      // Reschedule with the latest due_date and assigned_to on the updated task
      await scheduleDeadlineNotifications(updated, team);
    }
  }

  return updated;
}

// ---------------------------------------------------------------------------
// Close task — any team member
// ---------------------------------------------------------------------------

export async function closeTask(userId: string, taskId: string) {
  const { task } = await resolveTaskAndRole(taskId, userId);

  if (task.status === 'CLOSED') {
    throw new AppError(409, 'Task is already closed');
  }

  const closed = await taskRepo.closeTask(task.id, userId);

  const team = await teamRepo.findTeamById(task.team_id);
  if (team) {
    emitToTeam(team.id, WS_EVENTS.TASK_CLOSED, {
      teamId:    team.id,
      projectId: team.project_id,
      taskId:    task.id,
    });
  }

  // Cancel all deadline jobs — no notifications for a closed task
  if (isRedisReady()) {
    await removeAllDeadlineJobs(task.id);
  }

  return closed;
}

// ---------------------------------------------------------------------------
// Reopen task — OWNER or ADMIN only
// ---------------------------------------------------------------------------

export async function reopenTask(userId: string, taskId: string) {
  const { task, role } = await resolveTaskAndRole(taskId, userId);

  if (role === 'MEMBER') {
    throw new AppError(403, 'Only OWNER or ADMIN can reopen tasks');
  }

  if (task.status !== 'CLOSED') {
    throw new AppError(409, 'Task is not closed');
  }

  const reopened = await taskRepo.reopenTask(task.id);

  const team = await teamRepo.findTeamById(task.team_id);
  if (team) {
    emitToTeam(team.id, WS_EVENTS.TASK_REOPENED, {
      teamId:    team.id,
      projectId: team.project_id,
      taskId:    task.id,
    });

    // Re-schedule deadline notifications if the task still has a future due_date
    await scheduleDeadlineNotifications(reopened, team);
  }

  return reopened;
}

// ---------------------------------------------------------------------------
// Get closed tasks for a team — any team member
// ---------------------------------------------------------------------------

export async function getClosedTasks(userId: string, teamId: string, projectId?: string) {
  if (projectId) await assertTeamBelongsToProject(teamId, projectId);

  const role = await teamRepo.findMemberRole(teamId, userId);
  if (!role) throw new AppError(403, 'You are not a member of this team');

  return taskRepo.findClosedTasksByTeamId(teamId);
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
    await removeAllDeadlineJobs(task.id);
  }

  if (team) {
    emitToTeam(team.id, WS_EVENTS.TASK_DELETED, {
      teamId:    team.id,
      projectId: team.project_id,
      taskId:    task.id,
    });
  }
}
