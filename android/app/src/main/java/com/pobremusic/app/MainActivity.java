package com.pobremusic.app;

import android.app.Activity;
import android.content.ComponentName;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.TextUtils;
import android.view.Gravity;
import android.view.View;
import android.widget.*;
import androidx.core.content.ContextCompat;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.session.MediaController;
import androidx.media3.session.SessionToken;
import com.google.common.util.concurrent.ListenableFuture;
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
    private static final String CLOUD_RUN_API = "https://ais-pre-scpvhniuyqfisqru6bsquo-19904035643.us-west1.run.app";
    private static final String[] PIPED_INSTANCES = {
        "https://pipedapi.kavin.rocks",
        "https://pipedapi.leptons.xyz",
        "https://pipedapi.adminforge.de",
        "https://api.piped.yt",
        "https://piped-api.privacy.com.de",
        "https://pipedapi.drgns.space",
        "https://pipedapi.owo.si"
    };

    private LinearLayout tracksContainer;
    private TextView statusText, nowPlayingTitle, nowPlayingArtist, countText;
    private EditText urlInput;
    private Button playPauseBtn;
    private ListenableFuture<MediaController> controllerFuture;
    private MediaController mediaController;
    private final ExecutorService executor = Executors.newCachedThreadPool();
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    private final List<TrackInfo> trackList = new ArrayList<>();
    private int currentTrackIndex = -1;

    static class TrackInfo {
        String name;
        String artist;
        String coverUrl;
        long durationMs;
        TrackInfo(String name, String artist, String coverUrl, long durationMs) {
            this.name = name;
            this.artist = artist;
            this.coverUrl = coverUrl;
            this.durationMs = durationMs;
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
        buildUi();
        initPlayerController();
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

        TextView logo = createText("♫", 24, Color.rgb(29, 185, 84));
        logo.setGravity(Gravity.CENTER);
        logo.setBackground(createBackground(Color.rgb(30, 30, 30), 12));
        header.addView(logo, createLp(48, 48));

        LinearLayout titles = new LinearLayout(this);
        titles.setOrientation(LinearLayout.VERTICAL);
        titles.setPadding(dp(12), 0, 0, 0);
        TextView appTitle = createText("PobreMusic", 22, Color.WHITE);
        appTitle.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        titles.addView(appTitle, createLp(-1, -2));
        TextView appSubtitle = createText("Reprodutor de Playlists do Spotify", 13, Color.rgb(179, 179, 179));
        titles.addView(appSubtitle, createLp(-1, -2));
        header.addView(titles, new LinearLayout.LayoutParams(0, -2, 1));
        root.addView(header, createLp(-1, -2));

        // Spacer
        View spacer1 = new View(this);
        root.addView(spacer1, createLp(-1, 14));

        // Input Card
        LinearLayout inputCard = new LinearLayout(this);
        inputCard.setOrientation(LinearLayout.VERTICAL);
        inputCard.setBackground(createBackground(Color.rgb(28, 28, 28), 12));
        inputCard.setPadding(dp(12), dp(12), dp(12), dp(12));

        TextView sectionLabel = createText("COLE AQUI A PLAYLIST", 11, Color.rgb(29, 185, 84));
        sectionLabel.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        inputCard.addView(sectionLabel, createLp(-1, -2));

        urlInput = new EditText(this);
        urlInput.setHint("Link público do Spotify (playlist ou álbum)");
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

    private void initPlayerController() {
        ComponentName component = new ComponentName(this, PlaybackService.class);
        SessionToken token = new SessionToken(this, component);
        controllerFuture = new MediaController.Builder(this, token).buildAsync();
        controllerFuture.addListener(() -> {
            try {
                mediaController = controllerFuture.get();
                mediaController.setRepeatMode(Player.REPEAT_MODE_OFF);
                mediaController.addListener(new Player.Listener() {
                    @Override
                    public void onPlaybackStateChanged(int playbackState) {
                        mainHandler.post(() -> {
                            if (playbackState == Player.STATE_ENDED) {
                                playNextTrack();
                            } else if (playbackState == Player.STATE_READY) {
                                updatePlayPauseButton();
                            }
                        });
                    }

                    @Override
                    public void onIsPlayingChanged(boolean isPlaying) {
                        mainHandler.post(() -> updatePlayPauseButton());
                    }

                    @Override
                    public void onPlayerError(PlaybackException error) {
                        mainHandler.post(() -> {
                            statusText.setText("Erro ao reproduzir áudio: " + error.getErrorCodeName());
                            updatePlayPauseButton();
                        });
                    }
                });
            } catch (Exception e) {
                mainHandler.post(() -> statusText.setText("Erro ao inicializar serviço de áudio."));
            }
        }, ContextCompat.getMainExecutor(this));
    }

    private void updatePlayPauseButton() {
        if (mediaController != null && mediaController.isPlaying()) {
            playPauseBtn.setText("⏸");
            statusText.setText("▶ Reproduzindo");
        } else {
            playPauseBtn.setText("▶");
        }
    }

    private void togglePlayPause() {
        if (mediaController == null) return;
        if (mediaController.isPlaying()) {
            mediaController.pause();
        } else {
            if (mediaController.getPlaybackState() != Player.STATE_IDLE) {
                mediaController.play();
            } else if (currentTrackIndex >= 0 && currentTrackIndex < trackList.size()) {
                playTrackByIndex(currentTrackIndex);
            } else if (!trackList.isEmpty()) {
                playTrackByIndex(0);
            }
        }
        updatePlayPauseButton();
    }

    private void playNextTrack() {
        if (trackList.isEmpty()) return;
        int next = currentTrackIndex + 1;
        if (next < trackList.size()) {
            playTrackByIndex(next);
        } else {
            currentTrackIndex = -1;
            statusText.setText("Fim da playlist");
            updatePlayPauseButton();
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
                    statusText.setText("Playlist carregada! Toque em uma música.");
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

        // Attempt 1: Direct Spotify Embed scraping
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
                            long dur = tr.optLong("duration", 180000);
                            list.add(new TrackInfo(name, artist, "", dur));
                        }
                    }
                }
            }
        } catch (Exception ignored) {}

        if (!list.isEmpty()) return list;

        // Attempt 2: Server API endpoint fallback
        try {
            String apiUrl = CLOUD_RUN_API + "/api/public-playlist?url=" + URLEncoder.encode(rawUrl, "UTF-8");
            String response = httpGet(apiUrl, "PobreMusicAndroid/1.0");
            JSONObject obj = new JSONObject(response);
            if (obj.optBoolean("sucesso")) {
                JSONArray arr = obj.getJSONArray("faixas");
                for (int i = 0; i < arr.length(); i++) {
                    JSONObject tr = arr.getJSONObject(i);
                    String name = tr.optString("nome_musica", "Música");
                    String artist = tr.optString("nome_artista", "Artista");
                    String cover = tr.optString("capa", "");
                    long dur = tr.optLong("duracao_ms", 180000);
                    list.add(new TrackInfo(name, artist, cover, dur));
                }
            }
        } catch (Exception ignored) {}

        return list;
    }

    private void renderTrackRows() {
        tracksContainer.removeAllViews();
        for (int i = 0; i < trackList.size(); i++) {
            final int index = i;
            final TrackInfo track = trackList.get(i);

            LinearLayout row = new LinearLayout(this);
            row.setOrientation(LinearLayout.HORIZONTAL);
            row.setGravity(Gravity.CENTER_VERTICAL);
            row.setPadding(dp(12), dp(8), dp(12), dp(8));
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
        }
    }

    private void playTrackByIndex(int index) {
        if (index < 0 || index >= trackList.size()) return;
        currentTrackIndex = index;
        TrackInfo track = trackList.get(index);

        nowPlayingTitle.setText(track.name);
        nowPlayingArtist.setText(track.artist);
        statusText.setText("🔍 Buscando áudio para: " + track.name);

        executor.execute(() -> {
            try {
                String audioUrl = resolveAudioStreamUrl(track.name, track.artist);
                if (audioUrl == null || audioUrl.isEmpty()) {
                    throw new Exception("Não foi possível obter áudio dos servidores.");
                }

                mainHandler.post(() -> {
                    startPlayback(audioUrl, track.name, track.artist);
                });
            } catch (Exception e) {
                mainHandler.post(() -> {
                    statusText.setText("Erro ao obter música: " + e.getMessage());
                    updatePlayPauseButton();
                });
            }
        });
    }

    private String resolveAudioStreamUrl(String trackName, String artistName) {
        String query = trackName + " " + artistName;

        // Method 1: Piped Instances Direct Query
        for (String instance : PIPED_INSTANCES) {
            try {
                String searchUrl = instance + "/search?q=" + URLEncoder.encode(query, "UTF-8") + "&filter=music_songs";
                String json = httpGet(searchUrl, "PobreMusicAndroid/1.0");
                JSONObject searchResult = new JSONObject(json);
                JSONArray items = searchResult.optJSONArray("items");
                if (items != null && items.length() > 0) {
                    JSONObject firstItem = items.getJSONObject(0);
                    String videoId = extractVideoId(firstItem.optString("url", firstItem.optString("id", "")));
                    if (!videoId.isEmpty()) {
                        String streamUrl = instance + "/streams/" + videoId;
                        String streamJson = httpGet(streamUrl, "PobreMusicAndroid/1.0");
                        JSONObject streamObj = new JSONObject(streamJson);
                        JSONArray audioStreams = streamObj.optJSONArray("audioStreams");
                        if (audioStreams != null && audioStreams.length() > 0) {
                            // Find the best audio stream
                            for (int i = 0; i < audioStreams.length(); i++) {
                                JSONObject st = audioStreams.getJSONObject(i);
                                String u = st.optString("url", "");
                                if (u.startsWith("http")) {
                                    return u;
                                }
                            }
                        }
                    }
                }
            } catch (Exception ignored) {}
        }

        // Method 2: Cloud Run Backend Proxy
        try {
            String searchUrl = CLOUD_RUN_API + "/api/search?nome_musica=" + URLEncoder.encode(trackName, "UTF-8") + "&nome_artista=" + URLEncoder.encode(artistName, "UTF-8");
            String json = httpGet(searchUrl, "PobreMusicAndroid/1.0");
            JSONObject res = new JSONObject(json);
            if (res.optBoolean("sucesso")) {
                String videoId = res.getString("videoId");
                return CLOUD_RUN_API + "/api/audio?videoId=" + URLEncoder.encode(videoId, "UTF-8");
            }
        } catch (Exception ignored) {}

        return null;
    }

    private String extractVideoId(String text) {
        Matcher m = Pattern.compile("([A-Za-z0-9_-]{11})").matcher(text);
        if (m.find()) return m.group(1);
        return "";
    }

    private void startPlayback(String streamUrl, String title, String artist) {
        if (mediaController == null) {
            statusText.setText("Aguardando inicialização do player...");
            return;
        }

        try {
            mediaController.stop();
            mediaController.clearMediaItems();

            MediaMetadata meta = new MediaMetadata.Builder()
                .setTitle(title)
                .setArtist(artist)
                .build();

            MediaItem item = new MediaItem.Builder()
                .setUri(streamUrl)
                .setMediaMetadata(meta)
                .build();

            mediaController.setMediaItem(item);
            mediaController.prepare();
            mediaController.play();

            statusText.setText("▶ Reproduzindo: " + title);
            playPauseBtn.setText("⏸");
        } catch (Exception e) {
            statusText.setText("Erro ao iniciar áudio: " + e.getMessage());
        }
    }

    private String httpGet(String urlStr, String userAgent) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(urlStr).openConnection();
        conn.setConnectTimeout(8000);
        conn.setReadTimeout(12000);
        conn.setRequestProperty("User-Agent", userAgent);
        conn.setRequestProperty("Accept", "*/*");

        int code = conn.getResponseCode();
        InputStream is = code >= 400 ? conn.getErrorStream() : conn.getInputStream();
        if (is == null) throw new Exception("Sem resposta do servidor (HTTP " + code + ")");

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
        executor.shutdownNow();
        if (controllerFuture != null) {
            MediaController.releaseFuture(controllerFuture);
        }
        super.onDestroy();
    }
}
