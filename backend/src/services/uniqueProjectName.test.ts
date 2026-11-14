/**
 * uniqueProjectName.test.ts
 *
 * Tests for globally unique project names:
 *  - Global uniqueness across all users/creators
 *  - Case-insensitivity (e.g. "TeamPulse" vs "teampulse")
 *  - Whitespace-trimming (e.g. " TeamPulse " vs "TeamPulse")
 *  - Different names allowed (e.g. "TeamPulse" vs "Team Pulse")
 *  - Pre-check duplicate rejection (HTTP 409)
 *  - DB constraint violation handling on concurrent creation (HTTP 409)
 *  - Project renaming uniqueness & self-update allowance
 *  - Validation schema constraints (trim, min length, max length)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppError } from '../middleware/error.middleware';
import * as projectService from './project.service';
import * as projectRepo from '../repositories/project.repository';
import { createProjectSchema, updateProjectSchema } from '../validators/project.validator';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../repositories/project.repository', () => ({
  createProject: vi.fn(),
  updateProject: vi.fn(),
  findProjectById: vi.fn(),
  findProjectsByUserId: vi.fn(),
  findProjectByNormalizedName: vi.fn(),
  findProjectByNormalizedNameExcluding: vi.fn(),
  findMemberRole: vi.fn(),
  addMember: vi.fn(),
  removeMember: vi.fn(),
  updateMemberRole: vi.fn(),
  deleteProject: vi.fn(),
  searchProjects: vi.fn(),
  createJoinRequest: vi.fn(),
  findJoinRequestsByProject: vi.fn(),
  updateJoinRequest: vi.fn(),
  findJoinRequestById: vi.fn(),
}));

vi.mock('../repositories/team.repository', () => ({
  removeAllTeamMembershipsInProject: vi.fn(),
}));

vi.mock('../utils/cache', () => ({
  cacheGet: vi.fn().mockResolvedValue(null),
  cacheSet: vi.fn().mockResolvedValue(undefined),
  cacheInvalidate: vi.fn().mockResolvedValue(undefined),
  CacheKeys: {
    project: (id: string) => `project:${id}`,
  },
}));

vi.mock('../websocket/emit', () => ({
  emitToTeam: vi.fn(),
}));

vi.mock('../websocket/rooms', () => ({
  evictUserFromTeamRooms: vi.fn().mockResolvedValue(undefined),
}));

describe('Globally Unique Project Names', () => {
  const userId1 = 'user-uuid-1';
  const userId2 = 'user-uuid-2';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createProjectSchema (Zod validator)', () => {
    it('trims leading and trailing whitespace from valid project names', () => {
      const result = createProjectSchema.safeParse({ name: '  TeamPulse  ' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('TeamPulse');
      }
    });

    it('rejects whitespace-only names that trim to less than 2 characters', () => {
      const result = createProjectSchema.safeParse({ name: '    ' });
      expect(result.success).toBe(false);
    });

    it('rejects names shorter than 2 characters after trimming', () => {
      const result = createProjectSchema.safeParse({ name: ' A ' });
      expect(result.success).toBe(false);
    });

    it('rejects names longer than 100 characters', () => {
      const result = createProjectSchema.safeParse({ name: 'A'.repeat(101) });
      expect(result.success).toBe(false);
    });
  });

  describe('project.service::createProject', () => {
    it('creates project successfully when name is unique and adds creator as OWNER', async () => {
      vi.mocked(projectRepo.findProjectByNormalizedName).mockResolvedValue(null);
      vi.mocked(projectRepo.createProject).mockResolvedValue({
        id: 'proj-1',
        name: 'TeamPulse',
        created_by: userId1,
        created_at: new Date(),
      });
      vi.mocked(projectRepo.addMember).mockResolvedValue({
        project_id: 'proj-1',
        user_id: userId1,
        role: 'OWNER',
        joined_on: new Date(),
      });

      const result = await projectService.createProject(userId1, { name: '  TeamPulse  ' });

      expect(projectRepo.findProjectByNormalizedName).toHaveBeenCalledWith('TeamPulse');
      expect(projectRepo.createProject).toHaveBeenCalledWith('TeamPulse', userId1);
      expect(projectRepo.addMember).toHaveBeenCalledWith('proj-1', userId1, 'OWNER');
      expect(result.name).toBe('TeamPulse');
    });

    it('rejects with 409 Conflict when a project with exact same name already exists', async () => {
      vi.mocked(projectRepo.findProjectByNormalizedName).mockResolvedValue({
        id: 'existing-proj',
        name: 'TeamPulse',
        created_by: userId1,
        created_at: new Date(),
      });

      await expect(
        projectService.createProject(userId1, { name: 'TeamPulse' })
      ).rejects.toThrow(AppError);

      await projectService.createProject(userId1, { name: 'TeamPulse' }).catch((err) => {
        expect(err.statusCode).toBe(409);
        expect(err.message).toBe('A project with this name already exists');
      });

      expect(projectRepo.createProject).not.toHaveBeenCalled();
    });

    it('rejects with 409 Conflict when name differs only by case (case-insensitive)', async () => {
      vi.mocked(projectRepo.findProjectByNormalizedName).mockResolvedValue({
        id: 'existing-proj',
        name: 'TeamPulse',
        created_by: userId1,
        created_at: new Date(),
      });

      await projectService.createProject(userId1, { name: 'teampulse' }).catch((err) => {
        expect(err.statusCode).toBe(409);
        expect(err.message).toBe('A project with this name already exists');
      });

      expect(projectRepo.createProject).not.toHaveBeenCalled();
    });

    it('rejects with 409 Conflict when name differs only by leading/trailing whitespace', async () => {
      vi.mocked(projectRepo.findProjectByNormalizedName).mockResolvedValue({
        id: 'existing-proj',
        name: 'TeamPulse',
        created_by: userId1,
        created_at: new Date(),
      });

      await projectService.createProject(userId1, { name: '   TeamPulse   ' }).catch((err) => {
        expect(err.statusCode).toBe(409);
        expect(err.message).toBe('A project with this name already exists');
      });

      expect(projectRepo.findProjectByNormalizedName).toHaveBeenCalledWith('TeamPulse');
      expect(projectRepo.createProject).not.toHaveBeenCalled();
    });

    it('enforces uniqueness across different users globally (User 2 cannot take User 1 name)', async () => {
      vi.mocked(projectRepo.findProjectByNormalizedName).mockResolvedValue({
        id: 'user1-proj',
        name: 'TeamPulse',
        created_by: userId1,
        created_at: new Date(),
      });

      await projectService.createProject(userId2, { name: 'TeamPulse' }).catch((err) => {
        expect(err.statusCode).toBe(409);
        expect(err.message).toBe('A project with this name already exists');
      });

      expect(projectRepo.createProject).not.toHaveBeenCalled();
    });

    it('allows different project names (e.g. "TeamPulse" vs "Team Pulse")', async () => {
      vi.mocked(projectRepo.findProjectByNormalizedName).mockResolvedValue(null);
      vi.mocked(projectRepo.createProject).mockResolvedValue({
        id: 'proj-2',
        name: 'Team Pulse',
        created_by: userId1,
        created_at: new Date(),
      });
      vi.mocked(projectRepo.addMember).mockResolvedValue({
        project_id: 'proj-2',
        user_id: userId1,
        role: 'OWNER',
        joined_on: new Date(),
      });

      const res = await projectService.createProject(userId1, { name: 'Team Pulse' });
      expect(res.name).toBe('Team Pulse');
      expect(projectRepo.findProjectByNormalizedName).toHaveBeenCalledWith('Team Pulse');
    });

    it('handles concurrent race condition where DB throws 23505 unique violation', async () => {
      // Pre-check passed because concurrent transaction had not committed yet
      vi.mocked(projectRepo.findProjectByNormalizedName).mockResolvedValue(null);

      // DB insert throws unique constraint violation error
      const dbError: any = new Error('duplicate key value violates unique constraint "idx_projects_unique_name"');
      dbError.code = '23505';
      dbError.constraint = 'idx_projects_unique_name';
      vi.mocked(projectRepo.createProject).mockRejectedValue(dbError);

      await expect(
        projectService.createProject(userId1, { name: 'TeamPulse' })
      ).rejects.toThrow(AppError);

      await projectService.createProject(userId1, { name: 'TeamPulse' }).catch((err) => {
        expect(err.statusCode).toBe(409);
        expect(err.message).toBe('A project with this name already exists');
      });
    });
  });

  describe('project.service::updateProject', () => {
    it('allows renaming a project to a new unique name', async () => {
      vi.mocked(projectRepo.findProjectById).mockResolvedValue({
        id: 'proj-1',
        name: 'Old Name',
        created_by: userId1,
        created_at: new Date(),
      });
      vi.mocked(projectRepo.findMemberRole).mockResolvedValue('OWNER');
      vi.mocked(projectRepo.findProjectByNormalizedNameExcluding).mockResolvedValue(null);
      vi.mocked(projectRepo.updateProject).mockResolvedValue({
        id: 'proj-1',
        name: 'New Name',
        created_by: userId1,
        created_at: new Date(),
      });

      const updated = await projectService.updateProject(userId1, 'proj-1', { name: '  New Name  ' });

      expect(projectRepo.findProjectByNormalizedNameExcluding).toHaveBeenCalledWith('New Name', 'proj-1');
      expect(projectRepo.updateProject).toHaveBeenCalledWith('proj-1', { name: 'New Name' });
      expect(updated.name).toBe('New Name');
    });

    it('rejects renaming if another project already uses that name (case-insensitive & trimmed)', async () => {
      vi.mocked(projectRepo.findProjectById).mockResolvedValue({
        id: 'proj-1',
        name: 'Alpha',
        created_by: userId1,
        created_at: new Date(),
      });
      vi.mocked(projectRepo.findMemberRole).mockResolvedValue('ADMIN');
      vi.mocked(projectRepo.findProjectByNormalizedNameExcluding).mockResolvedValue({
        id: 'proj-2',
        name: 'Beta',
        created_by: userId2,
        created_at: new Date(),
      });

      await projectService.updateProject(userId1, 'proj-1', { name: 'beta' }).catch((err) => {
        expect(err.statusCode).toBe(409);
        expect(err.message).toBe('A project with this name already exists');
      });

      expect(projectRepo.updateProject).not.toHaveBeenCalled();
    });

    it('handles concurrent race condition on project update with 23505 unique violation', async () => {
      vi.mocked(projectRepo.findProjectById).mockResolvedValue({
        id: 'proj-1',
        name: 'Alpha',
        created_by: userId1,
        created_at: new Date(),
      });
      vi.mocked(projectRepo.findMemberRole).mockResolvedValue('OWNER');
      vi.mocked(projectRepo.findProjectByNormalizedNameExcluding).mockResolvedValue(null);

      const dbError: any = new Error('duplicate key value violates unique constraint "idx_projects_unique_name"');
      dbError.code = '23505';
      vi.mocked(projectRepo.updateProject).mockRejectedValue(dbError);

      await projectService.updateProject(userId1, 'proj-1', { name: 'Beta' }).catch((err) => {
        expect(err.statusCode).toBe(409);
        expect(err.message).toBe('A project with this name already exists');
      });
    });
  });
});
