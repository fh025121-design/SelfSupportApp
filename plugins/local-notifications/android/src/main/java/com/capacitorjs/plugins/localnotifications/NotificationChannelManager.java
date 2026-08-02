package com.capacitorjs.plugins.localnotifications;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.ContentResolver;
import android.content.Context;
import android.graphics.Color;
import android.media.AudioAttributes;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.net.Uri;
import androidx.core.app.NotificationCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Logger;
import com.getcapacitor.PluginCall;
import java.util.List;

public class NotificationChannelManager {

    private static final String DEFAULT_ALARM_SOUND_MARKER = "__DEFAULT_ALARM__";
    private static final String DEFAULT_NOTIFICATION_SOUND_MARKER = "__DEFAULT_NOTIFICATION__";
    private static final long[] ALARM_VIBRATION_PATTERN = new long[] { 0L, 500L, 300L, 500L, 300L, 500L, 300L, 500L, 300L, 500L, 300L, 500L };

    private Context context;
    private NotificationManager notificationManager;

    public NotificationChannelManager(Context context) {
        this.context = context;
        this.notificationManager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
    }

    public NotificationChannelManager(Context context, NotificationManager manager) {
        this.context = context;
        this.notificationManager = manager;
    }

    private static String CHANNEL_ID = "id";
    private static String CHANNEL_NAME = "name";
    private static String CHANNEL_DESCRIPTION = "description";
    private static String CHANNEL_IMPORTANCE = "importance";
    private static String CHANNEL_VISIBILITY = "visibility";
    private static String CHANNEL_SOUND = "sound";
    private static String CHANNEL_AUDIO_USAGE = "audioUsage";
    private static String CHANNEL_VIBRATE = "vibration";
    private static String CHANNEL_USE_LIGHTS = "lights";
    private static String CHANNEL_LIGHT_COLOR = "lightColor";

