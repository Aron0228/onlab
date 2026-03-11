import {TokenService} from '@loopback/authentication';
import {TokenServiceBindings} from '@loopback/authentication-jwt';
import {BindingScope, Getter, inject, injectable} from '@loopback/core';
import {DataObject, repository} from '@loopback/repository';
import {AccessTokenRepository} from '../../repositories';
import {AccessToken, User} from '../../models';
import moment from 'moment';
import {JWT_TOKEN_TTL} from '../../constants';

@injectable({scope: BindingScope.SINGLETON})
export class JwtTokenService {
  constructor(
    @inject(TokenServiceBindings.TOKEN_SERVICE)
    private tokenService: TokenService,
    @repository.getter('AccessTokenRepository')
    private accessTokenRepositoryGetter: Getter<AccessTokenRepository>,
  ) {}

  public async generateToken(
    user: User,
    githubToken: string,
  ): Promise<AccessToken> {
    const accessTokenRepository = await this.accessTokenRepositoryGetter();

    const userId = user.id;

    const jwtToken = await this.tokenService.generateToken(
      user.toUserProfile(),
    );

    const now = moment();

    const accessTokenDTO: DataObject<AccessToken> = {
      id: jwtToken,
      userId,
      githubToken,
      createdAt: now.clone().toDate(),
      expiresAt: now.clone().add(JWT_TOKEN_TTL.DEFAULT, 'minutes').toDate(),
      revoked: false,
    };

    return accessTokenRepository.create(accessTokenDTO);
  }

  public async validateToken(id: string): Promise<AccessToken | undefined> {
    const now = moment();
    const accessTokenRepository = await this.accessTokenRepositoryGetter();

    const token = await accessTokenRepository.findById(id);

    if (!token) {
      return undefined;
    }

    return now.clone().diff(moment(token.expiresAt)) && !token.revoked
      ? token
      : undefined;
  }
}
