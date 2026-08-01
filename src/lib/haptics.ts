// haptics.ts - Safe haptics wrapper with fallback
// Works with or without expo-haptics native module

let Haptics: any = null;
let hapticsAvailable = false;

// Try to load expo-haptics, fallback gracefully if not available
try {
  Haptics = require('expo-haptics');
  hapticsAvailable = true;
} catch (e) {
  console.warn('[Haptics] Native module not available - haptics disabled');
  hapticsAvailable = false;
}

export const HapticFeedback = {
  light: async () => {
    if (!hapticsAvailable || !Haptics) return;
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e) {
      console.warn('[Haptics] Failed to trigger light feedback:', e);
    }
  },
  
  medium: async () => {
    if (!hapticsAvailable || !Haptics) return;
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (e) {
      console.warn('[Haptics] Failed to trigger medium feedback:', e);
    }
  },
  
  heavy: async () => {
    if (!hapticsAvailable || !Haptics) return;
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    } catch (e) {
      console.warn('[Haptics] Failed to trigger heavy feedback:', e);
    }
  },
  
  success: async () => {
    if (!hapticsAvailable || !Haptics) return;
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      console.warn('[Haptics] Failed to trigger success feedback:', e);
    }
  },
  
  warning: async () => {
    if (!hapticsAvailable || !Haptics) return;
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } catch (e) {
      console.warn('[Haptics] Failed to trigger warning feedback:', e);
    }
  },
  
  error: async () => {
    if (!hapticsAvailable || !Haptics) return;
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } catch (e) {
      console.warn('[Haptics] Failed to trigger error feedback:', e);
    }
  },
  
  isAvailable: () => hapticsAvailable,
};

export default HapticFeedback;
