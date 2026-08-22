interface GoogleTokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
  expires_in?: number | string;
}

interface GoogleTokenClient {
  requestAccessToken(options?: {
    prompt?: "" | "none" | "consent" | "select_account";
  }): void;
}

interface Window {
  google?: {
    accounts: {
      oauth2: {
        initTokenClient(config: {
          client_id: string;
          scope: string;
          hint?: string;
          callback(response: GoogleTokenResponse): void;
          error_callback?(error: unknown): void;
        }): GoogleTokenClient;
        revoke(token: string, callback?: () => void): void;
      };
    };
  };
}
