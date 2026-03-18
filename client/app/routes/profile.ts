import Route from '@ember/routing/route';
import type Transition from '@ember/routing/transition';

type ProfileRouteModel = {
  routeBack: string;
};

export default class ProfileRoute extends Route {
  model(_: unknown, transition: Transition): ProfileRouteModel {
    return {
      routeBack: transition.to?.queryParams.routeBack ?? 'workspaces.index',
    };
  }
}
