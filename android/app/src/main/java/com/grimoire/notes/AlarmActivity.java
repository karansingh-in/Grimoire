package com.grimoire.notes;

import android.app.Activity;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

public class AlarmActivity extends Activity {

    private MediaPlayer player;
    private Vibrator vibrator;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        } else {
            getWindow().addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                    | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                    | WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
            );
        }
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        String noteId = getIntent().getStringExtra(AlarmPlugin.EXTRA_NOTE_ID);
        String rawTitle = getIntent().getStringExtra(AlarmPlugin.EXTRA_TITLE);
        final String title =
            rawTitle == null || rawTitle.isEmpty() ? "Grimoire" : rawTitle;

        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setGravity(android.view.Gravity.CENTER);
        layout.setPadding(64, 64, 64, 64);
        layout.setBackgroundColor(0xFF0B0B0D);

        TextView heading = new TextView(this);
        heading.setText("Reminder");
        heading.setTextSize(14);
        heading.setTextColor(0xFF8E8E93);
        heading.setGravity(android.view.Gravity.CENTER);
        layout.addView(heading);

        TextView titleView = new TextView(this);
        titleView.setText(title);
        titleView.setTextSize(28);
        titleView.setTextColor(0xFFFFFFFF);
        titleView.setGravity(android.view.Gravity.CENTER);
        titleView.setPadding(0, 16, 0, 48);
        layout.addView(titleView);

        Button open = new Button(this);
        open.setText("Open note");
        open.setOnClickListener(view -> {
            stopAlert();
            Intent main = new Intent(this, MainActivity.class);
            main.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            startActivity(main);
            finish();
        });
        layout.addView(open);

        Button snooze = new Button(this);
        snooze.setText("Snooze 10 min");
        snooze.setOnClickListener(view -> {
            if (noteId != null) {
                AlarmPlugin.scheduleExact(
                    this,
                    noteId,
                    System.currentTimeMillis() + AlarmPlugin.SNOOZE_MILLIS,
                    title
                );
            }
            stopAlert();
            finish();
        });
        layout.addView(snooze);

        Button dismiss = new Button(this);
        dismiss.setText("Dismiss");
        dismiss.setOnClickListener(view -> {
            stopAlert();
            finish();
        });
        layout.addView(dismiss);

        setContentView(layout);
        startAlert();
    }

    private void startAlert() {
        try {
            Uri tone = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
            if (tone == null) tone = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
            player = new MediaPlayer();
            player.setDataSource(this, tone);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                player.setAudioAttributes(
                    new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ALARM)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build()
                );
            } else {
                player.setAudioStreamType(android.media.AudioManager.STREAM_ALARM);
            }
            player.setLooping(true);
            player.prepare();
            player.start();
        } catch (Exception ignored) {
            player = null;
        }
        try {
            vibrator = (Vibrator) getSystemService(VIBRATOR_SERVICE);
            if (vibrator != null && vibrator.hasVibrator()) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    vibrator.vibrate(VibrationEffect.createWaveform(new long[] { 0, 600, 400 }, 0));
                } else {
                    vibrator.vibrate(new long[] { 0, 600, 400 }, 0);
                }
            }
        } catch (Exception ignored) {
            vibrator = null;
        }
    }

    private void stopAlert() {
        try {
            if (player != null) {
                if (player.isPlaying()) player.stop();
                player.release();
                player = null;
            }
        } catch (Exception ignored) {
            player = null;
        }
        try {
            if (vibrator != null) vibrator.cancel();
        } catch (Exception ignored) {
            // Never load-bearing.
        }
        vibrator = null;
    }

    @Override
    protected void onDestroy() {
        stopAlert();
        super.onDestroy();
    }
}
