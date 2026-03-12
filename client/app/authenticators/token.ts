import BaseAuthenticator from 'ember-simple-auth/authenticators/base';

interface SessionData {
  token: string;
  expiresAt?: string;
  userId?: number;
}

export default class TokenAuthenticator extends BaseAuthenticator {
  async authenticate(data: SessionData): Promise<SessionData> {
    this.assertValidSession(data);

    await Promise.resolve();

    return data;
  }

  async restore(data: SessionData): Promise<SessionData> {
    if (this.isValidSession(data)) {
      return data;
    }

    await Promise.resolve();

    throw new Error('No valid session');
  }

  async invalidate(): Promise<void> {}

  private assertValidSession(data: SessionData): void {
    if (!this.isValidSession(data)) {
      throw new Error('No valid session');
    }
  }

  private isValidSession(data: SessionData): boolean {
    if (!data.token) {
      return false;
    }

    if (!data.expiresAt) {
      return true;
    }

    const expiresAt = Date.parse(data.expiresAt);

    if (Number.isNaN(expiresAt)) {
      return false;
    }

    return expiresAt > Date.now();
  }
}
