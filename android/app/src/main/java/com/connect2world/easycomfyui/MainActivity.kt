package com.connect2world.easycomfyui

import android.content.Intent
import android.content.SharedPreferences
import android.net.Uri
import android.os.Bundle
import android.provider.OpenableColumns
import android.util.Log
import android.webkit.ConsoleMessage
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewClientCompat
import org.json.JSONArray
import org.json.JSONObject

class MainActivity : AppCompatActivity() {

    companion object {
        private const val TAG = "EasyComfyUI"
        private const val PREFS_NAME = "workflow_history"
        private const val KEY_HISTORY = "history"
        private const val MAX_HISTORY = 20
    }

    private lateinit var webView: WebView
    private var pendingJsonText: String? = null
    private lateinit var prefs: SharedPreferences

    private val openDocumentLauncher =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            val uri = result.data?.data ?: return@registerForActivityResult
            try {
                // Take persistable permission so we can reopen later
                val takeFlags = Intent.FLAG_GRANT_READ_URI_PERMISSION
                contentResolver.takePersistableUriPermission(uri, takeFlags)

                val inputStream = contentResolver.openInputStream(uri)
                val jsonText = inputStream?.bufferedReader()?.use { it.readText() }
                if (jsonText != null) {
                    // Parse to extract nodeCount/linkCount for history
                    var nodeCount = 0
                    var linkCount = 0
                    try {
                        val json = JSONObject(jsonText)
                        val nodes = json.optJSONArray("nodes")
                        val links = json.optJSONArray("links")
                        nodeCount = nodes?.length() ?: 0
                        linkCount = links?.length() ?: 0
                    } catch (e: Exception) {
                        Log.w(TAG, "Could not parse workflow for history metadata", e)
                    }

                    // Get fileName from ContentResolver
                    val fileName = getFileName(uri) ?: uri.lastPathSegment ?: "unknown"

                    injectWorkflow(jsonText)

                    // Record history after successful injection
                    addHistory(uri.toString(), fileName, nodeCount, linkCount)
                    refreshWebHistory()
                } else {
                    Toast.makeText(this, "Failed to read file", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error reading file", e)
                Toast.makeText(this, "Error reading file: ${e.message}", Toast.LENGTH_SHORT).show()
            }
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE)

        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webView = findViewById(R.id.webView)
        val settings = webView.settings

        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.allowFileAccess = true
        settings.allowContentAccess = true

        WebView.setWebContentsDebuggingEnabled(true)

        webView.webViewClient = object : WebViewClientCompat() {
            override fun shouldInterceptRequest(
                view: WebView,
                request: WebResourceRequest
            ): WebResourceResponse? {
                return assetLoader.shouldInterceptRequest(request.url)
            }

            override fun onPageFinished(view: WebView, url: String) {
                super.onPageFinished(view, url)
                pendingJsonText?.let { text ->
                    pendingJsonText = null
                    doInject(text)
                }
                // Push history to web UI after page loads
                refreshWebHistory()
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onConsoleMessage(msg: ConsoleMessage): Boolean {
                Log.d(TAG, "JS [${msg.messageLevel()}] ${msg.message()} (${msg.sourceId()}:${msg.lineNumber()})")
                return true
            }
        }

        // Expose AndroidBridge to JavaScript
        webView.addJavascriptInterface(AndroidBridge(), "AndroidBridge")

        // Clear caches to avoid serving stale assets
        webView.clearCache(true)
        webView.clearHistory()

        webView.loadUrl("https://appassets.androidplatform.net/assets/web-viewer/index.html")
    }

    /**
     * Get display name from ContentResolver.
     */
    private fun getFileName(uri: Uri): String? {
        var name: String? = null
        val cursor = contentResolver.query(uri, null, null, null, null)
        cursor?.use {
            if (it.moveToFirst()) {
                val nameIndex = it.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                if (nameIndex >= 0) {
                    name = it.getString(nameIndex)
                }
            }
        }
        return name
    }

    // ── History management ──────────────────────────────────────────

    /**
     * Add a history entry. If the same URI exists, update openedAt and move to top.
     * Max 20 entries.
     */
    private fun addHistory(uri: String, fileName: String, nodeCount: Int, linkCount: Int) {
        val history = loadHistory()
        val now = System.currentTimeMillis()

        // Remove existing entry with same URI
        val filtered = mutableListOf<JSONObject>()
        for (i in 0 until history.length()) {
            val entry = history.getJSONObject(i)
            if (entry.optString("uri", "") != uri) {
                filtered.add(entry)
            }
        }

        // Create new entry at top
        val newEntry = JSONObject().apply {
            put("id", uri) // use URI as id for dedup
            put("uri", uri)
            put("fileName", fileName)
            put("openedAt", now)
            put("nodeCount", nodeCount)
            put("linkCount", linkCount)
        }
        filtered.add(0, newEntry)

        // Trim to max
        val trimmed = if (filtered.size > MAX_HISTORY) filtered.subList(0, MAX_HISTORY) else filtered

        val newArray = JSONArray()
        for (entry in trimmed) {
            newArray.put(entry)
        }

        prefs.edit().putString(KEY_HISTORY, newArray.toString()).apply()
    }

    /**
     * Load history JSON array from SharedPreferences.
     */
    private fun loadHistory(): JSONArray {
        val raw = prefs.getString(KEY_HISTORY, null) ?: return JSONArray()
        return try {
            JSONArray(raw)
        } catch (e: Exception) {
            Log.w(TAG, "Failed to parse history JSON", e)
            JSONArray()
        }
    }

    /**
     * Push current history to Web UI via updateWorkflowHistory().
     */
    private fun refreshWebHistory() {
        val historyJson = loadHistory().toString()
        val escaped = JSONObject.quote(historyJson)
        webView.evaluateJavascript(
            "window.updateWorkflowHistory(JSON.parse($escaped));",
            null
        )
    }

    /**
     * JavaScript interface exposed as `window.AndroidBridge`.
     */
    inner class AndroidBridge {
        @JavascriptInterface
        fun openWorkflowPicker() {
            runOnUiThread {
                val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                    addCategory(Intent.CATEGORY_OPENABLE)
                    type = "*/*"
                    putExtra(Intent.EXTRA_MIME_TYPES, arrayOf(
                        "application/json",
                        "text/json",
                        "text/plain"
                    ))
                }
                openDocumentLauncher.launch(intent)
            }
        }

        @JavascriptInterface
        fun openExternalUrl(url: String) {
            // Security: only allow http:// and https://
            if (!url.startsWith("http://") && !url.startsWith("https://")) {
                Log.w(TAG, "openExternalUrl: blocked non-http(s) URL: $url")
                return
            }
            runOnUiThread {
                try {
                    val intent = Intent(Intent.ACTION_VIEW, android.net.Uri.parse(url)).apply {
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                    startActivity(intent)
                } catch (e: Exception) {
                    Log.e(TAG, "openExternalUrl: failed to open URL: $url", e)
                    Toast.makeText(this@MainActivity, "Failed to open URL: ${e.message}", Toast.LENGTH_SHORT).show()
                }
            }
        }

        @JavascriptInterface
        fun getHistory(): String {
            return loadHistory().toString()
        }

        @JavascriptInterface
        fun openHistoryItem(id: String) {
            runOnUiThread {
                try {
                    val history = loadHistory()
                    var targetEntry: JSONObject? = null
                    for (i in 0 until history.length()) {
                        val entry = history.getJSONObject(i)
                        if (entry.optString("id", "") == id) {
                            targetEntry = entry
                            break
                        }
                    }

                    if (targetEntry == null) {
                        Toast.makeText(this@MainActivity, "History item not found", Toast.LENGTH_SHORT).show()
                        return@runOnUiThread
                    }

                    val uriStr = targetEntry.optString("uri", "")
                    if (uriStr.isEmpty()) {
                        Toast.makeText(this@MainActivity, "History item has no URI", Toast.LENGTH_SHORT).show()
                        return@runOnUiThread
                    }

                    val uri = Uri.parse(uriStr)
                    val inputStream = contentResolver.openInputStream(uri)
                    if (inputStream == null) {
                        Toast.makeText(this@MainActivity,
                            "Cannot open this history item. File may be missing or permission expired.",
                            Toast.LENGTH_LONG).show()
                        return@runOnUiThread
                    }

                    val jsonText = inputStream.bufferedReader().use { it.readText() }
                    if (jsonText.isEmpty()) {
                        Toast.makeText(this@MainActivity,
                            "Cannot open this history item. File may be missing or permission expired.",
                            Toast.LENGTH_LONG).show()
                        return@runOnUiThread
                    }

                    // Parse to get nodeCount/linkCount for updated history
                    var nodeCount = 0
                    var linkCount = 0
                    try {
                        val json = JSONObject(jsonText)
                        val nodes = json.optJSONArray("nodes")
                        val links = json.optJSONArray("links")
                        nodeCount = nodes?.length() ?: 0
                        linkCount = links?.length() ?: 0
                    } catch (e: Exception) {
                        Log.w(TAG, "Could not parse workflow for history metadata", e)
                    }

                    val fileName = targetEntry.optString("fileName", "unknown")

                    // Inject into WebView
                    val escaped = JSONObject.quote(jsonText)
                    webView.evaluateJavascript(
                        "window.renderWorkflow(JSON.parse($escaped));",
                        null
                    )

                    // Update history: move to top, update openedAt
                    addHistory(uriStr, fileName, nodeCount, linkCount)
                    refreshWebHistory()

                } catch (e: Exception) {
                    Log.e(TAG, "openHistoryItem failed", e)
                    Toast.makeText(this@MainActivity,
                        "Cannot open this history item. File may be missing or permission expired.",
                        Toast.LENGTH_LONG).show()
                }
            }
        }

        @JavascriptInterface
        fun clearHistory() {
            runOnUiThread {
                prefs.edit().remove(KEY_HISTORY).apply()
                refreshWebHistory()
                Toast.makeText(this@MainActivity, "History cleared", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun injectWorkflow(jsonText: String) {
        webView.evaluateJavascript(
            "(typeof window.renderWorkflow === 'function') ? 'ready' : 'not_ready'"
        ) { result ->
            val trimmed = result?.trim('"')
            if (trimmed == "ready") {
                doInject(jsonText)
            } else {
                Log.e(TAG, "WebView not ready: window.renderWorkflow is not a function")
                Toast.makeText(this, "WebView not ready, will inject after page loads", Toast.LENGTH_SHORT).show()
                pendingJsonText = jsonText
            }
        }
    }

    private fun doInject(jsonText: String) {
        val escaped = JSONObject.quote(jsonText)
        webView.evaluateJavascript(
            "window.renderWorkflow(JSON.parse($escaped));",
            null
        )
    }
}
