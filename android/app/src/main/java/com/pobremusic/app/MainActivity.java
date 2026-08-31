package com.pobremusic.app;

import android.app.Activity;
import android.os.Bundle;
import android.graphics.Color;
import android.graphics.Typeface;
import android.view.Gravity;
import android.widget.*;
import androidx.core.content.ContextCompat;
import androidx.media3.common.MediaItem;
import androidx.media3.session.MediaController;
import androidx.media3.session.SessionToken;
import com.google.common.util.concurrent.ListenableFuture;
import org.json.*;
import java.io.*;
import java.net.*;
import java.util.concurrent.*;

public class MainActivity extends Activity {
    private static final String API="https://pobremusic.vercel.app";
    private LinearLayout tracks; private TextView status, now;
    private EditText url; private ListenableFuture<MediaController> future; private MediaController controller;
    private final ExecutorService io=Executors.newCachedThreadPool();

    @Override public void onCreate(Bundle b){super.onCreate(b); build();}
    private TextView text(String s,float z,int c){TextView v=new TextView(this);v.setText(s);v.setTextSize(z);v.setTextColor(c);return v;}
    private void build(){
        LinearLayout root=new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL); root.setPadding(22,28,22,16); root.setBackgroundColor(Color.rgb(9,9,9));
        TextView title=text("🎵  PobreMusic",27,Color.WHITE); title.setTypeface(Typeface.DEFAULT,Typeface.BOLD); title.setGravity(Gravity.CENTER_VERTICAL); root.addView(title,new LinearLayout.LayoutParams(-1,64));
        TextView sub=text("Spotify Playlist Player",15,Color.LTGRAY); sub.setGravity(Gravity.CENTER); root.addView(sub,new LinearLayout.LayoutParams(-1,38));
        url=new EditText(this); url.setHint("Cole o link da playlist Spotify"); url.setHintTextColor(Color.GRAY); url.setTextColor(Color.WHITE); url.setSingleLine(true); url.setPadding(18,0,18,0); root.addView(url,new LinearLayout.LayoutParams(-1,62));
        Button imp=new Button(this); imp.setText("IMPORTAR PLAYLIST"); imp.setOnClickListener(v->importPlaylist()); root.addView(imp,new LinearLayout.LayoutParams(-1,58));
        status=text("Cole uma playlist pública do Spotify para começar.",14,Color.LTGRAY); status.setPadding(4,10,4,10); root.addView(status,new LinearLayout.LayoutParams(-1,48));
        ScrollView sv=new ScrollView(this); tracks=new LinearLayout(this); tracks.setOrientation(LinearLayout.VERTICAL); sv.addView(tracks); root.addView(sv,new LinearLayout.LayoutParams(-1,0,1));
        LinearLayout player=new LinearLayout(this);player.setOrientation(LinearLayout.VERTICAL);player.setPadding(8,10,8,4);player.setBackgroundColor(Color.rgb(25,25,25));
        now=text("Nenhuma música selecionada",15,Color.WHITE);now.setGravity(Gravity.CENTER);player.addView(now,new LinearLayout.LayoutParams(-1,42));
        LinearLayout controls=new LinearLayout(this);controls.setGravity(Gravity.CENTER);
        Button prev=new Button(this);prev.setText("◀◀");Button play=new Button(this);play.setText("▶");Button next=new Button(this);next.setText("▶▶");
        controls.addView(prev,new LinearLayout.LayoutParams(90,56));controls.addView(play,new LinearLayout.LayoutParams(100,56));controls.addView(next,new LinearLayout.LayoutParams(90,56));player.addView(controls);
        play.setOnClickListener(v->{if(controller!=null){if(controller.isPlaying())controller.pause();else controller.play();}});
        root.addView(player,new LinearLayout.LayoutParams(-1,110)); setContentView(root);
    }
    private void importPlaylist(){final String link=url.getText().toString().trim();if(link.isEmpty()){status.setText("Cole um link do Spotify.");return;}status.setText("Importando playlist...");tracks.removeAllViews();io.execute(()->{try{String raw=get(API+"/api/public-playlist?url="+URLEncoder.encode(link,"UTF-8"));JSONObject d=new JSONObject(raw);if(!d.optBoolean("sucesso"))throw new Exception(d.optString("error","Falha"));JSONArray a=d.getJSONArray("faixas");runOnUiThread(()->status.setText(a.length()+" músicas importadas"));for(int i=0;i<a.length();i++){JSONObject t=a.getJSONObject(i);add(t,i+1);} }catch(Exception e){runOnUiThread(()->status.setText("Erro: "+e.getMessage()));}});}
    private void add(JSONObject t,int n){runOnUiThread(()->{String name=t.optString("nome_musica"),artist=t.optString("nome_artista");TextView row=text(n+". "+name+"\n"+artist,16,Color.WHITE);row.setPadding(14,14,8,14);row.setBackgroundColor(Color.rgb(22,22,22));row.setOnClickListener(v->playTrack(name,artist));tracks.addView(row,new LinearLayout.LayoutParams(-1,78));});}
    private void playTrack(String name,String artist){status.setText("Encontrando: "+name);io.execute(()->{try{String q=API+"/api/search?nome_musica="+URLEncoder.encode(name,"UTF-8")+"&nome_artista="+URLEncoder.encode(artist,"UTF-8");JSONObject r=new JSONObject(get(q));if(!r.optBoolean("sucesso"))throw new Exception(r.optString("error","Música não encontrada"));String id=r.getString("videoId");String audio=API+"/api/audio?videoId="+URLEncoder.encode(id,"UTF-8");ensure(()->{controller.setMediaItem(MediaItem.fromUri(audio));controller.prepare();controller.play();now.setText(name+" — "+artist);status.setText("▶ Tocando");});}catch(Exception e){runOnUiThread(()->status.setText("Não foi possível tocar: "+e.getMessage()));}});}
    private void ensure(Runnable r){if(controller!=null){runOnUiThread(r);return;}runOnUiThread(()->status.setText("Preparando player..."));future=new MediaController.Builder(this,new SessionToken(this,new android.content.ComponentName(this,PlaybackService.class))).buildAsync();future.addListener(()->{try{controller=future.get();runOnUiThread(r);}catch(Exception e){runOnUiThread(()->status.setText("Erro no player: "+e.getMessage()));}},ContextCompat.getMainExecutor(this));}
    private String get(String s)throws Exception{HttpURLConnection c=(HttpURLConnection)new URL(s).openConnection();c.setConnectTimeout(10000);c.setReadTimeout(20000);c.setRequestProperty("Accept","application/json");int code=c.getResponseCode();InputStream in=code>=400?c.getErrorStream():c.getInputStream();try(BufferedReader br=new BufferedReader(new InputStreamReader(in))){StringBuilder b=new StringBuilder();String l;while((l=br.readLine())!=null)b.append(l);if(code>=400)throw new IOException("HTTP "+code);return b.toString();}finally{c.disconnect();}}
    @Override protected void onDestroy(){io.shutdownNow();if(future!=null)MediaController.releaseFuture(future);super.onDestroy();}
}
