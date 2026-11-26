export interface StudentImportPreviewButton {
  text: string;
  callbackData: string;
}

/** Describes the confirm/cancel controls for text roster import review. */
export function buildStudentImportPreviewKeyboard(): StudentImportPreviewButton[][] {
  return [
    [{ text: '✅ Подтвердить', callbackData: 'studentimport:confirm' }],
    [{ text: '❌ Отменить', callbackData: 'studentimport:cancel' }]
  ];
}
