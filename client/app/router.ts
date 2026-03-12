import EmberRouter from '@embroider/router';
import config from 'client/config/environment';

export default class Router extends EmberRouter {
  location = config.locationType;
  rootURL = config.rootURL;
}

Router.map(function () {
  // Add route declarations here
  this.route('auth', function () {
    this.route('login');
    this.route('callback');
  });
  this.route('workspaces', function () {
    this.route('new');
  });
  this.route('debug', function () {
    this.route('client');
  });
  this.route('not-found', { path: '/*path' });
});
