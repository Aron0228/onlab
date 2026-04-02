import {beforeEach, describe, expect, it, vi} from 'vitest';
import {createHmac} from 'crypto';
import {HttpErrors} from '@loopback/rest';
import {GithubWebhookController} from '../../../controllers/github-integration/github-webhook.controller';

describe('GithubWebhookController (unit)', () => {
  let githubWebhookService: {
    handleWebhook: ReturnType<typeof vi.fn>;
  };
  let controller: GithubWebhookController;

  beforeEach(() => {
    process.env.GITHUB_WEBHOOK_SECRET = 'webhook-secret';
    githubWebhookService = {
      handleWebhook: vi.fn().mockResolvedValue(undefined),
    };
    controller = new GithubWebhookController(githubWebhookService as never);
  });

  it('validates the webhook signature before delegating the payload', async () => {
    const rawBody = '{"action":"opened"}';
    const signature = `sha256=${createHmac(
      'sha256',
      process.env.GITHUB_WEBHOOK_SECRET!,
    )
      .update(rawBody)
      .digest('hex')}`;
    const request = {
      headers: {
        'x-github-event': 'issues',
        'x-hub-signature-256': signature,
      },
      rawBody,
    };

    await expect(
      controller.handleWebhook({action: 'opened'} as never, request as never),
    ).resolves.toEqual({ok: true});
    expect(githubWebhookService.handleWebhook).toHaveBeenCalledWith('issues', {
      action: 'opened',
    });
  });

  it('rejects webhook requests with an invalid signature', async () => {
    const request = {
      headers: {
        'x-github-event': 'issues',
        'x-hub-signature-256': 'sha256=invalid',
      },
      rawBody: '{"action":"opened"}',
    };

    await expect(
      controller.handleWebhook({action: 'opened'} as never, request as never),
    ).rejects.toBeInstanceOf(HttpErrors.Unauthorized);
    expect(githubWebhookService.handleWebhook).not.toHaveBeenCalled();
  });
});
