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
    public void addStickerToWhatsApp(String stickerId, String packName, String author, String stickerUrl, String emojisJson) {
        Log.d(TAG, "addStickerToWhatsApp called: " + stickerUrl);
        mainHandler.post(() -> Toast.makeText(activity, "Preparing sticker for WhatsApp...", Toast.LENGTH_SHORT).show());

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
                if (fullUrl.startsWith("/")) {
                    if (activity instanceof MainActivity) {
                        String base = ((MainActivity) activity).getServerBaseUrl();
                        fullUrl = base + fullUrl;
                    }
                }

                // Download sticker WebP to cache dir
                File cacheDir = activity.getCacheDir();
                File tempSticker = new File(cacheDir, (stickerId != null ? stickerId : "sticker_" + System.currentTimeMillis()) + ".webp");

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
                String pName = (packName != null && !packName.trim().isEmpty()) ? packName : "TwitSticker Pack";
                String pAuthor = (author != null && !author.trim().isEmpty()) ? author : "TwitSticker App";

                packManager.addStickerToPack("twitsticker_main", pName, pAuthor, tempSticker, emojis);

                // Launch WhatsApp on main thread
                mainHandler.post(() -> {
                    packManager.addPackToWhatsApp(activity, "twitsticker_main");
                });

            } catch (Exception e) {
                Log.e(TAG, "Error importing sticker: " + e.getMessage(), e);
                mainHandler.post(() -> {
                    Toast.makeText(activity, "Failed to import sticker: " + e.getMessage(), Toast.LENGTH_LONG).show();
                });
            }
        });
    }

    @JavascriptInterface
    public void openStickerPackInWhatsApp(String packId) {
        mainHandler.post(() -> packManager.addPackToWhatsApp(activity, packId));
    }
}

