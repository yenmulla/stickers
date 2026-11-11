package com.twitsticker.app;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.UriMatcher;
import android.content.res.AssetFileDescriptor;
import android.content.res.AssetManager;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.text.TextUtils;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import java.io.File;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

public class StickerContentProvider extends ContentProvider {
    private static final String TAG = "StickerContentProvider";

    public static final String AUTHORITY = BuildConfig.CONTENT_PROVIDER_AUTHORITY != null 
        ? BuildConfig.CONTENT_PROVIDER_AUTHORITY 
        : "com.twitsticker.app.stickercontentprovider";

    public static final String METADATA_PATH = "metadata";
    public static final String STICKERS_PATH = "stickers";
    public static final String STICKERS_ASSET_PATH = "stickers_asset";

    /**
     * Exact column names mandated by WhatsApp specification
     */
    public static final String STICKER_PACK_IDENTIFIER_IN_QUERY = "sticker_pack_identifier";
    public static final String STICKER_PACK_NAME_IN_QUERY = "sticker_pack_name";
    public static final String STICKER_PACK_PUBLISHER_IN_QUERY = "sticker_pack_publisher";
    public static final String STICKER_PACK_ICON_IN_QUERY = "sticker_pack_icon";
    public static final String ANDROID_APP_DOWNLOAD_LINK_IN_QUERY = "android_play_store_link";
    public static final String IOS_APP_DOWNLOAD_LINK_IN_QUERY = "ios_app_download_link";
    public static final String PUBLISHER_EMAIL = "sticker_pack_publisher_email";
    public static final String PUBLISHER_WEBSITE = "sticker_pack_publisher_website";
    public static final String PRIVACY_POLICY_WEBSITE = "sticker_pack_privacy_policy_website";
    public static final String LICENSE_AGREEMENT_WEBSITE = "sticker_pack_license_agreement_website";
    public static final String IMAGE_DATA_VERSION = "image_data_version";
    public static final String AVOID_CACHE = "whatsapp_will_not_cache_stickers";
    public static final String ANIMATED_STICKER_PACK = "animated_sticker_pack";

    public static final String STICKER_FILE_NAME_IN_QUERY = "sticker_file_name";
    public static final String STICKER_FILE_EMOJI_IN_QUERY = "sticker_emoji";
    public static final String STICKER_FILE_ACCESSIBILITY_TEXT_IN_QUERY = "sticker_accessibility_text";

    private static final int METADATA_CODE = 1;
    private static final int METADATA_CODE_FOR_SINGLE_PACK = 2;
    private static final int STICKERS_CODE = 3;
    private static final int STICKERS_ASSET_CODE = 4;

    private static final UriMatcher MATCHER = new UriMatcher(UriMatcher.NO_MATCH);

    static {
        MATCHER.addURI(AUTHORITY, METADATA_PATH, METADATA_CODE);
        MATCHER.addURI(AUTHORITY, METADATA_PATH + "/*", METADATA_CODE_FOR_SINGLE_PACK);
        MATCHER.addURI(AUTHORITY, STICKERS_PATH + "/*", STICKERS_CODE);
        MATCHER.addURI(AUTHORITY, STICKERS_ASSET_PATH + "/*", STICKERS_ASSET_CODE);
        MATCHER.addURI(AUTHORITY, STICKERS_ASSET_PATH + "/*/*", STICKERS_ASSET_CODE);
    }

    private StickerPackManager packManager;

    @Override
    public boolean onCreate() {
        packManager = new StickerPackManager(getContext());
        return true;
    }

    @Nullable
    @Override
    public Cursor query(@NonNull Uri uri, @Nullable String[] projection, @Nullable String selection, @Nullable String[] selectionArgs, @Nullable String sortOrder) {
        int code = MATCHER.match(uri);
        Log.d(TAG, "query() URI: " + uri + " matched code: " + code);
        switch (code) {
            case METADATA_CODE:
                return getPackForAllPacks(uri);
            case METADATA_CODE_FOR_SINGLE_PACK:
                return getCursorForSinglePack(uri);
            case STICKERS_CODE:
                return getStickersForPack(uri);
            default:
                // Resilient fallback checking path segments
                String path = uri.getPath();
                if (path != null) {
                    if (path.contains("/" + STICKERS_PATH)) {
                        return getStickersForPack(uri);
                    } else if (path.contains("/" + METADATA_PATH)) {
                        return getCursorForSinglePack(uri);
                    }
                }
                throw new IllegalArgumentException("Unknown URI: " + uri);
        }
    }

