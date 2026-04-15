import {inject, service} from '@loopback/core';
import {
  HttpErrors,
  post,
  requestBody,
  RestBindings,
  Request,
} from '@loopback/rest';
import {createHmac, timingSafeEqual} from 'crypto';
import {
  GithubWebhookPayload,
  GithubWebhookService,
} from '../../services/github-integration/github-webhook.service';

export class GithubWebhookController {
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
    this.assertValidWebhookSignature(request, body);

    await this.githubWebhookService.handleWebhook(event, body);

    return {ok: true};
  }

  private assertValidWebhookSignature(
    request: Request,
    body: GithubWebhookPayload,
  ): void {
    const secret = process.env.GITHUB_WEBHOOK_SECRET;

    if (!secret) {
      throw new HttpErrors.InternalServerError(
        'GITHUB_WEBHOOK_SECRET is not configured',
      );
    }

    const signatureHeader = request.headers['x-hub-signature-256'];

    if (typeof signatureHeader !== 'string' || !signatureHeader.length) {
      throw new HttpErrors.Unauthorized(
        'GitHub webhook signature header is required',
      );
    }

    const payload = this.resolveWebhookPayload(request, body);
    const expectedSignature = `sha256=${createHmac('sha256', secret)
      .update(payload)
      .digest('hex')}`;

    if (
      signatureHeader.length !== expectedSignature.length ||
      !timingSafeEqual(
        Buffer.from(signatureHeader),
        Buffer.from(expectedSignature),
      )
    ) {
      throw new HttpErrors.Unauthorized('GitHub webhook signature is invalid');
    }
  }

  private resolveWebhookPayload(
    request: Request,
    body: GithubWebhookPayload,
  ): string | Buffer {
    const rawBody = (request as Request & {rawBody?: string | Buffer}).rawBody;

    if (typeof rawBody === 'string' || Buffer.isBuffer(rawBody)) {
      return rawBody;
    }

    return JSON.stringify(body);
  }
}
