package com.selfsupportapp.trial;

import android.content.ContentResolver;
import android.content.Intent;
import android.database.Cursor;
import android.media.AudioAttributes;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.net.Uri;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.Locale;

@CapacitorPlugin(name = "RingtonePicker")
public class RingtonePickerPlugin extends Plugin {

    private static final String PRESET_FRESH_START = "freshStart";
    private static final String PRESET_BICYCLE = "bicycle";
    private static final String BUNDLED_FRESH_START_RAW = "fresh_start";
    private static final String BUNDLED_BICYCLE_RAW = "bicycle";

    private Ringtone previewRingtone;

    @PluginMethod
    public void pickSound(PluginCall call) {
        String toneType = call.getString("toneType", "notification");
        int ringtoneType = "alarm".equals(toneType)
            ? RingtoneManager.TYPE_ALARM
            : RingtoneManager.TYPE_NOTIFICATION;

        Intent intent = new Intent(RingtoneManager.ACTION_RINGTONE_PICKER);
        intent.putExtra(RingtoneManager.EXTRA_RINGTONE_TYPE, ringtoneType);
        intent.putExtra(RingtoneManager.EXTRA_RINGTONE_SHOW_DEFAULT, true);
        intent.putExtra(RingtoneManager.EXTRA_RINGTONE_SHOW_SILENT, false);

        String existingUri = call.getString("existingUri", "");
        if (existingUri != null && !existingUri.isEmpty()) {
            intent.putExtra(RingtoneManager.EXTRA_RINGTONE_EXISTING_URI, Uri.parse(existingUri));
        }

        startActivityForResult(call, intent, "handlePickSoundResult");
    }

    @PluginMethod
    public void previewSound(PluginCall call) {
        String toneType = call.getString("toneType", "notification");
        Uri ringtoneUri = resolveRingtoneUri(call.getString("uri", ""), toneType);
        if (ringtoneUri == null) {
            call.reject("Unable to resolve ringtone uri");
            return;
        }

        stopPreviewInternal();
        previewRingtone = RingtoneManager.getRingtone(getContext(), ringtoneUri);
        if (previewRingtone == null) {
            call.reject("Unable to create ringtone preview");
            return;
        }

        AudioAttributes audioAttributes = new AudioAttributes.Builder()
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .setUsage("alarm".equals(toneType) ? AudioAttributes.USAGE_ALARM : AudioAttributes.USAGE_NOTIFICATION)
            .build();
        previewRingtone.setAudioAttributes(audioAttributes);
        previewRingtone.play();
        call.resolve();
    }

    @PluginMethod
    public void stopPreview(PluginCall call) {
        stopPreviewInternal();
        call.resolve();
    }

    @PluginMethod
    public void resolveFixedSound(PluginCall call) {
        String preset = call.getString("preset", PRESET_BICYCLE);
        String toneType = call.getString("toneType", "alarm");

        JSObject payload = resolveFixedSoundPayload(preset, toneType);
        call.resolve(payload);
    }

    @ActivityCallback
    private void handlePickSoundResult(PluginCall call, ActivityResult result) {
        if (call == null) {
            return;
        }

        JSObject payload = new JSObject();
        if (result == null || result.getResultCode() != android.app.Activity.RESULT_OK || result.getData() == null) {
            payload.put("selected", false);
            call.resolve(payload);
            return;
        }

        Uri pickedUri = result.getData().getParcelableExtra(RingtoneManager.EXTRA_RINGTONE_PICKED_URI);
        if (pickedUri == null) {
            payload.put("selected", false);
            call.resolve(payload);
            return;
        }

        String uriText = pickedUri.toString();
        String title = uriText;
        Ringtone ringtone = RingtoneManager.getRingtone(getContext(), pickedUri);
        if (ringtone != null) {
            String ringtoneTitle = ringtone.getTitle(getContext());
            if (ringtoneTitle != null && !ringtoneTitle.trim().isEmpty()) {
                title = ringtoneTitle.trim();
            }
        }

        payload.put("selected", true);
        payload.put("uri", uriText);
        payload.put("title", title);
        call.resolve(payload);
    }

    @Override
    protected void handleOnDestroy() {
        stopPreviewInternal();
        super.handleOnDestroy();
    }

