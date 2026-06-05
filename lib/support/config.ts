// lib/support/config.ts

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export const config = {
  botToken: required('SUPPORT_BOT_TOKEN'),
  webhookSecret: required('SUPPORT_BOT_WEBHOOK_SECRET'),
  adminGroupId: parseInt(required('SUPPORT_ADMIN_GROUP_ID'), 10),
  rateLimitPerMinute: 10,
  topicMappingTtlSec: 60 * 60 * 24 * 90,
  ticketModeTtlSec: 60 * 60 * 24,
  siteUrl: process.env.SITE_URL || 'https://proxysvpn.com',
  dashboardUrl: process.env.DASHBOARD_URL || 'https://proxysvpn.com/dashboard',
  guideUrl: process.env.GUIDE_URL || 'https://proxysvpn.com/guide',
  mainBotUrl: process.env.MAIN_BOT_URL || 'https://t.me/proxysvpn_bot',
} as const;
