export interface StudentRosterPageItem {
  index: number;
  name: string;
}

export interface StudentRosterPage {
  pages: number;
  items: StudentRosterPageItem[];
}

export interface StudentRosterGroup {
  students?: unknown[];
}

export interface CallbackButton {
  text: string;
  callbackData: string;
}

export type CallbackKeyboardRows = CallbackButton[][];

/** Build callback-button descriptors for a paginated student roster. */
export function buildStudentRosterKeyboard(
  group: StudentRosterGroup,
  page: number,
  getRosterPage: (group: StudentRosterGroup, page: number, pageSize: number) => StudentRosterPage
): CallbackKeyboardRows {
  const rosterPage = getRosterPage(group, page, 10);
  const rows: CallbackKeyboardRows = rosterPage.items.map(({ index, name }) => [
    { text: '👤 ' + (index + 1) + '. ' + name.slice(0, 42), callbackData: 'studentcard:' + index }
  ]);
  const navigation: CallbackButton[] = [];
  if (page > 0) navigation.push({ text: '⬅️', callbackData: 'studentpage:' + (page - 1) });
  navigation.push({ text: (page + 1) + '/' + rosterPage.pages, callbackData: 'studentpage:' + page });
  if (page < rosterPage.pages - 1) navigation.push({ text: '➡️', callbackData: 'studentpage:' + (page + 1) });
  rows.push(navigation);
  return rows;
}

/** Build the student-card actions without coupling the domain layer to Telegraf. */
export function buildStudentCardKeyboard(index: number): CallbackKeyboardRows {
  return [
    [{ text: '✏️ Изменить username', callbackData: 'studentedit:username:' + index }],
    [{ text: '📞 Изменить телефон', callbackData: 'studentedit:phone:' + index }],
    [{ text: '⬅️ К списку', callbackData: 'studentback' }]
  ];
}
