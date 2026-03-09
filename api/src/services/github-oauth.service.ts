import {BindingScope, injectable} from '@loopback/core';
import {HttpErrors, Response} from '@loopback/rest';
import https from 'node:https';

interface GithubTokenResponse {
  access_token?: string;
  token_type?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

interface GithubUserResponse {
  id: number;
  login: string;
  name: string | null;
  avatar_url: string;
  email: string;
}

interface GithubUserApiResponse {
  id: number;
  login: string;
  name: string | null;
  avatar_url: string;
  email: string | null;
}

interface GithubUserEmailResponse {
  email: string;
  primary: boolean;
  verified: boolean;
  visibility: 'public' | 'private' | null;
}

@injectable({scope: BindingScope.TRANSIENT})
export class GithubOauthService {
  private apiHost: string;
  private githubClientId: string;
  private githubCallbackUrl: string;
  private githubClientSecret: string;
  private clientUrl: string;

  constructor() {
    this.apiHost = process.env.API_HOST!;
    this.githubClientId = process.env.GITHUB_CLIENT_ID!;
    this.githubCallbackUrl = process.env.GITHUB_CALLBACK_URL!;
    this.githubClientSecret = process.env.GITHUB_CLIENT_SECRET!;
    this.clientUrl = process.env.CLIENT_URL!;
  }

  public getAuthorizationUrl(state?: string): string {
    const authorizeUrl = new URL('https://github.com/login/oauth/authorize');
    authorizeUrl.searchParams.set('client_id', this.githubClientId);
    authorizeUrl.searchParams.set('redirect_uri', this.githubCallbackUrl);
    authorizeUrl.searchParams.set('scope', 'read:user user:email');

    if (state) {
      authorizeUrl.searchParams.set('state', state);
    }

    return authorizeUrl.toString();
  }

  public async callback(response: Response, code?: string, state?: string) {
    if (!code) {
      throw new HttpErrors.BadRequest(
        'GitHub did not provide the required "code" query parameter',
      );
    }

    const callbackUrl = new URL('/auth/callback', this.clientUrl);

    try {
      const tokenResponse = await this.exchangeCodeForAccessToken(code);
      const githubUser = await this.getGithubUser(tokenResponse.access_token!);

      callbackUrl.searchParams.set('provider', 'github');
      callbackUrl.searchParams.set('github_id', String(githubUser.id));
      callbackUrl.searchParams.set('github_login', githubUser.login);
      callbackUrl.searchParams.set('github_email', githubUser.email);
      if (state) {
        callbackUrl.searchParams.set('state', state);
      }

      console.log('GitHub OAuth success', {
        id: githubUser.id,
        login: githubUser.login,
        email: githubUser.email,
        name: githubUser.name,
      });

      return response.redirect(callbackUrl.toString());
    } catch (error: unknown) {
      callbackUrl.searchParams.set('provider', 'github');
      callbackUrl.searchParams.set(
        'error',
        error instanceof Error ? error.message : 'Unknown GitHub OAuth error',
      );
      return response.redirect(callbackUrl.toString());
    }
  }

  private async exchangeCodeForAccessToken(
    code: string,
  ): Promise<GithubTokenResponse> {
    const payload = new URLSearchParams({
      client_id: this.githubClientId,
      client_secret: this.githubClientSecret,
      code,
      redirect_uri: this.githubCallbackUrl,
    }).toString();

    const tokenResponse = await this.githubRequest<GithubTokenResponse>({
      hostname: 'github.com',
      path: '/login/oauth/access_token',
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(payload),
      },
      body: payload,
    });

    if (!tokenResponse.access_token) {
      throw new Error(
        tokenResponse.error_description ??
          tokenResponse.error ??
          'GitHub access token is missing in response',
      );
    }

    console.log(tokenResponse);

    return tokenResponse;
  }

  private async getGithubUser(
    accessToken: string,
  ): Promise<GithubUserResponse> {
    const user = await this.githubRequest<GithubUserApiResponse>({
      hostname: 'api.github.com',
      path: '/user',
      method: 'GET',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${accessToken}`,
        'User-Agent': 'devteams-api',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    const email = user.email ?? (await this.getGithubUserEmail(accessToken));

    return {
      id: user.id,
      login: user.login,
      name: user.name,
      avatar_url: user.avatar_url,
      email,
    };
  }

  private async getGithubUserEmail(accessToken: string): Promise<string> {
    const emails = await this.githubRequest<GithubUserEmailResponse[]>({
      hostname: 'api.github.com',
      path: '/user/emails',
      method: 'GET',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${accessToken}`,
        'User-Agent': 'devteams-api',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    const preferredEmail =
      emails.find(email => email.primary && email.verified) ??
      emails.find(email => email.verified) ??
      emails[0];

    if (!preferredEmail?.email) {
      throw new Error('GitHub account does not have a usable email address');
    }

    return preferredEmail.email;
  }

  private githubRequest<T>(requestData: {
    hostname: string;
    path: string;
    method: 'GET' | 'POST';
    headers: Record<string, string | number>;
    body?: string;
  }): Promise<T> {
    return new Promise((resolve, reject) => {
      const req = https.request(
        {
          hostname: requestData.hostname,
          path: requestData.path,
          method: requestData.method,
          headers: requestData.headers,
        },
        res => {
          let rawData = '';
          res.setEncoding('utf8');

          res.on('data', chunk => {
            rawData += chunk;
          });

          res.on('end', () => {
            const statusCode = res.statusCode ?? 500;

            if (statusCode < 200 || statusCode >= 300) {
              return reject(
                new Error(
                  `GitHub request failed (${statusCode}): ${rawData || 'no body'}`,
                ),
              );
            }

            try {
              const parsed = JSON.parse(rawData) as T;
              resolve(parsed);
            } catch (error: unknown) {
              reject(
                new Error(
                  `Failed to parse GitHub response: ${
                    error instanceof Error ? error.message : 'unknown error'
                  }`,
                ),
              );
            }
          });
        },
      );

      req.on('error', error => {
        reject(error);
      });

      if (requestData.body) {
        req.write(requestData.body);
      }

      req.end();
    });
  }
}
