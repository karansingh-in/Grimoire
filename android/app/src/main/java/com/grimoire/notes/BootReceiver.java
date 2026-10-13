package com.grimoire.notes;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONObject;

/** Re-registers future reminders after a reboot; alarms never survive one. */
public class BootReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        if (!Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) return;
        SharedPreferences prefs = context.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE);
        String mirror = prefs.getString("grimoire-reminders", "[]");
        try {
            JSONArray entries = new JSONArray(mirror);
            long now = System.currentTimeMillis();
            for (int index = 0; index < entries.length(); index += 1) {
                JSONObject entry = entries.getJSONObject(index);
                String id = entry.optString("id", "");
                long at = entry.optLong("at", 0);
                String title = entry.optString("title", "Grimoire");
                if (!id.isEmpty() && at > now) {
                    AlarmPlugin.scheduleExact(context, id, at, title);
                }
            }
        } catch (Exception ignored) {
            // A corrupt mirror simply means no alarms until the app runs.
        }
    }
}
