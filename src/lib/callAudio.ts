import { PermissionsAndroid, Platform } from 'react-native';
import { setAudioModeAsync } from 'expo-audio';

type CallOwner = 'direct' | 'random';
let activeOwner: CallOwner | null = null;
let manager: any;
if (Platform.OS !== 'web') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    manager = require('react-native-incall-manager').default;
  } catch {
    console.warn('Native call audio manager unavailable; using Expo audio routing.');
  }
}

export async function startVoiceAudio(owner: CallOwner) {
  if (Platform.OS === 'web') return;
  if (Platform.OS === 'android') {
    const mic = PermissionsAndroid.PERMISSIONS.RECORD_AUDIO;
    if (!await PermissionsAndroid.check(mic) &&
        await PermissionsAndroid.request(mic) !== PermissionsAndroid.RESULTS.GRANTED) {
      throw new Error('Sesli görüşme için mikrofon izni gerekli.');
    }
    if (Number(Platform.Version) >= 31) {
      const bluetooth = PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT;
      if (!await PermissionsAndroid.check(bluetooth)) {
        // Denying Bluetooth must not block the built-in microphone/earpiece.
        await PermissionsAndroid.request(bluetooth);
      }
    }
  }
  activeOwner = owner;
  if (manager) {
    manager.start({ media: 'audio', auto: true });
    manager.setKeepScreenOn(true);
    manager.setForceSpeakerphoneOn(null);
    manager.setSpeakerphoneOn(false);
  } else {
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true,
      shouldPlayInBackground: true, shouldRouteThroughEarpiece: true });
  }
}

export async function setVoiceSpeaker(enabled: boolean) {
  if (Platform.OS === 'web') return;
  if (manager) {
    manager.setForceSpeakerphoneOn(enabled ? true : null);
    manager.setSpeakerphoneOn(enabled);
  } else {
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true,
      shouldPlayInBackground: true, shouldRouteThroughEarpiece: !enabled });
  }
}

export async function stopVoiceAudio(owner: CallOwner) {
  if (activeOwner !== owner) return;
  activeOwner = null;
  if (Platform.OS === 'web') return;
  if (manager) {
    manager.setForceSpeakerphoneOn(null);
    manager.setKeepScreenOn(false);
    manager.stop();
  } else {
    await setAudioModeAsync({ allowsRecording: false,
      shouldPlayInBackground: false, shouldRouteThroughEarpiece: false });
  }
}
