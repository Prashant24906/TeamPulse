import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Mirror of frontend parseToastDetails logic to verify exact parsing & formatting
// ---------------------------------------------------------------------------

function parseToastDetails(notification: { type: string; message: string }) {
  const { type, message } = notification;

  if (type === 'TEAM_MESSAGE') {
    const match = message.match(/^(.*?)\s+sent a message in\s+([^:]+)(?::\s*"?(.*?)"?)?$/);
    if (match) {
      const sender = match[1];
      const team = match[2];
      const preview = match[3];
      return {
        title: sender,
        subtitle: `Sent a message in ${team}`,
        preview: preview ? `"${preview}"` : undefined,
        iconType: 'TEAM_MESSAGE' as const,
      };
    }
    return {
      title: 'New Message',
      subtitle: message,
      iconType: 'TEAM_MESSAGE' as const,
    };
  }

  if (type === 'TASK_ASSIGNED') {
    const match = message.match(/^(.*?)\s+assigned you a task:\s*(.*)$/);
    if (match) {
      const assigner = match[1];
      const task = match[2];
      return {
        title: assigner,
        subtitle: `Assigned you a new task: ${task}`,
        iconType: 'TASK_ASSIGNED' as const,
      };
    }
    return {
      title: 'Task Assigned',
      subtitle: message,
      iconType: 'TASK_ASSIGNED' as const,
    };
  }

  if (type === 'PROJECT_JOIN_REQUEST') {
    const match = message.match(/^(.*?)\s+requested to join\s+(.*?)(\.)?$/);
    if (match) {
      const requester = match[1];
      const target = match[2];
      return {
        title: requester,
        subtitle: `Requested to join ${target}`,
        iconType: 'PROJECT_JOIN_REQUEST' as const,
      };
    }
    return {
      title: 'Project Join Request',
      subtitle: message,
      iconType: 'PROJECT_JOIN_REQUEST' as const,
    };
  }

  if (type === 'TEAM_JOIN_REQUEST') {
    const match = message.match(/^(.*?)\s+requested to join\s+(.*?)(\.)?$/);
    if (match) {
      const requester = match[1];
      const target = match[2];
      return {
        title: requester,
        subtitle: `Requested to join ${target}`,
        iconType: 'TEAM_JOIN_REQUEST' as const,
      };
    }
    return {
      title: 'Team Join Request',
      subtitle: message,
      iconType: 'TEAM_JOIN_REQUEST' as const,
    };
  }

  if (type === 'TASK_OVERDUE') {
    return {
      title: 'Task Overdue',
      subtitle: message,
      iconType: 'TASK_OVERDUE' as const,
    };
  }

  return {
    title: 'Task Due Soon',
    subtitle: message,
    iconType: 'TASK_DUE_SOON' as const,
  };
}

describe('Toast Notification Details Parsing', () => {
  it('correctly parses TEAM_MESSAGE with preview', () => {
    const result = parseToastDetails({
      type: 'TEAM_MESSAGE',
      message: 'Alex sent a message in Backend Development: "API endpoints are live!"',
    });

    expect(result.title).toBe('Alex');
    expect(result.subtitle).toBe('Sent a message in Backend Development');
    expect(result.preview).toBe('"API endpoints are live!"');
    expect(result.iconType).toBe('TEAM_MESSAGE');
  });

  it('correctly parses TEAM_MESSAGE without preview', () => {
    const result = parseToastDetails({
      type: 'TEAM_MESSAGE',
      message: 'Alex sent a message in Backend Development.',
    });

    expect(result.title).toBe('Alex');
    expect(result.subtitle).toBe('Sent a message in Backend Development.');
    expect(result.preview).toBeUndefined();
    expect(result.iconType).toBe('TEAM_MESSAGE');
  });

  it('correctly parses TASK_ASSIGNED notification', () => {
    const result = parseToastDetails({
      type: 'TASK_ASSIGNED',
      message: 'Alex assigned you a task: Implement Authentication API',
    });

    expect(result.title).toBe('Alex');
    expect(result.subtitle).toBe('Assigned you a new task: Implement Authentication API');
    expect(result.iconType).toBe('TASK_ASSIGNED');
  });

  it('correctly formats TASK_OVERDUE notification', () => {
    const result = parseToastDetails({
      type: 'TASK_OVERDUE',
      message: 'Task "Fix Login Bug" is overdue (was due 15 Nov, 2026).',
    });

    expect(result.title).toBe('Task Overdue');
    expect(result.subtitle).toBe('Task "Fix Login Bug" is overdue (was due 15 Nov, 2026).');
    expect(result.iconType).toBe('TASK_OVERDUE');
  });

  it('correctly parses PROJECT_JOIN_REQUEST notification', () => {
    const result = parseToastDetails({
      type: 'PROJECT_JOIN_REQUEST',
      message: 'Alex requested to join Project TeamPulse.',
    });

    expect(result.title).toBe('Alex');
    expect(result.subtitle).toBe('Requested to join Project TeamPulse');
    expect(result.iconType).toBe('PROJECT_JOIN_REQUEST');
  });

  it('correctly parses TEAM_JOIN_REQUEST notification', () => {
    const result = parseToastDetails({
      type: 'TEAM_JOIN_REQUEST',
      message: 'Alex requested to join Backend Development.',
    });

    expect(result.title).toBe('Alex');
    expect(result.subtitle).toBe('Requested to join Backend Development');
    expect(result.iconType).toBe('TEAM_JOIN_REQUEST');
  });

  it('correctly formats TASK_DUE_SOON notification', () => {
    const result = parseToastDetails({
      type: 'TASK_DUE_SOON',
      message: 'Task "Database Migration" is due soon (16 Nov, 2026).',
    });

    expect(result.title).toBe('Task Due Soon');
    expect(result.subtitle).toBe('Task "Database Migration" is due soon (16 Nov, 2026).');
    expect(result.iconType).toBe('TASK_DUE_SOON');
  });
});
