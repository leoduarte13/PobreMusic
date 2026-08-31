package com.pobremusic.app;

import android.content.ComponentName;
import android.os.Bundle;
import android.view.Gravity;
import android.widget.*;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;
import androidx.media3.common.MediaItem;
import androidx.media3.session.MediaController;
import androidx.media3.session.SessionToken;
import com.google.common.util.concurrent.ListenableFuture;
import org.json.*;
import java.io.*;
import java.net.*;
import java.util.concurrent.*;

public class MainActivity extends AppCompatActivity {
    private static final String API="https://pobremusic.vercel.app";
    private LinearLayout list; private TextView status; private EditText url;
    private ListenableFuture<MediaController> controllerFuture; private MediaController controller;

    @Override protected void onCreate(Bundle b){ super.onCreate(b); buildUi(); }

    private void buildUi(){
        LinearLayout root=new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL); root.setPadding(24,40,24,16); root.setBackgroundColor(0xff090909);
        TextView title=new TextView(this); title.setText("PobreMusic"); title.setTextColor(0xffffffff); title.setTextSize(28); title.setGravity(Gravity.CENTER); root.addView(title,new LinearLayout.LayoutParams(-1,70));
        url=new EditText(this); url.setHint("Cole o link da playlist Spotify"); url.setHintTextColor(0xff888888); url.setTextColor(0xffffffff); url.setSingleLine(true); root.addView(url,new LinearLayout.LayoutParams(-1,60));
        Button importBtn=new Button(this); importBtn.setText("IMPORTAR PLAYLIST"); importBtn.setOnClickListener(v->importPlaylist()); root.addView(importBtn,new LinearLayout.LayoutParams(-1,60));
        status=new TextView(this); status.setTextColor(0xffbbbbbb); status.setPadding(0,16,0,16); root.addView(status);
        ScrollView scroll=new ScrollView(this); list=new LinearLayout(this); list.setOrientation(LinearLayout.VERTICAL); scroll.addView(list); root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1)); setContentView(root);
    }

    private void ensureController(Runnable ready){
        if(controller!=null){ready.run();return;}
        status.setText("Preparando player...");
        controllerFuture=new MediaController.Builder(this,new SessionToken(this,new ComponentName(this,PlaybackService.class))).buildAsync();
        controllerFuture.addListener(()->{try{controller=controllerFuture.get(); runOnUiThread(ready);}catch(Exception e){runOnUiThread(()->status.setText("Erro no player: "+e.getMessage()));}},ContextCompat.getMainExecutor(this));
    }

    private void importPlaylist(){
        final String link=url.getText().toString().trim(); if(link.isEmpty())return;
        status.setText("Importando..."); list.removeAllViews();
        ExecutorService executor=Executors.newSingleThreadExecutor(); executor.execute(()->{try{
            String raw=get(API+"/api/public-playlist?url="+URLEncoder.encode(link,"UTF-8")); JSONObject data=new JSONObject(raw);
            if(!data.optBoolean("sucesso"))throw new Exception(data.optString("error","Falha")); JSONArray tracks=data.getJSONArray("faixas");
            runOnUiThread(()->status.setText(tracks.length()+" músicas importadas"));
            for(int i=0;i<tracks.length();i++){JSONObject t=tracks.getJSONObject(i); addTrack(t,i+1);}
        }catch(Exception e){runOnUiThread(()->status.setText("Erro: "+e.getMessage()));}finally{executor.shutdown();}});
    }

    private void addTrack(JSONObject t,int n){runOnUiThread(()->{TextView row=new TextView(this); String name=t.optString("nome_musica"); String artist=t.optString("nome_artista"); row.setText(n+". "+name+"\n"+artist); row.setTextColor(0xffffffff); row.setTextSize(16); row.setPadding(12,18,12,18); row.setOnClickListener(v->resolveAndPlay(name,artist,t.optString("capa"))); list.addView(row,new LinearLayout.LayoutParams(-1,-2));});}

    private void resolveAndPlay(String name,String artist,String art){
        status.setText("Encontrando: "+name);
        ExecutorService executor=Executors.newSingleThreadExecutor(); executor.execute(()->{try{
            String q="/api/search?nome_musica="+URLEncoder.encode(name,"UTF-8")+"&nome_artista="+URLEncoder.encode(artist,"UTF-8");
            JSONObject r=new JSONObject(get(API+q)); if(!r.optBoolean("sucesso"))throw new Exception(r.optString("error","Fonte não encontrada"));
            String id=r.getString("videoId"); String audio=API+"/api/audio?videoId="+URLEncoder.encode(id,"UTF-8");
            ensureController(()->{controller.setMediaItem(MediaItem.fromUri(audio)); controller.prepare(); controller.play(); status.setText(name+" — "+artist);});
        }catch(Exception e){runOnUiThread(()->status.setText("Não foi possível tocar: "+e.getMessage()));}finally{executor.shutdown();}});
    }

    private String get(String s)throws Exception{HttpURLConnection c=(HttpURLConnection)new URL(s).openConnection(); c.setConnectTimeout(10000); c.setReadTimeout(15000); c.setRequestProperty("Accept","application/json"); int code=c.getResponseCode(); InputStream stream=code>=400?c.getErrorStream():c.getInputStream(); try(BufferedReader br=new BufferedReader(new InputStreamReader(stream))){StringBuilder x=new StringBuilder();String l;while((l=br.readLine())!=null)x.append(l);if(code>=400)throw new IOException("HTTP "+code+": "+x);return x.toString();}finally{c.disconnect();}}
    @Override protected void onDestroy(){if(controllerFuture!=null)MediaController.releaseFuture(controllerFuture);super.onDestroy();}
}
