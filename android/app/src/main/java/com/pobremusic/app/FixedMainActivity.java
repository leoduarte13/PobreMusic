package com.pobremusic.app;

import android.app.Activity;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.text.TextUtils;
import android.view.Gravity;
import android.view.View;
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

public class FixedMainActivity extends Activity {
    private LinearLayout list;
    private TextView status, nowTitle, nowArtist, count;
    private EditText input;
    private Button playPause;
    private WebView web;
    private final ExecutorService executor = Executors.newFixedThreadPool(4);
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ArrayList<Track> tracks = new ArrayList<>();
    private int current = -1;
    private boolean playing = false;
    private boolean ready = false;
    private String pending;
    private PowerManager.WakeLock wakeLock;
    private static final String[] PIPED = {
        "https://pipedapi.kavin.rocks","https://pipedapi.leptons.xyz","https://pipedapi.adminforge.de",
        "https://api.piped.yt","https://piped-api.privacy.com.de","https://pipedapi.drgns.space",
        "https://pipedapi.owo.si","https://pipedapi.reallyaweso.me","https://api.piped.private.coffee",
        "https://pipedapi.darkness.services"
    };

    static class Track { String name, artist, videoId; Track(String n,String a){name=n;artist=a;} }

    private int dp(int n){ return Math.round(n*getResources().getDisplayMetrics().density); }
    private TextView text(String s,float size,int color){ TextView t=new TextView(this); t.setText(s); t.setTextSize(size); t.setTextColor(color); return t; }
    private GradientDrawable bg(int color,int r){ GradientDrawable g=new GradientDrawable(); g.setColor(color); g.setCornerRadius(dp(r)); return g; }
    private LinearLayout.LayoutParams lp(int w,int h){ return new LinearLayout.LayoutParams(w<0?w:dp(w),h<0?h:dp(h)); }

