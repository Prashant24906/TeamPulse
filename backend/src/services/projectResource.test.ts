import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppError } from '../middleware/error.middleware';
import * as projectRepo from '../repositories/project.repository';
import * as projectResourceRepo from '../repositories/projectResource.repository';
import * as resourceService from './projectResource.service';
import {
  createResourceSchema,
  updateResourceSchema,
} from '../validators/projectResource.validator';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../repositories/project.repository', () => ({
  findProjectById: vi.fn(),
  findMemberRole: vi.fn(),
}));

vi.mock('../repositories/projectResource.repository', () => ({
  findResourcesByProjectId: vi.fn(),
  findResourceById: vi.fn(),
  createResource: vi.fn(),
  updateResource: vi.fn(),
  deleteResource: vi.fn(),
}));

describe('Project Resources Service & Validation', () => {
  const projectId = 'proj-123';
  const otherProjectId = 'proj-999';
  const resourceId = 'res-456';
  const ownerId = 'user-owner';
  const adminId = 'user-admin';
  const memberId = 'user-member';
  const nonMemberId = 'user-nonmember';

  const mockProject = {
    id: projectId,
    name: 'Apollo Project',
    created_by: ownerId,
    created_at: new Date(),
  };

  const mockResource = {
    id: resourceId,
    project_id: projectId,
    name: 'GitHub Repository',
    url: 'https://github.com/example/repo',
    created_by: ownerId,
    created_at: new Date(),
    updated_at: new Date(),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(projectRepo.findProjectById).mockImplementation(async (pid) => {
      if (pid === projectId) return mockProject as any;
      return null;
    });

    vi.mocked(projectRepo.findMemberRole).mockImplementation(async (pid, uid) => {
      if (pid !== projectId) return null;
      if (uid === ownerId) return 'OWNER';
      if (uid === adminId) return 'ADMIN';
      if (uid === memberId) return 'MEMBER';
      return null;
    });

    vi.mocked(projectResourceRepo.findResourcesByProjectId).mockResolvedValue([mockResource]);
    vi.mocked(projectResourceRepo.findResourceById).mockImplementation(async (rid, pid) => {
      if (rid === resourceId && pid === projectId) return mockResource;
      return null;
    });
    vi.mocked(projectResourceRepo.createResource).mockResolvedValue(mockResource);
    vi.mocked(projectResourceRepo.updateResource).mockResolvedValue({
      ...mockResource,
      name: 'Updated Name',
      url: 'https://github.com/example/updated',
    });
    vi.mocked(projectResourceRepo.deleteResource).mockResolvedValue(true);
  });

  // -------------------------------------------------------------------------
  // 1. OWNER permissions
  // -------------------------------------------------------------------------
  describe('1. OWNER operations', () => {
    it('OWNER can view resources', async () => {
      const res = await resourceService.getResources(ownerId, projectId);
      expect(res).toEqual([mockResource]);
      expect(projectResourceRepo.findResourcesByProjectId).toHaveBeenCalledWith(projectId);
    });

    it('OWNER can create resources', async () => {
      const input = { name: 'Docs', url: 'https://docs.example.com' };
      const res = await resourceService.createResource(ownerId, projectId, input);
      expect(res).toBeDefined();
      expect(projectResourceRepo.createResource).toHaveBeenCalledWith(projectId, ownerId, input);
    });

    it('OWNER can edit resources', async () => {
      const input = { name: 'Updated Docs', url: 'https://docs2.example.com' };
      const res = await resourceService.updateResource(ownerId, projectId, resourceId, input);
      expect(res).toBeDefined();
      expect(projectResourceRepo.updateResource).toHaveBeenCalledWith(resourceId, projectId, input);
    });

    it('OWNER can delete resources', async () => {
      await expect(
        resourceService.deleteResource(ownerId, projectId, resourceId)
      ).resolves.not.toThrow();
      expect(projectResourceRepo.deleteResource).toHaveBeenCalledWith(resourceId, projectId);
    });
  });

  // -------------------------------------------------------------------------
  // 2. ADMIN permissions
  // -------------------------------------------------------------------------
  describe('2. ADMIN operations', () => {
    it('ADMIN can view resources', async () => {
      const res = await resourceService.getResources(adminId, projectId);
      expect(res).toEqual([mockResource]);
    });

    it('ADMIN can create resources', async () => {
      const input = { name: 'Figma Design', url: 'https://figma.com/file/123' };
      const res = await resourceService.createResource(adminId, projectId, input);
      expect(res).toBeDefined();
      expect(projectResourceRepo.createResource).toHaveBeenCalledWith(projectId, adminId, input);
    });

    it('ADMIN can edit resources', async () => {
      const input = { name: 'New Figma', url: 'https://figma.com/file/456' };
      const res = await resourceService.updateResource(adminId, projectId, resourceId, input);
      expect(res).toBeDefined();
      expect(projectResourceRepo.updateResource).toHaveBeenCalledWith(resourceId, projectId, input);
    });

    it('ADMIN can delete resources', async () => {
      await expect(
        resourceService.deleteResource(adminId, projectId, resourceId)
      ).resolves.not.toThrow();
      expect(projectResourceRepo.deleteResource).toHaveBeenCalledWith(resourceId, projectId);
    });
  });

  // -------------------------------------------------------------------------
  // 3. MEMBER permissions
  // -------------------------------------------------------------------------
  describe('3. MEMBER permissions', () => {
    it('MEMBER can view resources', async () => {
      const res = await resourceService.getResources(memberId, projectId);
      expect(res).toEqual([mockResource]);
    });

    it('MEMBER cannot create resources (throws 403)', async () => {
      const input = { name: 'CI/CD', url: 'https://ci.example.com' };
      await expect(
        resourceService.createResource(memberId, projectId, input)
      ).rejects.toThrowError(new AppError(403, 'Only project OWNER or ADMIN can add resources'));
      expect(projectResourceRepo.createResource).not.toHaveBeenCalled();
    });

    it('MEMBER cannot edit resources (throws 403)', async () => {
      const input = { name: 'New CI/CD' };
      await expect(
        resourceService.updateResource(memberId, projectId, resourceId, input)
      ).rejects.toThrowError(new AppError(403, 'Only project OWNER or ADMIN can edit resources'));
      expect(projectResourceRepo.updateResource).not.toHaveBeenCalled();
    });

    it('MEMBER cannot delete resources (throws 403)', async () => {
      await expect(
        resourceService.deleteResource(memberId, projectId, resourceId)
      ).rejects.toThrowError(new AppError(403, 'Only project OWNER or ADMIN can delete resources'));
      expect(projectResourceRepo.deleteResource).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 4. Non-member permissions
  // -------------------------------------------------------------------------
  describe('4. Non-members cannot access resources', () => {
    it('Non-member cannot view resources (throws 403)', async () => {
      await expect(
        resourceService.getResources(nonMemberId, projectId)
      ).rejects.toThrowError(new AppError(403, 'You are not a member of this project'));
    });

    it('Non-member cannot create resources (throws 403)', async () => {
      const input = { name: 'Docs', url: 'https://docs.example.com' };
      await expect(
        resourceService.createResource(nonMemberId, projectId, input)
      ).rejects.toThrowError(new AppError(403, 'You are not a member of this project'));
    });

    it('Non-member cannot edit resources (throws 403)', async () => {
      await expect(
        resourceService.updateResource(nonMemberId, projectId, resourceId, { name: 'Test' })
      ).rejects.toThrowError(new AppError(403, 'You are not a member of this project'));
    });

    it('Non-member cannot delete resources (throws 403)', async () => {
      await expect(
        resourceService.deleteResource(nonMemberId, projectId, resourceId)
      ).rejects.toThrowError(new AppError(403, 'You are not a member of this project'));
    });

    it('Non-existent project returns 404', async () => {
      await expect(
        resourceService.getResources(ownerId, 'non-existent-proj')
      ).rejects.toThrowError(new AppError(404, 'Project not found'));
    });
  });

  // -------------------------------------------------------------------------
  // 5. Cross-project isolation
  // -------------------------------------------------------------------------
  describe('5. Cross-project isolation', () => {
    it('Cannot edit resource belonging to another project (throws 404)', async () => {
      // resourceId does not belong to otherProjectId
      await expect(
        resourceService.updateResource(ownerId, projectId, 'res-other-proj', { name: 'Hacked' })
      ).rejects.toThrowError(new AppError(404, 'Resource not found'));
    });

    it('Cannot delete resource belonging to another project (throws 404)', async () => {
      await expect(
        resourceService.deleteResource(ownerId, projectId, 'res-other-proj')
      ).rejects.toThrowError(new AppError(404, 'Resource not found'));
    });

    it('Verification of resourceId and projectId scope in repository queries', async () => {
      await resourceService.updateResource(ownerId, projectId, resourceId, { name: 'Scoped' });
      expect(projectResourceRepo.findResourceById).toHaveBeenCalledWith(resourceId, projectId);
      expect(projectResourceRepo.updateResource).toHaveBeenCalledWith(
        resourceId,
        projectId,
        { name: 'Scoped' }
      );
    });
  });

  // -------------------------------------------------------------------------
  // 6. URL validation
  // -------------------------------------------------------------------------
  describe('6. URL validation', () => {
    it('accepts valid https URL', () => {
      const res = createResourceSchema.safeParse({
        name: 'GitHub',
        url: 'https://github.com/org/repo',
      });
      expect(res.success).toBe(true);
    });

    it('accepts valid http URL', () => {
      const res = createResourceSchema.safeParse({
        name: 'Local Dev',
        url: 'http://localhost:3000',
      });
      expect(res.success).toBe(true);
    });

    it('rejects javascript: URLs', () => {
      const res = createResourceSchema.safeParse({
        name: 'Exploit',
        url: 'javascript:alert(1)',
      });
      expect(res.success).toBe(false);
    });

    it('rejects ftp: URLs', () => {
      const res = createResourceSchema.safeParse({
        name: 'FTP',
        url: 'ftp://ftp.example.com',
      });
      expect(res.success).toBe(false);
    });

    it('rejects invalid or non-URL strings', () => {
      const res = createResourceSchema.safeParse({
        name: 'Invalid',
        url: 'not-a-valid-url',
      });
      expect(res.success).toBe(false);
    });

    it('rejects empty URL', () => {
      const res = createResourceSchema.safeParse({
        name: 'Empty',
        url: '   ',
      });
      expect(res.success).toBe(false);
    });

    it('rejects URL exceeding 2048 characters', () => {
      const longUrl = 'https://example.com/' + 'a'.repeat(2040);
      const res = createResourceSchema.safeParse({
        name: 'Long',
        url: longUrl,
      });
      expect(res.success).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // 7. Resource name validation
  // -------------------------------------------------------------------------
  describe('7. Resource name validation', () => {
    it('rejects empty name', () => {
      const res = createResourceSchema.safeParse({
        name: '',
        url: 'https://example.com',
      });
      expect(res.success).toBe(false);
    });

    it('rejects whitespace-only name', () => {
      const res = createResourceSchema.safeParse({
        name: '    ',
        url: 'https://example.com',
      });
      expect(res.success).toBe(false);
    });

    it('rejects name exceeding 100 characters', () => {
      const res = createResourceSchema.safeParse({
        name: 'A'.repeat(101),
        url: 'https://example.com',
      });
      expect(res.success).toBe(false);
    });

    it('accepts valid 1-100 character name', () => {
      const res = createResourceSchema.safeParse({
        name: 'Valid Name',
        url: 'https://example.com',
      });
      expect(res.success).toBe(true);
    });

    it('update schema rejects when both name and url are missing', () => {
      const res = updateResourceSchema.safeParse({});
      expect(res.success).toBe(false);
    });

    it('update schema accepts valid partial update', () => {
      const res = updateResourceSchema.safeParse({ name: 'New Name' });
      expect(res.success).toBe(true);
    });
  });
});
