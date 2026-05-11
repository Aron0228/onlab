import {authenticate} from '@loopback/authentication';
import {inject, service} from '@loopback/core';
import {get, HttpErrors, param, Response, RestBindings} from '@loopback/rest';
import {SecurityBindings, UserProfile} from '@loopback/security';
import {WORKSPACE_PERMISSION} from '../../constants';
import {GithubService, WorkspaceAuthorizationService} from '../../services';

export class GithubController {
  constructor(
    @service(GithubService)
    private githubService: GithubService,
    @service(WorkspaceAuthorizationService)
    private workspaceAuthorizationService: WorkspaceAuthorizationService,
  ) {}

  @get('/github/installApp')
  @authenticate('jwt-query')
  async installGithubApp(
    @inject(SecurityBindings.USER)
    userProfile: UserProfile,
    @inject(RestBindings.Http.RESPONSE) response: Response,
    @param.query.string('workspaceId') workspaceId?: string,
  ) {
    if (!workspaceId) {
      throw new HttpErrors.BadRequest(
        'The "workspaceId" query parameter is required.',
      );
    }

    const normalizedWorkspaceId = Number.parseInt(workspaceId, 10);
    const userId =
      this.workspaceAuthorizationService.getAuthenticatedUserId(userProfile);

    if (!Number.isFinite(normalizedWorkspaceId)) {
      throw new HttpErrors.BadRequest(
        'The "workspaceId" query parameter must be a number.',
      );
    }

    await this.workspaceAuthorizationService.assertPermission(
      normalizedWorkspaceId,
      userId,
      WORKSPACE_PERMISSION.GITHUB_INSTALL_MANAGE,
    );

    const url = await this.githubService.getInstallationUrl({
      workspaceId: normalizedWorkspaceId,
      userId,
    });
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
