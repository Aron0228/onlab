import type { TOC } from '@ember/component/template-only';
import RoutesWorkspacesEditIssuesEdit from 'client/components/routes/workspaces/edit/issues/edit';
import type { WorkspacesEditNewsFeedIssueRouteModel } from 'client/routes/workspaces/edit/news-feed/issue';

interface NewsFeedIssueSignature {
  Args: {
    model: WorkspacesEditNewsFeedIssueRouteModel;
    controller: unknown;
  };
}

<template>
  <RoutesWorkspacesEditIssuesEdit
    @model={{@model}}
    @closeRoute="workspaces.edit.news-feed"
    @closeModel={{@model.workspaceId}}
  />
</template> satisfies TOC<NewsFeedIssueSignature>;
