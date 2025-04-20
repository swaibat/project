import admin from '../firebase/config.js';

export async function sendPushNotification(token, title, body, data = {}) {
  try {
    const message = {
      notification: {
        title,
        body,
      },
      data, // optional custom data
      token,
    };

    const response = await admin.messaging().send(message);
    return { success: true, response };
  } catch (error) {
    console.error('Error sending push notification:', error);
    return { success: false, error: error.message };
  }
}
