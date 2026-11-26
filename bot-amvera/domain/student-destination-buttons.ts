export interface StudentDestinationGroup {
  title?: unknown;
  chatId?: unknown;
}
export interface StudentDestinationButton {
  text: string;
  callbackData: string;
}

/** Build the legacy group-selection buttons for opening student rosters. */
export function buildStudentDestinationButtons(
  groups: readonly StudentDestinationGroup[]
): StudentDestinationButton[][] {
  return groups.map(group => [{
    text: '👨‍🎓 ' + String(group.title).slice(0, 45),
    callbackData: 'students:' + String(group.chatId)
  }]);
}
