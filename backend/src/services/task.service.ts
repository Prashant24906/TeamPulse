import { AppError } from '../middleware/error.middleware';
import * as taskRepo    from '../repositories/task.repository';
import * as projectRepo from '../repositories/project.repository';
import * as teamRepo    from '../repositories/team.repository';
import type { TeamRole } from '../repositories/team.repository';
import type { CreateTaskInput, UpdateTaskInput } from '../validators/task.validator';
import { emitToTeam } from '../websocket/emit';
import { WS_EVENTS } from '../websocket/events';
import { scheduleTaskDeadlineJob, removeTaskDeadlineJob } from '../jobs/queues/notification.queue';
import { isRedisReady } from '../config/redis';

// ---------------------------------------------------------------------------
// Helper — the full authorization chain described in the docs:
//   taskId → project_id → team_id → membership → role
// ---------------------------------------------------------------------------

async function resolveTaskAndRole(
  taskId: string,
  userId: string
): Promise<{ task: taskRepo.Task; role: TeamRole }> {
  const task = await taskRepo.findTaskById(taskId);
  if (!task) throw new AppError(404, 'Task not found');

  const project = await projectRepo.findProjectById(task.project_id);
  if (!project) throw new AppError(404, 'Project not found');

  const role = await teamRepo.findMemberRole(project.team_id, userId);
  if (!role) throw new AppError(403, 'You are not a member of the team that owns this task');

  return { task, role };
}

// ---------------------------------------------------------------------------
// Create task — any team member (OWNER, ADMIN, MEMBER)
// created_by always comes from req.user — never from the body
// ---------------------------------------------------------------------------

export async function createTask(
  userId: string,
  projectId: string,
  input: CreateTaskInput
) {
  // Establish team membership via project
  const project = await projectRepo.findProjectById(projectId);
  if (!project) throw new AppError(404, 'Project not found');

  const role = await teamRepo.findMemberRole(project.team_id, userId);
  if (!role) throw new AppError(403, 'You are not a member of the team that owns this project');

  // If assigned_to is provided, verify that user is in the same team
  if (input.assigned_to) {
    const assigneeRole = await teamRepo.findMemberRole(project.team_id, input.assigned_to);
    if (!assigneeRole) {
      throw new AppError(400, 'assigned_to user is not a member of this team');
    }
  }

  const task = await taskRepo.createTask({
    name:        input.name,
    description: input.description,
    project_id:  projectId,
    created_by:  userId,               // never from body
    assigned_to: input.assigned_to,
    status:      input.status,
    priority:    input.priority,
    due_date:    input.due_date,
  });

  emitToTeam(project.team_id, WS_EVENTS.TASK_CREATED, {
    teamId:    project.team_id,
    projectId: projectId,
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
        projectId:  task.project_id,
        teamId:     project.team_id,
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
// Get tasks by project — any team member
// ---------------------------------------------------------------------------

export async function getTasksByProject(userId: string, projectId: string) {
  const project = await projectRepo.findProjectById(projectId);
  if (!project) throw new AppError(404, 'Project not found');

  const role = await teamRepo.findMemberRole(project.team_id, userId);
  if (!role) throw new AppError(403, 'You are not a member of the team that owns this project');

  return taskRepo.findTasksByProjectId(projectId);
}

// ---------------------------------------------------------------------------
// Get single task — any team member
// ---------------------------------------------------------------------------

export async function getTask(userId: string, taskId: string) {
  const { task } = await resolveTaskAndRole(taskId, userId);
  return task;
}

// ---------------------------------------------------------------------------
// Update task — any member; but only OWNER/ADMIN can delete (see below)
// assigned_to validated against team membership
// ---------------------------------------------------------------------------

export async function updateTask(
  userId: string,
  taskId: string,
  input: UpdateTaskInput
) {
  const { task, role: _role } = await resolveTaskAndRole(taskId, userId);

  // Validate new assigned_to is a team member (resolve team from task's project)
  if (input.assigned_to !== undefined && input.assigned_to !== null) {
    const project = await projectRepo.findProjectById(task.project_id);
    const assigneeRole = await teamRepo.findMemberRole(project!.team_id, input.assigned_to);
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

  const project = await projectRepo.findProjectById(task.project_id);
  if (project) {
    emitToTeam(project.team_id, WS_EVENTS.TASK_UPDATED, {
      teamId:    project.team_id,
      projectId: task.project_id,
      taskId:    task.id,
      changes:   input,
    });
  }

  // Reschedule or remove deadline job when due_date changes
  if (isRedisReady() && input.due_date !== undefined) {
    if (input.due_date === null) {
      // due_date cleared — remove any existing job
      await removeTaskDeadlineJob(`deadline:${updated.id}`);
    } else {
      // due_date changed — scheduleTaskDeadlineJob replaces the existing job
      const dueMs   = new Date(input.due_date).getTime();
      const nowMs   = Date.now();
      const delayMs = Math.max(0, dueMs - nowMs);

      await scheduleTaskDeadlineJob(
        `deadline:${updated.id}`,
        {
          taskId:     updated.id,
          taskName:   updated.name,
          projectId:  updated.project_id,
          teamId:     project?.team_id ?? '',
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

  const project = await projectRepo.findProjectById(task.project_id);
  await taskRepo.deleteTask(task.id);

  // Remove deadline job — task no longer exists
  if (isRedisReady()) {
    await removeTaskDeadlineJob(`deadline:${task.id}`);
  }

  if (project) {
    emitToTeam(project.team_id, WS_EVENTS.TASK_DELETED, {
      teamId:    project.team_id,
      projectId: task.project_id,
      taskId:    task.id,
    });
  }
}
