export interface DonationButton {
  text: string;
  callbackData: string;
}

/** Preserve the donation amounts and callback identifiers used by Telegram Stars. */
export function buildDonationKeyboard(): DonationButton[][] {
  return [
    [
      { text: '⭐ 50 Stars', callbackData: 'donate:50' },
      { text: '⭐ 100 Stars', callbackData: 'donate:100' }
    ],
    [
      { text: '⭐ 250 Stars', callbackData: 'donate:250' },
      { text: '⭐ 500 Stars', callbackData: 'donate:500' }
    ]
  ];
}
