import Route from '@ember/routing/route';
import type Transition from '@ember/routing/transition';

type ProfileRouteModel = {
  routeBack: string;
  routeBackUrl: string | null;
};

export default class ProfileRoute extends Route<ProfileRouteModel> {
  model(_: unknown, transition: Transition): ProfileRouteModel {
    const routeBack = transition.to?.queryParams.routeBack;
    const routeBackUrl = transition.to?.queryParams.routeBackUrl;

    return {
      routeBack:
        typeof routeBack === 'string' ? routeBack : 'workspaces.index',
      routeBackUrl: typeof routeBackUrl === 'string' ? routeBackUrl : null,
    };
  }
}
