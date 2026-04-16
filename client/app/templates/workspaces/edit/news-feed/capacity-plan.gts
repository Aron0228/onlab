import type { TOC } from '@ember/component/template-only';
import RoutesWorkspacesEditNewsFeedCapacityPlanPanel from 'client/components/routes/workspaces/edit/news-feed/capacity-plan-panel';
import type { WorkspacesEditNewsFeedCapacityPlanRouteModel } from 'client/routes/workspaces/edit/news-feed/capacity-plan';

interface NewsFeedCapacityPlanSignature {
  Args: {
    model: WorkspacesEditNewsFeedCapacityPlanRouteModel;
    controller: unknown;
  };
}

<template>
  <RoutesWorkspacesEditNewsFeedCapacityPlanPanel @model={{@model}} />
</template> satisfies TOC<NewsFeedCapacityPlanSignature>;
