import { useState } from 'react';
import {
  HOME_SETTINGS_ACTIONS_FOR_NOTIFY, NOTIFICATION_EVENTS, NOTIFICATION_MANAGER_ACTIONS,
  NOTIFICATION_MANAGER_CHANGED_EVENT, NOTIFICATION_SUMMARY_VERSION,
  type NotificationEvent, type NotificationManagerRule, type NotificationManagerSummary,
} from './notificationManager';
import { ADDRESS_FILTER_KEYS, RESOLVE_IDENTITIES_CHUNK_SIZE } from './identity';
import { copyTextToClipboard } from './clipboard';
import { ReferenceNavigation } from './ReferenceNavigation';

const CREATED_AT = '2026-01-01T00:00:00.000Z';
const EXAMPLE_ADDRESS = 'QUE2MRfg3vgxdLxNfLbjBS9jsyBSujeVED';
export const RULE_EXAMPLES = {
  RESOURCE_PUBLISHED: { notificationId: 'example.resource', event: 'RESOURCE_PUBLISHED', createdAt: CREATED_AT, filters: { service: 'APP', names: ['Example'] }, maskedFilterKeys: [], title: 'Example update', text: 'New resource', link: 'qdn://APP/Example/Example' },
  PAYMENT_RECEIVED: { notificationId: 'example.payment', event: 'PAYMENT_RECEIVED', createdAt: CREATED_AT, filters: {}, maskedFilterKeys: ['recipient'] },
  CHAT_MESSAGE: { notificationId: 'example.chat', event: 'CHAT_MESSAGE', createdAt: CREATED_AT, filters: { involving: [EXAMPLE_ADDRESS] }, maskedFilterKeys: [], partiallyMaskedFilterKeys: ['involving'] },
  TRANSACTION_CONFIRMED: { notificationId: 'example.confirmed', event: 'TRANSACTION_CONFIRMED', createdAt: CREATED_AT, filters: {}, maskedFilterKeys: ['signature'] },
  FOREIGN_PAYMENT_RECEIVED: { notificationId: 'example.foreign', event: 'FOREIGN_PAYMENT_RECEIVED', createdAt: CREATED_AT, filters: { coin: 'LTC' }, maskedFilterKeys: ['xpub'] },
} satisfies Record<NotificationEvent, NotificationManagerRule>;

export const SUMMARY_EXAMPLE = {
  version: NOTIFICATION_SUMMARY_VERSION, revision: 7,
  apps: [{ appKey: 'qdn://APP/Example/Example', grant: { grantedAt: CREATED_AT, muted: false }, rules: Object.values(RULE_EXAMPLES) }],
} satisfies NotificationManagerSummary;

export const MUTATION_EXAMPLES = {
  mute: { action: NOTIFICATION_MANAGER_ACTIONS[2], appKey: SUMMARY_EXAMPLE.apps[0].appKey, muted: true, expectedRevision: SUMMARY_EXAMPLE.revision },
  remove: { action: NOTIFICATION_MANAGER_ACTIONS[3], appKey: SUMMARY_EXAMPLE.apps[0].appKey, notificationIds: [RULE_EXAMPLES.RESOURCE_PUBLISHED.notificationId], expectedRevision: SUMMARY_EXAMPLE.revision },
  revoke: { action: NOTIFICATION_MANAGER_ACTIONS[4], appKey: SUMMARY_EXAMPLE.apps[0].appKey, expectedRevision: SUMMARY_EXAMPLE.revision },
} as const;

