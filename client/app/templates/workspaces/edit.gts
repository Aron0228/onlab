import type { TOC } from '@ember/component/template-only';
import { pageTitle } from 'ember-page-title';
import RoutesWorkspacesEdit from 'client/components/routes/workspaces/edit';
import type WorkspaceModel from 'client/models/workspace';
import type GithubRepositoryModel from 'client/models/github-repository';

type WorkspacesEditModel = {
  workspace: WorkspaceModel;
  repositories: GithubRepositoryModel[];
};

interface EditSignature {
  Args: {
    model: WorkspacesEditModel;
    controller: unknown;
  };
}

<template>
  {{pageTitle "Edit"}}
  <RoutesWorkspacesEdit @model={{@model}}>
    {{outlet}}
  </RoutesWorkspacesEdit>
</template> satisfies TOC<EditSignature>;
