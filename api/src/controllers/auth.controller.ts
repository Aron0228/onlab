import {authenticate} from '@loopback/authentication';
import {inject, service} from '@loopback/core';
import {
  get,
  HttpErrors,
  param,
  post,
  Request,
  Response,
  RestBindings,
} from '@loopback/rest';
import {GithubOauthService, JwtTokenService} from '../services/auth';

export class AuthController {
  constructor(
    @service(GithubOauthService) private githubOauthService: GithubOauthService,
    @service(JwtTokenService) private jwtTokenService: JwtTokenService,
  ) {}

  @get('/auth/github')
  async github(
    @inject(RestBindings.Http.RESPONSE) response: Response,
    @param.query.string('state') state?: string,
  ) {
    const url = this.githubOauthService.getAuthorizationUrl(state);
    return response.redirect(url);
  }

  @get('/auth/github/callback')
  async githubCallback(
    @inject(RestBindings.Http.RESPONSE) response: Response,
    @param.query.string('code') code?: string,
  ) {
    return await this.githubOauthService.callback(response, code);
  }

  @post('/auth/logout')
  @authenticate('jwt-header')
  async logout(
    @inject(RestBindings.Http.REQUEST) request: Request,
  ): Promise<{message: string}> {
    const token = this.getBearerToken(request);

    if (!token) {
      throw new HttpErrors.Unauthorized('Missing authentication token.');
    }

    try {
      await this.jwtTokenService.revokeToken(token);
    } catch {
      throw new HttpErrors.Unauthorized(
        'Authentication token could not be revoked.',
      );
    }

    return {message: 'Logged out successfully.'};
  }

  private getBearerToken(request: Request): string | undefined {
    const authorizationHeader = request.headers.authorization;

    if (!authorizationHeader?.startsWith('Bearer ')) {
      return undefined;
    }

    return authorizationHeader.slice('Bearer '.length).trim() || undefined;
  }
}
