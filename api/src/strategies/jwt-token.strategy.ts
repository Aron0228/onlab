import {AuthenticationStrategy} from '@loopback/authentication';
import {service} from '@loopback/core';
import {Request, RedirectRoute} from '@loopback/rest';
import {UserProfile} from '@loopback/security';
import {JwtTokenService} from '../services';
import {repository} from '@loopback/repository';
import {UserRepository} from '../repositories';

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
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return undefined;
      }
      if (!authHeader.startsWith('Bearer')) {
        return undefined;
      }

      const parts = authHeader.split(' ');
      if (parts.length !== 2) {
        return undefined;
      }

      const tokenFromRequest = parts[1];
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
}