export const REFERENCE_SNIPPETS = {
  capabilities: `const actions = await qdnRequest({ action: 'SHOW_ACTIONS' });
const required = ${JSON.stringify(NOTIFICATION_MANAGER_ACTIONS)};
if (!Array.isArray(actions) || !required.every(action => actions.includes(action))) {
  throw new Error('Qortium Home notification manager is unavailable.');
}
const permission = await qdnRequest({ action: 'NOTIFICATION_MANAGER_HAS_PERMISSION' });
// Non-prompting check. Only GET after the user chooses to proceed.
if (permission.granted) {
  const summary = await qdnRequest({ action: 'NOTIFICATION_MANAGER_GET' });
  if (summary.version !== ${NOTIFICATION_SUMMARY_VERSION} || !Number.isSafeInteger(summary.revision)
      || summary.revision < 0 || !Array.isArray(summary.apps)) {
    throw new Error('Unsupported notification summary');
  }
}`,
  summary: JSON.stringify(SUMMARY_EXAMPLE, null, 2),
  mute: `// Use the summary the user reviewed, not a freshly fetched revision
// attached to an old, unreviewed decision. This function does not run itself.
async function setMuted(summary, appKey, muted) {
  return qdnRequest({ action: '${NOTIFICATION_MANAGER_ACTIONS[2]}',
    appKey, muted, expectedRevision: summary.revision });
}
// On HOME_DATA_STALE: fetch again, show the new state, and let the user retry.
// On ambiguous failure: refresh; do not blindly replay the mutation.`,
  removal: `// Each is a separate request, after confirmation against the displayed summary.
// Replace synthetic app/rule IDs and revision with the reviewed current values.
${JSON.stringify(MUTATION_EXAMPLES.remove, null, 2)}

// Revocation removes the app's notification grant AND all of its rules.
${JSON.stringify(MUTATION_EXAMPLES.revoke, null, 2)}`,
  settings: `const actions = await qdnRequest({ action: 'SHOW_ACTIONS' });
if (!Array.isArray(actions) || !${JSON.stringify(HOME_SETTINGS_ACTIONS_FOR_NOTIFY)}.every(action => actions.includes(action))) {
  throw new Error('Home settings bridge is unavailable');
}
const settings = await qdnRequest({ action: 'GET_HOME_SETTINGS' });
// Only after the user chooses this change; Home requests its own approval.
const updated = await qdnRequest({
  action: 'UPDATE_HOME_SETTINGS', patch: { appNotifications: !settings.appNotifications },
});
// Read updated.appNotifications; this uses Home's settings approval,
// not the notification manager's expectedRevision.`,
  identities: `async function resolveVisibleAddresses(addresses) {
  const actions = await qdnRequest({ action: 'SHOW_ACTIONS' });
  if (!Array.isArray(actions) || !actions.includes('RESOLVE_IDENTITIES')) return [];
  const unique = [...new Set(addresses)];
  const results = [];
  for (let offset = 0; offset < unique.length; offset += ${RESOLVE_IDENTITIES_CHUNK_SIZE}) {
    results.push(...await qdnRequest({ action: 'RESOLVE_IDENTITIES',
      addresses: unique.slice(offset, offset + ${RESOLVE_IDENTITIES_CHUNK_SIZE}) }));
  }
  return results; // [{ address, name, avatarSrc }]; absent names/avatars are null.
}
// Pass only validated visible ${ADDRESS_FILTER_KEYS.join('/')} values.
// Keep masked values hidden. Ignore responses from superseded summaries.`,
} as const;

