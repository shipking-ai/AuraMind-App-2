package com.auramind.app;

import androidx.annotation.NonNull;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.wearable.DataClient;
import com.google.android.gms.wearable.DataItem;
import com.google.android.gms.wearable.DataMap;
import com.google.android.gms.wearable.PutDataMapRequest;
import com.google.android.gms.wearable.Wearable;
import com.google.android.gms.tasks.Task;

import org.json.JSONObject;

import java.util.ArrayList;

/**
 * WearSync — exposes the Wear OS data layer to the BonaMind JS app.
 *
 * - pushReviewPayload(payload): pushes today's due cards to the watch.
 * - onGradeResult event: fired when the watch sends a grade back.
 *
 * No-op when no watch is paired (Wear data-layer calls simply yield nothing).
 */
@CapacitorPlugin(name = "WearSync")
public class WearSyncPlugin extends Plugin {

    public static final String SYNC_PATH = "/auramind/sync";
    public static final String GRADE_PATH = "/auramind/grade";

    @Override
    public void load() {
        super.load();
        WearSyncBridge.setListener(this::emitGrade);
    }

    private void emitGrade(JSObject grade) {
        notifyListeners("onGradeResult", grade, true);
    }

    @PluginMethod
    public void pushReviewPayload(PluginCall call) {
        JSObject payload = call.getObject("payload");
        if (payload == null) {
            call.reject("payload is required");
            return;
        }

        PutDataMapRequest req = PutDataMapRequest.create(SYNC_PATH);
        DataMap dm = req.getDataMap();
        dm.putInt("version", payload.optInt("version", 1));
        dm.putString("sessionId", payload.optString("sessionId", ""));
        dm.putInt("dueCount", payload.optInt("dueCount", 0));
        dm.putInt("reviewedToday", payload.optInt("reviewedToday", 0));
        dm.putInt("streak", payload.optInt("streak", 0));

        ArrayList<DataMap> cards = new ArrayList<>();
        if (payload.has("cards")) {
            try {
                org.json.JSONArray arr = payload.getJSONArray("cards");
                for (int i = 0; i < arr.length(); i++) {
                    JSONObject raw = arr.getJSONObject(i);
                    JSObject c = JSObject.fromJSONObject(raw);
                    DataMap cm = new DataMap();
                    cm.putString("cardId", c.optString("cardId", ""));
                    cm.putString("deckId", c.optString("deckId", ""));
                    cm.putString("front", c.optString("front", ""));
                    cm.putString("back", c.optString("back", ""));
                    cards.add(cm);
                }
            } catch (Exception e) {
                call.reject("failed to parse cards: " + e.getMessage());
                return;
            }
        }
        dm.putDataMapArrayList("cards", cards);

        DataClient client = Wearable.getDataClient(getActivity());
        Task<DataItem> put = client.putDataItem(req.asPutDataRequest());
        put.addOnSuccessListener(item -> call.resolve(new JSObject().put("ok", true)))
           .addOnFailureListener(e -> call.reject("push failed: " + e.getMessage()));
    }
}
