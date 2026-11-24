package ly.signage.player

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.app.AlertDialog
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.media.AudioManager
import android.text.InputType
import android.util.Base64
import java.io.ByteArrayOutputStream
import java.security.MessageDigest
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.EditText
import android.widget.FrameLayout
import org.json.JSONObject
import java.util.Locale

/**
 * مشغّل الشاشات: صفحة /play داخل WebView بملء الشاشة، تبقى الشاشة مضاءة،
 * ويعمل الصوت دون لمس، وتنطق الإعلانات بمحرك الكلام في أندرويد.
 * خمس لمسات سريعة في الزاوية العلوية تفتح الإعدادات.
 */
class MainActivity : Activity() {
    private lateinit var web: WebView
    private lateinit var speech: SpeechBridge
    private val handler = Handler(Looper.getMainLooper())
    private var cornerTaps = 0
    private var lastCornerTap = 0L
    private var pendingPermission: PermissionRequest? = null

    private val prefs by lazy { getSharedPreferences("player", Context.MODE_PRIVATE) }
    private val playerUrl: String
        get() = prefs.getString("url", BuildConfig.PLAYER_URL) ?: BuildConfig.PLAYER_URL

    @SuppressLint("SetJavaScriptEnabled", "ClickableViewAccessibility")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        web = WebView(this).apply {
            setBackgroundColor(Color.parseColor("#0E2A5C"))
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.databaseEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false
            settings.cacheMode = WebSettings.LOAD_DEFAULT
            settings.userAgentString = settings.userAgentString + " SignageAndroid/" + BuildConfig.VERSION_NAME
            webViewClient = PlayerClient()
            webChromeClient = PlayerChrome()
        }
        speech = SpeechBridge(this, web, this)
        web.addJavascriptInterface(speech, "SignageAndroid")

        val corner = View(this).apply {
            setOnTouchListener { _, event ->
                if (event.action == MotionEvent.ACTION_DOWN) countCornerTap()
                false
            }
        }
        val size = (72 * resources.displayMetrics.density).toInt()
        setContentView(FrameLayout(this).apply {
            addView(web, FrameLayout.LayoutParams(-1, -1))
            addView(corner, FrameLayout.LayoutParams(size, size, Gravity.TOP or Gravity.START))
        })

