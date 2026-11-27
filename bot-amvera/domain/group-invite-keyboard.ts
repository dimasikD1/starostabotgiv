export interface GroupInviteButton {
  text: string;
  url: string;
}

const GROUP_INVITE_URL = 'https://t.me/starostagivbot?startgroup=true';

/** Describes the existing Telegram deep-link button for adding the bot to a group. */
export function buildGroupInviteButton(text: string): GroupInviteButton {
  return { text, url: GROUP_INVITE_URL };
}
