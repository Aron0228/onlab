import {BootMixin} from '@loopback/boot';
import {ApplicationConfig} from '@loopback/core';
import {RepositoryMixin} from '@loopback/repository';
import {
  RestExplorerBindings,
  RestExplorerComponent,
} from '@loopback/rest-explorer';
import {ServiceMixin} from '@loopback/service-proxy';
import path from 'path';
import {RestApplication} from '@loopback/rest';
import {MySequence} from './sequence';
import {PostgresDbDataSource} from './datasources';
import {JsonApiSerializerInterceptor} from './interceptors/json-api-serializer.interceptor';
import {JsonApiDeserializerInterceptor} from './interceptors/json-api-deserializer.interceptor';
import {JWTAuthenticationComponent} from '@loopback/authentication-jwt';
import {
  AuthenticationComponent,
  registerAuthenticationStrategy,
} from '@loopback/authentication';
import {JwtTokenStrategy} from './strategies/jwt-token.strategy';
import {QueryTokenStrategy} from './strategies/query-token.strategy';
import {
  GithubService,
  GithubWebhookService,
  GithubOauthService,
  IssueService,
  JwtTokenService,
  LabelService,
  PullRequestService,
  QueueService,
  RedisService,
} from './services';

export {ApplicationConfig};

export class RestApi extends BootMixin(
  ServiceMixin(RepositoryMixin(RestApplication)),
) {
  constructor(options: ApplicationConfig = {}) {
    super(options);

    this.dataSource(PostgresDbDataSource, 'postgresDB');

    this.bind('interceptors.json-api-serializer').toProvider(
      JsonApiSerializerInterceptor,
    );
    this.bind('interceptors.json-api-deserializer').toProvider(
      JsonApiDeserializerInterceptor,
    );

    // Set up the custom sequence
    this.sequence(MySequence);

    // Set up default home page
    this.static('/', path.join(__dirname, '../public'));

    // Customize @loopback/rest-explorer configuration here
    this.configure(RestExplorerBindings.COMPONENT).to({
      path: '/explorer',
    });
    this.component(RestExplorerComponent);
    this.component(JWTAuthenticationComponent);
    this.component(AuthenticationComponent);

    this.service(RedisService);
    this.service(QueueService);
    this.service(JwtTokenService);
    this.service(GithubOauthService);
    this.service(GithubService);
    this.service(GithubWebhookService);
    this.service(IssueService);
    this.service(LabelService);
    this.service(PullRequestService);

    this.projectRoot = __dirname;
    // Customize @loopback/boot Booter Conventions here
    this.bootOptions = {
      controllers: {
        // Customize ControllerBooter Conventions here
        dirs: ['controllers'],
        extensions: ['.controller.js'],
        nested: true,
      },
    };

    registerAuthenticationStrategy(this, JwtTokenStrategy);
    registerAuthenticationStrategy(this, QueryTokenStrategy);
  }
}
