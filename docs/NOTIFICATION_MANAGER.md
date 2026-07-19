# Notification manager contract

Notify is a thin, purpose-built UI over Home's `notifications.manage`
capability. This document maps each `qdnRequest` action to where it's used in
`src/`, so a future change to Home's contract is easy to trace here.

## Feature detection

`SHOW_ACTIONS` must include every action in
`NOTIFICATION_MANAGER_ACTIONS` (`src/notificationManager.ts`) before Notify
shows anything but the "needs a newer Home" card:

- `NOTIFICATION_MANAGER_HAS_PERMISSION`
- `NOTIFICATION_MANAGER_GET`
- `NOTIFICATION_MANAGER_SET_MUTED`
- `NOTIFICATION_MANAGER_REMOVE_RULES`
- `NOTIFICATION_MANAGER_REVOKE`

`GET_HOME_SETTINGS` and `UPDATE_HOME_SETTINGS` are detected separately
(`src/App.tsx` `homeSettingsSupported`) since they gate only the global
**App notifications** switch, not the per-app manager UI. `RESOLVE_IDENTITIES`
is also detected separately (`identityResolutionSupported`) since it only
upgrades address filter chips with a name/avatar — its absence never blocks
the manager UI itself.

## Permission

`hasNotificationManagerPermission()` (`NOTIFICATION_MANAGER_HAS_PERMISSION`)
is the non-prompting check; Notify calls it on load and when the app regains
focus to detect a grant revoked in Home settings and decide
whether to show the permission card or go straight to the summary. The
actual grant happens implicitly on the first `NOTIFICATION_MANAGER_GET` call,
which is why **Grant access** just calls `refreshSummary()` — a denial
surfaces as a normal rejected promise, shown inline with a retry action.

## Reading and mutating

All four operations round-trip through `NotificationManagerSummary`
(`src/notificationManager.ts`), which mirrors Home's sanitized shape exactly:

| Action | Function | UI |
| --- | --- | --- |
| `NOTIFICATION_MANAGER_GET` | `getNotificationManagerSummary` | initial load, refresh button, live-event refetch |
| `NOTIFICATION_MANAGER_SET_MUTED` | `setAppMuted` | per-app Mute/Unmute button |
| `NOTIFICATION_MANAGER_REMOVE_RULES` | `removeAppRules` | rule checkboxes + "Remove selected rules" |
| `NOTIFICATION_MANAGER_REVOKE` | `revokeApp` | "Revoke access" + confirm dialog |

Every mutation sends the summary's current `revision` as `expectedRevision`.
A `HOME_DATA_STALE` rejection (`isStaleRevisionError` in `src/qdnRequest.ts`)
never triggers a silent overwrite — Notify shows a banner and refetches; the
user must retry the action once the fresh data is visible.

## Live updates

`subscribeToNotificationManagerChanged` (`src/notificationManager.ts`) wraps
the desktop `qortiumNotificationManagerChanged` window event. Android sends
the equivalent `{ type: 'qortium:notification-manager-changed', detail }`
message; Notify source-checks it and forwards only its revision into the same
handler. Both forms carry a version number, not data. Notify rejects
out-of-order responses and treats a newer revision as "go refetch", not as
something to diff or merge itself.

## Data Notify never sees

Per `NOTIFICATION_MANAGER_GET`'s sanitizing, Home strips account bindings
and masks contact-, signature-, and xpub-like filter values, plus any value
under `address`, `involving`, `recipient`, or `sender` that does not itself
validate as a Qortal address, before Notify ever receives them.
`getVisibleFilterEntries` (`src/ruleSummary.ts`) renders `maskedFilterKeys`
as a distinct, clearly labeled "hidden" chip rather than omitting them or
fabricating a placeholder value — the user should always be able to tell a
filter exists, just not its value. When a mixed array filter (e.g.
`involving`) has some but not all of its values omitted, Home lists that key
in `partiallyMaskedFilterKeys` alongside the surviving values in `filters`;
Notify renders the visible addresses plus a `+ hidden` marker rather than
implying the array is complete.

## Address filter identity resolution

The four address filter keys above are the only filter values Notify ever
receives unmasked, and only once Home has validated them as Qortal
addresses. `src/identity.ts` gathers every such address across the current
summary (`extractAddressesFromSummary`), deduplicates, and resolves them
through `RESOLVE_IDENTITIES` in batches of at most 500
(`resolveIdentities`/`chunkAddresses`) — Home's existing action, shared with
other first-party apps, that returns `[{ address, name, avatarSrc }]`.

`RESOLVE_IDENTITIES` is feature-detected on its own
(`identityResolutionSupported` in `src/App.tsx`): older Home builds simply
render the raw address with no avatar/name, never an error state. Each
resolution request carries a request id
(`isCurrentIdentityResponse`) so a summary change that arrives while a
resolve is in flight can't overwrite the map with a stale result — the same
pattern `isCurrentNotificationManagerResponse` uses for the summary itself.

`RuleCard`'s `AddressIdentity` renders the published avatar and
primary/first name when known, falling back to a monogram and the full
address when not; the address itself is always available as the chip's
`title` and via a copy button, and an avatar image load failure clears back
to the monogram rather than showing a broken image.

## Home settings (global switch)

`getHomeSettings` / `setAppNotificationsEnabled` (`src/homeSettings.ts`) read
Home's narrow settings snapshot but write only the `appNotifications` boolean
through `GET_HOME_SETTINGS` / `UPDATE_HOME_SETTINGS`. The read supplies the
initial theme, accent, language, text size, and UI style; desktop
`qortiumHomeSettingsChanged`, Android `qortium:home-settings-changed`, and
legacy display messages keep those host-owned values current.
