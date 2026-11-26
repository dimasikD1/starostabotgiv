export interface HomeworkDestinationGroup {
  title?: unknown;
  chatId?: unknown;
}

export interface HomeworkDestinationButton {
  text: string;
  callbackData: string;
}

/** Builds callback button descriptors for selecting homework destinations. */
export function buildHomeworkDestinationButtons(
  groups: HomeworkDestinationGroup[]
): HomeworkDestinationButton[][] {
  const buttons = groups.map(group => [{
    text: '📚 ' + String(group.title).slice(0, 45),
    callbackData: 'hwsend:' + String(group.chatId)
  }]);
  if (groups.length > 1) {
    buttons.push([{ text: '📚 Во все группы', callbackData: 'hwsend:all' }]);
  }
  return buttons;
}
