// lib/support/redis.ts
import { Redis } from '@upstash/redis';
import { config } from './config';

const redis = Redis.fromEnv();

const K = {
  userTopic: (userId: number) => `support:user_topic:${userId}`,
  topicUser: (topicId: number) => `support:topic_user:${topicId}`,
  banned: (userId: number) => `support:banned:${userId}`,
  rate: (userId: number) => `support:rate:${userId}`,
  ticketMode: (userId: number) => `support:ticket_mode:${userId}`,
};

export async function getTopicForUser(userId: number): Promise<number | null> {
  const v = await redis.get<number>(K.userTopic(userId));
  return v ?? null;
}

export async function getUserForTopic(topicId: number): Promise<number | null> {
  const v = await redis.get<number>(K.topicUser(topicId));
  return v ?? null;
}

export async function saveTopicMapping(userId: number, topicId: number) {
  await Promise.all([
    redis.set(K.userTopic(userId), topicId, { ex: config.topicMappingTtlSec }),
    redis.set(K.topicUser(topicId), userId, { ex: config.topicMappingTtlSec }),
  ]);
}

export async function deleteTopicMapping(userId: number, topicId: number) {
  await Promise.all([redis.del(K.userTopic(userId)), redis.del(K.topicUser(topicId))]);
}

export async function isBanned(userId: number): Promise<boolean> {
  return (await redis.get(K.banned(userId))) !== null;
}

export async function setBanned(userId: number, banned: boolean) {
  if (banned) await redis.set(K.banned(userId), 1);
  else await redis.del(K.banned(userId));
}

export async function checkRateLimit(userId: number, limit: number): Promise<boolean> {
  const key = K.rate(userId);
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, 60);
  return count <= limit;
}

export async function setTicketMode(userId: number) {
  await redis.set(K.ticketMode(userId), 1, { ex: config.ticketModeTtlSec });
}

export async function clearTicketMode(userId: number) {
  await redis.del(K.ticketMode(userId));
}

export async function isInTicketMode(userId: number): Promise<boolean> {
  return (await redis.get(K.ticketMode(userId))) !== null;
}
