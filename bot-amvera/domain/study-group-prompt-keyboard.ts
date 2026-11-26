export interface StudyGroupPromptButton {
  text: string;
  callbackData?: string;
  url?: string;
}

/** Describe the group-choice prompt controls; rendering remains in the Telegram adapter. */
export function buildStudyGroupPromptKeyboard(
  groupTwo: string,
  groupOne: string,
  contactUrl = 'https://t.me/givenchytg'
): StudyGroupPromptButton[][] {
  return [
    [{ text: groupTwo, callbackData: 'studygroup:2' }],
    [{ text: groupOne, callbackData: 'studygroup:1' }],
    [{ text: '❓ Не знаю свою группу — написать', url: contactUrl }]
  ];
}
