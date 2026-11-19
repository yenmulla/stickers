package com.twitsticker.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.NotificationManager;
import android.content.Context;
import android.content.DialogInterface;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.text.TextUtils;
import android.util.Log;
import android.view.Menu;
import android.view.MenuItem;
import android.view.View;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.ProgressBar;
import android.widget.Toast;

import androidx.activity.EdgeToEdge;
import androidx.annotation.Nullable;
import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;
import androidx.appcompat.widget.Toolbar;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;

import com.google.android.gms.auth.api.signin.GoogleSignIn;
import com.google.android.gms.auth.api.signin.GoogleSignInAccount;
import com.google.android.gms.auth.api.signin.GoogleSignInClient;
import com.google.android.gms.auth.api.signin.GoogleSignInOptions;
import com.google.android.gms.common.api.ApiException;
import com.google.android.gms.tasks.Task;
import com.google.firebase.FirebaseApp;
import com.google.firebase.messaging.FirebaseMessaging;

import org.json.JSONObject;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class MainActivity extends AppCompatActivity {
    private static final String TAG = "MainActivity";
    public static final String SERVER_URL = "https://gifsticker.site";

    private static final int FILE_CHOOSER_REQUEST_CODE = 101;
    private static final int NOTIFICATION_PERMISSION_REQUEST_CODE = 102;
    private static final int GOOGLE_SIGN_IN_REQUEST_CODE = 103;

    private GoogleSignInClient googleSignInClient;

    private WebView webView;
    private SwipeRefreshLayout swipeRefresh;
    private ProgressBar progressBar;
    private StickerPackManager packManager;
    private WebAppInterface webAppInterface;

    private ValueCallback<Uri[]> fileUploadCallback;
    private String pendingSharedUrl = null;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        EdgeToEdge.enable(this);
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        Toolbar toolbar = findViewById(R.id.toolbar);
        setSupportActionBar(toolbar);
        if (getSupportActionBar() != null) {
            getSupportActionBar().setTitle("TwitSticker");
        }

        View mainLayout = findViewById(R.id.mainLayout);
        if (mainLayout != null) {
            ViewCompat.setOnApplyWindowInsetsListener(mainLayout, (v, windowInsets) -> {
                Insets systemBars = windowInsets.getInsets(
                        WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()
                );

                toolbar.setPadding(
                        systemBars.left,
                        systemBars.top,
                        systemBars.right,
                        0
                );

                v.setPadding(0, 0, 0, systemBars.bottom);

                return windowInsets;
            });
        }

        WindowInsetsControllerCompat insetsController = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        if (insetsController != null) {
            insetsController.setAppearanceLightStatusBars(false);
            insetsController.setAppearanceLightNavigationBars(false);
        }

        packManager = new StickerPackManager(this);
        webAppInterface = new WebAppInterface(this, packManager);

        progressBar = findViewById(R.id.progressBar);
        swipeRefresh = findViewById(R.id.swipeRefresh);
        webView = findViewById(R.id.webView);

        setupWebView();
        setupPushNotifications();
        handleIntent(getIntent());

        swipeRefresh.setOnRefreshListener(() -> webView.reload());
        swipeRefresh.setOnChildScrollUpCallback((parent, child) -> webView.getScrollY() > 0);
        webView.setOnScrollChangeListener((v, scrollX, scrollY, oldScrollX, oldScrollY) -> {
            swipeRefresh.setEnabled(scrollY == 0);
        });

        loadCurrentServer();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIntent(intent);
    }

    private void setupPushNotifications() {
        try {
            FirebaseApp.initializeApp(this);

            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            TwitStickerMessagingService.ensureNotificationChannel(nm);

            // Request POST_NOTIFICATIONS runtime permission on Android 13+ (API 33+)
            if (Build.VERSION.SDK_INT >= 33) {
                if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                        != PackageManager.PERMISSION_GRANTED) {
                    ActivityCompat.requestPermissions(
                            this,
                            new String[]{Manifest.permission.POST_NOTIFICATIONS},
                            NOTIFICATION_PERMISSION_REQUEST_CODE
                    );
                }
            }

            // Retrieve FCM Registration Token and subscribe to broadcast topics
            FirebaseMessaging.getInstance().getToken()
                    .addOnCompleteListener(task -> {
                        if (task.isSuccessful() && task.getResult() != null) {
                            Log.d(TAG, "FCM Registration Token: " + task.getResult());
                        } else {
                            Log.w(TAG, "Fetching FCM registration token failed", task.getException());
                        }
                    });

            FirebaseMessaging.getInstance().subscribeToTopic("all_users")
                    .addOnCompleteListener(task -> Log.d(TAG, "FCM topic 'all_users' subscribed: " + task.isSuccessful()));
            FirebaseMessaging.getInstance().subscribeToTopic("announcements")
                    .addOnCompleteListener(task -> Log.d(TAG, "FCM topic 'announcements' subscribed: " + task.isSuccessful()));
        } catch (Exception e) {
            Log.w(TAG, "FCM setup notice: " + e.getMessage());
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == NOTIFICATION_PERMISSION_REQUEST_CODE) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                Log.d(TAG, "POST_NOTIFICATIONS permission granted by user");
                NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
                TwitStickerMessagingService.ensureNotificationChannel(nm);
                FirebaseMessaging.getInstance().subscribeToTopic("all_users");
                FirebaseMessaging.getInstance().subscribeToTopic("announcements");
            }
        }
    }

    private void handleIntent(Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        String type = intent.getType();

        // Check if opened by tapping an FCM Push Notification carrying a URL / link extra
        Bundle extras = intent.getExtras();
        if (extras != null) {
            String notifUrl = extras.getString("notification_url");
            if (notifUrl == null) notifUrl = extras.getString("url");
            if (notifUrl == null) notifUrl = extras.getString("link");
            if (notifUrl != null && !notifUrl.trim().isEmpty()) {
                intent.removeExtra("notification_url");
                intent.removeExtra("url");
                intent.removeExtra("link");
                pendingSharedUrl = notifUrl.trim();
                injectSharedUrlIfReady();
                return;
            }
        }

        if (Intent.ACTION_SEND.equals(action) && type != null) {
            if ("text/plain".equals(type)) {
                String sharedText = intent.getStringExtra(Intent.EXTRA_TEXT);
                if (sharedText != null) {
                    String extractedUrl = extractUrlFromText(sharedText);
                    if (extractedUrl != null) {
                        pendingSharedUrl = extractedUrl;
                        injectSharedUrlIfReady();
                    }
                }
            }
        } else if (Intent.ACTION_VIEW.equals(action)) {
            Uri data = intent.getData();
            if (data != null) {
                if ("twitsticker".equalsIgnoreCase(data.getScheme()) &&
                    ("add".equalsIgnoreCase(data.getHost()) || data.getQueryParameter("stickerId") != null || data.getQueryParameter("url") != null)) {
                    String stickerId = data.getQueryParameter("stickerId");
                    String stickerUrl = data.getQueryParameter("url");
                    String packName = data.getQueryParameter("packName");
                    String author = data.getQueryParameter("author");
                    String emojis = data.getQueryParameter("emojis");
                    if (stickerUrl != null && !stickerUrl.isEmpty() && webAppInterface != null) {
                        webAppInterface.addStickerToWhatsApp(
                            stickerId != null ? stickerId : "sticker_" + System.currentTimeMillis(),
                            packName != null ? packName : "TwitSticker",
                            author != null ? author : "gifsticker.site",
                            stickerUrl,
                            emojis != null ? emojis : "[\"🔥\",\"✨\"]"
                        );
                        return;
                    }
                }
                pendingSharedUrl = data.toString();
                injectSharedUrlIfReady();
            }
        }
    }

    private String extractUrlFromText(String text) {
        Pattern pattern = Pattern.compile("https?://[\\w\\d:#@%/;$()~_?\\+-=\\\\\\.&]+", Pattern.CASE_INSENSITIVE);
        Matcher matcher = pattern.matcher(text);
        if (matcher.find()) {
            return matcher.group(0);
        }
        return text.trim();
    }

    private void injectSharedUrlIfReady() {
        if (pendingSharedUrl != null && webView != null) {
            String script = "if (window.handleSharedUrl) { window.handleSharedUrl('" + pendingSharedUrl + "'); } " +
                            "else { var el = document.getElementById('tweetUrlInput'); if (el) { el.value = '" + pendingSharedUrl + "'; var btn = document.getElementById('fetchBtn'); if(btn) btn.click(); } }";
            webView.evaluateJavascript(script, null);
            pendingSharedUrl = null;
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void setupWebView() {
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setUserAgentString(settings.getUserAgentString() + " TwitStickerApp/1.0.4");
        webView.clearCache(true);

        // Add JavaScript bridge for WhatsApp native sticker export
        webView.addJavascriptInterface(webAppInterface, "TwitStickerNative");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                progressBar.setVisibility(View.VISIBLE);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                progressBar.setVisibility(View.GONE);
                swipeRefresh.setRefreshing(false);
                injectSharedUrlIfReady();
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                super.onReceivedError(view, request, error);
                if (request.isForMainFrame()) {
                    progressBar.setVisibility(View.GONE);
                    swipeRefresh.setRefreshing(false);
                    showConnectionErrorDialog();
                }
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                progressBar.setProgress(newProgress);
            }

            @Override
            public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> filePathCallback, FileChooserParams fileChooserParams) {
                if (fileUploadCallback != null) {
                    fileUploadCallback.onReceiveValue(null);
                }
                fileUploadCallback = filePathCallback;

                Intent intent = fileChooserParams.createIntent();
                try {
                    startActivityForResult(intent, FILE_CHOOSER_REQUEST_CODE);
                } catch (Exception e) {
                    fileUploadCallback = null;
                    return false;
                }
                return true;
            }
        });
    }

    public String getServerBaseUrl() {
        return SERVER_URL;
    }

    private GoogleSignInClient getOrCreateGoogleSignInClient() {
        if (googleSignInClient != null) return googleSignInClient;

        int webClientIdRes = getResources().getIdentifier("default_web_client_id", "string", getPackageName());
        if (webClientIdRes == 0) {
            return null;
        }
        String webClientId = getString(webClientIdRes);
        if (TextUtils.isEmpty(webClientId)) {
            return null;
        }

        GoogleSignInOptions gso = new GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
                .requestIdToken(webClientId)
                .requestEmail()
                .build();
        googleSignInClient = GoogleSignIn.getClient(this, gso);
        return googleSignInClient;
    }

    public void launchNativeGoogleSignIn() {
        GoogleSignInClient client = getOrCreateGoogleSignInClient();
        if (client == null) {
            notifyWebGoogleSignInError("Google Sign-In is not configured in google-services.json yet (missing default_web_client_id).");
            return;
        }
        // Clear previous cached selection so Android always presents the clean 1-tap account picker
        client.signOut().addOnCompleteListener(this, task -> {
            Intent signInIntent = client.getSignInIntent();
            startActivityForResult(signInIntent, GOOGLE_SIGN_IN_REQUEST_CODE);
        });
    }

    public void signOutNativeGoogle() {
        GoogleSignInClient client = getOrCreateGoogleSignInClient();
        if (client != null) {
            client.signOut();
        }
    }

    private void notifyWebGoogleIdToken(String idToken) {
        if (webView == null) return;
        String js = "if (window.TwitPro && window.TwitPro.onNativeGoogleIdToken) { window.TwitPro.onNativeGoogleIdToken(" + JSONObject.quote(idToken) + "); }";
        webView.evaluateJavascript(js, null);
    }

    private void notifyWebGoogleSignInError(String message) {
        if (webView == null) return;
        String js = "if (window.TwitPro && window.TwitPro.onNativeGoogleSignInError) { window.TwitPro.onNativeGoogleSignInError(" + JSONObject.quote(message) + "); }";
        webView.evaluateJavascript(js, null);
    }

    private void loadCurrentServer() {
        webView.loadUrl(SERVER_URL);
    }

    private void showConnectionErrorDialog() {
        new AlertDialog.Builder(this)
            .setTitle("Connection Error")
            .setMessage("Cannot reach TwitSticker server at " + SERVER_URL + ".\nPlease check your internet connection and try again.")
            .setPositiveButton("Retry", (dialog, which) -> webView.reload())
            .setNegativeButton("Dismiss", null)
            .show();
    }

    @Override
    public boolean onCreateOptionsMenu(Menu menu) {
        getMenuInflater().inflate(R.menu.main_menu, menu);
        return true;
    }

    @Override
    public boolean onOptionsItemSelected(MenuItem item) {
        int id = item.getItemId();
        if (id == R.id.action_open_whatsapp_pack) {
            packManager.addPackToWhatsApp(this, "twitsticker_main");
            return true;
        } else if (id == R.id.action_refresh) {
            webView.reload();
            return true;
        }
        return super.onOptionsItemSelected(item);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, @Nullable Intent data) {
        super.onActivityResult(requestCode, resultCode, data);

        if (requestCode == FILE_CHOOSER_REQUEST_CODE) {
            if (fileUploadCallback != null) {
                Uri[] results = null;
                if (resultCode == RESULT_OK && data != null) {
                    if (data.getDataString() != null) {
                        results = new Uri[]{Uri.parse(data.getDataString())};
                    } else if (data.getClipData() != null) {
                        final int count = data.getClipData().getItemCount();
                        results = new Uri[count];
                        for (int i = 0; i < count; i++) {
                            results[i] = data.getClipData().getItemAt(i).getUri();
                        }
                    }
                }
                fileUploadCallback.onReceiveValue(results);
                fileUploadCallback = null;
            }
        } else if (requestCode == GOOGLE_SIGN_IN_REQUEST_CODE) {
            Task<GoogleSignInAccount> task = GoogleSignIn.getSignedInAccountFromIntent(data);
            try {
                GoogleSignInAccount account = task.getResult(ApiException.class);
                String idToken = account != null ? account.getIdToken() : null;
                if (idToken != null && !idToken.isEmpty()) {
                    Log.d(TAG, "Native Google Sign-In succeeded for: " + account.getEmail());
                    notifyWebGoogleIdToken(idToken);
                } else {
                    notifyWebGoogleSignInError("Could not retrieve Google ID token. Please try again.");
                }
            } catch (ApiException e) {
                Log.w(TAG, "Native Google Sign-In failed/cancelled, code=" + e.getStatusCode(), e);
                if (e.getStatusCode() == 12501) {
                    // User cancelled account picker
                    notifyWebGoogleSignInError("");
                } else {
                    notifyWebGoogleSignInError("Google Sign-In failed (code " + e.getStatusCode() + ").");
                }
            }
        } else if (requestCode == StickerPackManager.ADD_PACK_REQUEST_CODE) {
            if (resultCode == RESULT_OK) {
                Toast.makeText(this, "🎉 Sticker Pack successfully added to WhatsApp!", Toast.LENGTH_LONG).show();
            } else if (resultCode == RESULT_CANCELED && data != null) {
                String validationError = data.getStringExtra("validation_error");
                if (validationError != null) {
                    Log.e(TAG, "WhatsApp validation error: " + validationError);
                    Toast.makeText(this, "WhatsApp error: " + validationError, Toast.LENGTH_LONG).show();
                }
            }
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}

