package com.twitsticker.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ProviderInfo;
import android.net.Uri;
import android.util.Log;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

public class StickerPackManager {
    private static final String TAG = "StickerPackManager";
    public static final String EXTRA_STICKER_PACK_ID = "extra_sticker_pack_id";
    public static final String EXTRA_STICKER_PACK_AUTHORITY = "extra_sticker_pack_authority";
    public static final String EXTRA_STICKER_PACK_NAME = "extra_sticker_pack_name";
    public static final int ADD_PACK_REQUEST_CODE = 200;

    public static final String WHATSAPP_PACKAGE_NAME = "com.whatsapp";
    public static final String WHATSAPP_BUSINESS_PACKAGE_NAME = "com.whatsapp.w4b";

    private final Context context;
    private final File packsDir;
    private final File configFile;

    public StickerPackManager(Context context) {
        this.context = context.getApplicationContext();
        this.packsDir = new File(this.context.getFilesDir(), "sticker_packs");
        if (!packsDir.exists()) packsDir.mkdirs();
        this.configFile = new File(packsDir, "packs.json");
        initDefaultPackIfNeeded();
    }

    private void initDefaultPackIfNeeded() {
        List<StickerPack> packs = getPacks();
        if (packs.isEmpty()) {
            StickerPack defaultPack = new StickerPack(
                "twitsticker_main",
                "TwitSticker Pack",
                "TwitSticker App",
                "tray.webp"
            );
            defaultPack.animatedStickerPack = true;
            copyAssetToInternalStorage("tray.webp", new File(getPackDir("twitsticker_main"), "tray.webp"));
            copyAssetToInternalStorage("starter1.webp", new File(getPackDir("twitsticker_main"), "starter1.webp"));
            copyAssetToInternalStorage("starter2.webp", new File(getPackDir("twitsticker_main"), "starter2.webp"));
            copyAssetToInternalStorage("starter3.webp", new File(getPackDir("twitsticker_main"), "starter3.webp"));

            defaultPack.stickers.add(new Sticker("starter1.webp", Arrays.asList("🔥", "✨")));
            defaultPack.stickers.add(new Sticker("starter2.webp", Arrays.asList("😂", "🎉")));
            defaultPack.stickers.add(new Sticker("starter3.webp", Arrays.asList("🚀", "⭐")));

            packs.add(defaultPack);
            savePacks(packs);
        }
    }

    public File getPacksDir() {
        return packsDir;
    }

    public File getPackDir(String identifier) {
        File dir = new File(packsDir, identifier);
        if (!dir.exists()) dir.mkdirs();
        return dir;
    }

    public synchronized List<StickerPack> getPacks() {
        List<StickerPack> list = new ArrayList<>();
        if (!configFile.exists()) return list;

        try (FileInputStream fis = new FileInputStream(configFile)) {
            byte[] bytes = new byte[(int) configFile.length()];
            fis.read(bytes);
            String jsonStr = new String(bytes, "UTF-8");
            JSONArray arr = new JSONArray(jsonStr);

            for (int i = 0; i < arr.length(); i++) {
                JSONObject obj = arr.getJSONObject(i);
                StickerPack pack = new StickerPack(
                    obj.getString("identifier"),
                    obj.getString("name"),
                    obj.getString("publisher"),
                    obj.optString("trayImageFile", "tray.webp")
                );
                pack.animatedStickerPack = obj.optBoolean("animatedStickerPack", true);
                pack.publisherEmail = obj.optString("publisherEmail", "");
                pack.publisherWebsite = obj.optString("publisherWebsite", "");

                JSONArray stickersArr = obj.optJSONArray("stickers");
                if (stickersArr != null) {
                    for (int j = 0; j < stickersArr.length(); j++) {
                        JSONObject stObj = stickersArr.getJSONObject(j);
                        String fileName = stObj.getString("imageFileName");
                        List<String> emojis = new ArrayList<>();
                        JSONArray emojisArr = stObj.optJSONArray("emojis");
                        if (emojisArr != null) {
                            for (int k = 0; k < emojisArr.length(); k++) {
                                emojis.add(emojisArr.getString(k));
                            }
                        }
                        pack.stickers.add(new Sticker(fileName, emojis));
                    }
                }
                list.add(pack);
            }
        } catch (Exception e) {
            Log.e(TAG, "Error reading packs: " + e.getMessage(), e);
        }
        return list;
    }

    public synchronized void savePacks(List<StickerPack> packs) {
        try {
            JSONArray arr = new JSONArray();
            for (StickerPack pack : packs) {
                JSONObject obj = new JSONObject();
                obj.put("identifier", pack.identifier);
                obj.put("name", pack.name);
                obj.put("publisher", pack.publisher);
                obj.put("trayImageFile", pack.trayImageFile);
                obj.put("animatedStickerPack", pack.animatedStickerPack);
                obj.put("publisherEmail", pack.publisherEmail);
                obj.put("publisherWebsite", pack.publisherWebsite);

                JSONArray stickersArr = new JSONArray();
                for (Sticker sticker : pack.stickers) {
                    JSONObject stObj = new JSONObject();
                    stObj.put("imageFileName", sticker.imageFileName);
                    JSONArray emojisArr = new JSONArray();
                    for (String em : sticker.emojis) {
                        emojisArr.put(em);
                    }
                    stObj.put("emojis", emojisArr);
                    stickersArr.put(stObj);
                }
                obj.put("stickers", stickersArr);
                arr.put(obj);
            }

            try (FileOutputStream fos = new FileOutputStream(configFile)) {
                fos.write(arr.toString(2).getBytes("UTF-8"));
            }
        } catch (Exception e) {
            Log.e(TAG, "Error saving packs: " + e.getMessage(), e);
        }
    }

