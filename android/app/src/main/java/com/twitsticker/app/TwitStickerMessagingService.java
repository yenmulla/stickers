package com.twitsticker.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.os.Build;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;

import com.google.firebase.messaging.FirebaseMessaging;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

public class TwitStickerMessagingService extends FirebaseMessagingService {
    private static final String TAG = "TwitStickerFCM";
    public static final String CHANNEL_ID = "twitsticker_updates";
    public static final String CHANNEL_NAME = "TwitSticker Updates & New Stickers";

    @Override
    public void onNewToken(@NonNull String token) {
        super.onNewToken(token);
        Log.d(TAG, "Refreshed FCM token: " + token);

        // Automatically subscribe every device to broadcast topics
        FirebaseMessaging.getInstance().subscribeToTopic("all_users")
                .addOnCompleteListener(task -> Log.d(TAG, "Subscribed to topic 'all_users': " + task.isSuccessful()));
        FirebaseMessaging.getInstance().subscribeToTopic("announcements")
                .addOnCompleteListener(task -> Log.d(TAG, "Subscribed to topic 'announcements': " + task.isSuccessful()));
    }

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        super.onMessageReceived(remoteMessage);
        Log.d(TAG, "FCM Message received from: " + remoteMessage.getFrom());

        String title = "TwitSticker";
        String body = "Check out the latest animated WhatsApp stickers!";
        String targetUrl = null;

        // 1. Check notification payload
        RemoteMessage.Notification notification = remoteMessage.getNotification();
        if (notification != null) {
            if (notification.getTitle() != null && !notification.getTitle().isEmpty()) {
                title = notification.getTitle();
            }
            if (notification.getBody() != null && !notification.getBody().isEmpty()) {
                body = notification.getBody();
            }
        }

        // 2. Check custom data payload (supports title, body, url / link)
        Map<String, String> data = remoteMessage.getData();
        if (data != null && !data.isEmpty()) {
            if (data.containsKey("title") && data.get("title") != null) {
                title = data.get("title");
            }
            if (data.containsKey("body") && data.get("body") != null) {
                body = data.get("body");
            }
            if (data.containsKey("url")) {
                targetUrl = data.get("url");
            } else if (data.containsKey("link")) {
                targetUrl = data.get("link");
            }
        }

        showNotification(title, body, targetUrl);
    }

    private void showNotification(String title, String body, String targetUrl) {
        NotificationManager notificationManager =
                (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (notificationManager == null) return;

        ensureNotificationChannel(notificationManager);

        Intent intent = new Intent(this, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (targetUrl != null && !targetUrl.isEmpty()) {
            intent.putExtra("notification_url", targetUrl);
        }

        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent pendingIntent = PendingIntent.getActivity(
                this,
                (int) (System.currentTimeMillis() & 0xfffffff),
                intent,
                flags
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_notification)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setAutoCancel(true)
                .setDefaults(NotificationCompat.DEFAULT_ALL)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setColor(Color.parseColor("#25D366"))
                .setContentIntent(pendingIntent);

        notificationManager.notify((int) (System.currentTimeMillis() & 0xfffffff), builder.build());
    }

    public static void ensureNotificationChannel(NotificationManager notificationManager) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && notificationManager != null) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    CHANNEL_NAME,
                    NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription("Notifications for new WhatsApp sticker features, trending GIF packs, and app updates");
            channel.enableLights(true);
            channel.setLightColor(Color.parseColor("#25D366"));
            channel.enableVibration(true);
            notificationManager.createNotificationChannel(channel);
        }
    }
}
