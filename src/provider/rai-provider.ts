import type { LanguageModelV2, EmbeddingModelV2 } from '@ai-sdk/provider';
import {
  OpenAICompatibleChatLanguageModel,
  OpenAICompatibleCompletionLanguageModel,
  OpenAICompatibleEmbeddingModel,
} from '@ai-sdk/openai-compatible';
import type { FetchFunction } from '@ai-sdk/provider-utils';
import { withoutTrailingSlash } from '@ai-sdk/provider-utils';
import type { RaiChatModelId } from './rai-chat-settings';
import type { RaiCompletionModelId } from './rai-completion-settings';
import type { RaiEmbeddingModelId } from './rai-embedding-settings';
// Import your model id and settings here.

export interface RaiProviderSettings {
  /**
Client ID for OAuth2 authentication.
*/
  clientId?: string;
  /**
Client secret for OAuth2 authentication.
*/
  clientSecret?: string;
  /**
OAuth2 token endpoint URL for getting access tokens.
*/
  tokenEndpoint?: string;
  /**
Base URL for the API calls.
*/
  baseURL?: string;
  /**
Custom headers to include in the requests.
*/
  headers?: Record<string, string>;
  /**
Optional custom url query parameters to include in request urls.
*/
  queryParams?: Record<string, string>;
  /**
Custom fetch implementation. You can use it as a middleware to intercept requests,
or to provide a custom fetch implementation for e.g. testing.
*/
  fetch?: FetchFunction;
}

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
}

interface TokenManager {
  token: string | null;
  expiresAt: number | null;
  getValidToken(): Promise<string>;
}

export interface RaiProvider {
  /**
Creates a model for text generation.
*/
  (
    modelId: RaiChatModelId,
    // settings?: RaiChatSettings,
  ): LanguageModelV2;

  /**
Creates a chat model for text generation.
*/
  chatModel(
    modelId: RaiChatModelId,
    // settings?: RaiChatSettings,
  ): LanguageModelV2;

  /**
Creates a completion model for text generation.
*/
  completionModel(
    modelId: RaiCompletionModelId,
    // settings?: RaiCompletionSettings,
  ): LanguageModelV2;

  /**
Creates a text embedding model for text generation.
*/
  textEmbeddingModel(
    modelId: RaiEmbeddingModelId,
    // settings?: RaiEmbeddingSettings,
  ): EmbeddingModelV2<string>;
}

export function createRai(
  options: RaiProviderSettings = {},
): RaiProvider {
  const baseURL = withoutTrailingSlash(
    options.baseURL ?? 'https://api.example.com/v1',
  );
  
  const tokenEndpoint = options.tokenEndpoint ?? 'https://api.example.com/oauth/token';
  
  const clientId = options.clientId ?? import.meta.env.VITE_EAM_KEY;
  const clientSecret = options.clientSecret ?? import.meta.env.VITE_EAM_SECRET;
  const raiClientId = import.meta.env.VITE_RAI_CLIENT_ID;

  if (!clientId) {
    throw new Error('RAI client ID is required. Provide it via options.clientId or VITE_EAM_KEY environment variable.');
  }
  
  if (!clientSecret) {
    throw new Error('RAI client secret is required. Provide it via options.clientSecret or VITE_EAM_SECRET environment variable.');
  }

  // Token manager for handling OAuth2 token lifecycle
  const tokenManager: TokenManager = {
    token: null,
    expiresAt: null,
    
    async getValidToken(): Promise<string> {
      const now = Date.now();
      
      // Return cached token if still valid (with 60s buffer)
      if (this.token && this.expiresAt && now < this.expiresAt - 60000) {
        return this.token;
      }
      
      // Get new token
      const fetchFn = options.fetch ?? fetch;
      
      try {
        const tokenResponse = await fetchFn(tokenEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: clientId,
            client_secret: clientSecret,
          }),
        });

        if (!tokenResponse.ok) {
          throw new Error(`Token request failed: ${tokenResponse.status} ${tokenResponse.statusText}`);
        }

        const tokenData: TokenResponse = await tokenResponse.json();
        
        this.token = tokenData.access_token;
        // Set expiration (default to 1 hour if not provided)
        const expiresInMs = (tokenData.expires_in ?? 3600) * 1000;
        this.expiresAt = now + expiresInMs;
        
        return this.token;
      } catch (error) {
        throw new Error(`Failed to obtain access token: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },
  };

  // Custom fetch with token management and retry logic
  const fetchWithAuth: FetchFunction = async (input: RequestInfo | URL, init?: RequestInit) => {
    const fetchFn = options.fetch ?? fetch;
    
    const makeRequest = async (retryOn401 = true): Promise<Response> => {
      // Get fresh token for each request to avoid race conditions
      const token = await tokenManager.getValidToken();
      
      const authHeaders: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        ...options.headers,
      };
      
      // Add RAI client ID header if available
      if (raiClientId) {
        authHeaders['X-RAI-Client-ID'] = raiClientId;
      }
      
      const mergedInit = {
        ...init,
        headers: {
          ...authHeaders,
          ...(init?.headers || {}),
        },
      };
      
      const response = await fetchFn(input, mergedInit);
      
      // Retry once on 401 with fresh token
      if (response.status === 401 && retryOn401) {
        // Force token refresh by clearing cache
        tokenManager.token = null;
        tokenManager.expiresAt = null;
        return makeRequest(false);
      }
      
      return response;
    };
    
    return makeRequest();
  };

  const getCommonModelConfig = (modelType: string) => ({
    provider: `rai.${modelType}`,
    url: ({ path }: { path: string }) => {
      const url = new URL(`${baseURL}${path}`);
      if (options.queryParams) {
        url.search = new URLSearchParams(options.queryParams).toString();
      }
      return url.toString();
    },
    headers: () => ({}), // Empty since all auth is handled in fetchWithAuth
    fetch: fetchWithAuth,
  });

  const createChatModel = (
    modelId: RaiChatModelId,
  ) => {
    return new OpenAICompatibleChatLanguageModel(
      modelId,
      getCommonModelConfig('chat'),
    );
  };

  const createCompletionModel = (
    modelId: RaiCompletionModelId,
  ) =>
    new OpenAICompatibleCompletionLanguageModel(
      modelId,
      getCommonModelConfig('completion')
    );

  const createTextEmbeddingModel = (
    modelId: RaiEmbeddingModelId,
  ) =>
    new OpenAICompatibleEmbeddingModel(
      modelId,
      getCommonModelConfig('embedding'),
    );

  const provider = (
    modelId: RaiChatModelId,
  ) => createChatModel(modelId);

  provider.completionModel = createCompletionModel;
  provider.chatModel = createChatModel;
  provider.textEmbeddingModel = createTextEmbeddingModel;

  return provider;
}

// Export default instance
export const rai = createRai();