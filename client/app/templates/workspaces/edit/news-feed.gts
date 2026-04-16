import type { TOC } from '@ember/component/template-only';
import { pageTitle } from 'ember-page-title';
import RoutesWorkspacesEditNewsFeed from 'client/components/routes/workspaces/edit/news-feed';
import type { WorkspacesEditNewsFeedRouteModel } from 'client/routes/workspaces/edit/news-feed';

interface NewsFeedSignature {
  Args: {
    model: WorkspacesEditNewsFeedRouteModel;
    controller: unknown;
  };
}

<template>
  {{pageTitle "News Feed"}}
  <div class="workspaces-edit-news-feed-layout">
    <RoutesWorkspacesEditNewsFeed @model={{@model}} />
    {{outlet}}
  </div>
</template> satisfies TOC<NewsFeedSignature>;
