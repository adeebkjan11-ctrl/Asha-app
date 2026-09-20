package org.ashasaathi.app;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import android.view.WindowManager;
import java.io.ByteArrayInputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

public class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final int PICK_FILE = 41, SAVE_FILE = 42;
    private WebView web;
    private ValueCallback<Uri[]> chooser;
    private byte[] pendingDownload;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE);
        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(245,247,243));
        setContentView(web);
        web.setOnApplyWindowInsetsListener((v,insets)-> {v.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());return insets;});
        WebSettings settings=web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        WebView.setWebContentsDebuggingEnabled(false);
        web.setWebViewClient(new WebViewClient(){
            @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest req){
                Uri uri=req.getUrl();
                if(!HOST.equals(uri.getHost()))return null;
                String asset=uri.getPath();
                if(asset==null||asset.equals("/"))asset="/index.html";
                asset=asset.substring(1);
                if(asset.contains("..")||asset.startsWith("."))return missing();
                String type=asset.endsWith(".mjs")||asset.endsWith(".js")?"text/javascript":asset.endsWith(".css")?"text/css":asset.endsWith(".svg")?"image/svg+xml":asset.endsWith(".png")?"image/png":asset.endsWith(".webmanifest")?"application/manifest+json":"text/html";
                try{return new WebResourceResponse(type,"UTF-8",getAssets().open(asset));}catch(Exception e){return missing();}
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest req){
                Uri uri=req.getUrl();
                if(HOST.equals(uri.getHost())&&"https".equals(uri.getScheme()))return false;
                if("https".equals(uri.getScheme())){try{startActivity(new Intent(Intent.ACTION_VIEW,uri));}catch(Exception ignored){}}
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient(){
            @Override public boolean onShowFileChooser(WebView view,ValueCallback<Uri[]> callback,FileChooserParams params){
                if(chooser!=null)chooser.onReceiveValue(null);
                chooser=callback;
                Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*");
                i.putExtra(Intent.EXTRA_MIME_TYPES,new String[]{"image/png","image/jpeg","image/webp","application/pdf"});
                try{startActivityForResult(i,PICK_FILE);}catch(Exception e){chooser.onReceiveValue(null);chooser=null;Toast.makeText(MainActivity.this,"No file picker available",Toast.LENGTH_SHORT).show();}
                return true;
            }
        });
        web.addJavascriptInterface(new Downloads(),"AndroidDownloads");
        web.loadUrl("https://"+HOST+"/index.html");
    }
    private WebResourceResponse missing(){return new WebResourceResponse("text/plain","UTF-8",404,"Not found",null,new ByteArrayInputStream("Not found".getBytes(StandardCharsets.UTF_8)));}
    private class Downloads {
        @JavascriptInterface public void saveFile(String name,String type,String encoded){
            if(encoded==null||encoded.length()>9_000_000)return;
            if(type==null||!(type.startsWith("text/csv")||type.equals("application/pdf")||type.equals("image/png")||type.equals("image/jpeg")||type.equals("image/webp")))return;
            String safeName=name==null?"ASHA-Saathi-report":name.replaceAll("[^a-zA-Z0-9._ -]","_");
            String mimeType=type.split(";")[0];
            byte[] bytes;
            try{bytes=Base64.decode(encoded,Base64.DEFAULT);}catch(Exception e){return;}
            runOnUiThread(()->{
                if(pendingDownload!=null){Toast.makeText(MainActivity.this,"Finish the current download first",Toast.LENGTH_SHORT).show();return;}
                pendingDownload=bytes;
                Intent intent=new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(mimeType).putExtra(Intent.EXTRA_TITLE,safeName);
                try{startActivityForResult(intent,SAVE_FILE);}catch(Exception e){pendingDownload=null;Toast.makeText(MainActivity.this,"No file saver available",Toast.LENGTH_SHORT).show();}
            });
        }
        @JavascriptInterface public void printPage(){runOnUiThread(()->{PrintManager pm=(PrintManager)getSystemService(PRINT_SERVICE);if(pm!=null)pm.print("ASHA Saathi report",web.createPrintDocumentAdapter("ASHA Saathi report"),new PrintAttributes.Builder().build());});}
    }
    @Override protected void onActivityResult(int request,int result,Intent data){
        super.onActivityResult(request,result,data);
        if(request==PICK_FILE&&chooser!=null){chooser.onReceiveValue(result==RESULT_OK&&data!=null&&data.getData()!=null?new Uri[]{data.getData()}:null);chooser=null;}
        if(request==SAVE_FILE){byte[] bytes=pendingDownload;pendingDownload=null;if(result==RESULT_OK&&data!=null&&data.getData()!=null&&bytes!=null){try(OutputStream out=getContentResolver().openOutputStream(data.getData())){if(out!=null){out.write(bytes);Toast.makeText(this,"File saved",Toast.LENGTH_SHORT).show();}}catch(Exception e){Toast.makeText(this,"Could not save file",Toast.LENGTH_SHORT).show();}}}
    }
    @Override public void onBackPressed(){web.evaluateJavascript("document.querySelector('dialog[open]') ? (document.querySelector('dialog[open]').close(), true) : false",result->{if(!"true".equals(result)){if(web.canGoBack())web.goBack();else super.onBackPressed();}});}
    @Override protected void onDestroy(){if(chooser!=null)chooser.onReceiveValue(null);web.removeJavascriptInterface("AndroidDownloads");web.destroy();super.onDestroy();}
}
