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

import org.json.JSONArray;

import java.io.File;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

public class StickerContentProvider extends ContentProvider {
    private static final String TAG = "StickerContentProvider";

    public static final String AUTHORITY = BuildConfig.CONTENT_PROVIDER_AUTHORITY;

    public static final String METADATA_PATH = "metadata";
    public static final String STICKERS_PATH = "stickers";
    public static final String STICKERS_ASSET_PATH = "stickers_asset";

    // Column names defined by WhatsApp
    public static final String STICKER_PACK_IDENTIFIER_IN_QUERY = "sticker_pack_identifier";
    public static final String STICKER_PACK_NAME_IN_QUERY = "sticker_pack_name";
    public static final String STICKER_PACK_PUBLISHER_IN_QUERY = "sticker_pack_publisher";
    public static final String STICKER_PACK_ICON_IN_QUERY = "sticker_pack_icon";
    public static final String ANDROID_APP_DOWNLOAD_LINK_IN_QUERY = "android_play_store_link";
    public static final String IOS_APP_DOWNLOAD_LINK_IN_QUERY = "ios_app_store_link";
    public static final String PUBLISHER_EMAIL = "publisher_email";
    public static final String PUBLISHER_WEBSITE = "publisher_website";
    public static final String PRIVACY_POLICY_WEBSITE = "privacy_policy_website";
    public static final String LICENSE_AGREEMENT_WEBSITE = "license_agreement_website";
    public static final String IMAGE_DATA_VERSION = "image_data_version";
    public static final String AVOID_CACHE = "avoid_cache";
    public static final String ANIMATED_STICKER_PACK = "animated_sticker_pack";

    public static final String STICKER_FILE_NAME_IN_QUERY = "sticker_file_name";
    public static final String STICKER_PACK_ANIMATION_DATA_IN_QUERY = "sticker_pack_animation_data";
    public static final String STICKER_EMOJIS_IN_QUERY = "sticker_emojis";

    private static final int METADATA_CODE = 1;
    private static final int STICKERS_CODE = 2;
    private static final int STICKER_ASSET_CODE = 3;

    private static final UriMatcher MATCHER = new UriMatcher(UriMatcher.NO_MATCH);

    static {
        MATCHER.addURI(AUTHORITY, METADATA_PATH, METADATA_CODE);
        MATCHER.addURI(AUTHORITY, STICKERS_PATH + "/*", STICKERS_CODE);
        MATCHER.addURI(AUTHORITY, STICKERS_ASSET_PATH + "/*/*", STICKER_ASSET_CODE);
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
        if (code == METADATA_CODE) {
            return getPackForAllPacks();
        } else if (code == STICKERS_CODE) {
            String identifier = uri.getLastPathSegment();
            return getStickersForPack(identifier);
        } else {
            throw new IllegalArgumentException("Unknown URI: " + uri);
        }
    }

    private Cursor getPackForAllPacks() {
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
            ANIMATED_STICKER_PACK
        });

        List<StickerPack> packs = packManager.getPacks();
        for (StickerPack pack : packs) {
            MatrixCursor.RowBuilder builder = cursor.newRow();
            builder.add(pack.identifier);
            builder.add(pack.name);
            builder.add(pack.publisher);
            builder.add(pack.trayImageFile);
            builder.add(pack.androidPlayStoreLink);
            builder.add(pack.iosAppStoreLink);
            builder.add(pack.publisherEmail);
            builder.add(pack.publisherWebsite);
            builder.add(pack.privacyPolicyWebsite);
            builder.add(pack.licenseAgreementWebsite);
            builder.add(pack.imageDataVersion);
            builder.add(pack.avoidCache ? 1 : 0);
            builder.add(pack.animatedStickerPack ? 1 : 0);
        }
        return cursor;
    }

    private Cursor getStickersForPack(String identifier) {
        MatrixCursor cursor = new MatrixCursor(new String[]{
            STICKER_FILE_NAME_IN_QUERY,
            STICKER_PACK_ANIMATION_DATA_IN_QUERY,
            STICKER_EMOJIS_IN_QUERY
        });

        List<StickerPack> packs = packManager.getPacks();
        for (StickerPack pack : packs) {
            if (pack.identifier.equals(identifier)) {
                for (Sticker sticker : pack.stickers) {
                    MatrixCursor.RowBuilder builder = cursor.newRow();
                    builder.add(sticker.imageFileName);
                    builder.add(null);
                    JSONArray arr = new JSONArray();
                    for (String em : sticker.emojis) {
                        arr.put(em);
                    }
                    builder.add(arr.toString());
                }
                break;
            }
        }
        return cursor;
    }

    @Nullable
    @Override
    public AssetFileDescriptor openAssetFile(@NonNull Uri uri, @NonNull String mode) throws FileNotFoundException {
        int code = MATCHER.match(uri);
        if (code == STICKER_ASSET_CODE) {
            List<String> pathSegments = uri.getPathSegments();
            String identifier = pathSegments.get(pathSegments.size() - 2);
            String fileName = pathSegments.get(pathSegments.size() - 1);

            File packDir = packManager.getPackDir(identifier);
            File file = new File(packDir, fileName);

            if (file.exists()) {
                ParcelFileDescriptor pfd = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY);
                return new AssetFileDescriptor(pfd, 0, AssetFileDescriptor.UNKNOWN_LENGTH);
            }

            // Fallback: try opening from app assets if it's a starter asset
            try {
                AssetManager am = Objects.requireNonNull(getContext()).getAssets();
                return am.openFd(fileName);
            } catch (IOException e) {
                Log.e(TAG, "File not found in assets either: " + fileName);
                throw new FileNotFoundException("Cannot find " + fileName + " in pack or assets");
            }
        }
        throw new IllegalArgumentException("Invalid URI for openAssetFile: " + uri);
    }

    @Nullable
    @Override
    public String getType(@NonNull Uri uri) {
        int code = MATCHER.match(uri);
        switch (code) {
            case METADATA_CODE:
                return "vnd.android.cursor.dir/vnd." + AUTHORITY + "." + METADATA_PATH;
            case STICKERS_CODE:
                return "vnd.android.cursor.dir/vnd." + AUTHORITY + "." + STICKERS_PATH;
            case STICKER_ASSET_CODE:
                return "image/webp";
            default:
                throw new IllegalArgumentException("Unknown URI: " + uri);
        }
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

