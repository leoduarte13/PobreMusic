/**
 * Utilitário de diagnóstico e logging detalhado para monitoramento de requisições de playlist
 * Identifica se erros ocorrem no client-side (navegador), na rede ou no servidor (Vercel/Cloud Run/Local).
 */

export interface ApiLogPayload {
  context: string;
  url: string;
  host: string;
  method?: string;
  status?: number;
  statusText?: string;
  durationMs?: number;
  data?: any;
  error?: any;
  contentType?: string | null;
}

export const playlistLogger = {
  /**
   * Log inicial de disparo da função loadPlaylist
   */
  startLoad: (inputUrlOrId: string, candidateHosts: string[]) => {
    const browserOrigin = typeof window !== "undefined" ? window.location.origin : "N/A";
    console.groupCollapsed(
      `%c🎵 [POBREMUSIC] loadPlaylist: "${inputUrlOrId.substring(0, 55)}${inputUrlOrId.length > 55 ? "..." : ""}"`,
      "color: #10b981; font-weight: bold; font-size: 12px;"
    );
    console.log("%c📍 Origem do Navegador:", "font-weight: bold; color: #3b82f6;", browserOrigin);
    console.log("%c🔗 Entrada Fornecida:", "font-weight: bold; color: #8b5cf6;", inputUrlOrId);
    console.log("%c🌐 Hosts de API candidatos:", "font-weight: bold; color: #f59e0b;", candidateHosts);
    console.groupEnd();
  },

  /**
   * Log detalhado de cada chamada feita a um endpoint de API (incluindo host completo e status)
   */
  logApiCall: ({
    context,
    url,
    host,
    method = "GET",
    status,
    statusText = "",
    durationMs,
    data,
    error,
    contentType,
  }: ApiLogPayload) => {
    const isSuccess = status && status >= 200 && status < 300;
    const isClientNetworkError = !status && error;
    const isServerError = status && status >= 500;
    const isAuthOrClientError = status && status >= 400 && status < 500;

    let badgeColor = "#10b981"; // green
    let badgeText = `${status || "OK"} ${statusText}`;

    if (isServerError) {
      badgeColor = "#ef4444"; // red
      badgeText = `${status} SERVER ERROR (Vercel/Backend)`;
    } else if (isAuthOrClientError) {
      badgeColor = "#f59e0b"; // amber
      badgeText = `${status} CLIENT/AUTH ERROR`;
    } else if (isClientNetworkError) {
      badgeColor = "#dc2626"; // dark red
      badgeText = "CLIENT-SIDE NETWORK ERROR / CORS";
    }

    const hostLabel = host || (typeof window !== "undefined" ? window.location.origin + " (relativo)" : "local");

    console.groupCollapsed(
      `%c[${context}] %c${badgeText}%c ➔ ${method} ${url}`,
      "color: #6366f1; font-weight: bold;",
      `background-color: ${badgeColor}; color: white; padding: 2px 6px; border-radius: 4px; font-weight: bold; font-size: 10px;`,
      "color: #9ca3af; font-weight: normal;"
    );

    console.log("%c🌐 Host da API:", "font-weight: bold;", hostLabel);
    console.log("%c🔗 URL Completa Chamada:", "font-weight: bold; color: #3b82f6;", url);
    console.log("%c⚡ Método:", "font-weight: bold;", method);
    console.log(
      "%c📊 Status HTTP Retornado:",
      `font-weight: bold; color: ${isSuccess ? "#10b981" : "#ef4444"};`,
      status ? `${status} ${statusText}` : "Falha antes de receber resposta HTTP"
    );
    if (durationMs !== undefined) {
      console.log("%c⏱️ Tempo de Resposta:", "font-weight: bold;", `${durationMs.toFixed(0)} ms`);
    }
    if (contentType) {
      console.log("%c📄 Content-Type:", "font-weight: bold;", contentType);
    }

    // Diagnóstico de causa raiz
    if (isServerError) {
      console.warn(
        "%c⚠️ DIAGNÓSTICO: O erro ocorreu no SERVIDOR BACKEND / VERCEL (Status " + status + "). Verifique os logs da função serverless ou headers de proxy.",
        "color: #ef4444; font-weight: bold;"
      );
    } else if (isClientNetworkError) {
      console.warn(
        "%c⚠️ DIAGNÓSTICO: O erro ocorreu no CLIENT-SIDE / NAVEGADOR (Bloqueio CORS, Host inacessível, timeout ou falta de conexão).",
        "color: #dc2626; font-weight: bold;"
      );
    } else if (isSuccess) {
      console.log(
        "%c✅ DIAGNÓSTICO: Comunicação com a API bem-sucedida! Dados recebidos com sucesso.",
        "color: #10b981; font-weight: bold;"
      );
    }

    if (data) {
      console.log("%c📦 Dados Retornados:", "font-weight: bold;", data);
    }
    if (error) {
      console.error("%c💥 Detalhes do Erro:", "font-weight: bold;", error);
    }

    console.groupEnd();
  },

  /**
   * Log final do resultado da carga
   */
  finishLoad: (
    inputUrlOrId: string,
    result: {
      sucesso: boolean;
      totalFaixas?: number;
      nomePlaylist?: string;
      modo?: string;
      error?: any;
    }
  ) => {
    if (result.sucesso) {
      console.log(
        `%c✅ [POBREMUSIC] Playlist carregada com sucesso! (${result.totalFaixas} faixas | "${result.nomePlaylist}") [Modo: ${result.modo || "API"}]`,
        "color: #10b981; font-weight: bold; font-size: 11px;"
      );
    } else {
      console.error(
        `%c❌ [POBREMUSIC] Falha ao carregar playlist para "${inputUrlOrId}":`,
        "color: #ef4444; font-weight: bold; font-size: 11px;",
        result.error
      );
    }
  },
};
