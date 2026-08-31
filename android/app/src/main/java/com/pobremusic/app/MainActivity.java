package com.pobremusic.app;

import android.app.Activity;
import android.os.Bundle;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.view.Gravity;
import android.view.View;
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
    private LinearLayout tracks;
    private TextView status, now, count;
    private EditText url;
    private ListenableFuture<MediaController> future;
    private MediaController controller;
    private final ExecutorService io=Executors.newCachedThreadPool();

    private int dp(int v){return Math.round(v*getResources().getDisplayMetrics().density);}
    private TextView text(String s,float z,int c){TextView v=new TextView(this);v.setText(s);v.setTextSize(z);v.setTextColor(c);return v;}
    private GradientDrawable bg(int color,int radius){GradientDrawable g=new GradientDrawable();g.setColor(color);g.setCornerRadius(dp(radius));return g;}
    private LinearLayout.LayoutParams lp(int w,int h){return new LinearLayout.LayoutParams(w<0?w:dp(w),h<0?h:dp(h));}

    @Override public void onCreate(Bundle b){super.onCreate(b);build();}

    private void build(){
        LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setBackgroundColor(Color.rgb(10,10,10));root.setPadding(dp(14),dp(10),dp(14),0);

        LinearLayout header=new LinearLayout(this);header.setGravity(Gravity.CENTER_VERTICAL);header.setPadding(0,0,0,dp(8));
        TextView logo=text("♫",30,Color.rgb(30,215,96));logo.setGravity(Gravity.CENTER);logo.setBackground(bg(Color.rgb(25,25,25),14));header.addView(logo,lp(52,52));
        LinearLayout titles=new LinearLayout(this);titles.setOrientation(LinearLayout.VERTICAL);titles.setPadding(dp(12),0,0,0);
        TextView title=text("PobreMusic",24,Color.WHITE);title.setTypeface(Typeface.DEFAULT,Typeface.BOLD);titles.addView(title,lp(-1,32));
        TextView sub=text("Spotify Playlist Player",14,Color.LTGRAY);titles.addView(sub,lp(-1,22));header.addView(titles,lp(0,52));((LinearLayout.LayoutParams)titles.getLayoutParams()).weight=1;root.addView(header,lp(-1,60));

        TextView section=text("IMPORTAR PLAYLIST",12,Color.rgb(30,215,96));section.setTypeface(Typeface.DEFAULT,Typeface.BOLD);root.addView(section,lp(-1,22));
        url=new EditText(this);url.setHint("Cole o link da playlist Spotify");url.setHintTextColor(Color.rgb(140,140,140));url.setTextColor(Color.WHITE);url.setTextSize(15);url.setSingleLine(true);url.setPadding(dp(14),0,dp(14),0);url.setBackground(bg(Color.rgb(27,27,27),12));root.addView(url,lp(-1,52));
        Button imp=new Button(this);imp.setText("Importar playlist");imp.setTextSize(14);imp.setTextColor(Color.WHITE);imp.setAllCaps(false);imp.setBackground(bg(Color.rgb(29,185,84),12));imp.setOnClickListener(v->importPlaylist());LinearLayout.LayoutParams ip=lp(-1,48);ip.topMargin=dp(8);root.addView(imp,ip);

        LinearLayout info=new LinearLayout(this);info.setGravity(Gravity.CENTER_VERTICAL);status=text("Cole uma playlist pública para começar",13,Color.LTGRAY);info.addView(status,lp(0,38));((LinearLayout.LayoutParams)status.getLayoutParams()).weight=1;count=text("0 músicas",13,Color.GRAY);count.setGravity(Gravity.CENTER);info.addView(count,lp(90,38));root.addView(info,lp(-1,46));

        ScrollView sv=new ScrollView(this);sv.setFillViewport(true);tracks=new LinearLayout(this);tracks.setOrientation(LinearLayout.VERTICAL);tracks.setPadding(0,dp(2),0,dp(10));sv.addView(tracks);root.addView(sv,new LinearLayout.LayoutParams(-1,0,1));

        LinearLayout player=new LinearLayout(this);player.setOrientation(LinearLayout.VERTICAL);player.setPadding(dp(12),dp(8),dp(12),dp(6));player.setBackground(bg(Color.rgb(27,27,27),16));
        now=text("Nenhuma música selecionada",15,Color.WHITE);now.setTypeface(Typeface.DEFAULT,Typeface.BOLD);now.setGravity(Gravity.CENTER);now.setSingleLine(true);now.setEllipsize(android.text.TextUtils.TruncateAt.MARQUEE);player.addView(now,lp(-1,30));
        TextView hint=text("Toque em uma música para reproduzir",11,Color.GRAY);hint.setGravity(Gravity.CENTER);player.addView(hint,lp(-1,20));
        LinearLayout controls=new LinearLayout(this);controls.setGravity(Gravity.CENTER);Button prev=control("⏮");Button play=control("▶");Button next=control("⏭");controls.addView(prev,lp(64,46));controls.addView(play,lp(86,46));controls.addView(next,lp(64,46));player.addView(controls,lp(-1,48));
        play.setOnClickListener(v->{if(controller!=null){if(controller.isPlaying())controller.pause();else controller.play();}});prev.setOnClickListener(v->{if(controller!=null)controller.seekToPreviousMediaItem();});next.setOnClickListener(v->{if(controller!=null)controller.seekToNextMediaItem();});
        root.addView(player,lp(-1,116));setContentView(root);
    }

    private Button control(String s){Button b=new Button(this);b.setText(s);b.setTextSize(18);b.setTextColor(Color.WHITE);b.setAllCaps(false);b.setBackground(bg(Color.rgb(45,45,45),24));return b;}

    private void importPlaylist(){
        final String link=url.getText().toString().trim();if(link.isEmpty()){status.setText("Cole um link do Spotify");return;}
        status.setText("Importando playlist...");count.setText("...");tracks.removeAllViews();
        io.execute(()->{try{String raw=get(API+"/api/public-playlist?url="+URLEncoder.encode(link,"UTF-8"));JSONObject d=new JSONObject(raw);if(!d.optBoolean("sucesso"))throw new Exception(d.optString("error","Falha ao importar"));JSONArray a=d.getJSONArray("faixas");runOnUiThread(()->{status.setText("Playlist importada");count.setText(a.length()+" músicas");});for(int i=0;i<a.length();i++)add(a.getJSONObject(i),i);}catch(Exception e){runOnUiThread(()->{status.setText("Erro ao importar: "+e.getMessage());count.setText("0 músicas");});}});
    }

    private void add(JSONObject t,int index){
        final String name=t.optString("nome_musica","Música");final String artist=t.optString("nome_artista","Artista");
        runOnUiThread(()->{
            LinearLayout row=new LinearLayout(this);row.setGravity(Gravity.CENTER_VERTICAL);row.setPadding(dp(8),dp(5),dp(8),dp(5));row.setBackground(bg(Color.rgb(24,24,24),10));
            TextView num=text(String.valueOf(index+1),12,Color.GRAY);num.setGravity(Gravity.CENTER);row.addView(num,lp(32,62));
            LinearLayout info=new LinearLayout(this);info.setOrientation(LinearLayout.VERTICAL);info.setGravity(Gravity.CENTER_VERTICAL);info.setPadding(dp(8),0,dp(4),0);
            TextView n=text(name,15,Color.WHITE);n.setTypeface(Typeface.DEFAULT,Typeface.BOLD);n.setSingleLine(true);n.setEllipsize(android.text.TextUtils.TruncateAt.END);info.addView(n,lp(-1,27));
            TextView ar=text(artist,12,Color.GRAY);ar.setSingleLine(true);ar.setEllipsize(android.text.TextUtils.TruncateAt.END);info.addView(ar,lp(-1,21));LinearLayout.LayoutParams inf=lp(0,66);inf.weight=1;row.addView(info,inf);
            Button p=control("▶");p.setTextSize(15);row.addView(p,lp(48,46));View.OnClickListener l=v->playTrack(name,artist);row.setOnClickListener(l);p.setOnClickListener(l);LinearLayout.LayoutParams rp=lp(-1,72);rp.bottomMargin=dp(5);tracks.addView(row,rp);
        });
    }

    private void playTrack(String name,String artist){
        status.setText("Procurando áudio...");now.setText(name+" — "+artist);
        io.execute(()->{try{String q=API+"/api/search?nome_musica="+URLEncoder.encode(name,"UTF-8")+"&nome_artista="+URLEncoder.encode(artist,"UTF-8");JSONObject r=new JSONObject(get(q));if(!r.optBoolean("sucesso"))throw new Exception(r.optString("error","Música não encontrada"));String id=r.getString("videoId");String audio=API+"/api/audio?videoId="+URLEncoder.encode(id,"UTF-8");ensure(()->{controller.setMediaItem(MediaItem.fromUri(audio));controller.prepare();controller.play();status.setText("▶ Reproduzindo");now.setText(name+" — "+artist);});}catch(Exception e){runOnUiThread(()->status.setText("Não foi possível reproduzir: "+e.getMessage()));}});
    }

    private void ensure(Runnable r){if(controller!=null){runOnUiThread(r);return;}runOnUiThread(()->status.setText("Preparando player..."));future=new MediaController.Builder(this,new SessionToken(this,new android.content.ComponentName(this,PlaybackService.class))).buildAsync();future.addListener(()->{try{controller=future.get();runOnUiThread(r);}catch(Exception e){runOnUiThread(()->status.setText("Erro no player: "+e.getMessage()));}},ContextCompat.getMainExecutor(this));}

    private String get(String s)throws Exception{HttpURLConnection c=(HttpURLConnection)new URL(s).openConnection();c.setConnectTimeout(10000);c.setReadTimeout(20000);c.setRequestProperty("Accept","application/json");int code=c.getResponseCode();InputStream in=code>=400?c.getErrorStream():c.getInputStream();try(BufferedReader br=new BufferedReader(new InputStreamReader(in))){StringBuilder b=new StringBuilder();String l;while((l=br.readLine())!=null)b.append(l);if(code>=400)throw new IOException("HTTP "+code);return b.toString();}finally{c.disconnect();}}
    @Override protected void onDestroy(){io.shutdownNow();if(future!=null)MediaController.releaseFuture(future);super.onDestroy();}
}
