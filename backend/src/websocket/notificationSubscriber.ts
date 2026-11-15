import { createPubSubConnection } from '../config/redis';
import { emitToUser } from './emit';
import { WS_EVENTS } from './events';
import type Redis from 'ioredis';

// ---------------------------------------------------------------------------
// notificationSubscriber.ts — Redis Pub/Sub bridge
//
// The notification worker (a separate Railway process) cannot access the
// Socket.IO server instance. Instead it publishes to a Redis channel after
// persisting a notification. This subscriber listens on that channel and
// delivers the event to the correct user via their personal Socket.IO room.
//
// Channel: 'notifications:push'
// Message: JSON { userId: string, notification: Notification }
// ---------------------------------------------------------------------------

const CHANNEL = 'notifications:push';

let subscriber: Redis | null = null;

export function initNotificationSubscriber(): void {
  if (subscriber) return; // already initialized

  subscriber = createPubSubConnection();

  subscriber.on('error', (err) => {
    console.error('[notif-sub] Redis error:', err.message);
  });

  subscriber.subscribe(CHANNEL, (err, count) => {
    if (err) {
      console.error('[notif-sub] Failed to subscribe to channel:', err.message);
      return;
    }
    console.log(`[notif-sub] Subscribed to "${CHANNEL}" (total subscriptions: ${count})`);
  });

  subscriber.on('message', (channel, message) => {
    if (channel !== CHANNEL) return;

    try {
      const { userId, notification } = JSON.parse(message) as {
        userId: string;
        notification: Record<string, unknown>;
      };

      if (!userId || typeof userId !== 'string') {
        console.warn('[notif-sub] Received message with missing/invalid userId — skipping');
        return;
      }

      emitToUser(userId, WS_EVENTS.NOTIFICATION_RECEIVED, notification);
    } catch (err) {
      console.error('[notif-sub] Failed to parse or emit notification message:', err);
    }
  });

  console.log('[notif-sub] Notification subscriber initialized');
}

export async function closeNotificationSubscriber(): Promise<void> {
  if (subscriber) {
    await subscriber.quit();
    subscriber = null;
    console.log('[notif-sub] Subscriber connection closed');
  }
}