    public synchronized StickerPack addStickerToPack(String packId, String packName, String author, File stickerFile, List<String> emojis) {
        List<StickerPack> packs = getPacks();
        StickerPack targetPack = null;
        for (StickerPack p : packs) {
            if (p.identifier.equals(packId)) {
                targetPack = p;
                break;
            }
        }

        if (targetPack == null) {
            targetPack = new StickerPack(packId, packName, author, "tray.webp");
            targetPack.animatedStickerPack = true;
            copyAssetToInternalStorage("tray.webp", new File(getPackDir(packId), "tray.webp"));
            packs.add(targetPack);
        } else {
            targetPack.name = packName;
            targetPack.publisher = author;
        }

        // Copy file into target pack directory
        File packDir = getPackDir(packId);
        String finalFileName = stickerFile.getName();
        File destFile = new File(packDir, finalFileName);
        copyFile(stickerFile, destFile);

        // Remove if duplicate file exists in pack
        for (int i = targetPack.stickers.size() - 1; i >= 0; i--) {
            if (targetPack.stickers.get(i).imageFileName.equals(finalFileName)) {
                targetPack.stickers.remove(i);
            }
        }

        // Add at the front (index 0) so newest sticker is at the top of the pack
        targetPack.stickers.add(0, new Sticker(finalFileName, emojis));

        // WhatsApp requires 3 stickers minimum per pack!
        // If pack has less than 3 stickers, ensure fallback stickers exist
        while (targetPack.stickers.size() < 3) {
            int idx = targetPack.stickers.size() + 1;
            String fallbackName = "starter" + idx + ".webp";
            copyAssetToInternalStorage(fallbackName, new File(packDir, fallbackName));
            targetPack.stickers.add(new Sticker(fallbackName, Arrays.asList("🔥", "✨")));
        }

        savePacks(packs);
        return targetPack;
    }

    public void addPackToWhatsApp(Activity activity, String packIdentifier) {
        List<StickerPack> packs = getPacks();
        StickerPack pack = null;
        for (StickerPack p : packs) {
            if (p.identifier.equals(packIdentifier)) {
                pack = p;
                break;
            }
        }
        if (pack == null && !packs.isEmpty()) {
            pack = packs.get(0);
        }
        if (pack == null) {
            Toast.makeText(activity, "No sticker pack found", Toast.LENGTH_SHORT).show();
            return;
        }

        String authority = BuildConfig.CONTENT_PROVIDER_AUTHORITY;
        Intent intent = new Intent();
        intent.setAction("com.whatsapp.intent.action.ENABLE_STICKER_PACK");
        intent.putExtra(EXTRA_STICKER_PACK_ID, pack.identifier);
        intent.putExtra(EXTRA_STICKER_PACK_AUTHORITY, authority);
        intent.putExtra(EXTRA_STICKER_PACK_NAME, pack.name);

        try {
            // First check if WhatsApp is installed
            if (isPackageInstalled(WHATSAPP_PACKAGE_NAME, activity.getPackageManager())) {
                intent.setPackage(WHATSAPP_PACKAGE_NAME);
                activity.startActivityForResult(intent, ADD_PACK_REQUEST_CODE);
            } else if (isPackageInstalled(WHATSAPP_BUSINESS_PACKAGE_NAME, activity.getPackageManager())) {
                intent.setPackage(WHATSAPP_BUSINESS_PACKAGE_NAME);
                activity.startActivityForResult(intent, ADD_PACK_REQUEST_CODE);
            } else {
                Toast.makeText(activity, "WhatsApp is not installed on this device", Toast.LENGTH_LONG).show();
            }
        } catch (ActivityNotFoundException e) {
            Toast.makeText(activity, "Failed to launch WhatsApp: " + e.getMessage(), Toast.LENGTH_LONG).show();
        }
    }

    private boolean isPackageInstalled(String packageName, PackageManager packageManager) {
        try {
            packageManager.getPackageInfo(packageName, 0);
            return true;
        } catch (PackageManager.NameNotFoundException e) {
            return false;
        }
    }

    private void copyAssetToInternalStorage(String assetName, File destFile) {
        if (destFile.exists()) return;
        try (InputStream in = context.getAssets().open(assetName);
             OutputStream out = new FileOutputStream(destFile)) {
            byte[] buf = new byte[4096];
            int len;
            while ((len = in.read(buf)) > 0) {
                out.write(buf, 0, len);
            }
        } catch (Exception e) {
            Log.w(TAG, "Asset copy skipped: " + assetName + " - " + e.getMessage());
        }
    }

    private void copyFile(File src, File dst) {
        try (InputStream in = new FileInputStream(src);
             OutputStream out = new FileOutputStream(dst)) {
            byte[] buf = new byte[4096];
            int len;
            while ((len = in.read(buf)) > 0) {
                out.write(buf, 0, len);
            }
        } catch (Exception e) {
            Log.e(TAG, "File copy error: " + e.getMessage(), e);
        }
    }
}

