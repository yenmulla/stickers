package com.twitsticker.app;

import android.app.Activity;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.webkit.JavascriptInterface;
import android.widget.Toast;

import org.json.JSONArray;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class WebAppInterface {
    private static final String TAG = "WebAppInterface";
    private final Activity activity;
    private final StickerPackManager packManager;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    public WebAppInterface(Activity activity, StickerPackManager packManager) {
        this.activity = activity;
        this.packManager = packManager;
    }

    @JavascriptInterface
    public boolean isNativeApp() {
        return true;
    }

    @JavascriptInterface
    public void importStickerToPack(String stickerId, String packName, String author, String stickerUrl, String emojisJson) {
        Log.d(TAG, "importStickerToPack (silent background sync): " + stickerUrl);
        downloadAndAddSticker(stickerId, packName, author, stickerUrl, emojisJson, false);
    }

    @JavascriptInterface
    public void addStickerToWhatsApp(String stickerId, String packName, String author, String stickerUrl, String emojisJson) {
        Log.d(TAG, "addStickerToWhatsApp called: " + stickerUrl);
        mainHandler.post(() -> Toast.makeText(activity, "Adding sticker to WhatsApp...", Toast.LENGTH_SHORT).show());
        downloadAndAddSticker(stickerId, packName, author, stickerUrl, emojisJson, true);
    }

    private void downloadAndAddSticker(String stickerId, String packName, String author, String stickerUrl, String emojisJson, boolean launchWhatsApp) {
        executor.execute(() -> {
            try {
                // Parse emojis
                List<String> emojis = new ArrayList<>();
                try {
                    if (emojisJson != null && emojisJson.startsWith("[")) {
                        JSONArray arr = new JSONArray(emojisJson);
                        for (int i = 0; i < arr.length(); i++) {
                            emojis.add(arr.getString(i));
                        }
                    }
                } catch (Exception ignored) {}
                if (emojis.isEmpty()) {
                    emojis.add("🔥");
                    emojis.add("✨");
                }

                // If URL is relative, resolve it
                String fullUrl = stickerUrl;
                if (fullUrl != null && fullUrl.startsWith("/")) {
                    if (activity instanceof MainActivity) {
                        String base = ((MainActivity) activity).getServerBaseUrl();
                        fullUrl = base + fullUrl;
                    }
                }

                if (fullUrl == null || fullUrl.isEmpty()) {
                    throw new Exception("Invalid sticker URL");
                }

                // Download sticker WebP to cache dir
                File cacheDir = activity.getCacheDir();
                String cleanId = (stickerId != null ? stickerId.replace("-", "_") : "sticker_" + System.currentTimeMillis());
                File tempSticker = new File(cacheDir, cleanId + ".webp");

                URL url = new URL(fullUrl);
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setConnectTimeout(15000);
                conn.setReadTimeout(30000);
                conn.connect();

                if (conn.getResponseCode() != 200) {
                    throw new Exception("HTTP download error: " + conn.getResponseCode());
                }

                try (InputStream in = conn.getInputStream();
                     FileOutputStream out = new FileOutputStream(tempSticker)) {
                    byte[] buffer = new byte[8192];
                    int len;
                    while ((len = in.read(buffer)) != -1) {
                        out.write(buffer, 0, len);
                    }
                }

                // Add to active sticker pack
                String pName = (packName != null && !packName.trim().isEmpty()) ? packName : "TwitSticker";
                String pAuthor = (author != null && !author.trim().isEmpty()) ? author : "gifsticker.site";

                StickerPack pack = packManager.addStickerToPack("twitsticker_main", pName, pAuthor, tempSticker, emojis);
                Log.d(TAG, "Sticker added to pack! Total stickers in pack: " + pack.stickers.size());

                if (launchWhatsApp) {
                    mainHandler.post(() -> packManager.addPackToWhatsApp(activity, "twitsticker_main"));
                } else {
                    mainHandler.post(() -> Toast.makeText(activity, "Sticker saved to pack!", Toast.LENGTH_SHORT).show());
                }

            } catch (Exception e) {
                Log.e(TAG, "Error importing sticker: " + e.getMessage(), e);
                if (launchWhatsApp) {
                    mainHandler.post(() -> Toast.makeText(activity, "Failed to import sticker: " + e.getMessage(), Toast.LENGTH_LONG).show());
                }
            }
        });
    }

    @JavascriptInterface
    public void openStickerPackInWhatsApp(String packId) {
        mainHandler.post(() -> packManager.addPackToWhatsApp(activity, packId));
    }
}