    public void createChannel(PluginCall call) {
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            JSObject channel = new JSObject();
            if (call.getString(CHANNEL_ID) != null) {
                channel.put(CHANNEL_ID, call.getString(CHANNEL_ID));
            } else {
                call.reject("Channel missing identifier");
                return;
            }
            if (call.getString(CHANNEL_NAME) != null) {
                channel.put(CHANNEL_NAME, call.getString(CHANNEL_NAME));
            } else {
                call.reject("Channel missing name");
                return;
            }

            channel.put(CHANNEL_IMPORTANCE, call.getInt(CHANNEL_IMPORTANCE, NotificationManager.IMPORTANCE_DEFAULT));
            channel.put(CHANNEL_DESCRIPTION, call.getString(CHANNEL_DESCRIPTION, ""));
            channel.put(CHANNEL_VISIBILITY, call.getInt(CHANNEL_VISIBILITY, NotificationCompat.VISIBILITY_PUBLIC));
            channel.put(CHANNEL_SOUND, call.getString(CHANNEL_SOUND, null));
            channel.put(CHANNEL_AUDIO_USAGE, call.getString(CHANNEL_AUDIO_USAGE, "notification"));
            channel.put(CHANNEL_VIBRATE, call.getBoolean(CHANNEL_VIBRATE, false));
            channel.put(CHANNEL_USE_LIGHTS, call.getBoolean(CHANNEL_USE_LIGHTS, false));
            channel.put(CHANNEL_LIGHT_COLOR, call.getString(CHANNEL_LIGHT_COLOR, null));
            createChannel(channel);
            call.resolve();
        } else {
            call.unavailable();
        }
    }

    public void createChannel(JSObject channel) {
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            NotificationChannel notificationChannel = new NotificationChannel(
                channel.getString(CHANNEL_ID),
                channel.getString(CHANNEL_NAME),
                channel.getInteger(CHANNEL_IMPORTANCE)
            );
            notificationChannel.setDescription(channel.getString(CHANNEL_DESCRIPTION));
            notificationChannel.setLockscreenVisibility(channel.getInteger(CHANNEL_VISIBILITY));
            notificationChannel.enableVibration(channel.getBool(CHANNEL_VIBRATE));
            notificationChannel.enableLights(channel.getBool(CHANNEL_USE_LIGHTS));
            String lightColor = channel.getString(CHANNEL_LIGHT_COLOR);
            if (lightColor != null) {
                try {
                    notificationChannel.setLightColor(Color.parseColor(lightColor));
                } catch (IllegalArgumentException ex) {
                    Logger.error(Logger.tags("NotificationChannel"), "Invalid color provided for light color.", null);
                }
            }
            String sound = channel.getString(CHANNEL_SOUND, null);
            String audioUsage = channel.getString(CHANNEL_AUDIO_USAGE, "notification");
            int usage = "alarm".equals(audioUsage) ? AudioAttributes.USAGE_ALARM : AudioAttributes.USAGE_NOTIFICATION;
            if (sound != null && !sound.isEmpty()) {
                if (DEFAULT_ALARM_SOUND_MARKER.equals(sound)) {
                    AudioAttributes audioAttributes = new AudioAttributes.Builder()
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .setUsage(AudioAttributes.USAGE_ALARM)
                        .build();
                    Uri soundUri = RingtoneManager.getActualDefaultRingtoneUri(context, RingtoneManager.TYPE_ALARM);
                    if (soundUri == null) {
                        soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
                    }
                    if (soundUri != null) {
                        notificationChannel.setSound(soundUri, audioAttributes);
                    }
                    notificationChannel.setVibrationPattern(ALARM_VIBRATION_PATTERN);
                } else if (DEFAULT_NOTIFICATION_SOUND_MARKER.equals(sound)) {
                    AudioAttributes audioAttributes = new AudioAttributes.Builder()
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                        .build();
                    Uri soundUri = RingtoneManager.getActualDefaultRingtoneUri(context, RingtoneManager.TYPE_NOTIFICATION);
                    if (soundUri == null) {
                        soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
                    }
                    if (soundUri != null) {
                        notificationChannel.setSound(soundUri, audioAttributes);
                    }
                } else if (sound.startsWith("content://") || sound.startsWith("file://") || sound.startsWith(ContentResolver.SCHEME_ANDROID_RESOURCE + "://")) {
                    AudioAttributes audioAttributes = new AudioAttributes.Builder()
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .setUsage(usage)
                        .build();
                    Uri selectedUri = Uri.parse(sound);
                    Uri effectiveUri = selectedUri;
                    Ringtone ringtone = RingtoneManager.getRingtone(context, selectedUri);
                    if (ringtone == null) {
                        effectiveUri = usage == AudioAttributes.USAGE_ALARM
                            ? RingtoneManager.getActualDefaultRingtoneUri(context, RingtoneManager.TYPE_ALARM)
                            : RingtoneManager.getActualDefaultRingtoneUri(context, RingtoneManager.TYPE_NOTIFICATION);
                        if (effectiveUri == null) {
                            effectiveUri = usage == AudioAttributes.USAGE_ALARM
                                ? RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
                                : RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
                        }
                    }
                    if (effectiveUri != null) {
                        notificationChannel.setSound(effectiveUri, audioAttributes);
                    }
                    if (usage == AudioAttributes.USAGE_ALARM) {
                        notificationChannel.setVibrationPattern(ALARM_VIBRATION_PATTERN);
                    }
                } else {
                    if (sound.contains(".")) {
                        sound = sound.substring(0, sound.lastIndexOf('.'));
                    }
                    AudioAttributes audioAttributes = new AudioAttributes.Builder()
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .setUsage(usage)
                        .build();
                    Uri soundUri = Uri.parse(ContentResolver.SCHEME_ANDROID_RESOURCE + "://" + context.getPackageName() + "/raw/" + sound);
                    notificationChannel.setSound(soundUri, audioAttributes);
                    if (usage == AudioAttributes.USAGE_ALARM) {
                        notificationChannel.setVibrationPattern(ALARM_VIBRATION_PATTERN);
                    }
                }
            }
            notificationManager.createNotificationChannel(notificationChannel);
        }
    }

    public void deleteChannel(PluginCall call) {
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            String channelId = call.getString("id");
            notificationManager.deleteNotificationChannel(channelId);
            call.resolve();
        } else {
            call.unavailable();
        }
    }

    public void listChannels(PluginCall call) {
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            List<NotificationChannel> notificationChannels = notificationManager.getNotificationChannels();
            JSArray channels = new JSArray();
            for (NotificationChannel notificationChannel : notificationChannels) {
                JSObject channel = new JSObject();
                channel.put(CHANNEL_ID, notificationChannel.getId());
                channel.put(CHANNEL_NAME, notificationChannel.getName());
                channel.put(CHANNEL_DESCRIPTION, notificationChannel.getDescription());
                channel.put(CHANNEL_IMPORTANCE, notificationChannel.getImportance());
                channel.put(CHANNEL_VISIBILITY, notificationChannel.getLockscreenVisibility());
                channel.put(CHANNEL_SOUND, notificationChannel.getSound());
                channel.put(CHANNEL_VIBRATE, notificationChannel.shouldVibrate());
                channel.put(CHANNEL_USE_LIGHTS, notificationChannel.shouldShowLights());
                channel.put(CHANNEL_LIGHT_COLOR, String.format("#%06X", 0xFFFFFF & notificationChannel.getLightColor()));
                Logger.debug(Logger.tags("NotificationChannel"), "visibility " + notificationChannel.getLockscreenVisibility());
                Logger.debug(Logger.tags("NotificationChannel"), "importance " + notificationChannel.getImportance());
                channels.put(channel);
            }
            JSObject result = new JSObject();
            result.put("channels", channels);
            call.resolve(result);
        } else {
            call.unavailable();
        }
    }
}
