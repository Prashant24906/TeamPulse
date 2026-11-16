/**
 * taskAssignmentNotification.test.ts
 *
 * Comprehensive tests for TASK_ASSIGNED notifications:
 * 1. Creating a task assigned to another user generates a notification.
 * 2. Assigning an existing task to another user generates a notification.
 * 3. Reassigning a task notifies only the new assignee.
 * 4. Updating a task without changing its assignee does not generate a notification.
 * 5. Unassigning a task does not generate a notification.
 * 6. Assigning a task to the same user does not generate a notification.
 * 7. Assigning a task to yourself does not generate a notification.
 * 8. Notifications are persisted and delivered through the existing real-time mechanism.
 * 9. One assignment change cannot generate duplicate notifications.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock dependencies before importing services
// ---------------------------------------------------------------------------

vi.mock('../config/database', () => {
  const sqlMock: any = vi.fn();
  return {
    default: sqlMock,
    sql: sqlMock,
    connectDB: vi.fn(),
    disconnectDB: vi.fn(),
  };
});

vi.mock('../repositories/task.repository', () => ({
  createTask: vi.fn(),
  updateTask: vi.fn(),
  findTaskById: vi.fn(),
  findTasksByTeamId: vi.fn(),
  findClosedTasksByTeamId: vi.fn(),
  closeTask: vi.fn(),
  reopenTask: vi.fn(),
  deleteTask: vi.fn(),
}));

vi.mock('../repositories/team.repository', () => ({
  findTeamById: vi.fn(),
  findMemberRole: vi.fn(),
  getMemberCount: vi.fn(),
  getMembers: vi.fn(),
  findTeamsByUserId: vi.fn(),
}));

vi.mock('../repositories/user.repository', () => ({
  findById: vi.fn(),
}));

vi.mock('./team.guard', () => ({
  assertTeamBelongsToProject: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../websocket/emit', () => ({
  emitToTeam: vi.fn(),
  emitToUser: vi.fn(),
}));

vi.mock('../jobs/queues/notification.queue', () => ({
  scheduleTaskDeadlineJob: vi.fn().mockResolvedValue(undefined),
  removeAllDeadlineJobs: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../config/redis', () => {
  const mockPublish = vi.fn().mockResolvedValue(1);
  const mockQuit = vi.fn().mockResolvedValue('OK');
  return {
    isRedisReady: vi.fn().mockReturnValue(false),
    createPubSubConnection: vi.fn().mockReturnValue({
      publish: mockPublish,
      quit: mockQuit,
      on: vi.fn(),
    }),
  };
});

// Mock notification.service for task.service tests, or spy on it
vi.mock('./notification.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./notification.service')>();
  return {
    ...actual,
    notifyTaskAssigned: vi.fn().mockResolvedValue(undefined),
  };
});

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import * as taskRepo from '../repositories/task.repository';
import * as teamRepo from '../repositories/team.repository';
import * as userRepo from '../repositories/user.repository';
import * as notificationService from './notification.service';
import { createTask, updateTask } from './task.service';
import { createPubSubConnection } from '../config/redis';
import sql from '../config/database';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const TEAM_ID = '11111111-1111-1111-1111-111111111111';
const PROJECT_ID = '22222222-2222-2222-2222-222222222222';
const TASK_ID = '33333333-3333-3333-3333-333333333333';
const CREATOR_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_A = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const USER_B = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

const teamRecord = { id: TEAM_ID, project_id: PROJECT_ID, name: 'Core Team' };
const creatorUser = { id: CREATOR_ID, name: 'Alex Creator', email: 'alex@example.com' };

describe('Task Assignment Notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(teamRepo.findTeamById).mockResolvedValue(teamRecord as any);
    vi.mocked(teamRepo.findMemberRole).mockResolvedValue('MEMBER' as any);
    vi.mocked(userRepo.findById).mockResolvedValue(creatorUser as any);
  });

  // -------------------------------------------------------------------------
  // 1. Creating a task assigned to another user generates a notification.
  // -------------------------------------------------------------------------
  it('1. creates notification when a new task is assigned to another user', async () => {
    const createdTask = {
      id: TASK_ID,
      name: 'Implement OAuth',
      description: 'Add OAuth login',
      team_id: TEAM_ID,
      created_by: CREATOR_ID,
      assigned_to: USER_A,
      status: 'TODO' as const,
      priority: 'HIGH' as const,
      due_date: null,
      created_at: new Date(),
      closed_by: null,
      closed_at: null,
    };
    vi.mocked(taskRepo.createTask).mockResolvedValue(createdTask);

    await createTask(CREATOR_ID, TEAM_ID, {
      name: 'Implement OAuth',
      assigned_to: USER_A,
      status: 'TODO',
      priority: 'HIGH',
    });

    expect(notificationService.notifyTaskAssigned).toHaveBeenCalledTimes(1);
    expect(notificationService.notifyTaskAssigned).toHaveBeenCalledWith(
      `assign_${TASK_ID}_${USER_A}`,
      TASK_ID,
      USER_A,
      'Alex Creator',
      'Implement OAuth',
      TEAM_ID,
      PROJECT_ID
    );
  });

  // -------------------------------------------------------------------------
  // 2. Assigning an existing task to another user generates a notification.
  // -------------------------------------------------------------------------
  it('2. creates notification when an unassigned task is assigned to another user', async () => {
    const existingTask = {
      id: TASK_ID,
      name: 'Fix Header',
      description: null,
      team_id: TEAM_ID,
      created_by: CREATOR_ID,
      assigned_to: null,
      status: 'TODO' as const,
      priority: 'MEDIUM' as const,
      due_date: null,
      created_at: new Date(),
      closed_by: null,
      closed_at: null,
    };
    const updatedTask = { ...existingTask, assigned_to: USER_A };

    vi.mocked(taskRepo.findTaskById).mockResolvedValue(existingTask);
    vi.mocked(taskRepo.updateTask).mockResolvedValue(updatedTask);

    await updateTask(CREATOR_ID, TASK_ID, { assigned_to: USER_A });

    expect(notificationService.notifyTaskAssigned).toHaveBeenCalledTimes(1);
    expect(notificationService.notifyTaskAssigned).toHaveBeenCalledWith(
      expect.stringMatching(new RegExp(`^assign_${TASK_ID}_${USER_A}_\\d+$`)),
      TASK_ID,
      USER_A,
      'Alex Creator',
      'Fix Header',
      TEAM_ID,
      PROJECT_ID
    );
  });

  // -------------------------------------------------------------------------
  // 3. Reassigning a task notifies only the new assignee.
  // -------------------------------------------------------------------------
  it('3. reassigning a task from User A to User B notifies only User B', async () => {
    const existingTask = {
      id: TASK_ID,
      name: 'Migrate DB',
      description: null,
      team_id: TEAM_ID,
      created_by: CREATOR_ID,
      assigned_to: USER_A,
      status: 'TODO' as const,
      priority: 'HIGH' as const,
      due_date: null,
      created_at: new Date(),
      closed_by: null,
      closed_at: null,
    };
    const updatedTask = { ...existingTask, assigned_to: USER_B };

    vi.mocked(taskRepo.findTaskById).mockResolvedValue(existingTask);
    vi.mocked(taskRepo.updateTask).mockResolvedValue(updatedTask);

    await updateTask(CREATOR_ID, TASK_ID, { assigned_to: USER_B });

    expect(notificationService.notifyTaskAssigned).toHaveBeenCalledTimes(1);
    expect(notificationService.notifyTaskAssigned).toHaveBeenCalledWith(
      expect.stringMatching(new RegExp(`^assign_${TASK_ID}_${USER_B}_\\d+$`)),
      TASK_ID,
      USER_B,
      'Alex Creator',
      'Migrate DB',
      TEAM_ID,
      PROJECT_ID
    );
    // User A must NOT be notified
    expect(notificationService.notifyTaskAssigned).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      USER_A,
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything()
    );
  });

  // -------------------------------------------------------------------------
  // 4. Updating a task without changing its assignee does not generate a notification.
  // -------------------------------------------------------------------------
  it('4. updating task fields (e.g. name, status) without changing assignee does not notify', async () => {
    const existingTask = {
      id: TASK_ID,
      name: 'Old Name',
      description: null,
      team_id: TEAM_ID,
      created_by: CREATOR_ID,
      assigned_to: USER_A,
      status: 'TODO' as const,
      priority: 'LOW' as const,
      due_date: null,
      created_at: new Date(),
      closed_by: null,
      closed_at: null,
    };
    const updatedTask = { ...existingTask, name: 'New Name', status: 'IN_PROGRESS' as const };

    vi.mocked(taskRepo.findTaskById).mockResolvedValue(existingTask);
    vi.mocked(taskRepo.updateTask).mockResolvedValue(updatedTask);

    await updateTask(CREATOR_ID, TASK_ID, { name: 'New Name', status: 'IN_PROGRESS' });

    expect(notificationService.notifyTaskAssigned).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 5. Unassigning a task does not generate a notification.
  // -------------------------------------------------------------------------
  it('5. setting assigned_to = null (unassigning) does not generate a notification', async () => {
    const existingTask = {
      id: TASK_ID,
      name: 'Unassign Test',
      description: null,
      team_id: TEAM_ID,
      created_by: CREATOR_ID,
      assigned_to: USER_A,
      status: 'TODO' as const,
      priority: 'MEDIUM' as const,
      due_date: null,
      created_at: new Date(),
      closed_by: null,
      closed_at: null,
    };
    const updatedTask = { ...existingTask, assigned_to: null };

    vi.mocked(taskRepo.findTaskById).mockResolvedValue(existingTask);
    vi.mocked(taskRepo.updateTask).mockResolvedValue(updatedTask);

    await updateTask(CREATOR_ID, TASK_ID, { assigned_to: null });

    expect(notificationService.notifyTaskAssigned).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 6. Assigning a task to the same user does not generate a notification.
  // -------------------------------------------------------------------------
  it('6. re-specifying the same assigned_to does not generate a duplicate notification', async () => {
    const existingTask = {
      id: TASK_ID,
      name: 'Same Assignee Test',
      description: null,
      team_id: TEAM_ID,
      created_by: CREATOR_ID,
      assigned_to: USER_A,
      status: 'TODO' as const,
      priority: 'MEDIUM' as const,
      due_date: null,
      created_at: new Date(),
      closed_by: null,
      closed_at: null,
    };
    const updatedTask = { ...existingTask };

    vi.mocked(taskRepo.findTaskById).mockResolvedValue(existingTask);
    vi.mocked(taskRepo.updateTask).mockResolvedValue(updatedTask);

    await updateTask(CREATOR_ID, TASK_ID, { assigned_to: USER_A });

    expect(notificationService.notifyTaskAssigned).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 7. Assigning a task to yourself does not generate a notification.
  // -------------------------------------------------------------------------
  it('7a. creating a task assigned to oneself does not generate a notification', async () => {
    const createdTask = {
      id: TASK_ID,
      name: 'Self Assigned On Create',
      description: null,
      team_id: TEAM_ID,
      created_by: CREATOR_ID,
      assigned_to: CREATOR_ID,
      status: 'TODO' as const,
      priority: 'LOW' as const,
      due_date: null,
      created_at: new Date(),
      closed_by: null,
      closed_at: null,
    };
    vi.mocked(taskRepo.createTask).mockResolvedValue(createdTask);

    await createTask(CREATOR_ID, TEAM_ID, {
      name: 'Self Assigned On Create',
      assigned_to: CREATOR_ID,
      status: 'TODO',
      priority: 'LOW',
    });

    expect(notificationService.notifyTaskAssigned).not.toHaveBeenCalled();
  });

  it('7b. updating a task to assign it to oneself does not generate a notification', async () => {
    const existingTask = {
      id: TASK_ID,
      name: 'Self Assigned On Update',
      description: null,
      team_id: TEAM_ID,
      created_by: CREATOR_ID,
      assigned_to: null,
      status: 'TODO' as const,
      priority: 'LOW' as const,
      due_date: null,
      created_at: new Date(),
      closed_by: null,
      closed_at: null,
    };
    const updatedTask = { ...existingTask, assigned_to: CREATOR_ID };

    vi.mocked(taskRepo.findTaskById).mockResolvedValue(existingTask);
    vi.mocked(taskRepo.updateTask).mockResolvedValue(updatedTask);

    await updateTask(CREATOR_ID, TASK_ID, { assigned_to: CREATOR_ID });

    expect(notificationService.notifyTaskAssigned).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 8. Notifications are persisted and delivered through the existing real-time mechanism.
  // -------------------------------------------------------------------------
  it('8. notifyTaskAssigned persists to DB and publishes to Redis notifications:push channel', { timeout: 30000 }, async () => {
    const actualNotificationService = await vi.importActual<typeof import('./notification.service')>('./notification.service');

    vi.mocked(sql).mockResolvedValue([
      {
        id: 'notif-123',
        user_id: USER_A,
        task_id: TASK_ID,
        type: 'TASK_ASSIGNED',
        message: 'Alex Creator assigned you a task: Real-time Delivery Test',
        job_id: `assign_${TASK_ID}_${USER_A}`,
        is_read: false,
        created_at: new Date(),
      },
    ] as any);

    const mockPublish = vi.fn().mockResolvedValue(1);
    const mockQuit = vi.fn().mockResolvedValue('OK');
    vi.mocked(createPubSubConnection).mockReturnValue({
      publish: mockPublish,
      quit: mockQuit,
    } as any);

    await actualNotificationService.notifyTaskAssigned(
      `assign_${TASK_ID}_${USER_A}`,
      TASK_ID,
      USER_A,
      'Alex Creator',
      'Real-time Delivery Test',
      TEAM_ID,
      PROJECT_ID
    );

    // 1. Database query was executed
    expect(sql).toHaveBeenCalled();

    // 2. Delivered through Redis pub/sub channel
    expect(createPubSubConnection).toHaveBeenCalled();
    expect(mockPublish).toHaveBeenCalledWith(
      'notifications:push',
      expect.stringContaining(`"userId":"${USER_A}"`)
    );
    expect(mockPublish).toHaveBeenCalledWith(
      'notifications:push',
      expect.stringContaining(`"team_id":"${TEAM_ID}"`)
    );
    expect(mockPublish).toHaveBeenCalledWith(
      'notifications:push',
      expect.stringContaining(`"project_id":"${PROJECT_ID}"`)
    );
    expect(mockQuit).toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 9. One assignment change cannot generate duplicate notifications.
  // -------------------------------------------------------------------------
  it('9. duplicate notification calls are suppressed by the idempotency guard (persistNotification returns null)', { timeout: 30000 }, async () => {
    const actualNotificationService = await vi.importActual<typeof import('./notification.service')>('./notification.service');

    // Simulate database returning empty array because ON CONFLICT (job_id, user_id) DO NOTHING skipped duplicate
    vi.mocked(sql).mockResolvedValue([] as any);

    const mockPublish = vi.fn();
    vi.mocked(createPubSubConnection).mockReturnValue({
      publish: mockPublish,
      quit: vi.fn(),
    } as any);

    await actualNotificationService.notifyTaskAssigned(
      `assign_${TASK_ID}_${USER_A}`,
      TASK_ID,
      USER_A,
      'Alex Creator',
      'Duplicate Task',
      TEAM_ID,
      PROJECT_ID
    );

    // If persist returned null (duplicate), Redis publish must NOT be called
    expect(mockPublish).not.toHaveBeenCalled();
  });
});
