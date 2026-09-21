// ---------------------------------------------------------------------------
// Typed event names and payloads for the TeamFlow WebSocket system.
//
// Rule: REST is the source of truth. These events are emitted AFTER a
// successful DB mutation, never instead of one.
// ---------------------------------------------------------------------------

export const WS_EVENTS = {
  // Team events
  TEAM_UPDATED:               'team.updated',
  TEAM_MEMBER_ADDED:          'team.member_added',
  TEAM_MEMBER_REMOVED:        'team.member_removed',
  TEAM_JOIN_REQUEST_CREATED:  'team.join_request_created',

  // Project events
  PROJECT_CREATED: 'project.created',
  PROJECT_UPDATED: 'project.updated',
  PROJECT_DELETED: 'project.deleted',

  // Task events
  TASK_CREATED: 'task.created',
  TASK_UPDATED: 'task.updated',
  TASK_DELETED: 'task.deleted',
} as const;

export type WsEvent = typeof WS_EVENTS[keyof typeof WS_EVENTS];

// ---------------------------------------------------------------------------
// Payload types
// ---------------------------------------------------------------------------

export interface TeamUpdatedPayload      { teamId: string; changes: Record<string, unknown> }
export interface TeamMemberPayload       { teamId: string; userId: string; role?: string }
export interface JoinRequestPayload      { teamId: string; requestId: string; userId: string }

export interface ProjectPayload          { teamId: string; projectId: string; [key: string]: unknown }
export interface TaskPayload             { teamId: string; projectId: string; taskId: string; [key: string]: unknown }

