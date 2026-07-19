export const EN_STRINGS = {
  'app.title': 'Qortium Notify',
  'app.tagline': 'Manage which apps can send notifications through Qortium Home.',

  'action.grantAccess': 'Grant access',
  'action.mute': 'Mute',
  'action.unmute': 'Unmute',
  'action.refresh': 'Refresh',
  'action.retry': 'Retry',
  'action.back': 'Back',
  'action.cancel': 'Cancel',
  'action.revoke': 'Revoke access',
  'action.removeSelected': 'Remove selected rules',
  'action.selectAll': 'Select all',
  'action.clearSelection': 'Clear selection',

  'bridge.unavailable.title': 'Open this app inside Qortium Home',
  'bridge.unavailable.body':
    'Notify manages the notification permissions and background rules other apps register with Home. It only works when Home provides the QDN app bridge — open qdn://APP/Notify/Notify inside Qortium Home to use it.',
  'bridge.unsupported.title': 'Needs a newer Qortium Home',
  'bridge.unsupported.body':
    'This build of Qortium Home does not yet expose the notification manager bridge actions. Update Home to manage app notification settings here.',

  'permission.title': 'Allow Notify to manage app notifications',
  'permission.body':
    'Notify reads a sanitized summary of every app’s notification grant and background rules, and can mute, unmute, remove rules for, or revoke any app. It cannot see delivered notifications, and Home always hides account bindings, wallet keys, addresses, contacts, and signatures.',
  'permission.denied': 'Home denied the notification manager permission. You can try again at any time.',

  'global.title': 'App notifications',
  'global.body': 'The master switch for every app’s background and direct notifications in Home.',
  'global.on': 'On',
  'global.off': 'Off',
  'global.unavailable': 'This build of Home does not expose the global notifications setting here.',
  'global.updateError': 'Could not update the global notifications setting.',

  'summary.appsGranted.one': '{count} app has notification access',
  'summary.appsGranted.other': '{count} apps have notification access',
  'summary.appsMuted': '{count} muted',

  'list.title': 'Apps',
  'list.empty.title': 'No apps have requested notification access yet',
  'list.empty.body':
    'Apps that ask Home to send notifications or watch for events will appear here once you approve them.',
  'list.rules.one': '{count} rule',
  'list.rules.other': '{count} rules',

  'grant.active': 'Active',
  'grant.muted': 'Muted',
  'grant.grantedAt': 'Granted {date}',
  'grant.none': 'No notification grant',

  'event.resourcePublished': 'New QDN resource published',
  'event.paymentReceived': 'Payment received',
  'event.chatMessage': 'Chat message',
  'event.transactionConfirmed': 'Transaction confirmed',
  'event.foreignPaymentReceived': 'Foreign payment received',

  'detail.selectPrompt': 'Select an app to manage its notification access.',
  'detail.rulesTitle': 'Background rules',
  'detail.rulesEmpty': 'This app has a notification grant but no background rules right now.',
  'detail.rulesEmptyNoGrant': 'This app has no notification grant or background rules.',
  'detail.maskedFilters': 'Home hides some filter values from Notify:',
  'detail.maskedFilterChip': '{key}: hidden',
  'detail.event': 'Event',
  'detail.created': 'Added {date}',
  'detail.link': 'Opens',

  'confirm.revoke.title': 'Revoke notification access?',
  'confirm.revoke.body.one':
    'This deletes {appName}’s notification grant and its {count} background rule. The app must ask again before it can send notifications.',
  'confirm.revoke.body.other':
    'This deletes {appName}’s notification grant and all {count} background rules. The app must ask again before it can send notifications.',
  'confirm.removeRules.title': 'Remove selected rules?',
  'confirm.removeRules.body.one':
    'This removes {count} selected background rule from {appName}. Its notification grant is kept.',
  'confirm.removeRules.body.other':
    'This removes {count} selected background rules from {appName}. Its notification grant is kept.',

  'state.loading': 'Loading notification settings…',
  'state.error': 'Could not load notification settings.',
  'state.stale.title': 'Notification settings changed elsewhere',
  'state.stale.body':
    'Another view or Home itself changed these settings. Refresh to see the current state before trying again.',

  'a11y.closeDialog': 'Close dialog',
} as const;
