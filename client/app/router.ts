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
  this.route('profile');
  this.route('workspaces', function () {
    this.route('callback');
    this.route('new');

    this.route('edit', { path: '/:id' }, function () {
      this.route('issues', function () {
        this.route('edit', { path: '/:issue_id' });
        this.route('new');
      });

      this.route('pull-requests', function () {
        this.route('edit', { path: '/:pull_request_id' });
      });

      this.route('settings');
    });
  });
  this.route('debug', function () {
    this.route('client');
  });
  this.route('not-found', { path: '/*path' });
});
