import {inject, service} from '@loopback/core';
import {get, param, Response, RestBindings} from '@loopback/rest';
import {GithubService} from '../../services/github-integration/github.service';

export class GithubController {
  constructor(@service(GithubService) private githubService: GithubService) {}

  @get('/github/installApp')
  async installGithubApp(
    @inject(RestBindings.Http.RESPONSE) response: Response,
    @param.query.string('workspaceId') workspaceId?: string,
  ) {
    const url = await this.githubService.getInstallationUrl(workspaceId);
    return response.redirect(url);
  }

  @get('/github/callback')
  async githubCallback(
    @inject(RestBindings.Http.RESPONSE) response: Response,
    @param.query.string('installation_id') installationId?: string,
    @param.query.string('setup_action') setupAction?: string,
    @param.query.string('state') state?: string,
  ) {
    return this.githubService.callback(
      response,
      installationId,
      setupAction,
      state,
    );
  }
}
