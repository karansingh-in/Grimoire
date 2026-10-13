package com.grimoire.notes;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import androidx.core.app.NotificationCompat;

public class AlarmReceiver extends BroadcastReceiver {

    private static final String CHANNEL_ID = "grimoire-reminders";

    @Override
    public void onReceive(Context context, Intent intent) {
        String noteId = intent.getStringExtra(AlarmPlugin.EXTRA_NOTE_ID);
        String title = intent.getStringExtra(AlarmPlugin.EXTRA_TITLE);
        if (title == null || title.isEmpty()) title = "Grimoire";
        int code = noteId != null ? noteId.hashCode() : 0;

        // Bridge for the web layer: tapping through opens this note.
        context
            .getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE)
            .edit()
            .putString("grimoire-pending-note", noteId != null ? noteId : "")
            .apply();

        NotificationManager notifications =
            (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (notifications == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            notifications.createNotificationChannel(
                new NotificationChannel(CHANNEL_ID, "Reminders", NotificationManager.IMPORTANCE_HIGH)
            );
        }

        Intent openApp = new Intent(context, MainActivity.class);
        openApp.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent content = PendingIntent.getActivity(
            context,
            code,
            openApp,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Intent fullScreen = new Intent(context, AlarmActivity.class);
        fullScreen.putExtra(AlarmPlugin.EXTRA_NOTE_ID, noteId);
        fullScreen.putExtra(AlarmPlugin.EXTRA_TITLE, title);
        fullScreen.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent fullScreenIntent = PendingIntent.getActivity(
            context,
            code,
            fullScreen,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Uri sound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
        if (sound == null) sound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);

        try {
            notifications.notify(
                code,
                new NotificationCompat.Builder(context, CHANNEL_ID)
                    .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
                    .setContentTitle(title)
                    .setContentText("Reminder · Grimoire")
                    .setPriority(NotificationCompat.PRIORITY_HIGH)
                    .setCategory(NotificationCompat.CATEGORY_ALARM)
                    .setSound(sound)
                    .setVibrate(new long[] { 0, 500, 500, 500 })
                    .setContentIntent(content)
                    .setAutoCancel(true)
                    .setFullScreenIntent(fullScreenIntent, true)
                    .build()
            );
        } catch (SecurityException ignored) {
            // Notification permission denied; the alarm Activity still fires below.
        }

        try {
            context.startActivity(fullScreen);
        } catch (Exception ignored) {
            // Background-start restrictions on some builds; notification covers it.
        }
    }
}
