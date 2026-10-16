'use client';

import { use, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

/**
 * /projects/[projectId]/teams/[teamId]/tasks
 *
 * Redirects to the team detail page (which hosts the Kanban board as a tab).
 * This keeps deep-links and bookmarks working while keeping the board UI
 * co-located with the rest of the team context.
 */
export default function TasksRedirectPage({
  params,
}: {
  params: Promise<{ projectId: string; teamId: string }>;
}) {
  const { projectId, teamId } = use(params);
  const router = useRouter();

  useEffect(() => {
    router.replace(`/projects/${projectId}/teams/${teamId}`);
  }, [projectId, teamId, router]);

  return (
    <div className="flex items-center justify-center h-full py-24 text-gray-400 gap-2">
      <Loader2 className="animate-spin" size={18} />
      <span className="text-sm">Redirecting to team board…</span>
    </div>
  );
}
