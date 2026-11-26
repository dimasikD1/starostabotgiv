export interface PollDestinationGroup {
  title?: unknown;
  chatId?: unknown;
}

export interface PollDestinationButton {
  text: string;
  callbackData: string;
}

/** Builds callback button descriptors for selecting poll destinations. */
export function buildPollDestinationButtons(
  groups: PollDestinationGroup[]
): PollDestinationButton[][] {
  const buttons = groups.map(group => [{
    text: '📢 ' + String(group.title).slice(0, 45),
    callbackData: 'pollsend:' + String(group.chatId)
  }]);
  if (groups.length > 1) {
    buttons.push([{ text: '📢 Во все группы', callbackData: 'pollsend:all' }]);
  }
  return buttons;
}
