package com.pobremusic.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.util.Log;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;
import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import androidx.webkit.WebViewAssetLoader;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Iterator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class MainActivity extends Activity {
    private static final String TAG = "ProbeMusic";
    private static final String APP_URL = "https://appassets.androidplatform.net/index.html";
    private static final String CHANNEL_ID = "probe_music_notification_channel";
    private static final int NOTIFICATION_ID = 1001;

    private WebView webView;
    private PowerManager.WakeLock wakeLock;
    private NotificationManager notificationManager;
    private WebViewAssetLoader assetLoader;
    private final ExecutorService executor = Executors.newFixedThreadPool(4);

    private String currentTitle = "Probe Music";
    private String currentArtist = "Ouça e Baixe";
    private boolean isPlaying = false;

    private static final String[] PIPED_INSTANCES = new String[]{
            "https://pipedapi.kavin.rocks",
            "https://pipedapi.leptons.xyz",
            "https://pipedapi.adminforge.de",
            "https://api.piped.yt",
            "https://piped-api.privacy.com.de",
            "https://pipedapi.drgns.space",
            "https://pipedapi.reallyaweso.me",
            "https://api.piped.private.coffee"
    };

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Dark theme system bar styling
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

        // Notification permission request for Android 13+
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, android.Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(this,
                        new String[]{android.Manifest.permission.POST_NOTIFICATIONS}, 101);
            }
        }

        // Setup WebViewAssetLoader to serve bundled web assets over HTTPS
        assetLoader = new WebViewAssetLoader.Builder()
                .setDomain("appassets.androidplatform.net")
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .addPathHandler("/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor("#0B0914"));

        webView = new WebView(this);
        webView.setBackgroundColor(Color.parseColor("#0B0914"));
        root.addView(webView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
        ));
        setContentView(root);

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

        settings.setUserAgentString("Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36 ProbeMusic/2.0");

        webView.addJavascriptInterface(new AndroidBridge(), "AndroidBridge");
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(android.webkit.ConsoleMessage consoleMessage) {
                Log.d("ProbeMusicJS", consoleMessage.message() + " -- Line " + consoleMessage.lineNumber() + " of " + consoleMessage.sourceId());
                return true;
            }
        });

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
                Log.e(TAG, "WebView load error: " + description + " URL: " + failingUrl);
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String path = uri.getPath();
                if (path == null) path = "/";

                // 1. Intercept API calls and process natively on Android
                if (path.startsWith("/api/search")) {
                    String song = uri.getQueryParameter("nome_musica");
                    String artist = uri.getQueryParameter("nome_artista");
                    String json = handleNativeSearch(song, artist);
                    return createJsonResponse(json);
                }

                if (path.startsWith("/api/public-playlist")) {
                    String spotifyUrl = uri.getQueryParameter("url");
                    String json = handleNativeSpotifyPlaylist(spotifyUrl);
                    return createJsonResponse(json);
                }

                if (path.startsWith("/api/health")) {
                    return createJsonResponse("{\"status\":\"ok\",\"platform\":\"android\"}");
                }

                // 2. Try WebViewAssetLoader
                WebResourceResponse assetResponse = assetLoader.shouldInterceptRequest(uri);
                if (assetResponse != null) {
                    return assetResponse;
                }

                // 3. Fallback: Direct APK asset streaming for all asset structures
                try {
                    String clean = path.startsWith("/") ? path.substring(1) : path;
                    if (clean.isEmpty() || clean.equals("index.html")) clean = "index.html";

                    String[] lookupPaths = new String[]{
                            clean,
                            clean.replace("assets/", ""),
                            "assets/" + clean,
                            "www/" + clean,
                            clean.replace("www/", "")
                    };

                    for (String candidate : lookupPaths) {
                        try {
                            InputStream is = getAssets().open(candidate);
                            String mime = getMimeType(candidate);
                            WebResourceResponse res = new WebResourceResponse(mime, "UTF-8", is);
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                                java.util.Map<String, String> headers = new java.util.HashMap<>();
                                headers.put("Access-Control-Allow-Origin", "*");
                                headers.put("Cache-Control", "no-cache");
                                res.setResponseHeaders(headers);
                            }
                            return res;
                        } catch (Exception ignored) {}
                    }
                } catch (Exception e) {
                    Log.e(TAG, "Asset fallback error: " + e.getMessage());
                }

                return super.shouldInterceptRequest(view, request);
            }
        });

        // Load the local HTTPS URL
        webView.loadUrl(APP_URL);
    }

    private String getMimeType(String path) {
        if (path.endsWith(".html")) return "text/html";
        if (path.endsWith(".js") || path.endsWith(".mjs")) return "application/javascript";
        if (path.endsWith(".css")) return "text/css";
        if (path.endsWith(".png")) return "image/png";
        if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
        if (path.endsWith(".svg")) return "image/svg+xml";
        if (path.endsWith(".json")) return "application/json";
        if (path.endsWith(".wasm")) return "application/wasm";
        return "application/octet-stream";
    }

    private WebResourceResponse createJsonResponse(String json) {
        byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
        InputStream stream = new ByteArrayInputStream(bytes);
        WebResourceResponse response = new WebResourceResponse("application/json", "UTF-8", stream);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            java.util.Map<String, String> headers = new java.util.HashMap<>();
            headers.put("Access-Control-Allow-Origin", "*");
            headers.put("Cache-Control", "no-cache, no-store");
            response.setResponseHeaders(headers);
        }
        return response;
    }

    // Native YouTube search implementation in Java
    private String handleNativeSearch(String song, String artist) {
        String query = ((song != null ? song : "") + " " + (artist != null ? artist : "")).trim();
        if (query.isEmpty()) {
            return "{\"sucesso\":false,\"error\":\"Nome da música não informado.\"}";
        }

        try {
            // Method 1: YouTube Search Scraping
            String searchUrl = "https://www.youtube.com/results?search_query=" + URLEncoder.encode(query, "UTF-8");
            HttpURLConnection conn = (HttpURLConnection) new URL(searchUrl).openConnection();
            conn.setRequestMethod("GET");
            conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36");
            conn.setRequestProperty("Accept-Language", "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7");
            conn.setConnectTimeout(6000);
            conn.setReadTimeout(6000);

            if (conn.getResponseCode() == 200) {
                BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8));
                StringBuilder sb = new StringBuilder();
                String line;
                while ((line = reader.readLine()) != null) {
                    sb.append(line);
                }
                reader.close();
                String html = sb.toString();

                Pattern p = Pattern.compile("\"videoId\":\"([A-Za-z0-9_-]{11})\"");
                Matcher m = p.matcher(html);
                Set<String> ids = new LinkedHashSet<>();
                while (m.find()) {
                    ids.add(m.group(1));
                }

                if (!ids.isEmpty()) {
                    String bestId = ids.iterator().next();
                    JSONObject res = new JSONObject();
                    res.put("sucesso", true);
                    res.put("videoId", bestId);
                    res.put("titulo", query);
                    res.put("canal", artist != null ? artist : "YouTube");
                    res.put("duracao", 210);
                    res.put("capa", "https://i.ytimg.com/vi/" + bestId + "/hqdefault.jpg");
                    res.put("instance", "youtube_native");
                    return res.toString();
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "Search scraping error: " + e.getMessage());
        }

        // Method 2: Piped fallback
        for (String instance : PIPED_INSTANCES) {
            try {
                String u = instance + "/search?q=" + URLEncoder.encode(query, "UTF-8") + "&filter=music_songs";
                HttpURLConnection conn = (HttpURLConnection) new URL(u).openConnection();
                conn.setRequestProperty("User-Agent", "ProbeMusic/2.0");
                conn.setConnectTimeout(4000);
                conn.setReadTimeout(4000);
                if (conn.getResponseCode() == 200) {
                    BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8));
                    StringBuilder sb = new StringBuilder();
                    String line;
                    while ((line = reader.readLine()) != null) sb.append(line);
                    reader.close();

                    JSONObject data = new JSONObject(sb.toString());
                    JSONArray items = data.optJSONArray("items");
                    if (items != null && items.length() > 0) {
                        for (int i = 0; i < items.length(); i++) {
                            JSONObject item = items.getJSONObject(i);
                            String rawUrl = item.optString("url", item.optString("id", ""));
                            String videoId = extractVideoId(rawUrl);
                            if (!videoId.isEmpty()) {
                                JSONObject res = new JSONObject();
                                res.put("sucesso", true);
                                res.put("videoId", videoId);
                                res.put("titulo", item.optString("title", query));
                                res.put("canal", item.optString("uploaderName", "YouTube"));
                                res.put("duracao", item.optInt("duration", 210));
                                res.put("capa", item.optString("thumbnail", "https://i.ytimg.com/vi/" + videoId + "/hqdefault.jpg"));
                                res.put("instance", instance);
                                return res.toString();
                            }
                        }
                    }
                }
            } catch (Exception ignored) {}
        }

        return "{\"sucesso\":false,\"error\":\"Música não encontrada nos provedores de áudio.\"}";
    }

    // Native Spotify Playlist Extraction in Java
    private String handleNativeSpotifyPlaylist(String rawUrl) {
        if (rawUrl == null || rawUrl.trim().isEmpty()) {
            return "{\"sucesso\":false,\"error\":\"Link do Spotify não informado.\"}";
        }

        String type = "playlist";
        String id = "";

        Pattern p = Pattern.compile("(?:spotify\\.com/(?:intl-[^/]+/)?)(playlist|album|track)/([A-Za-z0-9]+)", Pattern.CASE_INSENSITIVE);
        Matcher m = p.matcher(rawUrl);
        if (m.find()) {
            type = m.group(1).toLowerCase();
            id = m.group(2);
        } else {
            String clean = rawUrl.split("\\?")[0];
            String[] parts = clean.split("/");
            if (parts.length > 0) {
                id = parts[parts.length - 1].replaceAll("[^A-Za-z0-9]", "");
            }
        }

        if (id.isEmpty()) {
            return "{\"sucesso\":false,\"error\":\"Link do Spotify inválido.\"}";
        }

        try {
            String embedUrl = "https://open.spotify.com/embed/" + type + "/" + id + "?utm_source=generator&theme=0";
            HttpURLConnection conn = (HttpURLConnection) new URL(embedUrl).openConnection();
            conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36");
            conn.setRequestProperty("Accept", "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8");
            conn.setConnectTimeout(8000);
            conn.setReadTimeout(8000);

            if (conn.getResponseCode() == 200) {
                BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8));
                StringBuilder sb = new StringBuilder();
                String line;
                while ((line = reader.readLine()) != null) sb.append(line);
                reader.close();
                String html = sb.toString();

                Pattern nextDataPattern = Pattern.compile("<script[^>]*id=[\"']__NEXT_DATA__[\"'][^>]*>([\\s\\S]*?)</script>", Pattern.CASE_INSENSITIVE);
                Matcher nextDataMatcher = nextDataPattern.matcher(html);

                JSONObject entity = null;
                JSONArray trackList = null;

                if (nextDataMatcher.find()) {
                    try {
                        JSONObject nextData = new JSONObject(nextDataMatcher.group(1));
                        JSONObject props = nextData.optJSONObject("props");
                        if (props != null) {
                            JSONObject pageProps = props.optJSONObject("pageProps");
                            if (pageProps != null) {
                                JSONObject state = pageProps.optJSONObject("state");
                                if (state != null) {
                                    JSONObject data = state.optJSONObject("data");
                                    if (data != null) {
                                        entity = data.optJSONObject("entity");
                                        if (entity != null) {
                                            trackList = entity.optJSONArray("trackList");
                                            if (trackList == null) {
                                                JSONObject tr = entity.optJSONObject("tracks");
                                                if (tr != null) trackList = tr.optJSONArray("items");
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    } catch (Exception ignored) {}
                }

                String playlistName = entity != null ? entity.optString("name", entity.optString("title", "Playlist do Spotify")) : "Playlist do Spotify";
                String coverUrl = "";
                if (entity != null) {
                    JSONObject coverArt = entity.optJSONObject("coverArt");
                    if (coverArt != null) {
                        JSONArray sources = coverArt.optJSONArray("sources");
                        if (sources != null && sources.length() > 0) {
                            coverUrl = sources.getJSONObject(0).optString("url", "");
                        }
                    }
                }

                JSONArray faixas = new JSONArray();
                if (trackList != null) {
                    for (int i = 0; i < trackList.length(); i++) {
                        JSONObject item = trackList.optJSONObject(i);
                        if (item == null) continue;
                        JSONObject tr = item.optJSONObject("track");
                        if (tr == null) tr = item;

                        String songName = tr.optString("name", tr.optString("title", item.optString("title", "")));
                        if (songName.isEmpty()) continue;

                        String artistName = tr.optString("artist", tr.optString("subtitle", item.optString("subtitle", "Artista Desconhecido")));
                        JSONArray artistsArr = tr.optJSONArray("artists");
                        if (artistsArr != null && artistsArr.length() > 0) {
                            StringBuilder ab = new StringBuilder();
                            for (int a = 0; a < artistsArr.length(); a++) {
                                JSONObject artObj = artistsArr.optJSONObject(a);
                                String n = artObj != null ? artObj.optString("name", "") : artistsArr.optString(a, "");
                                if (!n.isEmpty()) {
                                    if (ab.length() > 0) ab.append(", ");
                                    ab.append(n);
                                }
                            }
                            if (ab.length() > 0) artistName = ab.toString();
                        }

                        long durationMs = tr.optLong("duration_ms", tr.optLong("duration", item.optLong("duration_ms", 0)));
                        if (durationMs > 0 && durationMs < 1000) durationMs *= 1000;

                        String trackCover = coverUrl;
                        JSONObject trCoverArt = tr.optJSONObject("coverArt");
                        if (trCoverArt != null) {
                            JSONArray sources = trCoverArt.optJSONArray("sources");
                            if (sources != null && sources.length() > 0) {
                                trackCover = sources.getJSONObject(0).optString("url", coverUrl);
                            }
                        }

                        JSONObject faixa = new JSONObject();
                        faixa.put("nome_musica", songName);
                        faixa.put("nome_artista", artistName);
                        faixa.put("album", playlistName);
                        faixa.put("duracao_ms", durationMs);
                        faixa.put("capa", trackCover);
                        faixa.put("spotify_id", tr.optString("id", ""));
                        faixas.put(faixa);
                    }
                }

                JSONObject result = new JSONObject();
                result.put("sucesso", true);
                result.put("nome_playlist", playlistName);
                result.put("capa_playlist", coverUrl);
                result.put("total_faixas", faixas.length());
                result.put("faixas", faixas);
                return result.toString();
            }
        } catch (Exception e) {
            Log.e(TAG, "Spotify extraction error: " + e.getMessage());
        }

        return "{\"sucesso\":false,\"error\":\"Não foi possível extrair faixas desta playlist.\"}";
    }

    private static String extractVideoId(String value) {
        if (value == null) return "";
        Pattern p = Pattern.compile("(?:v=|/watch/|/videos/|^)([A-Za-z0-9_-]{11})");
        Matcher m = p.matcher(value);
        if (m.find()) return m.group(1);
        return "";
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
            notificationManager.notify(NOTIFICATION_ID, builder.build());
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
            // Minimize instead of quitting to keep background playback going
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
        executor.shutdown();
        super.onDestroy();
    }
}
