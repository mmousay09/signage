package ly.signage.player

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** يفتح المشغّل بعد تشغيل الجهاز. على أندرويد 10 وأحدث يُفضّل جعله التطبيق الرئيسي. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED && intent.action != Intent.ACTION_LOCKED_BOOT_COMPLETED) return
        context.startActivity(
            Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )
    }
}