    @NonNull
    private Cursor getStickerPackInfo(@NonNull Uri uri, @NonNull List<StickerPack> stickerPackList) {
        // Includes WhatsApp standard column names AND historical aliases
        MatrixCursor cursor = new MatrixCursor(new String[]{
            STICKER_PACK_IDENTIFIER_IN_QUERY,
            STICKER_PACK_NAME_IN_QUERY,
            STICKER_PACK_PUBLISHER_IN_QUERY,
            STICKER_PACK_ICON_IN_QUERY,
            ANDROID_APP_DOWNLOAD_LINK_IN_QUERY,
            IOS_APP_DOWNLOAD_LINK_IN_QUERY,
            PUBLISHER_EMAIL,
            PUBLISHER_WEBSITE,
            PRIVACY_POLICY_WEBSITE,
            LICENSE_AGREEMENT_WEBSITE,
            IMAGE_DATA_VERSION,
            AVOID_CACHE,
            ANIMATED_STICKER_PACK,
            // Aliases for compatibility
            "ios_app_store_link",
            "publisher_email",
            "publisher_website",
            "privacy_policy_website",
            "license_agreement_website",
            "license_agreenment_website",
            "avoid_cache"
        });

        for (StickerPack pack : stickerPackList) {
            MatrixCursor.RowBuilder builder = cursor.newRow();
            builder.add(pack.identifier);
            builder.add(pack.name);
            builder.add(pack.publisher);
            builder.add(pack.trayImageFile);
            builder.add(pack.androidPlayStoreLink != null ? pack.androidPlayStoreLink : "");
            builder.add(pack.iosAppStoreLink != null ? pack.iosAppStoreLink : "");
            builder.add(pack.publisherEmail != null ? pack.publisherEmail : "");
            builder.add(pack.publisherWebsite != null ? pack.publisherWebsite : "");
            builder.add(pack.privacyPolicyWebsite != null ? pack.privacyPolicyWebsite : "");
            builder.add(pack.licenseAgreementWebsite != null ? pack.licenseAgreementWebsite : "");
            builder.add(pack.imageDataVersion != null ? pack.imageDataVersion : "2");
            builder.add(pack.avoidCache ? 1 : 0);
            builder.add(pack.animatedStickerPack ? 1 : 0);

            // Aliases
            builder.add(pack.iosAppStoreLink != null ? pack.iosAppStoreLink : "");
            builder.add(pack.publisherEmail != null ? pack.publisherEmail : "");
            builder.add(pack.publisherWebsite != null ? pack.publisherWebsite : "");
            builder.add(pack.privacyPolicyWebsite != null ? pack.privacyPolicyWebsite : "");
            builder.add(pack.licenseAgreementWebsite != null ? pack.licenseAgreementWebsite : "");
            builder.add(pack.licenseAgreementWebsite != null ? pack.licenseAgreementWebsite : "");
            builder.add(pack.avoidCache ? 1 : 0);
        }

        if (getContext() != null) {
            cursor.setNotificationUri(getContext().getContentResolver(), uri);
        }
        return cursor;
    }

    private Cursor getPackForAllPacks(@NonNull Uri uri) {
        return getStickerPackInfo(uri, packManager.getPacks());
    }

    private Cursor getCursorForSinglePack(@NonNull Uri uri) {
        String identifier = uri.getLastPathSegment();
        List<StickerPack> packs = packManager.getPacks();
        List<StickerPack> singlePackList = new ArrayList<>();
        for (StickerPack pack : packs) {
            if (pack.identifier.equals(identifier)) {
                singlePackList.add(pack);
                break;
            }
        }
        if (singlePackList.isEmpty() && !packs.isEmpty()) {
            singlePackList.add(packs.get(0));
        }
        return getStickerPackInfo(uri, singlePackList);
    }

