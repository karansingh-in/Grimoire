package com.grimoire.notes;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "Alarm")
public class AlarmPlugin extends Plugin {

    public static final String EXTRA_NOTE_ID = "noteId";
    public static final String EXTRA_TITLE = "title";
    public static final long SNOOZE_MILLIS = 10 * 60 * 1000L;

    public static void scheduleExact(Context context, String id, long atMillis, String title) {
        AlarmManager manager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (manager == null || id == null) return;
        Intent intent = new Intent(context, AlarmReceiver.class);
        intent.putExtra(EXTRA_NOTE_ID, id);
        intent.putExtra(EXTRA_TITLE, title);
        PendingIntent pending = PendingIntent.getBroadcast(
            context,
            id.hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !manager.canScheduleExactAlarms()) {
            manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, atMillis, pending);
        } else {
            manager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, atMillis, pending);
        }
    }

    public static void cancelScheduled(Context context, String id) {
        if (id == null) return;
        AlarmManager manager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        Intent intent = new Intent(context, AlarmReceiver.class);
        PendingIntent pending = PendingIntent.getBroadcast(
            context,
            id.hashCode(),
            intent,
            PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE
        );
        if (manager != null && pending != null) {
            manager.cancel(pending);
            pending.cancel();
        }
    }

    @PluginMethod
    public void schedule(PluginCall call) {
        JSObject data = call.getData();
        String id = call.getString("id");
        long at = data != null ? data.optLong("at", 0) : 0;
        String title = call.getString("title", "Grimoire");
        if (id == null || at <= 0) {
            call.reject("Missing id or time");
            return;
        }
        scheduleExact(getContext(), id, at, title);
        call.resolve();
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        String id = call.getString("id");
        if (id == null) {
            call.reject("Missing id");
            return;
        }
        cancelScheduled(getContext(), id);
        call.resolve();
    }

    @PluginMethod
    public void ping(PluginCall call) {
        call.resolve();
    }

    /** Whether exact alarms and notifications are actually granted. */
    @PluginMethod
    public void status(PluginCall call) {
        Context context = getContext();
        boolean exact = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            AlarmManager manager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
            exact = manager == null || manager.canScheduleExactAlarms();
        }
        boolean notifications = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            android.app.NotificationManager manager =
                (android.app.NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager != null) {
                notifications = manager.areNotificationsEnabled();
            }
        }
        JSObject result = new JSObject();
        result.put("exact", exact);
        result.put("notifications", notifications);
        call.resolve(result);
    }

    /** Opens this app's system settings page (notifications, alarms, battery). */
    @PluginMethod
    public void openAppSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            intent.setData(Uri.parse("package:" + getContext().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception error) {
            call.reject("Could not open settings");
        }
    }
}
