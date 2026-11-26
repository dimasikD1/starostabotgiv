export interface ScheduleGroupButton {
  text: string;
  callbackData: string;
}

/** Build the group picker used when a schedule request has no valid group. */
export function buildScheduleGroupKeyboard(
  groupTwo: string,
  groupOne: string
): ScheduleGroupButton[][] {
  return [
    [{ text: groupTwo, callbackData: 'studygroup:2' }],
    [{ text: groupOne, callbackData: 'studygroup:1' }]
  ];
}
