import type { TOC } from '@ember/component/template-only';
import { pageTitle } from 'ember-page-title';
import RoutesNotifications from 'client/components/routes/notifications';
import type { NotificationRouteModel } from 'client/routes/notifications';

interface NotificationsSignature {
  Args: {
    model: NotificationRouteModel;
  };
}

<template>
  {{pageTitle "Notifications"}}
  <RoutesNotifications @notifications={{@model.notifications}} />
  {{outlet}}
</template> satisfies TOC<NotificationsSignature>;