    private Uri resolveRingtoneUri(String rawUri, String toneType) {
        String normalizedRawUri = rawUri != null ? rawUri.trim() : "";
        if (!normalizedRawUri.isEmpty()) {
            if (BUNDLED_FRESH_START_RAW.equals(normalizedRawUri)) {
                return buildBundledRawResourceUri(BUNDLED_FRESH_START_RAW);
            }
            if (BUNDLED_BICYCLE_RAW.equals(normalizedRawUri)) {
                return buildBundledRawResourceUri(BUNDLED_BICYCLE_RAW);
            }

            Uri selectedUri = Uri.parse(normalizedRawUri);
            Ringtone ringtone = RingtoneManager.getRingtone(getContext(), selectedUri);
            if (ringtone != null) {
                return selectedUri;
            }
        }

        if ("alarm".equals(toneType)) {
            Uri defaultUri = RingtoneManager.getActualDefaultRingtoneUri(getContext(), RingtoneManager.TYPE_ALARM);
            return defaultUri != null ? defaultUri : RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
        }

        Uri defaultUri = RingtoneManager.getActualDefaultRingtoneUri(getContext(), RingtoneManager.TYPE_NOTIFICATION);
        return defaultUri != null ? defaultUri : RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
    }

    private void stopPreviewInternal() {
        if (previewRingtone != null && previewRingtone.isPlaying()) {
            previewRingtone.stop();
        }
        previewRingtone = null;
    }

    private JSObject resolveFixedSoundPayload(String preset, String toneType) {
        JSObject payload = new JSObject();
        String normalizedToneType = "alarm".equals(toneType) ? "alarm" : "notification";
        String normalizedPreset = PRESET_FRESH_START.equals(preset) ? PRESET_FRESH_START : PRESET_BICYCLE;

        Uri systemUri = findSystemPresetUri(normalizedPreset, normalizedToneType);
        if (systemUri != null) {
            payload.put("uri", systemUri.toString());
            payload.put("title", getPresetDisplayName(normalizedPreset));
            payload.put("source", "system");
            return payload;
        }

        String bundledRaw = PRESET_FRESH_START.equals(normalizedPreset) ? BUNDLED_FRESH_START_RAW : BUNDLED_BICYCLE_RAW;
        Uri bundledUri = buildBundledRawResourceUri(bundledRaw);
        Ringtone bundledRingtone = bundledUri != null ? RingtoneManager.getRingtone(getContext(), bundledUri) : null;
        if (bundledUri != null && bundledRingtone != null) {
            payload.put("uri", bundledUri.toString());
            payload.put("title", getPresetDisplayName(normalizedPreset));
            payload.put("source", "bundled");
            return payload;
        }

        Uri defaultUri = resolveRingtoneUri("", normalizedToneType);
        payload.put("uri", defaultUri != null ? defaultUri.toString() : "");
        payload.put("title", getPresetDisplayName(normalizedPreset));
        payload.put("source", "default");
        return payload;
    }

    private Uri findSystemPresetUri(String preset, String toneType) {
        int[] ringtoneTypes = "alarm".equals(toneType)
            ? new int[] { RingtoneManager.TYPE_ALARM, RingtoneManager.TYPE_NOTIFICATION }
            : new int[] { RingtoneManager.TYPE_NOTIFICATION, RingtoneManager.TYPE_ALARM };

        for (int ringtoneType : ringtoneTypes) {
            RingtoneManager manager = new RingtoneManager(getContext());
            manager.setType(ringtoneType);
            Cursor cursor = manager.getCursor();
            if (cursor == null) continue;
            try {
                int count = cursor.getCount();
                for (int i = 0; i < count; i++) {
                    if (!cursor.moveToPosition(i)) continue;
                    Uri uri = manager.getRingtoneUri(i);
                    if (uri == null) continue;
                    Ringtone ringtone = RingtoneManager.getRingtone(getContext(), uri);
                    if (ringtone == null) continue;
                    String title = ringtone.getTitle(getContext());
                    if (matchesPresetTitle(preset, title)) {
                        return uri;
                    }
                }
            } finally {
                cursor.close();
            }
        }
        return null;
    }

    private boolean matchesPresetTitle(String preset, String title) {
        String normalizedTitle = normalizeTitle(title);
        if (normalizedTitle.isEmpty()) return false;
        if (PRESET_FRESH_START.equals(preset)) {
            return normalizedTitle.contains("freshstart") || normalizedTitle.contains("フレッシュスタート");
        }
        return normalizedTitle.contains("bicycle") || normalizedTitle.contains("バイシクル");
    }

    private String normalizeTitle(String title) {
        if (title == null) return "";
        String normalized = title.toLowerCase(Locale.ROOT).trim();
        normalized = normalized.replace(" ", "");
        normalized = normalized.replace("-", "");
        normalized = normalized.replace("_", "");
        return normalized;
    }

    private String getPresetDisplayName(String preset) {
        return PRESET_FRESH_START.equals(preset) ? "フレッシュスタート" : "バイシクル";
    }

    private Uri buildBundledRawResourceUri(String rawName) {
        if (rawName == null || rawName.trim().isEmpty()) return null;
        return Uri.parse(ContentResolver.SCHEME_ANDROID_RESOURCE + "://" + getContext().getPackageName() + "/raw/" + rawName.trim());
    }
}