        if (savedInstanceState == null) web.loadUrl(playerUrl) else web.restoreState(savedInstanceState)
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) hideSystemBars()
    }

    override fun onResume() {
        super.onResume()
        web.onResume()
        hideSystemBars()
    }

    override fun onPause() {
        web.onPause()
        super.onPause()
    }

    override fun onDestroy() {
        speech.shutdown()
        web.destroy()
        super.onDestroy()
    }

    // الشاشة لا تُغلق بزر الرجوع
    @Deprecated("Kiosk")
    override fun onBackPressed() = Unit

    @Suppress("DEPRECATION")
    private fun hideSystemBars() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.setDecorFitsSystemWindows(false)
            window.insetsController?.let {
                it.hide(WindowInsets.Type.statusBars() or WindowInsets.Type.navigationBars())
                it.systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            }
        } else {
            window.decorView.systemUiVisibility = (View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                or View.SYSTEM_UI_FLAG_FULLSCREEN
                or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN)
        }
    }

    private fun countCornerTap() {
        val now = System.currentTimeMillis()
        cornerTaps = if (now - lastCornerTap < 700) cornerTaps + 1 else 1
        lastCornerTap = now
        if (cornerTaps >= 5) {
            cornerTaps = 0
            showSettings()
        }
    }

    private fun showSettings() {
        val hash = prefs.getString("pin_hash", "") ?: ""
        if (hash.isEmpty()) return openSettings()
        val pin = EditText(this).apply {
            inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_VARIATION_PASSWORD
        }
        AlertDialog.Builder(this)
            .setTitle(R.string.pin_title)
            .setView(pin)
            .setPositiveButton(R.string.open) { _, _ ->
                if (sha256(pin.text.toString()) == hash) openSettings()
            }
            .setNegativeButton(android.R.string.cancel, null)
            .show()
    }

    private fun openSettings() {
        val input = EditText(this).apply {
            setText(playerUrl)
            setSingleLine()
        }
        AlertDialog.Builder(this)
            .setTitle(getString(R.string.settings_title))
            .setMessage(getString(R.string.settings_message, BuildConfig.VERSION_NAME))
            .setView(input)
            .setPositiveButton(R.string.save) { _, _ ->
                val value = input.text.toString().trim()
                if (value.startsWith("https://")) prefs.edit().putString("url", value).apply()
                web.loadUrl(playerUrl)
            }
            .setNeutralButton(R.string.reload) { _, _ -> web.reload() }
            .setNegativeButton(R.string.exit) { _, _ -> finishAffinity() }
            .show()
    }

    /** رمز الإعدادات يُضبط من لوحة التحكم ويصل مع بيانات الشاشة */
    fun savePinHash(hash: String) {
        prefs.edit().putString("pin_hash", if (Regex("^[0-9a-f]{64}$").matches(hash)) hash else "").apply()
    }

    fun captureScreen(): String {
        val latch = CountDownLatch(1)
        var result = ""
        runOnUiThread {
            try {
                val width = web.width.coerceAtLeast(1)
                val height = web.height.coerceAtLeast(1)
                val scale = 720f / maxOf(width, height)
                val bitmap = Bitmap.createBitmap((width * scale).toInt(), (height * scale).toInt(), Bitmap.Config.RGB_565)
                val canvas = Canvas(bitmap)
                canvas.scale(scale, scale)
                web.draw(canvas)
                val out = ByteArrayOutputStream()
                bitmap.compress(Bitmap.CompressFormat.JPEG, 70, out)
                bitmap.recycle()
                result = "data:image/jpeg;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
            } finally {
                latch.countDown()
            }
        }
        latch.await(3, TimeUnit.SECONDS)
        return result
    }

    fun setSystemVolume(level: Int) {
        val audio = getSystemService(Context.AUDIO_SERVICE) as AudioManager
        val max = audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
        audio.setStreamVolume(AudioManager.STREAM_MUSIC, (max * level.coerceIn(0, 100)) / 100, 0)
    }

    private fun sha256(value: String): String =
        MessageDigest.getInstance("SHA-256").digest(value.toByteArray()).joinToString("") { "%02x".format(it) }

    private fun scheduleRetry() {
        handler.removeCallbacksAndMessages(null)
        handler.postDelayed({ web.loadUrl(playerUrl) }, 15_000)
    }

    private inner class PlayerClient : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            val target = request.url
            val home = Uri.parse(playerUrl)
            if (target.host == home.host) return false
            // روابط المواقع الأخرى لا تُفتح داخل الشاشة
            return true
        }

        override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
            if (request.isForMainFrame) scheduleRetry()
        }

        override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
            // إن تعطلت الصفحة يُعاد تشغيل التطبيق بدل الإغلاق
            startActivity(Intent(this@MainActivity, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            finish()
            return true
        }
    }

    private inner class PlayerChrome : WebChromeClient() {
        override fun onPermissionRequest(request: PermissionRequest) {
            val home = Uri.parse(playerUrl)
            if (request.origin.host != home.host) return request.deny()
            if (!request.resources.contains(PermissionRequest.RESOURCE_VIDEO_CAPTURE)) return request.deny()
            if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
                request.grant(arrayOf(PermissionRequest.RESOURCE_VIDEO_CAPTURE))
            } else {
                pendingPermission = request
                requestPermissions(arrayOf(Manifest.permission.CAMERA), CAMERA_REQUEST)
            }
        }
    }

    override fun onRequestPermissionsResult(code: Int, permissions: Array<out String>, results: IntArray) {
        if (code != CAMERA_REQUEST) return
        val request = pendingPermission ?: return
        pendingPermission = null
        if (results.firstOrNull() == PackageManager.PERMISSION_GRANTED) {
            request.grant(arrayOf(PermissionRequest.RESOURCE_VIDEO_CAPTURE))
        } else {
            request.deny()
        }
    }

    companion object {
        private const val CAMERA_REQUEST = 7
    }
}

/** محرك الكلام في أندرويد، تستدعيه الصفحة عبر window.SignageAndroid */
class SpeechBridge(context: Context, private val web: WebView, private val activity: MainActivity) {
    private var ready = false
    private val tts: TextToSpeech = TextToSpeech(context.applicationContext) { status ->
        ready = status == TextToSpeech.SUCCESS
    }

    init {
        tts.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(id: String) = Unit
            override fun onDone(id: String) = report(id, true)
            @Deprecated("Deprecated in Java")
            override fun onError(id: String) = report(id, false)
            override fun onError(id: String, errorCode: Int) = report(id, false)
        })
    }

    private fun report(id: String, ok: Boolean) {
        val quoted = JSONObject.quote(id)
        web.post { web.evaluateJavascript("window.__signageSpeechDone && window.__signageSpeechDone($quoted, $ok)", null) }
    }

    @JavascriptInterface
    fun speak(id: String, text: String, language: String): Boolean {
        if (!ready) return false
        val locale = when (language) {
            "fr" -> Locale.FRENCH
            "en" -> Locale.ENGLISH
            else -> Locale("ar")
        }
        val available = tts.isLanguageAvailable(locale)
        if (available < TextToSpeech.LANG_AVAILABLE) return false
        tts.language = locale
        tts.setSpeechRate(0.95f)
        return tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, id) == TextToSpeech.SUCCESS
    }

    @JavascriptInterface
    fun stopSpeaking() {
        tts.stop()
    }

    @JavascriptInterface
    fun setVolume(level: Int) {
        activity.runOnUiThread { activity.setSystemVolume(level) }
    }

    @JavascriptInterface
    fun setPinHash(hash: String) {
        activity.savePinHash(hash)
    }

    @JavascriptInterface
    fun captureScreen(): String = activity.captureScreen()

    fun shutdown() {
        tts.shutdown()
    }
}
