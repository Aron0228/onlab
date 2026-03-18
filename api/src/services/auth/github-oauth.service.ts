import {BindingScope, Getter, injectable, service} from '@loopback/core';
import {HttpErrors, Response} from '@loopback/rest';
import https from 'node:https';
import {JwtTokenService} from '.';
import {DataObject, repository} from '@loopback/repository';
import {UserRepository} from '../../repositories';
import {User} from '../../models';

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
  private githubClientId: string;
  private githubCallbackUrl: string;
  private githubClientSecret: string;
  private clientUrl: string;

  constructor(
    @service(JwtTokenService) private jwtTokenService: JwtTokenService,
    @repository.getter('UserRepository')
    private userRepositoryGetter: Getter<UserRepository>,
  ) {
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

  public async callback(response: Response, code?: string) {
    if (!code) {
      throw new HttpErrors.BadRequest(
        'GitHub did not provide the required "code" query parameter',
      );
    }

    const callbackUrl = new URL('/auth/callback', this.clientUrl);

    try {
      const tokenResponse = await this.exchangeCodeForAccessToken(code);
      const githubUser = await this.getGithubUser(tokenResponse.access_token!);
      const user = await this.getOrCreateUser(githubUser);
      const token = await this.jwtTokenService.generateToken(
        user,
        tokenResponse.access_token!,
      );

      callbackUrl.searchParams.set('token_id', token.id);
      callbackUrl.searchParams.set('expires_at', token.expiresAt.toISOString());
      callbackUrl.searchParams.set('user_id', user.id.toString());

      console.log('GitHub OAuth success', {
        id: githubUser.id,
        login: githubUser.login,
        email: githubUser.email,
        name: githubUser.name,
        avatarUrl: githubUser.avatar_url,
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

  public async verifyGithubToken(token: string) {
    await this.githubRequest<{
      login: string;
      id: number;
      avatar_url: string;
      name?: string;
    }>({
      hostname: 'api.github.com',
      path: '/user',
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': 'devteams-api',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
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

  private async getOrCreateUser(githubUser: GithubUserResponse): Promise<User> {
    const userRepository = await this.userRepositoryGetter();
    const userDTO: DataObject<User> = {
      githubId: githubUser.id,
      username: githubUser.login,
      fullName: githubUser.name ?? githubUser.login,
      email: githubUser.email,
      avatarUrl: githubUser.avatar_url,
    };

    const existingUser = await userRepository.findOne({
      where: {
        githubId: githubUser.id,
      },
    });

    if (existingUser) {
      await userRepository.updateById(existingUser.id, userDTO);
      return userRepository.findById(existingUser.id);
    }

    return userRepository.create(userDTO);
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
