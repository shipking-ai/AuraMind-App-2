package com.auramind.app;

import android.content.ClipData;
import android.content.Intent;
import android.net.Uri;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Share target — receives content shared into BonaMind from any other app.
 *
 * This is the capability a website cannot have. A browser tab is somewhere you
 * go; a share target is somewhere the operating system can send things. It
 * turns every other app on the phone into an input funnel for deck creation,
 * which is the product's actual pitch ("turn anything into a course") applied
 * to the one surface where it can literally be true.
 *
 * WHY A HELD INTENT RATHER THAN AN EVENT ALONE
 *
 * A share can arrive before the web layer is listening — Android launches the
 * activity and delivers the intent long before React has mounted and
 * registered a handler. So the intent is parked here and the JS side pulls it
 * with consume(). Shares that arrive while the app is already running are
 * additionally emitted as an event, since nothing will be polling then.
 *
 * consume() clears the held value: a share is a one-shot instruction, and a
 * stale one replayed on the next launch would silently recreate a deck the
 * user already made.
 */
@CapacitorPlugin(name = "ShareTarget")
public class ShareTargetPlugin extends Plugin {

    /** Set by MainActivity before the web layer is ready to ask for it. */
    private static JSObject pending;

    private static ShareTargetPlugin instance;

    @Override
    public void load() {
        super.load();
        instance = this;
    }

    /**
     * Called from MainActivity for both cold-start and warm intents.
     * Static because the activity has no handle on the plugin instance, and
     * because a cold start delivers the intent before load() has run.
     */
    public static void handleIntent(Intent intent) {
        JSObject parsed = parse(intent);
        if (parsed == null) return;
        pending = parsed;
        // Only useful when the app is already up; on a cold start there is no
        // listener yet, which is exactly why `pending` exists.
        if (instance != null) {
            instance.notifyListeners("shareReceived", parsed);
        }
    }

    private static JSObject parse(Intent intent) {
        if (intent == null) return null;
        String action = intent.getAction();
        if (!Intent.ACTION_SEND.equals(action) && !Intent.ACTION_SEND_MULTIPLE.equals(action)) {
            return null;
        }

        JSObject out = new JSObject();
        out.put("type", intent.getType() == null ? "" : intent.getType());

        // Text shares: a URL, a highlighted passage, a note. Subject carries
        // the page title when a browser is the sender.
        CharSequence text = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
        if (text != null) out.put("text", text.toString());

        CharSequence subject = intent.getCharSequenceExtra(Intent.EXTRA_SUBJECT);
        if (subject != null) out.put("title", subject.toString());

        // File shares: a PDF, a photo of a page, a slide deck. The URI is
        // readable only while this grant lasts, so the web layer must act on
        // it during this launch rather than storing it for later.
        Uri stream = intent.getParcelableExtra(Intent.EXTRA_STREAM);
        if (stream != null) {
            out.put("uri", stream.toString());
        } else {
            ClipData clip = intent.getClipData();
            if (clip != null && clip.getItemCount() > 0) {
                Uri first = clip.getItemAt(0).getUri();
                if (first != null) out.put("uri", first.toString());
            }
        }

        boolean hasText = text != null && text.toString().trim().length() > 0;
        boolean hasUri = out.getString("uri") != null;
        return (hasText || hasUri) ? out : null;
    }

    /** Take the pending share, if any, and clear it. */
    @PluginMethod
    public void consume(PluginCall call) {
        JSObject result = new JSObject();
        if (pending == null) {
            result.put("share", JSObject.NULL);
        } else {
            result.put("share", pending);
            pending = null;
        }
        call.resolve(result);
    }
}
