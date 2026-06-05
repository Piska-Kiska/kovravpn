// lib/support/handler.ts
import { config } from './config';
import {
  buildKeyboard,
  findNode,
  TICKET_MODE_START_TEXT,
  WELCOME_TEXT,
  type FaqNode,
} from './faq';
import {
  answerCallbackQuery,
  closeForumTopic,
  copyMessage,
  createForumTopic,
  editMessageText,
  sendMessage,
} from './telegram';
import {
  checkRateLimit,
  clearTicketMode,
  deleteTopicMapping,
  getTopicForUser,
  getUserForTopic,
  isBanned,
  isInTicketMode,
  saveTopicMapping,
  setBanned,
  setTicketMode,
} from './redis';
import type { TgCallbackQuery, TgMessage, TgUser, Update } from './types';

const BANNED_MSG = 'Вы заблокированы в поддержке.';
const RATE_LIMIT_MSG = 'Слишком много сообщений. Подождите минуту.';
const GENERIC_ERROR = 'Временная ошибка. Попробуйте позже.';

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export async function handleUpdate(update: Update): Promise<void> {
  if (update.callback_query) {
    await handleCallback(update.callback_query);
    return;
  }

  const msg = update.message;
  if (!msg || msg.from?.is_bot) return;

  if (msg.chat.type === 'private') {
    await handleUserMessage(msg);
    return;
  }

  if (msg.chat.id === config.adminGroupId && msg.message_thread_id) {
    await handleAdminReply(msg);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// User messages in private chat
// ════════════════════════════════════════════════════════════════════════════

async function handleUserMessage(msg: TgMessage): Promise<void> {
  const user = msg.from;
  if (!user) return;

  if (await isBanned(user.id)) {
    await sendMessage(user.id, BANNED_MSG);
    return;
  }

  const text = (msg.text || '').trim();

  if (text === '/start' || text === '/help' || text === '/menu') {
    await clearTicketMode(user.id);
    await showMenu(user.id);
    return;
  }

  if (!(await checkRateLimit(user.id, config.rateLimitPerMinute))) {
    await sendMessage(user.id, RATE_LIMIT_MSG);
    return;
  }

  // If user is NOT in ticket mode and sends a free-form message — switch to ticket mode
  if (!(await isInTicketMode(user.id))) {
    await startTicketMode(user);
  }

  await forwardToAdmin(user, msg);
}

async function showMenu(userId: number) {
  const root = findNode('menu')!;
  await sendMessage(userId, WELCOME_TEXT, {
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: buildKeyboard(root) },
  });
}

// ════════════════════════════════════════════════════════════════════════════
// Callback queries
// ════════════════════════════════════════════════════════════════════════════

async function handleCallback(cb: TgCallbackQuery): Promise<void> {
  const data = cb.data || '';
  const user = cb.from;
  const msg = cb.message;
  if (!msg) {
    await answerCallbackQuery(cb.id);
    return;
  }

  if (await isBanned(user.id)) {
    await answerCallbackQuery(cb.id, BANNED_MSG, true);
    return;
  }

  if (data === 'contact') {
    await answerCallbackQuery(cb.id);
    await startTicketMode(user);
    return;
  }

  if (data.startsWith('faq:')) {
    const nodeId = data.slice(4);
    const node = findNode(nodeId);
    if (!node) {
      await answerCallbackQuery(cb.id, 'Раздел не найден', true);
      return;
    }
    await answerCallbackQuery(cb.id);
    await renderNode(user.id, msg.message_id, node);
    return;
  }

  await answerCallbackQuery(cb.id);
}

async function renderNode(chatId: number, messageId: number, node: FaqNode) {
  const text = node.text
    ? `<b>${escapeHtml(stripEmoji(node.title))}</b>\n\n${node.text}`
    : WELCOME_TEXT;

  const res = await editMessageText(chatId, messageId, text, {
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: buildKeyboard(node) },
  });

  // If edit failed (message too old / deleted), send a new one
  if (!res.ok) {
    await sendMessage(chatId, text, {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: buildKeyboard(node) },
    });
  }
}

function stripEmoji(s: string): string {
  // Drop leading emoji + space so we don't duplicate it in the bold header
  return s.replace(/^[^\w\dА-Яа-я]+\s*/u, '');
}

