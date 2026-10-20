import { registerDevicePushToken } from '../lib/pushRegistration';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useRouter } from 'expo-router';
import { useCall } from '../contexts/CallContext';
const notificationsSupported = Platform.OS !== 'web';
const NOTIFICATION_CHANNEL_ID = 'chat_messages';
const NOTIFICATION_SOUND = 'notification.mp3';

let Notifications: any = null;
const isExpoGo = Constants.appOwnership === 'expo';

if (Platform.OS !== 'web' && !isExpoGo) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    Notifications = require('expo-notifications');
  } catch (err) {
    console.warn('Failed to load expo-notifications:', err);
  }
}

if (Platform.OS !== 'web' && Notifications) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: false,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: false,
      shouldShowList: true,
    }),
  });
}

async function registerForPushNotificationsAsync() {
  if (!notificationsSupported || !Notifications) {
    console.warn('Push Notifications are not supported or available in this environment.');
    return null;
  }

  let token;
  if (Platform.OS === 'web') {
    return null;
  }
  if (!Device.isDevice) {
    console.warn('Must use physical device for Push Notifications');
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') {
    console.warn('Failed to get push token for push notification!');
    return null;
  }

  // Get project ID from Constants
  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;

  try {
    token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;

  } catch (error) {
    console.error('Error fetching Expo push token:', error);
  }

  if (Platform.OS === 'android') {
    Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNEL_ID, {
      name: 'Sohbet bildirimleri',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
      sound: NOTIFICATION_SOUND,
    });
  }

  return token;
}

export function useNotifications() {
  const { user, profile } = useAuth();
  const userId = user?.id;
  const hasProfile = !!profile;
  const router = useRouter();
  const { setIncomingCall } = useCall();
  const notificationListener = useRef<any>(null);
  const responseListener = useRef<any>(null);

  useEffect(() => {
    if (!userId || !hasProfile || !notificationsSupported || !Notifications) return;

    let cancelled = false;
    registerForPushNotificationsAsync().then(async token => {
      if (token && !cancelled) await registerDevicePushToken(userId, token);
    }).catch(error => console.warn('Push registration failed:', error.message));

    // Listener for when a notification is received while the app is foregrounded
    notificationListener.current = Notifications.addNotificationReceivedListener(
      (notification: any) => {
        // Foreground message banners are handled by the Realtime banner.
        const data = notification.request.content.data;
        if (data?.type === 'call_incoming' && data.callerId && data.conversationId) {
          setIncomingCall({ callerId: data.callerId, callerName: data.senderName || 'Birisi', callerAvatar: data.callerAvatar || null, roomName: data.conversationId });
        }
      }
    );

    // Listener for when a user interacts with/taps a notification (foreground/background/closed)
    responseListener.current = Notifications.addNotificationResponseReceivedListener(
      (response: any) => {
        const data = response.notification.request.content.data;

        
        if (data) {
          if (data.type === 'call_incoming' && data.conversationId) {
            setIncomingCall({
              callerId: data.callerId,
              callerName: data.senderName || 'Birisi',
              callerAvatar: data.callerAvatar || null,
              roomName: data.conversationId,
            });
          } else if (data.conversationId) {
            // Navigate to the chat room
            router.push({
              pathname: '/chat-room',
              params: {
                id: data.conversationId,
                name: data.senderName || 'Sohbet',
              },
            });
          }
        }
      }
    );

    return () => {
      cancelled = true;
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, [userId, hasProfile, router, setIncomingCall]);
}