    private Cursor getStickersForPack(@NonNull Uri uri) {
        String identifier = uri.getLastPathSegment();
        MatrixCursor cursor = new MatrixCursor(new String[]{
            STICKER_FILE_NAME_IN_QUERY,
            STICKER_FILE_EMOJI_IN_QUERY,
            STICKER_FILE_ACCESSIBILITY_TEXT_IN_QUERY
        });

        List<StickerPack> packs = packManager.getPacks();
        StickerPack targetPack = null;
        for (StickerPack pack : packs) {
            if (pack.identifier.equals(identifier)) {
                targetPack = pack;
                break;
            }
        }
        if (targetPack == null && !packs.isEmpty()) {
            targetPack = packs.get(0);
        }

        if (targetPack != null) {
            for (Sticker sticker : targetPack.stickers) {
                String emojiCsv = (sticker.emojis != null && !sticker.emojis.isEmpty())
                    ? TextUtils.join(",", sticker.emojis)
                    : "🔥,✨";
                cursor.addRow(new Object[]{
                    sticker.imageFileName,
                    emojiCsv,
                    sticker.accessibilityText != null ? sticker.accessibilityText : ""
                });
            }
        }

        if (getContext() != null) {
            cursor.setNotificationUri(getContext().getContentResolver(), uri);
        }
        return cursor;
    }

    @Nullable
    @Override
    public AssetFileDescriptor openAssetFile(@NonNull Uri uri, @NonNull String mode) throws FileNotFoundException {
        Log.d(TAG, "openAssetFile() requested: " + uri);
        List<String> pathSegments = uri.getPathSegments();
        if (pathSegments.isEmpty()) {
            throw new FileNotFoundException("Invalid URI: " + uri);
        }

        String fileName = pathSegments.get(pathSegments.size() - 1);
        String identifier = pathSegments.size() >= 2 ? pathSegments.get(pathSegments.size() - 2) : "twitsticker_main";
        if (identifier.equals(STICKERS_ASSET_PATH)) {
            identifier = "twitsticker_main";
        }

        File packDir = packManager.getPackDir(identifier);
        File file = new File(packDir, fileName);

        if (file.exists() && file.length() > 0) {
            ParcelFileDescriptor pfd = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY);
            return new AssetFileDescriptor(pfd, 0, file.length());
        }

        // If not found in internal packDir, check if it's a starter/tray asset and copy it
        File copied = packManager.copyAssetToPackDirIfMissing(identifier, fileName);
        if (copied != null && copied.exists() && copied.length() > 0) {
            ParcelFileDescriptor pfd = ParcelFileDescriptor.open(copied, ParcelFileDescriptor.MODE_READ_ONLY);
            return new AssetFileDescriptor(pfd, 0, copied.length());
        }

        // Fallback: try opening from app assets directly
        try {
            AssetManager am = Objects.requireNonNull(getContext()).getAssets();
            return am.openFd(fileName);
        } catch (IOException e) {
            Log.e(TAG, "File not found: " + fileName + " in " + packDir.getAbsolutePath() + " or assets: " + e.getMessage());
            throw new FileNotFoundException("Cannot find " + fileName + " in pack dir or assets");
        }
    }

    @Nullable
    @Override
    public ParcelFileDescriptor openFile(@NonNull Uri uri, @NonNull String mode) throws FileNotFoundException {
        Log.d(TAG, "openFile() requested: " + uri);
        AssetFileDescriptor afd = openAssetFile(uri, mode);
        if (afd != null) {
            return afd.getParcelFileDescriptor();
        }
        throw new FileNotFoundException("Cannot open file: " + uri);
    }

    @Nullable
    @Override
    public String getType(@NonNull Uri uri) {
        String path = uri.getPath();
        if (path != null) {
            if (path.endsWith("tray.png") || path.endsWith(".png")) {
                return "image/png";
            }
            if (path.contains("/" + STICKERS_ASSET_PATH)) {
                return "image/webp";
            }
            if (path.contains("/" + STICKERS_PATH)) {
                return "vnd.android.cursor.dir/vnd." + AUTHORITY + "." + STICKERS_PATH;
            }
            if (path.contains("/" + METADATA_PATH)) {
                return path.endsWith(METADATA_PATH)
                    ? "vnd.android.cursor.dir/vnd." + AUTHORITY + "." + METADATA_PATH
                    : "vnd.android.cursor.item/vnd." + AUTHORITY + "." + METADATA_PATH;
            }
        }
        return "image/webp";
    }

    @Nullable
    @Override
    public Uri insert(@NonNull Uri uri, @Nullable ContentValues values) {
        throw new UnsupportedOperationException("Insert not supported");
    }

    @Override
    public int delete(@NonNull Uri uri, @Nullable String selection, @Nullable String[] selectionArgs) {
        throw new UnsupportedOperationException("Delete not supported");
    }

    @Override
    public int update(@NonNull Uri uri, @Nullable ContentValues values, @Nullable String selection, @Nullable String[] selectionArgs) {
        throw new UnsupportedOperationException("Update not supported");
    }
}
