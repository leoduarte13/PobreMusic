# Probe Music - Aplicativo Android (APK)

Aplicativo Android nativo para reprodução de playlists do Spotify e buscas de músicas com suporte completo a **reprodução em segundo plano** e **tela bloqueada**.

## Como gerar o arquivo APK:

### Método 1: No Android Studio
1. Baixe o projeto ZIP pelo menu do AI Studio (**Export / Download ZIP**).
2. Abra o **Android Studio** e clique em **Open** selecionando a pasta `android`.
3. Aguarde o Gradle sincronizar as dependências.
4. No menu superior, vá em **Build > Build Bundle(s) / APK(s) > Build APK(s)**.
5. O Android Studio gerará o APK **ProbeMusic** em:
   `app/build/outputs/apk/debug/ProbeMusic-debug.apk` (ou `app-debug.apk`)
6. Transfira para o seu celular Android e instale.

### Método 2: Linha de Comando (Terminal)
Com o Android SDK e Java instalados:
```bash
cd android
./gradlew assembleDebug
```
O arquivo APK estará pronto na pasta `app/build/outputs/apk/debug/`.

---

## Funcionalidades Nativas Implementadas:
- **Foreground Service (`FOREGROUND_SERVICE_MEDIA_PLAYBACK`):** Mantém a reprodução ativa quando o app está minimizado ou a tela é bloqueada.
- **WakeLock (`PARTIAL_WAKE_LOCK`):** Impede que o processador do celular entre em repouso durante a reprodução da playlist.
- **Jetpack Media3 & MediaSession:** Controles de áudio e informações da faixa na barra de status e tela de bloqueio do Android.
