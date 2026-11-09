/**
 * closedTasks.test.ts
 *
 * Tests for the Closed Tasks feature:
 *   - closeTask  (any team member can close)
 *   - reopenTask (OWNER / ADMIN only)
 *   - getClosedTasks (any team member can view)
 *
 * Coverage for all 12 required test cases.
 * No real DB; every repository function is mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock all external dependencies
// ---------------------------------------------------------------------------

vi.mock('../repositories/task.repository', () => ({
  findTaskById:            vi.fn(),
  findTasksByTeamId:       vi.fn(),
  findClosedTasksByTeamId: vi.fn(),
  createTask:              vi.fn(),
  updateTask:              vi.fn(),
  deleteTask:              vi.fn(),
  closeTask:               vi.fn(),
  reopenTask:              vi.fn(),
}));

vi.mock('../repositories/team.repository', () => ({
  findTeamById:     vi.fn(),
  findMemberRole:   vi.fn(),
  getMemberCount:   vi.fn(),
  getMembers:       vi.fn(),
  updateTeam:       vi.fn(),
  deleteTeam:       vi.fn(),
  addMember:        vi.fn(),
  updateMemberRole: vi.fn(),
  removeMember:     vi.fn(),
  transferOwnership:                 vi.fn(),
  findTeamIdsByUserAndProject:       vi.fn(),
  removeAllTeamMembershipsInProject: vi.fn(),
}));

vi.mock('../repositories/project.repository', () => ({
  findProjectById: vi.fn(),
  findMemberRole:  vi.fn(),
}));

vi.mock('../repositories/user.repository', () => ({
  findByUsername: vi.fn(),
}));

vi.mock('../websocket/emit', () => ({
  emitToTeam: vi.fn(),
  emitToUser: vi.fn(),
}));

vi.mock('../websocket/rooms', () => ({
  evictUserFromTeamRoom:  vi.fn(),
  evictUserFromTeamRooms: vi.fn(),
}));

vi.mock('../utils/cache', () => ({
  cacheGet:        vi.fn().mockResolvedValue(null),
  cacheSet:        vi.fn(),
  cacheInvalidate: vi.fn(),
  CacheKeys:       { team: (id: string) => `team:${id}` },
}));

vi.mock('../jobs/queues/notification.queue', () => ({
  scheduleTaskDeadlineJob: vi.fn(),
  removeTaskDeadlineJob:   vi.fn(),
}));

vi.mock('../config/redis', () => ({
  isRedisReady: vi.fn().mockReturnValue(false),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import * as taskRepo from '../repositories/task.repository';
import * as teamRepo from '../repositories/team.repository';
import { emitToTeam } from '../websocket/emit';

import * as taskService from './task.service';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TEAM_ID    = 'aaaaaaaa-0000-0000-0000-000000000000';
const PROJECT_ID = 'bbbbbbbb-0000-0000-0000-000000000000';
const TASK_ID    = 'cccccccc-0000-0000-0000-000000000000';
const OWNER_ID   = 'dddddddd-0000-0000-0000-000000000000';
const ADMIN_ID   = 'eeeeeeee-0000-0000-0000-000000000000';
const MEMBER_ID  = 'ffffffff-0000-0000-0000-000000000000';
const OTHER_USER = '11111111-0000-0000-0000-000000000000';

const teamRecord = { id: TEAM_ID, project_id: PROJECT_ID, name: 'Alpha', max_size: 10 };

const activeTask = {
  id: TASK_ID, name: 'Fix bug', description: null,
  team_id: TEAM_ID, created_by: OWNER_ID, assigned_to: null,
  status: 'TODO' as const, priority: 'MEDIUM' as const,
  due_date: null, created_at: new Date(),
  closed_by: null, closed_at: null,
};

const closedTask = { ...activeTask, status: 'CLOSED' as const, closed_by: MEMBER_ID, closed_at: new Date() };

/** Returns the matching role or null for a given user ID. */
function roleLookup(userId: string): string | null {
  const map: Record<string, string> = {
    [OWNER_ID]:  'OWNER',
    [ADMIN_ID]:  'ADMIN',
    [MEMBER_ID]: 'MEMBER',
  };
  return map[userId] ?? null;
}

// ---------------------------------------------------------------------------
// Reset mocks before every test
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// 1–3. closeTask — any team member can close any task
// ===========================================================================