export function Reference() {
  const [copied, setCopied] = useState('');
  async function copy(key: string, text: string, button: HTMLButtonElement) {
    setCopied(await copyTextToClipboard(text) ? key : 'unavailable');
    button.focus({ preventScroll: true });
  }
  return <article className="reference" lang="en" dir="ltr" aria-label="Notify developer reference">
    <header className="reference-header">
      <h2>Developers</h2><p>Qortium Home notification manager · summary version {NOTIFICATION_SUMMARY_VERSION}</p>
      <ReferenceNavigation />
      <p className="copy-status" role="status" aria-live="polite">{copied === 'unavailable' ? 'Clipboard unavailable. Select the code and copy it manually.' : copied ? `Copied ${copied} example.` : 'Code examples can be selected for manual copying.'}</p>
    </header>
    <div className="reference-scroll">
      <section id="reference-contract" tabIndex={-1}>
        <h3>Contract and authority</h3>
        <p>Notify is published on Qortium QDN as <code>APP/Notify/Notify</code>. Its public app bundle contains no notification profile. Grants and rules belong to Home’s device-local store; Notify does not publish them to QDN or keep a competing local store. This app has no Qortal app integration or Qortal QDN publication.</p>
        <p>Discover all {NOTIFICATION_MANAGER_ACTIONS.length} manager actions using <code>SHOW_ACTIONS</code>: {NOTIFICATION_MANAGER_ACTIONS.map((action, i) => <span key={action}>{i ? ', ' : ''}<code>{action}</code></span>)}. The manager was introduced at Home platform level 1.5; capability discovery, not a version string or node URL, determines availability.</p>
        <p><code>NOTIFICATION_MANAGER_HAS_PERMISSION</code> returns <code>{'{ granted: boolean }'}</code> without prompting. The first permitted read through <code>NOTIFICATION_MANAGER_GET</code> can request durable <code>notifications.manage</code> access. Notify asks after Grant access is chosen; it also rechecks on focus. Denial is a rejected promise. Other manager operations require this permission too.</p>
        <p>This is broad administrative access to the sanitized notification settings of all apps on the device. It can mute, remove rules and revoke producer notification grants. It grants no wallet keys or spending authority. Home Settings can revoke Notify’s manager access independently; revoking an app through this manager concerns that app’s notification grant, not every Home capability.</p>
        <p>Rule creation/replacement and sending notifications are producer operations. Notify’s manager actions cannot perform them. Discover producer actions separately; manager availability does not imply that a Home version supports registering new subscriptions.</p>
      </section>
      <section id="reference-summary" tabIndex={-1}>
        <h3>Summary and privacy</h3>
        <p>Reads and mutations return <code>{'{ version, revision, apps }'}</code>. Version is {NOTIFICATION_SUMMARY_VERSION}; revision is a nonnegative safe integer. Notify checks this envelope and relies on Home for nested-record validation and sanitization. Unknown versions or an invalid envelope are rejected. Independent clients should validate nested records before rendering untrusted data.</p>
        <dl>
          <dt>App</dt><dd><code>appKey: string</code>, <code>grant: null | {'{ grantedAt: string, muted?: boolean }'}</code>, and <code>rules: Rule[]</code>. Keys identify originating QDN apps, commonly <code>qdn://APP/Name/Identifier</code>. An app can have rules without a grant; mute requires a grant. Missing muted means false.</dd>
          <dt>Rule</dt><dd>String <code>notificationId</code>, <code>event</code>, ISO timestamp <code>createdAt</code>, <code>filters</code>, <code>maskedFilterKeys: string[]</code>, optional <code>partiallyMaskedFilterKeys: string[]</code>, and optional strings <code>title</code>, <code>text</code>, <code>link</code>. Grant timestamps use ISO strings too. IDs belong to the originating app; they are not global IDs.</dd>
          <dt>Events</dt><dd>{NOTIFICATION_EVENTS.map((event, i) => <span key={event}>{i ? ', ' : ''}<code>{event}</code></span>)}. These describe stored rules; their presence is not proof that the current host is running every producer/delivery backend.</dd>
          <dt>Filters</dt><dd>A record of booleans, numbers, strings or string arrays. Non-sensitive filters such as resource service/name or coin may be visible. Values under {ADDRESS_FILTER_KEYS.map((key, i) => <span key={key}>{i ? ', ' : ''}<code>{key}</code></span>)} survive only when Home validates them as Q-addresses (the shared address format). Invalid or contact-like values are hidden; mixed arrays retain safe addresses and mark partial masking.</dd>
        </dl>
        <p>Home strips account bindings, masks signature filters, and removes the xpub filter from foreign-payment rules. <code>maskedFilterKeys</code> reports fully hidden keys; <code>partiallyMaskedFilterKeys</code> reports incomplete arrays whose surviving values remain visible. Notify displays “hidden” or “+ hidden” markers and never reconstructs omitted values. Optional notification template title/text/link fields remain visible; sanitization does not make user-supplied free text secret.</p>
        <p>Notify never receives delivered-notification history or wallet private keys through this manager. Foreign-payment rules use a shared watch-only Core wallet view: address history, never spending authority. Masking the xpub from Notify does not hide that history from the Core used by the producer.</p>
      </section>
      <section id="reference-mutations" tabIndex={-1}>
        <h3>Mutations and revisions</h3>
        <p>Each mutation sends <code>appKey</code> and <code>expectedRevision</code> from the displayed summary. <code>NOTIFICATION_MANAGER_SET_MUTED</code> additionally takes boolean <code>muted</code>; it preserves the grant and rules. <code>NOTIFICATION_MANAGER_REMOVE_RULES</code> takes a nonempty <code>notificationIds</code> array and preserves the grant. <code>NOTIFICATION_MANAGER_REVOKE</code> removes both the app’s notification grant and its rules.</p>
        <p>Home validates exact fields and performs the revision check before applying the change. Use the returned complete summary, not a guessed revision. <code>HOME_DATA_STALE</code> means refresh and ask the user to review/retry; no silent overwrite or automatic replay. An ambiguous transport failure does not prove a mutation was rejected. Rule removal and revocation show confirmation dialogs; restoration of removed rules belongs to the producer, not to a hidden undo store in Notify.</p>
        <p>Home 2 rejects corrupt/unavailable stores with <code>HOME_NOTIFICATION_STORE_CORRUPT</code> or <code>HOME_NOTIFICATION_STORE_UNAVAILABLE</code>. Do not interpret these as an empty profile. Manager changes are device-local operations, without blockchain confirmation or QDN publication.</p>
        <p><code>{NOTIFICATION_MANAGER_CHANGED_EVENT}</code> carries only <code>detail.revision</code>. Android also sends <code>qortium:notification-manager-changed</code> with the same detail. Notify accepts parent-sourced messages, refetches on a newer revision, and discards out-of-order responses. The event is a refresh hint, never a replacement summary.</p>
        <p>Host limits checked for summary version 1: stored rules are bounded at 20 per app; notification IDs use 1–64 ASCII letters, digits, dot, underscore or hyphen. Home trims/deduplicates removal IDs. Manager mutation app keys accept qdn APP/WEBSITE forms up to 2048 characters; display parsing alone does not guarantee a key is writable. These are Home-owned rules, not newly imposed client permissions.</p>
      </section>
      <section id="reference-settings" tabIndex={-1}>
        <h3>Home settings and compatibility</h3>
        <p>Detect {HOME_SETTINGS_ACTIONS_FOR_NOTIFY.map((action, i) => <span key={action}>{i ? ' and ' : ''}<code>{action}</code></span>)} separately. They gate the global App notifications switch, not manager access. Notify writes only <code>{'{ patch: { appNotifications: boolean } }'}</code>. Home 2 requests approval for each settings change; the manager grant and manager revision are not that approval. A rejected change restores the displayed switch state.</p>
        <p>Theme, language, accent, text size and UI style are read from Home and followed through its change events. The Developers body remains English and left-to-right. The global switch controls delivery; turning it off does not delete grants or rules and does not grant Notify access to their content.</p>
        <p><code>RESOLVE_IDENTITIES</code> is optional. Notify deduplicates visible address-filter values and sends at most {RESOLVE_IDENTITIES_CHUNK_SIZE} per call. Responses contain <code>{'{ address, name, avatarSrc }'}</code>; unresolved or unavailable identities keep the raw address. Superseded responses are ignored. This can retrieve public identity/avatar data through Home, even though Notify does not itself read Core resources.</p>
        <p>In a plain browser, the shell and reference render but Home’s manager is unavailable. There is no local notification-store fallback. Canonical route: <code>qdn://APP/Notify/Notify?view=developers</code>. Developer/reference aliases normalize to developers, taking precedence over <code>?app=...</code> without discarding that selection. Section navigation owns <code>section</code> and preserves app, Home/unknown/repeated parameters and the fragment. Returning to App notifications removes view/section; Back/Forward restores the workspace and selected app.</p>
      </section>
      <section id="reference-examples" tabIndex={-1}>
        <h3>Bridge examples</h3><p>All records below are synthetic sanitized summaries, not producer registration payloads. Copying does not run requests. Use current Home-provided IDs and the revision of the state the user reviewed before any mutation.</p>
        {Object.entries(REFERENCE_SNIPPETS).map(([key, snippet]) => <div className="reference-example" key={key}>
          <h4>{key}</h4><button type="button" className="command-button command-button--secondary" aria-label={`Copy ${key} example`} onClick={event => void copy(key, snippet, event.currentTarget)}>Copy</button>
          <pre aria-label={`${key} example`}><code>{snippet}</code></pre>
        </div>)}
      </section>
    </div>
  </article>;
}
