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
  }
}
