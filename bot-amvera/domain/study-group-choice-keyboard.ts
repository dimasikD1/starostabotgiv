export interface StudyGroupChoiceButton {
  text: string;
  callbackData: string;
}

/** Shared two-group picker for onboarding and commands that require a group. */
export function buildStudyGroupChoiceKeyboard(
  groupTwo: string,
  groupOne: string
): StudyGroupChoiceButton[][] {
  return [
    [{ text: groupTwo, callbackData: 'studygroup:2' }],
    [{ text: groupOne, callbackData: 'studygroup:1' }]
  ];
}
