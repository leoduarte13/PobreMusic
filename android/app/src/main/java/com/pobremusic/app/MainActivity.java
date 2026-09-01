package com.pobremusic.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;
import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

public class MainActivity extends Activity {
    private static final String APP_URL = "https://ais-pre-scpvhniuyqfisqru6bsquo-19904035643.us-west1.run.app";
    private static final String LOCAL_URL = "file:///android_asset/www/index.html";
    private static final String CHANNEL_ID = "probe_music_notification_channel";
    private static final int NOTIFICATION_ID = 1001;

    private WebView webView;
    private PowerManager.WakeLock wakeLock;
    private NotificationManager notificationManager;
    private String currentTitle = "Probe Music";
    private String currentArtist = "Ouça e Baixe";
    private boolean isPlaying = false;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Styling: Set dark status bar & navigation bar to match PC app theme
        Window window = getWindow();
        window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
        window.setStatusBarColor(Color.parseColor("#0B0914"));
        window.setNavigationBarColor(Color.parseColor("#070414"));
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            View decor = window.getDecorView();
            decor.setSystemUiVisibility(decor.getSystemUiVisibility() & ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
        }

        // Initialize WakeLock
        PowerManager powerManager = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (powerManager != null) {
            wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "ProbeMusic:WakeLock");
            wakeLock.setReferenceCounted(false);
        }

        notificationManager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        createNotificationChannel();

        // Check Notification Permission on Android 13+
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, android.Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(this,
                        new String[]{android.Manifest.permission.POST_NOTIFICATIONS}, 101);
            }
        }

        // Create Container & WebView
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor("#0B0914"));

        webView = new WebView(this);
        webView.setBackgroundColor(Color.parseColor("#0B0914"));
        root.addView(webView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
        ));
        setContentView(root);

        // Configure WebSettings
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        }

        // Add Chrome mobile User-Agent for YouTube player compatibility
        settings.setUserAgentString("Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36 ProbeMusic/2.0");

        // Add JS Interface Bridge
        webView.addJavascriptInterface(new AndroidBridge(), "AndroidBridge");

        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    // If remote fails, fallback to local asset bundle
                    view.loadUrl(LOCAL_URL);
                }
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
            }
        });

        // Load Application
        webView.loadUrl(APP_URL);
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Probe Music Reprodução",
                    NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Controles de reprodução de música em segundo plano");
            channel.setShowBadge(false);
            if (notificationManager != null) {
                notificationManager.createNotificationChannel(channel);
            }
        }
    }

    private void updateNotification(String title, String artist, boolean playing) {
        if (notificationManager == null) return;

        Intent intent = new Intent(this, MainActivity.class);
        PendingIntent pendingIntent = PendingIntent.getActivity(
                this, 0, intent,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_launcher)
                .setContentTitle(title)
                .setContentText(artist)
                .setSubText("Probe Music")
                .setContentIntent(pendingIntent)
                .setOngoing(playing)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC);

        try {
            Notification notification = builder.build();
            notificationManager.notify(NOTIFICATION_ID, notification);
        } catch (Exception ignored) {}
    }

    public class AndroidBridge {
        @JavascriptInterface
        public void updateTrackInfo(String title, String artist, String coverUrl) {
            runOnUiThread(() -> {
                currentTitle = (title != null && !title.isEmpty()) ? title : "Probe Music";
                currentArtist = (artist != null && !artist.isEmpty()) ? artist : "Ouça e Baixe";
                isPlaying = true;
                if (wakeLock != null && !wakeLock.isHeld()) {
                    wakeLock.acquire(12 * 60 * 60 * 1000L); // 12 hours max
                }
                updateNotification(currentTitle, currentArtist, true);
            });
        }

        @JavascriptInterface
        public void onPlaybackStateChanged(boolean playing) {
            runOnUiThread(() -> {
                isPlaying = playing;
                if (playing) {
                    if (wakeLock != null && !wakeLock.isHeld()) {
                        wakeLock.acquire(12 * 60 * 60 * 1000L);
                    }
                } else {
                    if (wakeLock != null && wakeLock.isHeld()) {
                        wakeLock.release();
                    }
                }
                updateNotification(currentTitle, currentArtist, playing);
            });
        }

        @JavascriptInterface
        public void showToast(String message) {
            runOnUiThread(() -> {
                if (message != null && !message.isEmpty()) {
                    Toast.makeText(MainActivity.this, message, Toast.LENGTH_SHORT).show();
                }
            });
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            // Minimize instead of destroying to keep background music active
            moveTaskToBack(true);
        }
    }

    @Override
    protected void onDestroy() {
        if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
        }
        if (notificationManager != null) {
            notificationManager.cancel(NOTIFICATION_ID);
        }
        if (webView != null) {
            webView.destroy();
        }
        super.onDestroy();
    }
}