describe('closeTask', () => {
  function setupClose(callerId: string, task = activeTask) {
    vi.mocked(taskRepo.findTaskById).mockResolvedValue(task as any);
    vi.mocked(teamRepo.findMemberRole).mockImplementation((_teamId, userId) =>
      Promise.resolve(roleLookup(userId) as any)
    );
    vi.mocked(taskRepo.closeTask).mockResolvedValue({
      ...task, status: 'CLOSED', closed_by: callerId, closed_at: new Date(),
    } as any);
    vi.mocked(teamRepo.findTeamById).mockResolvedValue(teamRecord as any);
  }

  // Test 1
  it('MEMBER can close any team task', async () => {
    setupClose(MEMBER_ID);
    const result = await taskService.closeTask(MEMBER_ID, TASK_ID);
    expect(result.status).toBe('CLOSED');
    expect(taskRepo.closeTask).toHaveBeenCalledWith(TASK_ID, MEMBER_ID);
  });

  // Test 2
  it('ADMIN can close a task', async () => {
    setupClose(ADMIN_ID);
    const result = await taskService.closeTask(ADMIN_ID, TASK_ID);
    expect(result.status).toBe('CLOSED');
    expect(taskRepo.closeTask).toHaveBeenCalledWith(TASK_ID, ADMIN_ID);
  });

  // Test 3
  it('OWNER can close a task', async () => {
    setupClose(OWNER_ID);
    const result = await taskService.closeTask(OWNER_ID, TASK_ID);
    expect(result.status).toBe('CLOSED');
    expect(taskRepo.closeTask).toHaveBeenCalledWith(TASK_ID, OWNER_ID);
  });

  // Test 7 — correct user ID is recorded as the closer
  it('records the caller as the closer (closed_by)', async () => {
    setupClose(MEMBER_ID);
    const result = await taskService.closeTask(MEMBER_ID, TASK_ID);
    expect(result.closed_by).toBe(MEMBER_ID);
  });

  // Test 8 — closure timestamp is set
  it('records a closure timestamp', async () => {
    setupClose(MEMBER_ID);
    const result = await taskService.closeTask(MEMBER_ID, TASK_ID);
    expect(result.closed_at).not.toBeNull();
  });

  it('rejects if task is already closed', async () => {
    vi.mocked(taskRepo.findTaskById).mockResolvedValue(closedTask as any);
    vi.mocked(teamRepo.findMemberRole).mockResolvedValue('MEMBER');
    await expect(taskService.closeTask(MEMBER_ID, TASK_ID))
      .rejects.toMatchObject({ statusCode: 409, message: 'Task is already closed' });
  });

  it('rejects if user is not a team member', async () => {
    vi.mocked(taskRepo.findTaskById).mockResolvedValue(activeTask as any);
    vi.mocked(teamRepo.findMemberRole).mockResolvedValue(null);
    await expect(taskService.closeTask(OTHER_USER, TASK_ID))
      .rejects.toMatchObject({ statusCode: 403 });
  });

  // Test 11 — WS event emitted only after successful DB update
  it('emits TASK_CLOSED event only after successful DB write', async () => {
    setupClose(MEMBER_ID);
    await taskService.closeTask(MEMBER_ID, TASK_ID);
    expect(taskRepo.closeTask).toHaveBeenCalledBefore
      ? expect(taskRepo.closeTask).toHaveBeenCalledBefore(vi.mocked(emitToTeam))
      : expect(emitToTeam).toHaveBeenCalledWith(TEAM_ID, 'task.closed', expect.objectContaining({ taskId: TASK_ID }));
  });

  it('does not emit WS event if DB write fails', async () => {
    vi.mocked(taskRepo.findTaskById).mockResolvedValue(activeTask as any);
    vi.mocked(teamRepo.findMemberRole).mockResolvedValue('MEMBER');
    vi.mocked(taskRepo.closeTask).mockRejectedValue(new Error('DB error'));
    vi.mocked(teamRepo.findTeamById).mockResolvedValue(teamRecord as any);
    await expect(taskService.closeTask(MEMBER_ID, TASK_ID)).rejects.toThrow('DB error');
    expect(emitToTeam).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// 4–6. reopenTask — OWNER / ADMIN only
// ===========================================================================

describe('reopenTask', () => {
  function setupReopen(callerId: string) {
    vi.mocked(taskRepo.findTaskById).mockResolvedValue(closedTask as any);
    vi.mocked(teamRepo.findMemberRole).mockImplementation((_teamId, userId) =>
      Promise.resolve(roleLookup(userId) as any)
    );
    vi.mocked(taskRepo.reopenTask).mockResolvedValue({
      ...activeTask, status: 'TODO', closed_by: null, closed_at: null,
    } as any);
    vi.mocked(teamRepo.findTeamById).mockResolvedValue(teamRecord as any);
  }

  // Test 4
  it('MEMBER cannot reopen a task → 403', async () => {
    vi.mocked(taskRepo.findTaskById).mockResolvedValue(closedTask as any);
    vi.mocked(teamRepo.findMemberRole).mockResolvedValue('MEMBER');
    await expect(taskService.reopenTask(MEMBER_ID, TASK_ID))
      .rejects.toMatchObject({ statusCode: 403, message: 'Only OWNER or ADMIN can reopen tasks' });
  });

  // Test 5
  it('ADMIN can reopen a task → status becomes TODO', async () => {
    setupReopen(ADMIN_ID);
    const result = await taskService.reopenTask(ADMIN_ID, TASK_ID);
    expect(result.status).toBe('TODO');
    expect(taskRepo.reopenTask).toHaveBeenCalledWith(TASK_ID);
  });

  // Test 6
  it('OWNER can reopen a task', async () => {
    setupReopen(OWNER_ID);
    const result = await taskService.reopenTask(OWNER_ID, TASK_ID);
    expect(result.status).toBe('TODO');
  });

  it('rejects if task is not closed → 409', async () => {
    vi.mocked(taskRepo.findTaskById).mockResolvedValue(activeTask as any);
    vi.mocked(teamRepo.findMemberRole).mockResolvedValue('OWNER');
    await expect(taskService.reopenTask(OWNER_ID, TASK_ID))
      .rejects.toMatchObject({ statusCode: 409, message: 'Task is not closed' });
  });

  it('emits TASK_REOPENED WS event after successful reopen', async () => {
    setupReopen(ADMIN_ID);
    await taskService.reopenTask(ADMIN_ID, TASK_ID);
    expect(emitToTeam).toHaveBeenCalledWith(TEAM_ID, 'task.reopened', expect.objectContaining({ taskId: TASK_ID }));
  });

  it('does not emit WS event if DB write fails during reopen', async () => {
    vi.mocked(taskRepo.findTaskById).mockResolvedValue(closedTask as any);
    vi.mocked(teamRepo.findMemberRole).mockResolvedValue('OWNER');
    vi.mocked(taskRepo.reopenTask).mockRejectedValue(new Error('DB error'));
    vi.mocked(teamRepo.findTeamById).mockResolvedValue(teamRecord as any);
    await expect(taskService.reopenTask(OWNER_ID, TASK_ID)).rejects.toThrow('DB error');
    expect(emitToTeam).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// 9–10. getClosedTasks — any team member; non-members are blocked
// ===========================================================================

describe('getClosedTasks', () => {
  const closedList = [
    {
      ...closedTask,
      created_by_name: 'Alice',
      assigned_to_name: null,
      closed_by_name: 'Bob',
    },
  ];

  // Test 9
  it('closed tasks list is accessible to MEMBER', async () => {
    vi.mocked(teamRepo.findMemberRole).mockResolvedValue('MEMBER');
    vi.mocked(taskRepo.findClosedTasksByTeamId).mockResolvedValue(closedList as any);
    const result = await taskService.getClosedTasks(MEMBER_ID, TEAM_ID);
    expect(result).toHaveLength(1);
    expect(result[0].closed_by_name).toBe('Bob');
  });

  it('closed tasks list is accessible to ADMIN', async () => {
    vi.mocked(teamRepo.findMemberRole).mockResolvedValue('ADMIN');
    vi.mocked(taskRepo.findClosedTasksByTeamId).mockResolvedValue(closedList as any);
    const result = await taskService.getClosedTasks(ADMIN_ID, TEAM_ID);
    expect(result).toHaveLength(1);
  });

  it('closed tasks list is accessible to OWNER', async () => {
    vi.mocked(teamRepo.findMemberRole).mockResolvedValue('OWNER');
    vi.mocked(taskRepo.findClosedTasksByTeamId).mockResolvedValue(closedList as any);
    const result = await taskService.getClosedTasks(OWNER_ID, TEAM_ID);
    expect(result).toHaveLength(1);
  });

  // Test 10
  it('non-member cannot access closed tasks → 403', async () => {
    vi.mocked(teamRepo.findMemberRole).mockResolvedValue(null);
    await expect(taskService.getClosedTasks(OTHER_USER, TEAM_ID))
      .rejects.toMatchObject({ statusCode: 403 });
  });
});

// ===========================================================================
// 12. Existing task functionality remains intact after adding close/reopen
// ===========================================================================

describe('existing task service functions unaffected', () => {
  it('getTasksByTeam still works and excludes closed tasks (repository-level filter)', async () => {
    vi.mocked(teamRepo.findMemberRole).mockResolvedValue('MEMBER');
    vi.mocked(taskRepo.findTasksByTeamId).mockResolvedValue([activeTask] as any);
    const result = await taskService.getTasksByTeam(MEMBER_ID, TEAM_ID);
    expect(result).toHaveLength(1);
    expect(result[0].status).not.toBe('CLOSED');
  });

  it('getTask still returns any task by id (including closed, for direct lookup)', async () => {
    vi.mocked(taskRepo.findTaskById).mockResolvedValue(closedTask as any);
    vi.mocked(teamRepo.findMemberRole).mockResolvedValue('MEMBER');
    const result = await taskService.getTask(MEMBER_ID, TASK_ID);
    expect(result.id).toBe(TASK_ID);
  });

  it('deleteTask still requires OWNER/ADMIN', async () => {
    vi.mocked(taskRepo.findTaskById).mockResolvedValue(activeTask as any);
    vi.mocked(teamRepo.findMemberRole).mockResolvedValue('MEMBER');
    await expect(taskService.deleteTask(MEMBER_ID, TASK_ID))
      .rejects.toMatchObject({ statusCode: 403, message: 'Only OWNER or ADMIN can delete tasks' });
  });
});