    @Override public void onCreate(Bundle b){ super.onCreate(b); getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON); PowerManager pm=(PowerManager)getSystemService(POWER_SERVICE); if(pm!=null) wakeLock=pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK,"PobreMusic:Playback"); buildUi(); initWebPlayer(); }

    private void buildUi(){
        LinearLayout root=new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL); root.setPadding(dp(14),dp(14),dp(14),dp(8)); root.setBackgroundColor(Color.rgb(18,18,18));
        TextView title=text("♫  PobreMusic",21,Color.WHITE); title.setTypeface(Typeface.DEFAULT,Typeface.BOLD); root.addView(title,lp(-1,42));
        TextView sub=text("Importe uma playlist pública do Spotify",12,Color.LTGRAY); root.addView(sub,lp(-1,26));
        input=new EditText(this); input.setSingleLine(true); input.setTextColor(Color.WHITE); input.setHintTextColor(Color.GRAY); input.setHint("Link da playlist do Spotify"); input.setBackground(bg(Color.rgb(38,38,38),10)); input.setPadding(dp(12),0,dp(12),0); root.addView(input,lp(-1,46));
        Button imp=new Button(this); imp.setText("Importar playlist"); imp.setAllCaps(false); imp.setTextColor(Color.WHITE); imp.setBackground(bg(Color.rgb(29,185,84),10)); imp.setOnClickListener(v->importPlaylist()); LinearLayout.LayoutParams ilp=lp(-1,44); ilp.topMargin=dp(8); root.addView(imp,ilp);
        LinearLayout sr=new LinearLayout(this); sr.setGravity(Gravity.CENTER_VERTICAL); status=text("Pronto",12,Color.LTGRAY); count=text("0 músicas",12,Color.GRAY); sr.addView(status,new LinearLayout.LayoutParams(0,-2,1)); sr.addView(count,lp(-2,-2)); root.addView(sr,lp(-1,34));
        ScrollView sv=new ScrollView(this); list=new LinearLayout(this); list.setOrientation(LinearLayout.VERTICAL); sv.addView(list); root.addView(sv,new LinearLayout.LayoutParams(-1,0,1));
        LinearLayout bar=new LinearLayout(this); bar.setOrientation(LinearLayout.VERTICAL); bar.setPadding(dp(12),dp(8),dp(12),dp(8)); bar.setBackground(bg(Color.rgb(30,30,30),12));
        nowTitle=text("Nenhuma música",14,Color.WHITE); nowTitle.setTypeface(Typeface.DEFAULT,Typeface.BOLD); nowTitle.setSingleLine(true); nowTitle.setEllipsize(TextUtils.TruncateAt.END); bar.addView(nowTitle,lp(-1,24));
        nowArtist=text("Toque em uma faixa",12,Color.LTGRAY); bar.addView(nowArtist,lp(-1,22));
        LinearLayout ctl=new LinearLayout(this); ctl.setGravity(Gravity.CENTER); Button prev=button("⏮"); playPause=button("▶"); Button next=button("⏭"); ctl.addView(prev,lp(60,44)); ctl.addView(playPause,lp(70,44)); ctl.addView(next,lp(60,44)); bar.addView(ctl,lp(-1,48)); prev.setOnClickListener(v->previous()); next.setOnClickListener(v->next()); playPause.setOnClickListener(v->toggle()); root.addView(bar,lp(-1,100));
        web=new WebView(this); web.setVisibility(View.GONE); root.addView(web,new LinearLayout.LayoutParams(1,1)); setContentView(root);
    }
    private Button button(String s){ Button b=new Button(this); b.setText(s); b.setTextSize(18); b.setTextColor(Color.WHITE); b.setAllCaps(false); b.setBackground(bg(Color.rgb(45,45,45),20)); return b; }

    private void initWebPlayer(){
        WebSettings s=web.getSettings(); s.setJavaScriptEnabled(true); s.setDomStorageEnabled(true); s.setMediaPlaybackRequiresUserGesture(false); s.setUserAgentString("Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36");
        web.setWebViewClient(new WebViewClient()); web.setWebChromeClient(new WebChromeClient());
        web.addJavascriptInterface(new Object(){
            @JavascriptInterface public void ready(){ main.post(()->{ready=true;if(pending!=null){String id=pending;pending=null;playId(id);}}); }
            @JavascriptInterface public void state(int st){ main.post(()->{ if(st==1){playing=true;playPause.setText("⏸");status.setText("▶ Reproduzindo");if(wakeLock!=null&&!wakeLock.isHeld())try{wakeLock.acquire(12*60*60*1000L);}catch(Exception ignored){}} else if(st==2){playing=false;playPause.setText("▶");status.setText("⏸ Pausado");} else if(st==3)status.setText("⏳ Carregando..."); else if(st==0)next(); }); }
            @JavascriptInterface public void error(int code){ main.post(()->{playing=false;playPause.setText("▶");status.setText("Faixa indisponível, tentando próxima...");next();}); }
        },"PobreBridge");
        String html="<!doctype html><html><body style='margin:0;background:#000'><div id='p'></div><script>var p;var t=document.createElement('script');t.src='https://www.youtube.com/iframe_api';document.head.appendChild(t);function onYouTubeIframeAPIReady(){p=new YT.Player('p',{height:'1',width:'1',playerVars:{autoplay:0,controls:0,playsinline:1,rel:0},events:{onReady:function(){PobreBridge.ready()},onStateChange:function(e){PobreBridge.state(e.data)},onError:function(e){PobreBridge.error(e.data)}}})}function play(id){if(p){p.loadVideoById(id);p.playVideo()}}function pause(){if(p)p.pauseVideo()}function resume(){if(p)p.playVideo()}</script></body></html>";
        web.loadDataWithBaseURL("https://www.youtube.com/",html,"text/html","UTF-8",null);
    }
    private void playId(String id){ if(id==null||id.length()!=11)return; if(!ready){pending=id;return;} web.evaluateJavascript("play('"+id.replace("'","\\'")+"')",null); }

    private void importPlaylist(){
        final String raw=input.getText().toString().trim(); if(raw.isEmpty()){status.setText("Cole um link do Spotify");return;} status.setText("Importando playlist..."); list.removeAllViews(); tracks.clear(); current=-1; count.setText("...");
        executor.execute(()->{ try{ List<Track> parsed=spotifyTracks(raw); if(parsed.isEmpty())throw new Exception("Nenhuma faixa encontrada"); main.post(()->{tracks.addAll(parsed);count.setText(tracks.size()+" músicas");status.setText("Playlist carregada");render();}); }catch(Exception e){main.post(()->{status.setText("Erro: "+e.getMessage());count.setText("0 músicas");});} });
    }

    private List<Track> spotifyTracks(String raw)throws Exception{
        String id=extractId(raw); if(id.isEmpty())throw new Exception("Link Spotify inválido"); String html=get("https://open.spotify.com/embed/playlist/"+id+"?utm_source=generator&theme=0");
        ArrayList<Track> out=new ArrayList<>(); Matcher m=Pattern.compile("<script[^>]*id=[\\\"']__NEXT_DATA__[\\\"'][^>]*>([\\s\\S]*?)</script>",Pattern.CASE_INSENSITIVE).matcher(html);
        while(m.find()){ try{JSONObject root=new JSONObject(m.group(1)); JSONArray a=findTrackArray(root); if(a!=null){for(int i=0;i<a.length();i++){JSONObject x=a.optJSONObject(i); if(x==null)continue; JSONObject tr=x.optJSONObject("track"); if(tr==null)tr=x.optJSONObject("item"); if(tr==null)tr=x; String name=first(tr,"title","name"); String artist=first(tr,"subtitle","artist"); if(artist.isEmpty()){JSONArray as=tr.optJSONArray("artists"); if(as!=null&&as.length()>0)artist=first(as.optJSONObject(0),"name");} if(!name.isEmpty())out.add(new Track(name,artist.isEmpty()?"Artista desconhecido":artist));} } }catch(Exception ignored){} if(!out.isEmpty())break; }
        if(out.isEmpty()){ Matcher q=Pattern.compile("\\\"title\\\":\\\"([^\\\"]+)\\\"[\\s\\S]{0,500}?\\\"subtitle\\\":\\\"([^\\\"]+)\\\"").matcher(html); while(q.find())out.add(new Track(q.group(1),q.group(2))); }
        return out;
    }
    private JSONArray findTrackArray(Object node){
        if(node instanceof JSONObject){JSONObject o=(JSONObject)node; JSONArray a=o.optJSONArray("trackList"); if(a!=null&&a.length()>0)return a; JSONObject tr=o.optJSONObject("tracks"); if(tr!=null){a=tr.optJSONArray("items");if(a!=null&&a.length()>0)return a;} for(String k:o.keySet()){Object v=o.opt(k);JSONArray r=findTrackArray(v);if(r!=null)return r;}}
        else if(node instanceof JSONArray){JSONArray a=(JSONArray)node;for(int i=0;i<a.length();i++){JSONArray r=findTrackArray(a.opt(i));if(r!=null)return r;}}
        return null;
    }
    private String first(JSONObject o,String...keys){if(o==null)return "";for(String k:keys){String v=o.optString(k,"");if(!v.isEmpty())return v;}return "";}

    private void render(){ list.removeAllViews(); for(int i=0;i<tracks.size();i++){final int idx=i;Track t=tracks.get(i); LinearLayout row=new LinearLayout(this);row.setGravity(Gravity.CENTER_VERTICAL);row.setPadding(dp(10),dp(8),dp(10),dp(8));row.setBackground(bg(Color.rgb(26,26,26),8)); TextView n=text(String.valueOf(i+1),12,Color.GRAY);row.addView(n,lp(32,-2)); LinearLayout inf=new LinearLayout(this);inf.setOrientation(LinearLayout.VERTICAL); TextView a=text(t.name,14,Color.WHITE);a.setTypeface(Typeface.DEFAULT,Typeface.BOLD);a.setSingleLine(true);a.setEllipsize(TextUtils.TruncateAt.END);inf.addView(a,lp(-1,24));TextView b=text(t.artist,12,Color.LTGRAY);b.setSingleLine(true);inf.addView(b,lp(-1,20));row.addView(inf,new LinearLayout.LayoutParams(0,-2,1));TextView p=text("▶",14,Color.rgb(29,185,84));row.addView(p,lp(35,-2));row.setOnClickListener(v->playTrack(idx));LinearLayout.LayoutParams rp=lp(-1,52);rp.bottomMargin=dp(5);list.addView(row,rp);}}

    private void playTrack(int idx){ if(idx<0||idx>=tracks.size())return; current=idx; Track t=tracks.get(idx); nowTitle.setText(t.name);nowArtist.setText(t.artist);status.setText("🔎 Procurando áudio..."); if(t.videoId!=null&&!t.videoId.isEmpty()){playId(t.videoId);return;} executor.execute(()->{String id=findVideo(t.name,t.artist);main.post(()->{if(id.isEmpty()){status.setText("Não foi possível encontrar a música");return;}t.videoId=id;status.setText("▶ Carregando...");playId(id);});}); }

    private String findVideo(String name,String artist){ String q=(name+" "+artist).trim(); for(String base:PIPED){try{String j=get(base+"/search?q="+URLEncoder.encode(q,"UTF-8")+"&filter=music_songs");JSONObject o=new JSONObject(j);JSONArray items=o.optJSONArray("items");if(items==null)continue;String best="";int bestScore=-999999;for(int i=0;i<items.length();i++){JSONObject x=items.optJSONObject(i);if(x==null)continue;String id=x.optString("url","");Matcher m=Pattern.compile("(?:v=|/watch/)([A-Za-z0-9_-]{11})").matcher(id);if(!m.find())id=x.optString("id","");else id=m.group(1);if(!id.matches("[A-Za-z0-9_-]{11}"))continue;String title=x.optString("title","").toLowerCase();int score=0;for(String w:name.toLowerCase().split("\\s+")){if(w.length()>1&&title.contains(w))score+=10;}if(title.contains(artist.toLowerCase()))score+=30;if(title.contains("official")||title.contains("topic")||title.contains("audio"))score+=5;if(title.contains("cover")||title.contains("karaoke")||title.contains("reaction")||title.contains("slowed"))score-=30;if(score>bestScore){bestScore=score;best=id;}}if(!best.isEmpty())return best;}catch(Exception ignored){}} return ""; }

    private String get(String u)throws Exception{HttpURLConnection c=(HttpURLConnection)new URL(u).openConnection();c.setConnectTimeout(7000);c.setReadTimeout(12000);c.setRequestProperty("User-Agent","Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36");c.setRequestProperty("Accept","application/json,text/html,*/*");int code=c.getResponseCode();if(code<200||code>=300)throw new Exception("HTTP "+code);BufferedReader r=new BufferedReader(new InputStreamReader(c.getInputStream()));StringBuilder s=new StringBuilder();String line;while((line=r.readLine())!=null)s.append(line);r.close();c.disconnect();return s.toString();}
    private String extractId(String s){Matcher m=Pattern.compile("spotify\\.com/(?:intl-[^/]+/)?playlist/([A-Za-z0-9]+)",Pattern.CASE_INSENSITIVE).matcher(s);if(m.find())return m.group(1);m=Pattern.compile("spotify:playlist:([A-Za-z0-9]+)",Pattern.CASE_INSENSITIVE).matcher(s);if(m.find())return m.group(1);return "";}
    private void toggle(){if(current<0&&!tracks.isEmpty()){playTrack(0);return;}if(playing)web.evaluateJavascript("pause()",null);else web.evaluateJavascript("resume()",null);}
    private void next(){if(tracks.isEmpty())return;int n=current+1;if(n<tracks.size())playTrack(n);else{status.setText("Fim da playlist");playing=false;playPause.setText("▶");}}
    private void previous(){if(tracks.isEmpty())return;playTrack(Math.max(0,current-1));}
    @Override protected void onDestroy(){try{if(wakeLock!=null&&wakeLock.isHeld())wakeLock.release();}catch(Exception ignored){}executor.shutdownNow();if(web!=null)web.destroy();super.onDestroy();}
}
