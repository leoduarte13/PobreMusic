package com.pobremusic.app;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.text.TextUtils;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.*;
import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class MainActivity extends Activity {
    private static final String BACKEND_API = "https://ais-pre-scpvhniuyqfisqru6bsquo-19904035643.us-west1.run.app";

    private LinearLayout tracksContainer;
    private TextView statusText, nowPlayingTitle, nowPlayingArtist, countText;
    private EditText urlInput;
    private Button playPauseBtn;
    private WebView audioPlayerWebView;

    private final ExecutorService executor = Executors.newCachedThreadPool();
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    private final List<TrackInfo> trackList = new ArrayList<>();
    private final List<View> trackRowViews = new ArrayList<>();
    private int currentTrackIndex = -1;
    private boolean isPlaying = false;
    private boolean playerReady = false;
    private String pendingVideoId = null;

    private PowerManager.WakeLock wakeLock;

    static class TrackInfo {
        String name;
        String artist;
        String videoId;
        TrackInfo(String name, String artist) {
            this.name = name;
            this.artist = artist;
        }
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private TextView createText(String text, float sizeSp, int color) {
        TextView tv = new TextView(this);
        tv.setText(text);
        tv.setTextSize(sizeSp);
        tv.setTextColor(color);
        return tv;
    }

    private GradientDrawable createBackground(int color, int radiusDp) {
        GradientDrawable gd = new GradientDrawable();
        gd.setColor(color);
        gd.setCornerRadius(dp(radiusDp));
        return gd;
    }

    private LinearLayout.LayoutParams createLp(int w, int h) {
        return new LinearLayout.LayoutParams(w < 0 ? w : dp(w), h < 0 ? h : dp(h));
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        PowerManager powerManager = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (powerManager != null) {
            wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "ProbeMusic:PlaybackWakeLock");
        }

        // Request notification permission for Android 13+
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 101);
            }
        }

        buildUi();
        initAudioEngine();
    }

    private void acquireWakeLock() {
        if (wakeLock != null && !wakeLock.isHeld()) {
            try {
                wakeLock.acquire(12 * 60 * 60 * 1000L); // 12 hours max
            } catch (Exception ignored) {}
        }
    }

    private void releaseWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) {
            try {
                wakeLock.release();
            } catch (Exception ignored) {}
        }
    }

    private void buildUi() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.rgb(18, 18, 18));
        root.setPadding(dp(16), dp(16), dp(16), dp(8));

        // Header
        LinearLayout header = new LinearLayout(this);
        header.setGravity(Gravity.CENTER_VERTICAL);
        header.setOrientation(LinearLayout.HORIZONTAL);

        TextView logo = createText("♫", 22, Color.rgb(29, 185, 84));
        logo.setGravity(Gravity.CENTER);
        logo.setBackground(createBackground(Color.rgb(30, 30, 30), 12));
        header.addView(logo, createLp(46, 46));

        LinearLayout titles = new LinearLayout(this);
        titles.setOrientation(LinearLayout.VERTICAL);
        titles.setPadding(dp(12), 0, 0, 0);
        TextView appTitle = createText("Probe Music", 20, Color.WHITE);
        appTitle.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        titles.addView(appTitle, createLp(-1, -2));
        TextView appSubtitle = createText("Reprodutor com Reprodução em Segundo Plano", 12, Color.rgb(179, 179, 179));
        titles.addView(appSubtitle, createLp(-1, -2));
        header.addView(titles, new LinearLayout.LayoutParams(0, -2, 1));
        root.addView(header, createLp(-1, -2));

        // Spacer
        View spacer1 = new View(this);
        root.addView(spacer1, createLp(-1, 12));

        // Input Card
        LinearLayout inputCard = new LinearLayout(this);
        inputCard.setOrientation(LinearLayout.VERTICAL);
        inputCard.setBackground(createBackground(Color.rgb(28, 28, 28), 12));
        inputCard.setPadding(dp(12), dp(12), dp(12), dp(12));

        TextView sectionLabel = createText("COLE AQUI A PLAYLIST OU MÚSICA", 11, Color.rgb(29, 185, 84));
        sectionLabel.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        inputCard.addView(sectionLabel, createLp(-1, -2));

        urlInput = new EditText(this);
        urlInput.setHint("Link público do Spotify (playlist, álbum ou música)");
        urlInput.setHintTextColor(Color.rgb(130, 130, 130));
        urlInput.setTextColor(Color.WHITE);
        urlInput.setTextSize(14);
        urlInput.setSingleLine(true);
        urlInput.setPadding(dp(12), dp(10), dp(12), dp(10));
        urlInput.setBackground(createBackground(Color.rgb(40, 40, 40), 8));
        LinearLayout.LayoutParams inputLp = createLp(-1, 46);
        inputLp.topMargin = dp(8);
        inputCard.addView(urlInput, inputLp);

        Button importBtn = new Button(this);
        importBtn.setText("Importar Playlist");
        importBtn.setTextSize(14);
        importBtn.setTextColor(Color.WHITE);
        importBtn.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        importBtn.setAllCaps(false);
        importBtn.setBackground(createBackground(Color.rgb(29, 185, 84), 8));
        importBtn.setOnClickListener(v -> startImportPlaylist());
        LinearLayout.LayoutParams btnLp = createLp(-1, 44);
        btnLp.topMargin = dp(10);
        inputCard.addView(importBtn, btnLp);

        root.addView(inputCard, createLp(-1, -2));

        // Status bar
        LinearLayout statusRow = new LinearLayout(this);
        statusRow.setGravity(Gravity.CENTER_VERTICAL);
        statusRow.setPadding(0, dp(10), 0, dp(6));
        statusText = createText("Pronto para importar", 12, Color.rgb(179, 179, 179));
        statusText.setSingleLine(true);
        statusText.setEllipsize(TextUtils.TruncateAt.END);
        statusRow.addView(statusText, new LinearLayout.LayoutParams(0, -2, 1));
        countText = createText("0 músicas", 12, Color.rgb(140, 140, 140));
        statusRow.addView(countText, createLp(-2, -2));
        root.addView(statusRow, createLp(-1, -2));

        // Track List Scroll
        ScrollView scrollView = new ScrollView(this);
        scrollView.setFillViewport(true);
        tracksContainer = new LinearLayout(this);
        tracksContainer.setOrientation(LinearLayout.VERTICAL);
        tracksContainer.setPadding(0, 0, 0, dp(8));
        scrollView.addView(tracksContainer);
        root.addView(scrollView, new LinearLayout.LayoutParams(-1, 0, 1));

        // Bottom Player Bar
        LinearLayout playerBar = new LinearLayout(this);
        playerBar.setOrientation(LinearLayout.VERTICAL);
        playerBar.setBackground(createBackground(Color.rgb(24, 24, 24), 14));
        playerBar.setPadding(dp(14), dp(10), dp(14), dp(10));

        nowPlayingTitle = createText("Nenhuma música tocando", 14, Color.WHITE);
        nowPlayingTitle.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        nowPlayingTitle.setSingleLine(true);
        nowPlayingTitle.setEllipsize(TextUtils.TruncateAt.MARQUEE);
        playerBar.addView(nowPlayingTitle, createLp(-1, -2));

        nowPlayingArtist = createText("Toque em uma faixa para começar", 12, Color.rgb(179, 179, 179));
        nowPlayingArtist.setSingleLine(true);
        nowPlayingArtist.setEllipsize(TextUtils.TruncateAt.END);
        playerBar.addView(nowPlayingArtist, createLp(-1, -2));

        LinearLayout controls = new LinearLayout(this);
        controls.setGravity(Gravity.CENTER);
        controls.setPadding(0, dp(6), 0, 0);

        Button prevBtn = createControlButton("⏮");
        playPauseBtn = createControlButton("▶");
        playPauseBtn.setTextColor(Color.rgb(29, 185, 84));
        Button nextBtn = createControlButton("⏭");

        controls.addView(prevBtn, createLp(56, 44));
        controls.addView(playPauseBtn, createLp(72, 44));
        controls.addView(nextBtn, createLp(56, 44));
        playerBar.addView(controls, createLp(-1, -2));

        prevBtn.setOnClickListener(v -> playPreviousTrack());
        playPauseBtn.setOnClickListener(v -> togglePlayPause());
        nextBtn.setOnClickListener(v -> playNextTrack());

        root.addView(playerBar, createLp(-1, -2));

        // Background Audio Engine WebView
        audioPlayerWebView = new WebView(this);
        audioPlayerWebView.setVisibility(View.GONE);
        root.addView(audioPlayerWebView, new LinearLayout.LayoutParams(1, 1));

        setContentView(root);
    }

    private Button createControlButton(String text) {
        Button b = new Button(this);
        b.setText(text);
        b.setTextSize(18);
        b.setTextColor(Color.WHITE);
        b.setAllCaps(false);
        b.setBackground(createBackground(Color.rgb(36, 36, 36), 20));
        return b;
    }

    private void initAudioEngine() {
        WebSettings settings = audioPlayerWebView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setUserAgentString("Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36");

        audioPlayerWebView.setWebViewClient(new WebViewClient());
        audioPlayerWebView.setWebChromeClient(new WebChromeClient());

        audioPlayerWebView.addJavascriptInterface(new Object() {
            @JavascriptInterface
            public void onReady() {
                mainHandler.post(() -> {
                    playerReady = true;
                    if (pendingVideoId != null) {
                        String id = pendingVideoId;
                        pendingVideoId = null;
                        loadAndPlayVideoId(id);
                    }
                });
            }

            @JavascriptInterface
            public void onPlaying() {
                mainHandler.post(() -> {
                    isPlaying = true;
                    acquireWakeLock();
                    statusText.setText("▶ Reproduzindo (Segundo plano ativo)");
                    playPauseBtn.setText("⏸");
                    startPlaybackService();
                });
            }

            @JavascriptInterface
            public void onPaused() {
                mainHandler.post(() -> {
                    isPlaying = false;
                    releaseWakeLock();
                    statusText.setText("⏸ Pausado");
                    playPauseBtn.setText("▶");
                });
            }

            @JavascriptInterface
            public void onBuffering() {
                mainHandler.post(() -> statusText.setText("⏳ Carregando áudio..."));
            }

            @JavascriptInterface
            public void onEnded() {
                mainHandler.post(() -> playNextTrack());
            }

            @JavascriptInterface
            public void onError(int code) {
                mainHandler.post(() -> {
                    statusText.setText("Tentando próxima faixa...");
                    playNextTrack();
                });
            }
        }, "PobreBridge");

        String html = "<!DOCTYPE html><html><head><meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\"><style>body{margin:0;background:#000;}</style></head><body><div id=\"player\"></div><script>var tag=document.createElement('script');tag.src='https://www.youtube.com/iframe_api';var first=document.getElementsByTagName('script')[0];first.parentNode.insertBefore(tag,first);var player=null;function onYouTubeIframeAPIReady(){player=new YT.Player('player',{height:'100%',width:'100%',videoId:'dQw4w9WgXcQ',playerVars:{autoplay:0,controls:0,playsinline:1,rel:0,disablekb:1},events:{onReady:function(){if(window.PobreBridge)PobreBridge.onReady();},onStateChange:function(e){if(!window.PobreBridge)return;if(e.data===1)PobreBridge.onPlaying();else if(e.data===2)PobreBridge.onPaused();else if(e.data===3)PobreBridge.onBuffering();else if(e.data===0)PobreBridge.onEnded();},onError:function(e){if(window.PobreBridge)PobreBridge.onError(e.data);}}});}function playVideo(id){if(player&&player.loadVideoById){player.loadVideoById(id);player.playVideo();}}function pauseVideo(){if(player&&player.pauseVideo){player.pauseVideo();}}function resumeVideo(){if(player&&player.playVideo){player.playVideo();}}</script></body></html>";

        audioPlayerWebView.loadDataWithBaseURL("https://www.youtube.com", html, "text/html", "UTF-8", null);
    }

    private void startPlaybackService() {
        try {
            Intent serviceIntent = new Intent(this, PlaybackService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(serviceIntent);
            } else {
                startService(serviceIntent);
            }
        } catch (Exception ignored) {}
    }

    private void loadAndPlayVideoId(String videoId) {
        if (!playerReady) {
            pendingVideoId = videoId;
            return;
        }
        audioPlayerWebView.evaluateJavascript("playVideo('" + videoId + "');", null);
    }

    private void togglePlayPause() {
        if (currentTrackIndex < 0 && !trackList.isEmpty()) {
            playTrackByIndex(0);
            return;
        }
        if (isPlaying) {
            audioPlayerWebView.evaluateJavascript("pauseVideo();", null);
        } else {
            audioPlayerWebView.evaluateJavascript("resumeVideo();", null);
        }
    }

    private void playNextTrack() {
        if (trackList.isEmpty()) return;
        int next = currentTrackIndex + 1;
        if (next < trackList.size()) {
            playTrackByIndex(next);
        } else {
            statusText.setText("Fim da playlist");
            isPlaying = false;
            releaseWakeLock();
            playPauseBtn.setText("▶");
        }
    }

    private void playPreviousTrack() {
        if (trackList.isEmpty()) return;
        int prev = Math.max(0, currentTrackIndex - 1);
        playTrackByIndex(prev);
    }

    private void startImportPlaylist() {
        final String rawUrl = urlInput.getText().toString().trim();
        if (rawUrl.isEmpty()) {
            statusText.setText("Por favor, cole um link do Spotify.");
            return;
        }

        statusText.setText("Importando músicas do Spotify...");
        countText.setText("...");
        tracksContainer.removeAllViews();
        trackRowViews.clear();
        trackList.clear();
        currentTrackIndex = -1;

        executor.execute(() -> {
            try {
                String spotifyId = extractSpotifyId(rawUrl);
                List<TrackInfo> parsed = fetchSpotifyTracks(spotifyId, rawUrl);
                if (parsed.isEmpty()) {
                    throw new Exception("Nenhuma faixa encontrada na playlist.");
                }

                mainHandler.post(() -> {
                    trackList.addAll(parsed);
                    countText.setText(parsed.size() + " músicas");
                    statusText.setText("Playlist carregada! Toque em uma música para tocar.");
                    renderTrackRows();
                });
            } catch (Exception e) {
                mainHandler.post(() -> {
                    statusText.setText("Falha ao importar: " + e.getMessage());
                    countText.setText("0 músicas");
                });
            }
        });
    }

    private String extractSpotifyId(String url) {
        Pattern p = Pattern.compile("spotify\\.com/(?:intl-[^/]+/)?(playlist|album|track)/([A-Za-z0-9]+)");
        Matcher m = p.matcher(url);
        if (m.find()) return m.group(2);
        return url.split("\\?")[0].replaceAll("[^A-Za-z0-9]", "");
    }

    private List<TrackInfo> fetchSpotifyTracks(String spotifyId, String rawUrl) {
        List<TrackInfo> list = new ArrayList<>();

        // Method 1: Direct Spotify Embed scraping
        try {
            String embedUrl = "https://open.spotify.com/embed/playlist/" + spotifyId + "?utm_source=generator&theme=0";
            String html = httpGet(embedUrl, "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36");
            Matcher m = Pattern.compile("<script[^>]*id=[\"']__NEXT_DATA__[\"'][^>]*>([\\s\\S]*?)</script>").matcher(html);
            if (m.find()) {
                JSONObject root = new JSONObject(m.group(1));
                JSONObject state = root.optJSONObject("props")
                    .optJSONObject("pageProps")
                    .optJSONObject("state")
                    .optJSONObject("data")
                    .optJSONObject("entity");
                if (state != null) {
                    JSONArray items = state.optJSONArray("trackList");
                    if (items != null) {
                        for (int i = 0; i < items.length(); i++) {
                            JSONObject tr = items.getJSONObject(i);
                            String name = tr.optString("title", tr.optString("name", "Música"));
                            String artist = tr.optString("subtitle", tr.optString("artist", "Artista"));
                            list.add(new TrackInfo(name, artist));
                        }
                    }
                }
            }
        } catch (Exception ignored) {}

        if (!list.isEmpty()) return list;

        // Method 2: Server API endpoint fallback
        try {
            String apiUrl = BACKEND_API + "/api/public-playlist?url=" + URLEncoder.encode(rawUrl, "UTF-8");
            String response = httpGet(apiUrl, "PobreMusicAndroid/1.0");
            JSONObject obj = new JSONObject(response);
            if (obj.optBoolean("sucesso")) {
                JSONArray arr = obj.getJSONArray("faixas");
                for (int i = 0; i < arr.length(); i++) {
                    JSONObject tr = arr.getJSONObject(i);
                    String name = tr.optString("nome_musica", "Música");
                    String artist = tr.optString("nome_artista", "Artista");
                    list.add(new TrackInfo(name, artist));
                }
            }
        } catch (Exception ignored) {}

        return list;
    }

    private void renderTrackRows() {
        tracksContainer.removeAllViews();
        trackRowViews.clear();

        for (int i = 0; i < trackList.size(); i++) {
            final int index = i;
            final TrackInfo track = trackList.get(i);

            LinearLayout row = new LinearLayout(this);
            row.setOrientation(LinearLayout.HORIZONTAL);
            row.setGravity(Gravity.CENTER_VERTICAL);
            row.setPadding(dp(12), dp(10), dp(12), dp(10));
            row.setBackground(createBackground(Color.rgb(24, 24, 24), 8));

            TextView num = createText(String.valueOf(i + 1), 12, Color.rgb(130, 130, 130));
            num.setGravity(Gravity.CENTER);
            row.addView(num, createLp(28, -2));

            LinearLayout info = new LinearLayout(this);
            info.setOrientation(LinearLayout.VERTICAL);
            info.setPadding(dp(8), 0, dp(8), 0);

            TextView nameTv = createText(track.name, 14, Color.WHITE);
            nameTv.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
            nameTv.setSingleLine(true);
            nameTv.setEllipsize(TextUtils.TruncateAt.END);
            info.addView(nameTv, createLp(-1, -2));

            TextView artistTv = createText(track.artist, 12, Color.rgb(170, 170, 170));
            artistTv.setSingleLine(true);
            artistTv.setEllipsize(TextUtils.TruncateAt.END);
            info.addView(artistTv, createLp(-1, -2));

            row.addView(info, new LinearLayout.LayoutParams(0, -2, 1));

            TextView playIcon = createText("▶", 14, Color.rgb(29, 185, 84));
            row.addView(playIcon, createLp(-2, -2));

            LinearLayout.LayoutParams rowLp = createLp(-1, -2);
            rowLp.bottomMargin = dp(6);

            row.setOnClickListener(v -> playTrackByIndex(index));
            tracksContainer.addView(row, rowLp);
            trackRowViews.add(row);
        }
    }

    private void updateActiveRowVisuals(int activeIndex) {
        for (int i = 0; i < trackRowViews.size(); i++) {
            View row = trackRowViews.get(i);
            if (i == activeIndex) {
                row.setBackground(createBackground(Color.rgb(35, 60, 42), 8));
            } else {
                row.setBackground(createBackground(Color.rgb(24, 24, 24), 8));
            }
        }
    }

    private void playTrackByIndex(int index) {
        if (index < 0 || index >= trackList.size()) return;
        currentTrackIndex = index;
        TrackInfo track = trackList.get(index);

        updateActiveRowVisuals(index);
        nowPlayingTitle.setText(track.name);
        nowPlayingArtist.setText(track.artist);
        statusText.setText("🔍 Buscando áudio...");

        if (track.videoId != null && !track.videoId.isEmpty()) {
            loadAndPlayVideoId(track.videoId);
            return;
        }

        executor.execute(() -> {
            try {
                String videoId = searchVideoId(track.name, track.artist);
                if (videoId == null || videoId.isEmpty()) {
                    throw new Exception("Música não encontrada.");
                }
                track.videoId = videoId;

                mainHandler.post(() -> {
                    statusText.setText("▶ Carregando player...");
                    loadAndPlayVideoId(videoId);
                });
            } catch (Exception e) {
                mainHandler.post(() -> {
                    statusText.setText("Não foi possível carregar: " + e.getMessage());
                    playPauseBtn.setText("▶");
                });
            }
        });
    }

    private String searchVideoId(String trackName, String artistName) {
        String query = (trackName + " " + artistName).trim();

        // Step 1: Direct YouTube Search Scraping (Ultra fast and reliable)
        try {
            String searchUrl = "https://www.youtube.com/results?search_query=" + URLEncoder.encode(query, "UTF-8");
            String html = httpGet(searchUrl, "Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36");
            Matcher m = Pattern.compile("\"videoId\":\"([A-Za-z0-9_-]{11})\"").matcher(html);
            if (m.find()) {
                return m.group(1);
            }
        } catch (Exception ignored) {}

        // Step 2: Backend API Fallback
        try {
            String apiUrl = BACKEND_API + "/api/search?nome_musica=" + URLEncoder.encode(trackName, "UTF-8") + "&nome_artista=" + URLEncoder.encode(artistName, "UTF-8");
            String json = httpGet(apiUrl, "PobreMusicAndroid/1.0");
            JSONObject res = new JSONObject(json);
            if (res.optBoolean("sucesso")) {
                return res.optString("videoId", "");
            }
        } catch (Exception ignored) {}

        return "";
    }

    private String httpGet(String urlStr, String userAgent) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(urlStr).openConnection();
        conn.setConnectTimeout(8000);
        conn.setReadTimeout(12000);
        conn.setRequestProperty("User-Agent", userAgent);
        conn.setRequestProperty("Accept", "*/*");

        int code = conn.getResponseCode();
        InputStream is = code >= 400 ? conn.getErrorStream() : conn.getInputStream();
        if (is == null) throw new Exception("Sem resposta (HTTP " + code + ")");

        try (BufferedReader br = new BufferedReader(new InputStreamReader(is))) {
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = br.readLine()) != null) {
                sb.append(line);
            }
            if (code >= 400) throw new Exception("HTTP " + code);
            return sb.toString();
        } finally {
            conn.disconnect();
        }
    }

    @Override
    protected void onDestroy() {
        releaseWakeLock();
        executor.shutdownNow();
        if (audioPlayerWebView != null) {
            audioPlayerWebView.destroy();
        }
        super.onDestroy();
    }
}
