import { module, test } from 'qunit';
import { setupTest } from 'client/tests/helpers';

module(
  'Unit | Route | workspaces/edit/capacity-planning/edit',
  function (hooks) {
    setupTest(hooks);

    test('it exists', function (assert) {
      const route = this.owner.lookup(
        'route:workspaces/edit/capacity-planning/edit'
      );
      assert.ok(route);
    });
  }
);
