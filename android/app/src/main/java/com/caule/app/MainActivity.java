package com.caule.app;

import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        handlePushIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handlePushIntent(intent);
    }

    // Navega pro destino certo quando o app e aberto tocando numa notificacao construida pelo
    // CauleMessagingService (mesmo comportamento que o listener JS 'pushNotificationActionPerformed'
    // ja fazia pra notificacoes mostradas automaticamente pelo SDK do Firebase).
    private void handlePushIntent(Intent intent) {
        if (intent == null) return;
        String type = intent.getStringExtra("type");
        if (type == null) return;
        String id = intent.getStringExtra("id");

        String path;
        if ("tarefa".equals(type) && id != null) {
            path = "/app?tarefa=" + id;
        } else if ("mensagem".equals(type)) {
            path = "/comunicacao";
        } else {
            return;
        }

        String js = "window.location.href='" + path + "';";
        new Handler(Looper.getMainLooper()).postDelayed(() -> {
            if (getBridge() != null && getBridge().getWebView() != null) {
                getBridge().getWebView().evaluateJavascript(js, null);
            }
        }, 1200);
    }
}
