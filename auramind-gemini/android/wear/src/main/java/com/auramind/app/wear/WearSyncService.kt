package com.auramind.app.wear

import android.content.Context
import com.google.android.gms.tasks.Task
import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.DataEventBuffer
import com.google.android.gms.wearable.DataItem
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.PutDataMapRequest
import com.google.android.gms.wearable.Wearable
import com.google.android.gms.wearable.WearableListenerService
import kotlinx.coroutines.flow.MutableStateFlow

/** Shared watch-side state: latest payload from the phone + last sync time. */
object WearState {
    val payload: MutableStateFlow<ReviewPayload?> = MutableStateFlow(null)
    val lastSyncAt: MutableStateFlow<Long> = MutableStateFlow(0L)

    /** Grades graded on-watch but not yet delivered to the phone. */
    val pendingGrades: MutableStateFlow<Int> = MutableStateFlow(0)

    /** True when the queue overflowed and the oldest grades were dropped. */
    val queueOverflowed: MutableStateFlow<Boolean> = MutableStateFlow(false)

    /** Re-read queue state after enqueue/flush/undo and on cold start. */
    fun refreshQueue(context: Context) {
        pendingGrades.value = GradeQueue.size(context)
        queueOverflowed.value = GradeQueue.overflowed(context)
    }
}

/** Receives /auramind/sync data items pushed by the paired phone app. */
class WearSyncService : WearableListenerService() {

    override fun onDataChanged(dataEvents: DataEventBuffer) {
        for (event in dataEvents) {
            if (event.type != DataEvent.TYPE_CHANGED) continue
            val path = event.dataItem.uri.path
            if (path == SYNC_PATH) {
                val payload = DataMapItem.fromDataItem(event.dataItem).dataMap.toReviewPayload()
                if (payload != null) {
                    WearState.payload.value = payload
                    WearState.lastSyncAt.value = System.currentTimeMillis()
                    // The tile and complication read this same process state —
                    // nudge them now instead of waiting for their schedule.
                    AuraMindTileService.requestUpdate(this@WearSyncService)
                }
            }
        }
    }
}

/** Sends a grade result back to the phone app over the data layer. */
fun sendGrade(context: Context, grade: GradeResult): Task<DataItem> {
    val req = PutDataMapRequest.create(GRADE_PATH)
    req.dataMap.putString("sessionId", grade.sessionId)
    req.dataMap.putString("cardId", grade.cardId)
    req.dataMap.putInt("rating", grade.rating)
    req.dataMap.putLong("timestamp", grade.timestamp)
    return Wearable.getDataClient(context).putDataItem(req.asPutDataRequest())
}