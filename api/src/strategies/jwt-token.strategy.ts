import {AuthenticationStrategy} from '@loopback/authentication';
import {service} from '@loopback/core';
import {repository} from '@loopback/repository';
import {RedirectRoute, Request} from '@loopback/rest';
import {UserProfile} from '@loopback/security';
import {UserRepository} from '../repositories';
import {JwtTokenService} from '../services';

export class JwtTokenStrategy implements AuthenticationStrategy {
  name = 'jwt';

  constructor(
    @service(JwtTokenService) private jwtTokenService: JwtTokenService,
    @repository(UserRepository) private userRepository: UserRepository,
  ) {}

  async authenticate(
    request: Request,
  ): Promise<UserProfile | RedirectRoute | undefined> {
    try {
      const tokenFromRequest = this.getTokenFromParams(request);

      if (!tokenFromRequest) {
        return undefined;
      }

      const token = await this.jwtTokenService.validateToken(tokenFromRequest);

      if (!token) {
        return undefined;
      }

      const user = await this.userRepository.findById(token.userId);

      return user.toUserProfile();
    } catch (error) {
      console.error(error);

      return undefined;
    }
  }

  private getTokenFromParams(request: Request): string | undefined {
    const routeParams = request.params as Record<string, string | undefined>;
    const queryParams = request.query as Record<
      string,
      string | string[] | undefined
    >;

    const token =
      routeParams.token ??
      routeParams.token_id ??
      this.getFirstQueryValue(queryParams.token) ??
      this.getFirstQueryValue(queryParams.token_id);

    return token?.trim() || undefined;
  }

  private getFirstQueryValue(
    value: string | string[] | undefined,
  ): string | undefined {
    if (Array.isArray(value)) {
      return value[0];
    }

    return value;
  }
}
