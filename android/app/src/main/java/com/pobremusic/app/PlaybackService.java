package com.pobremusic.app;

import android.app.PendingIntent;
import android.content.Intent;
import androidx.annotation.Nullable;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.session.MediaSession;
import androidx.media3.session.MediaSessionService;

public class PlaybackService extends MediaSessionService {
    private ExoPlayer player;
    private MediaSession mediaSession;

    @Override public void onCreate() {
        super.onCreate();
        AudioAttributes attrs = new AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MUSIC).build();
        player = new ExoPlayer.Builder(this).build();
        player.setAudioAttributes(attrs, true);
        Intent intent = new Intent(this, MainActivity.class);
        PendingIntent pi = PendingIntent.getActivity(this, 0, intent, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        mediaSession = new MediaSession.Builder(this, player).setSessionActivity(pi).build();
    }

    public void play(String audioUrl, String title, String artist, String artwork) {
        MediaMetadata.Builder md = new MediaMetadata.Builder().setTitle(title).setArtist(artist);
        if (artwork != null && !artwork.isEmpty()) md.setArtworkUri(android.net.Uri.parse(artwork));
        MediaItem item = new MediaItem.Builder().setUri(audioUrl).setMediaMetadata(md.build()).build();
        player.setMediaItem(item); player.prepare(); player.play();
    }

    @Nullable @Override public MediaSession onGetSession(MediaSession.ControllerInfo controllerInfo) { return mediaSession; }

    @Override public void onTaskRemoved(Intent rootIntent) {
        if (player != null && !player.getPlayWhenReady()) stopSelf();
        super.onTaskRemoved(rootIntent);
    }

    @Override public void onDestroy() {
        if (mediaSession != null) mediaSession.release();
        if (player != null) player.release();
        super.onDestroy();
    }
}
