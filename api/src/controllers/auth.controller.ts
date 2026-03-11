import {inject, service} from '@loopback/core';
import {get, param, Response, RestBindings} from '@loopback/rest';
import {GithubOauthService} from '../services/auth/github-oauth.service';

export class AuthController {
  constructor(
    @service(GithubOauthService) private githubOauthService: GithubOauthService,
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
}
