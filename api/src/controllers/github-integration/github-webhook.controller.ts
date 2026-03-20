import {post, requestBody, RestBindings, Request} from '@loopback/rest';
import {inject, service} from '@loopback/core';
import {
  GithubWebhookPayload,
  GithubWebhookService,
} from '../../services/github-integration/github-webhook.service';

export class GithubWebhookController {
  private readonly debugInstallationId = 113596655;

  constructor(
    @service(GithubWebhookService)
    private githubWebhookService: GithubWebhookService,
  ) {}

  @post('/github/webhook')
  async handleWebhook(
    @requestBody() body: GithubWebhookPayload,
    @inject(RestBindings.Http.REQUEST) request: Request,
  ) {
    const event = request.headers['x-github-event'] as string;

    console.log(body);

    await this.githubWebhookService.handleWebhook(event, body);

    return {ok: true};
  }
}
