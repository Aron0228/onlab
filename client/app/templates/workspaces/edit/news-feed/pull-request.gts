import type { TOC } from '@ember/component/template-only';
import RoutesWorkspacesEditPullRequestsEdit from 'client/components/routes/workspaces/edit/pull-requests/edit';
import type { WorkspacesEditNewsFeedPullRequestRouteModel } from 'client/routes/workspaces/edit/news-feed/pull-request';

interface NewsFeedPullRequestSignature {
  Args: {
    model: WorkspacesEditNewsFeedPullRequestRouteModel;
    controller: unknown;
  };
}

<template>
  <RoutesWorkspacesEditPullRequestsEdit
    @model={{@model}}
    @closeRoute="workspaces.edit.news-feed"
    @closeModel={{@model.workspaceId}}
  />
</template> satisfies TOC<NewsFeedPullRequestSignature>;
