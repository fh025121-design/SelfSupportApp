package com.selfsupportapp.trial;

import android.content.Intent;
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

@CapacitorPlugin(name = "RingtonePicker")
public class RingtonePickerPlugin extends Plugin {

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
        Uri selectedUri = null;
        if (rawUri != null && !rawUri.trim().isEmpty()) {
            selectedUri = Uri.parse(rawUri.trim());
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
}
