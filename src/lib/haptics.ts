/**
 * iOS-style haptic feedback utility.
 * Uses the Vibration API where available.
 */
export const hapticFeedback = {
  /** Light tap — for button presses */
  light() {
    if ('vibrate' in navigator) {
      navigator.vibrate(10);
    }
  },
  /** Medium tap — for submit/save actions */
  medium() {
    if ('vibrate' in navigator) {
      navigator.vibrate(20);
    }
  },
  /** Success pattern — for completed actions */
  success() {
    if ('vibrate' in navigator) {
      navigator.vibrate([10, 50, 20]);
    }
  },
  /** Error pattern */
  error() {
    if ('vibrate' in navigator) {
      navigator.vibrate([30, 50, 30, 50, 30]);
    }
  },
};