// ════════════════════════════════════════════════════════════════════════════
// Ticket mode (forward user msgs to admin group via forum topics)
// ════════════════════════════════════════════════════════════════════════════

async function startTicketMode(user: TgUser) {
  await setTicketMode(user.id);
  await sendMessage(user.id, TICKET_MODE_START_TEXT, { parse_mode: 'HTML' });

  // Pre-create topic so the admin sees the ticket even before user sends anything
  const existing = await getTopicForUser(user.id);
  if (!existing) {
    await createTopicForUser(user);
  }
}

async function forwardToAdmin(user: TgUser, msg: TgMessage): Promise<void> {
  let topicId = await getTopicForUser(user.id);
  if (!topicId) {
    topicId = await createTopicForUser(user);
    if (!topicId) {
      await sendMessage(user.id, GENERIC_ERROR);
      return;
    }
  }

  const res = await copyMessage(config.adminGroupId, user.id, msg.message_id, {
    message_thread_id: topicId,
  });

  if (!res.ok) {
    console.warn('[support] copyMessage failed, recreating topic:', res.description);
    await deleteTopicMapping(user.id, topicId);
    const newTopicId = await createTopicForUser(user);
    if (newTopicId) {
      await copyMessage(config.adminGroupId, user.id, msg.message_id, {
        message_thread_id: newTopicId,
      });
    }
  }
}

async function createTopicForUser(user: TgUser): Promise<number | null> {
  const parts = [user.first_name];
  if (user.username) parts.push(`@${user.username}`);
  parts.push(String(user.id));
  const name = parts.join(' | ').slice(0, 128);

  const res = await createForumTopic(config.adminGroupId, name);
  if (!res.ok || !res.result) {
    console.error('[support] createForumTopic failed:', res.description);
    return null;
  }

  const topicId = res.result.message_thread_id;
  await saveTopicMapping(user.id, topicId);

  const card = [
    '<b>Новый тикет</b>',
    `User ID: <code>${user.id}</code>`,
    user.username ? `Username: @${escapeHtml(user.username)}` : null,
    `Name: ${escapeHtml(user.first_name)}${user.last_name ? ' ' + escapeHtml(user.last_name) : ''}`,
    user.language_code ? `Lang: ${escapeHtml(user.language_code)}` : null,
    '',
    'Команды: /info /ban /unban /close',
  ]
    .filter(Boolean)
    .join('\n');

  await sendMessage(config.adminGroupId, card, {
    message_thread_id: topicId,
    parse_mode: 'HTML',
  });

  return topicId;
}

// ════════════════════════════════════════════════════════════════════════════
// Admin replies inside forum topics
// ════════════════════════════════════════════════════════════════════════════

async function handleAdminReply(msg: TgMessage): Promise<void> {
  const topicId = msg.message_thread_id!;
  const userId = await getUserForTopic(topicId);
  if (!userId) return;

  const text = (msg.text || msg.caption || '').trim();

  if (text.startsWith('/ban')) {
    await setBanned(userId, true);
    await sendMessage(config.adminGroupId, `Пользователь ${userId} забанен.`, {
      message_thread_id: topicId,
    });
    return;
  }

  if (text.startsWith('/unban')) {
    await setBanned(userId, false);
    await sendMessage(config.adminGroupId, `Пользователь ${userId} разбанен.`, {
      message_thread_id: topicId,
    });
    return;
  }

  if (text.startsWith('/info')) {
    const banned = await isBanned(userId);
    const ticketMode = await isInTicketMode(userId);
    await sendMessage(
      config.adminGroupId,
      `User ID: ${userId}\nBanned: ${banned}\nTicket mode: ${ticketMode}\nTopic: ${topicId}`,
      { message_thread_id: topicId },
    );
    return;
  }

  if (text.startsWith('/close')) {
    await closeForumTopic(config.adminGroupId, topicId);
    await deleteTopicMapping(userId, topicId);
    await clearTicketMode(userId);
    return;
  }

  // Skip other slash commands silently
  if (text.startsWith('/')) return;

  // Forward operator reply to user
  await copyMessage(userId, config.adminGroupId, msg.message_id);
}
