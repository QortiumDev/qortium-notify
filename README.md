# Qortium Notify

A QDN notification settings and subscription manager for Qortium Home. Notify
is not an inbox — it never sees delivered notifications. It manages the
elevated `notifications.manage` capability Home exposes to one trusted
administrator app: sanitized per-app grants and background rules, mute state,
selected-rule removal, and full revocation, plus Home's global app
notifications switch.

## Current features

- Feature-detects the full `NOTIFICATION_MANAGER_*` action set through
  `SHOW_ACTIONS` and shows a clear message when Home doesn't expose it yet,
  or when the app isn't running inside Home at all.
- Non-prompting permission check on load; a first explicit **Grant access**
  action triggers Home's durable approval dialog. A denial is shown inline
  with a retry action — Notify never re-prompts on its own.
- A sanitized, all-apps summary (`NOTIFICATION_MANAGER_GET`): every app that
  has ever registered a notification grant or a background rule, its mute
  state, and its rules.
- Per-app mute/unmute, selected-rule removal, and full revoke (grant + all
  rules), each guarded by Home's `expectedRevision` check.
- A stale-revision banner and refresh action when `HOME_DATA_STALE` comes
  back from a mutation — Notify always refetches rather than guessing at a
  merge, per Home's data-manager contract.
- Live updates: subscribes to desktop `qortiumNotificationManagerChanged` and
  Android `qortium:notification-manager-changed` events, then
  refetches whenever Home's revision moves, whether the change came from
  Notify itself, Home's own settings UI, or another view.
- Home's global **App notifications** switch
  (`GET_HOME_SETTINGS`/`UPDATE_HOME_SETTINGS`, `appNotifications`), shown only
  when the host exposes it.
- Masked filter values are always shown as a hidden chip, never guessed at or
  hidden entirely — Notify surfaces exactly what Home tells it was masked
  (`maskedFilterKeys`), never the underlying contact, signature, or stored
  binding. Filter values that validate as Qortal addresses (`address`,
  `involving`, `recipient`, `sender`) are the one exception: Home exposes
  those, and Notify shows each as a published name/avatar (falling back to
  the full address) resolved through `RESOLVE_IDENTITIES`, with the address
  always available as accessible text and a copy action.
- Deep-linkable selection (`?app=<appKey>`), kept in sync with the browser
  History API so Home's address bar and Back/Forward track the open app
  detail view.

Classic, Modern, and Fun all use the full app window responsively, with a
list/detail layout that stacks on narrow hosts.

## Runtime and QAVS

Qortium Home supplies the `qdnRequest` bridge and the manager/Home-settings
actions above. Notify has no useful standalone-browser mode: opening it
outside Home shows an explanatory card, since every real feature requires
Home's device-local manager state.

Notify is at QAVS `1.5.3`: `1.5` is the minimum Qortium platform level this
first release is built against, and the patch number is the app's own free
running release counter from here on. `vite.config.ts` reads `package.json`,
injects the visible version, and emits `dist/qortium-app.json` with the name
`Notify`.

The app supports Classic, Modern, and Fun QDN UI styles and follows Home
theme, accent, language, and text-size settings. Its base scale matches Home,
Help, Minting, and Boards: 13px supporting text, 16px interface text, 21px
section headings, and 28px page titles before Home's selected multiplier is
applied.

## i18n

Notify ships complete static catalogs for every language supported by Home,
including Arabic and Hebrew RTL layouts. The catalog test requires every
language to contain every message key and preserve interpolation placeholders.
Unsupported language tags still fall back safely to English.

## Development and verification

```sh
npm install
npm run dev -- --host 127.0.0.1
npm test
npm run build
npm run preview
```

## Previewnet publish

```sh
npm run build
npm run qdn:publish
```

The publisher uploads `dist/` as `qdn://APP/Notify/Notify` through the local
Core at `http://127.0.0.1:24891`. It defaults to
`~/qortium/git/qortium-core/preview/secrets/initial-minting-accounts.json`.
Overrides use the `QORTIUM_NOTIFY_` prefix.

The helper refuses missing or stale builds and will not send the preview
private key to a non-loopback plain-HTTP node. Use a local node or HTTPS;
`QORTIUM_NOTIFY_ALLOW_REMOTE_SIGN=1` is an explicit unsafe override.

The render URL is `http://127.0.0.1:24891/render/APP/Notify/Notify`. The
publisher waits for `/arbitrary/resource/status/APP/Notify/Notify?build=true`
to report `READY`.

## Contract reference

See [`docs/NOTIFICATION_MANAGER.md`](docs/NOTIFICATION_MANAGER.md) for the
exact bridge actions Notify uses and how each maps to a UI affordance. The
authoritative source is Qortium Home's own `docs/HOME_DATA_MANAGERS.md` and
`docs/APP_NOTIFICATIONS.md`.
