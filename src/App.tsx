import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  Check,
  ChevronLeft,
  Copy,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  applyDisplaySettings,
  getDisplaySettingsUpdateFromHomeSettings,
  getDisplaySettingsUpdateFromMessage,
  getInitialDisplaySettings,
  type QdnDisplaySettings,
} from './displaySettings';
import { createTranslator, translatePlural, type TranslateFunction } from './i18n';
import { getHomeSettings, parseHomeSettingsSnapshot, setAppNotificationsEnabled } from './homeSettings';
import {
  buildIdentityMap,
  extractAddressesFromSummary,
  isCurrentIdentityResponse,
  resolveIdentities,
  type IdentityResult,
} from './identity';
import {
  hasNotificationManagerPermission,
  getNotificationManagerSummary,
  getChangedRevisionFromMessage,
  isCurrentNotificationManagerResponse,
  NOTIFICATION_MANAGER_ACTIONS,
  removeAppRules,
  revokeApp,
  setAppMuted,
  subscribeToNotificationManagerChanged,
  type NotificationManagerApp,
  type NotificationManagerSummary,
} from './notificationManager';
import { getBridgeState, hasAction, isStaleRevisionError, type BridgeState } from './qdnRequest';
import { readSelectedAppFromLocation, subscribeToPopState, writeSelectedAppToLocation } from './routes';
import {
  canMuteApp,
  countGrantedApps,
  countMutedApps,
  findAppByKey,
  formatAppDisplayName,
  formatEventLabel,
  formatRelativeTime,
  getEntryAddresses,
  getVisibleFilterEntries,
  sortAppsByDisplayName,
} from './ruleSummary';

const emptyBridgeState: BridgeState = { actions: [], isHomeBridge: false, ui: 'BROWSER_DEV' };

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function hasEveryAction(actions: string[], candidates: readonly string[]) {
  return candidates.every((candidate) => hasAction(actions, candidate));
}

function isMessageFromHost(event: MessageEvent) {
  // Notify runs embedded in Home's isolated app view (`window.parent`) or,
  // in the standalone browser fallback, has no legitimate poster at all.
  return event.source === window.parent;
}

function Switch({
  checked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: () => void;
}) {
  return (
    <button
      aria-checked={checked}
      aria-label={label}
      className="switch"
      disabled={disabled}
      onClick={onChange}
      role="switch"
      type="button"
    >
      <span className="switch__thumb" />
    </button>
  );
}

function IconButton({
  busy,
  disabled,
  icon,
  label,
  onClick,
}: {
  busy?: boolean;
  disabled?: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className={`icon-button${busy ? ' is-spinning' : ''}`}
      disabled={disabled || busy}
      onClick={onClick}
      title={label}
      type="button"
    >
      {busy ? <Loader2 aria-hidden /> : icon}
    </button>
  );
}

function CommandButton({
  busy,
  children,
  disabled,
  onClick,
  variant = 'secondary',
}: {
  busy?: boolean;
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
  variant?: 'danger' | 'primary' | 'secondary';
}) {
  return (
    <button
      className={`command-button command-button--${variant}`}
      disabled={disabled || busy}
      onClick={onClick}
      type="button"
    >
      {busy ? <Loader2 aria-hidden /> : null}
      {children}
    </button>
  );
}

function ConfirmDialog({
  body,
  busy,
  confirmLabel,
  onCancel,
  onConfirm,
  t,
  title,
}: {
  body: string;
  busy: boolean;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
  t: TranslateFunction;
  title: string;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const busyRef = useRef(busy);
  const onCancelRef = useRef(onCancel);

  busyRef.current = busy;
  onCancelRef.current = onCancel;

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;

    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busyRef.current) {
        onCancelRef.current();
        return;
      }

      if (event.key !== 'Tab' || !dialogRef.current) {
        return;
      }

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );

      if (focusable.length === 0) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener('keydown', handleKey);
    dialogRef.current?.focus();

    return () => {
      window.removeEventListener('keydown', handleKey);
      previousFocus?.focus();
    };
  }, []);

  return (
    <div
      className="modal-overlay"
      onClick={busy ? undefined : onCancel}
      role="presentation"
    >
      <div
        aria-labelledby="confirm-dialog-title"
        aria-modal="true"
        className="modal"
        onClick={(event) => event.stopPropagation()}
        ref={dialogRef}
        role="alertdialog"
        tabIndex={-1}
      >
        <h2 id="confirm-dialog-title">{title}</h2>
        <p className="modal__body">{body}</p>
        <div className="button-row">
          <CommandButton disabled={busy} onClick={onCancel} variant="secondary">
            {t('action.cancel')}
          </CommandButton>
          <CommandButton busy={busy} onClick={onConfirm} variant="danger">
            {confirmLabel}
          </CommandButton>
        </div>
      </div>
    </div>
  );
}

function AppRow({
  app,
  onSelect,
  selected,
  t,
}: {
  app: NotificationManagerApp;
  onSelect: () => void;
  selected: boolean;
  t: TranslateFunction;
}) {
  const muted = app.grant?.muted === true;
  const hasGrant = app.grant !== null;

  return (
    <li>
      <button
        aria-current={selected ? 'true' : undefined}
        className={`app-row${selected ? ' is-selected' : ''}`}
        onClick={onSelect}
        type="button"
      >
        <span className="app-row__name">{formatAppDisplayName(app.appKey)}</span>
        <span className="app-row__meta">
          <span className={`status-pill ${!hasGrant || muted ? 'status-pill--muted' : 'status-pill--good'}`}>
            {!hasGrant ? t('grant.none') : muted ? t('grant.muted') : t('grant.active')}
          </span>
          <span className="count-pill">{translatePlural(t, 'list.rules', app.rules.length)}</span>
        </span>
      </button>
    </li>
  );
}

function AddressIdentity({
  address,
  identity,
  t,
}: {
  address: string;
  identity: IdentityResult | undefined;
  t: TranslateFunction;
}) {
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [copied, setCopied] = useState(false);
  const copiedTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(
    () => () => {
      if (copiedTimeoutRef.current) {
        clearTimeout(copiedTimeoutRef.current);
      }
    },
    [],
  );

  const name = identity?.name ?? null;
  const label = name ?? address;
  const showAvatarImage = Boolean(identity?.avatarSrc) && !avatarFailed;
  const monogram = label.trim().slice(0, 1).toUpperCase() || '?';

  const copyAddress = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();

      if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
        return;
      }

      void navigator.clipboard
        .writeText(address)
        .then(() => {
          setCopied(true);
          if (copiedTimeoutRef.current) {
            clearTimeout(copiedTimeoutRef.current);
          }
          copiedTimeoutRef.current = setTimeout(() => setCopied(false), 1500);
        })
        .catch(() => {});
    },
    [address],
  );

  return (
    <span className="identity-chip" title={address}>
      <span aria-hidden="true" className="identity-chip__avatar">
        {showAvatarImage ? (
          <img alt="" onError={() => setAvatarFailed(true)} src={identity?.avatarSrc ?? undefined} />
        ) : (
          monogram
        )}
      </span>
      <span className="identity-chip__label">{label}</span>
      <button
        aria-label={t('detail.copyAddress')}
        className="identity-chip__copy"
        onClick={copyAddress}
        title={t('detail.copyAddress')}
        type="button"
      >
        {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
      </button>
    </span>
  );
}

function RuleCard({
  identityMap,
  language,
  now,
  onToggleSelect,
  rule,
  selected,
  t,
}: {
  identityMap: Map<string, IdentityResult>;
  language: string;
  now: number;
  onToggleSelect: () => void;
  rule: NotificationManagerApp['rules'][number];
  selected: boolean;
  t: TranslateFunction;
}) {
  const filterEntries = getVisibleFilterEntries(rule);

  return (
    <li className="rule-card">
      <div className="rule-card__head">
        <label className="rule-card__select">
          <input aria-label={rule.notificationId} checked={selected} onChange={onToggleSelect} type="checkbox" />
          <span>
            <span className="rule-card__title">{rule.title ?? rule.notificationId}</span>
            <br />
            <span className="rule-card__event">
              {t('detail.event')}: {formatEventLabel(rule.event, t)}
            </span>
          </span>
        </label>
        <span className="rule-card__meta">
          {t('detail.created', { date: formatRelativeTime(rule.createdAt, now, language) })}
        </span>
      </div>
      {rule.text ? <p className="rule-card__meta">{rule.text}</p> : null}
      {rule.link ? (
        <p className="rule-card__link">
          {t('detail.link')}: {rule.link}
        </p>
      ) : null}
      {filterEntries.length > 0 ? (
        <div className="filter-chips">
          {filterEntries.map((entry) => {
            if (entry.masked) {
              return (
                <span className="filter-chip filter-chip--masked" key={entry.key}>
                  {t('detail.maskedFilterChip', { key: entry.key })}
                </span>
              );
            }

            const addresses = getEntryAddresses(entry);

            if (addresses.length === 0) {
              return (
                <span className="filter-chip" key={entry.key}>
                  {entry.key}: {Array.isArray(entry.value) ? entry.value.join(', ') : String(entry.value)}
                </span>
              );
            }

            return (
              <span className="filter-chip filter-chip--identity" key={entry.key}>
                <span className="filter-chip__key">{entry.key}:</span>
                {addresses.map((address) => (
                  <AddressIdentity address={address} identity={identityMap.get(address)} key={address} t={t} />
                ))}
                {entry.partiallyMasked ? (
                  <span className="filter-chip__partial">{t('detail.partiallyMaskedFilterChip')}</span>
                ) : null}
              </span>
            );
          })}
        </div>
      ) : null}
    </li>
  );
}

export default function App() {
  const [initialAppKey] = useState(readSelectedAppFromLocation);
  const [displaySettings, setDisplaySettings] = useState<QdnDisplaySettings>(getInitialDisplaySettings);
  const t = useMemo(() => createTranslator(displaySettings.language), [displaySettings.language]);
  const [bridgeState, setBridgeState] = useState<BridgeState>(emptyBridgeState);
  const [bridgeLoaded, setBridgeLoaded] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [permissionChecked, setPermissionChecked] = useState(false);
  const [permissionBusy, setPermissionBusy] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [summary, setSummary] = useState<NotificationManagerSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [staleNotice, setStaleNotice] = useState(false);
  const [selectedAppKey, setSelectedAppKey] = useState<string | null>(initialAppKey);
  const [selectedRuleIds, setSelectedRuleIds] = useState<Set<string>>(new Set());
  const [busyAppKey, setBusyAppKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmRevokeTarget, setConfirmRevokeTarget] = useState<NotificationManagerApp | null>(null);
  const [confirmRemoveTarget, setConfirmRemoveTarget] = useState<NotificationManagerApp | null>(null);
  const [globalEnabled, setGlobalEnabled] = useState<boolean | null>(null);
  const [globalBusy, setGlobalBusy] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [identityMap, setIdentityMap] = useState<Map<string, IdentityResult>>(new Map());
  const latestSummaryRequestRef = useRef(0);
  const observedSummaryRevisionRef = useRef(-1);
  const permissionRequestRef = useRef(false);
  const latestIdentityRequestRef = useRef(0);

  const managerSupported = useMemo(
    () => hasEveryAction(bridgeState.actions, NOTIFICATION_MANAGER_ACTIONS),
    [bridgeState.actions],
  );
  const homeSettingsSupported = useMemo(
    () => hasAction(bridgeState.actions, 'GET_HOME_SETTINGS') && hasAction(bridgeState.actions, 'UPDATE_HOME_SETTINGS'),
    [bridgeState.actions],
  );
  const identityResolutionSupported = useMemo(
    () => hasAction(bridgeState.actions, 'RESOLVE_IDENTITIES'),
    [bridgeState.actions],
  );

  useLayoutEffect(() => {
    applyDisplaySettings(displaySettings);
  }, [displaySettings]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (!isMessageFromHost(event)) {
        return;
      }

      if (event.data?.type === 'qortium:home-settings-changed') {
        const settings = parseHomeSettingsSnapshot(event.data.detail);
        if (!settings) return;
        setDisplaySettings((current) => getDisplaySettingsUpdateFromHomeSettings(settings, current) ?? current);
        setGlobalEnabled(settings.appNotifications);
        return;
      }

      const notificationRevision = getChangedRevisionFromMessage(event.data);
      if (notificationRevision !== null) {
        window.dispatchEvent(new CustomEvent('qortiumNotificationManagerChanged', {
          detail: { revision: notificationRevision },
        }));
        return;
      }

      setDisplaySettings((current) => getDisplaySettingsUpdateFromMessage(event.data, current) ?? current);
    }

    window.addEventListener('message', handleMessage);

    function handleHomeSettingsChanged(event: Event) {
      const settings = parseHomeSettingsSnapshot((event as CustomEvent<unknown>).detail);
      if (!settings) return;
      setDisplaySettings((current) => getDisplaySettingsUpdateFromHomeSettings(settings, current) ?? current);
      setGlobalEnabled(settings.appNotifications);
    }

    window.addEventListener('qortiumHomeSettingsChanged', handleHomeSettingsChanged);

    return () => {
      window.removeEventListener('message', handleMessage);
      window.removeEventListener('qortiumHomeSettingsChanged', handleHomeSettingsChanged);
    };
  }, []);

  useEffect(() => {
    void getBridgeState()
      .then(setBridgeState)
      .finally(() => setBridgeLoaded(true));
  }, []);

  useEffect(() => {
    return subscribeToPopState(setSelectedAppKey);
  }, []);

  useEffect(() => {
    setSelectedRuleIds(new Set());
  }, [selectedAppKey]);

  const refreshSummary = useCallback(async () => {
    const requestId = ++latestSummaryRequestRef.current;
    setSummaryLoading(true);
    setSummaryError(null);

    try {
      const nextSummary = await getNotificationManagerSummary();

      if (isCurrentNotificationManagerResponse(
        requestId,
        latestSummaryRequestRef.current,
        nextSummary.revision,
        observedSummaryRevisionRef.current,
      )) {
        observedSummaryRevisionRef.current = nextSummary.revision;
        setSummary(nextSummary);
        setStaleNotice(false);
      }

      return nextSummary;
    } catch (error) {
      if (requestId === latestSummaryRequestRef.current) {
        setSummaryError(getErrorMessage(error, t('state.error')));
      }
      throw error;
    } finally {
      if (requestId === latestSummaryRequestRef.current) {
        setSummaryLoading(false);
      }
    }
  }, [t]);

  useEffect(() => {
    if (!bridgeLoaded || !managerSupported) {
      return;
    }

    let cancelled = false;

    void hasNotificationManagerPermission()
      .then((granted) => {
        if (cancelled) return;
        setPermissionGranted(granted);
        setPermissionChecked(true);
        if (granted) {
          void refreshSummary().catch(() => {});
        }
      })
      .catch(() => {
        if (!cancelled) setPermissionChecked(true);
      });

    return () => {
      cancelled = true;
    };
    // Intentionally only re-runs when bridge readiness/support changes; refreshSummary
    // is stable enough across renders for this one-time permission bootstrap.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bridgeLoaded, managerSupported]);

  useEffect(() => {
    if (!permissionGranted) {
      return;
    }

    return subscribeToNotificationManagerChanged((revision) => {
      if (revision <= observedSummaryRevisionRef.current) return;
      observedSummaryRevisionRef.current = revision;
      void refreshSummary().catch(() => {});
    });
  }, [permissionGranted, refreshSummary]);

  useEffect(() => {
    if (!bridgeLoaded || !managerSupported) return;

    const verifyPermission = () => {
      void hasNotificationManagerPermission().then((granted) => {
        setPermissionChecked(true);
        setPermissionGranted(granted);
        if (!granted) {
          latestSummaryRequestRef.current += 1;
          observedSummaryRevisionRef.current = -1;
          setSummary(null);
          setSummaryLoading(false);
          setSummaryError(null);
        }
      }).catch(() => {});
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') verifyPermission();
    };

    window.addEventListener('focus', verifyPermission);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('focus', verifyPermission);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [bridgeLoaded, managerSupported]);

  useEffect(() => {
    if (!bridgeLoaded || !homeSettingsSupported) {
      return;
    }

    void getHomeSettings()
      .then((settings) => {
        setGlobalEnabled(settings.appNotifications);
        setDisplaySettings((current) => getDisplaySettingsUpdateFromHomeSettings(settings, current) ?? current);
      })
      .catch(() => setGlobalEnabled(null));
  }, [bridgeLoaded, homeSettingsSupported]);

  useEffect(() => {
    if (!identityResolutionSupported || !summary) {
      latestIdentityRequestRef.current += 1;
      setIdentityMap(new Map());
      return;
    }

    const addresses = extractAddressesFromSummary(summary);

    if (addresses.length === 0) {
      latestIdentityRequestRef.current += 1;
      setIdentityMap(new Map());
      return;
    }

    const requestId = ++latestIdentityRequestRef.current;

    void resolveIdentities(addresses)
      .then((results) => {
        if (isCurrentIdentityResponse(requestId, latestIdentityRequestRef.current)) {
          setIdentityMap(buildIdentityMap(results));
        }
      })
      .catch(() => {
        // A resolution failure just leaves addresses unresolved (rendered as
        // plain text); it never blocks the rest of the summary from showing.
      });
  }, [identityResolutionSupported, summary]);

  const selectApp = useCallback((appKey: string | null) => {
    setSelectedAppKey(appKey);
    writeSelectedAppToLocation(appKey, true);
  }, []);

  const requestAccess = useCallback(async () => {
    if (permissionRequestRef.current) return;
    permissionRequestRef.current = true;
    setPermissionBusy(true);
    setPermissionError(null);

    try {
      await refreshSummary();
      setPermissionGranted(true);
    } catch (error) {
      setPermissionError(getErrorMessage(error, t('permission.denied')));
    } finally {
      permissionRequestRef.current = false;
      setPermissionBusy(false);
    }
  }, [refreshSummary, t]);

  const handleStale = useCallback(() => {
    setStaleNotice(true);
    void refreshSummary().catch(() => {});
  }, [refreshSummary]);

  const toggleMute = useCallback(
    async (app: NotificationManagerApp) => {
      if (!summary) return;

      setBusyAppKey(app.appKey);
      setActionError(null);

      try {
        const next = await setAppMuted(app.appKey, !(app.grant?.muted === true), summary.revision);
        latestSummaryRequestRef.current += 1;
        observedSummaryRevisionRef.current = next.revision;
        setSummary(next);
        setSummaryLoading(false);
        setSummaryError(null);
      } catch (error) {
        if (isStaleRevisionError(error)) {
          handleStale();
        } else {
          setActionError(getErrorMessage(error, t('global.updateError')));
        }
      } finally {
        setBusyAppKey(null);
      }
    },
    [summary, handleStale, t],
  );

  const performRevoke = useCallback(async () => {
    if (!summary || !confirmRevokeTarget) return;
    const app = confirmRevokeTarget;

    setBusyAppKey(app.appKey);
    setActionError(null);

    try {
      const next = await revokeApp(app.appKey, summary.revision);
      latestSummaryRequestRef.current += 1;
      observedSummaryRevisionRef.current = next.revision;
      setSummary(next);
      setSummaryLoading(false);
      setSummaryError(null);
      setConfirmRevokeTarget(null);
      if (selectedAppKey === app.appKey) {
        selectApp(null);
      }
    } catch (error) {
      if (isStaleRevisionError(error)) {
        setConfirmRevokeTarget(null);
        handleStale();
      } else {
        setActionError(getErrorMessage(error, t('state.error')));
      }
    } finally {
      setBusyAppKey(null);
    }
  }, [summary, confirmRevokeTarget, selectedAppKey, selectApp, handleStale, t]);

  const performRemoveSelected = useCallback(async () => {
    if (!summary || !confirmRemoveTarget) return;
    const app = confirmRemoveTarget;
    const ids = [...selectedRuleIds];

    setBusyAppKey(app.appKey);
    setActionError(null);

    try {
      const next = await removeAppRules(app.appKey, ids, summary.revision);
      latestSummaryRequestRef.current += 1;
      observedSummaryRevisionRef.current = next.revision;
      setSummary(next);
      setSummaryLoading(false);
      setSummaryError(null);
      setConfirmRemoveTarget(null);
      setSelectedRuleIds(new Set());
    } catch (error) {
      if (isStaleRevisionError(error)) {
        setConfirmRemoveTarget(null);
        handleStale();
      } else {
        setActionError(getErrorMessage(error, t('state.error')));
      }
    } finally {
      setBusyAppKey(null);
    }
  }, [summary, confirmRemoveTarget, selectedRuleIds, handleStale, t]);

  const toggleGlobalNotifications = useCallback(() => {
    if (globalEnabled === null) return;
    const next = !globalEnabled;

    setGlobalBusy(true);
    setGlobalError(null);
    setGlobalEnabled(next);

    void setAppNotificationsEnabled(next)
      .then(setGlobalEnabled)
      .catch((error) => {
        setGlobalEnabled(!next);
        setGlobalError(getErrorMessage(error, t('global.updateError')));
      })
      .finally(() => setGlobalBusy(false));
  }, [globalEnabled, t]);

  const apps = useMemo(() => (summary ? sortAppsByDisplayName(summary.apps) : []), [summary]);
  const selectedApp = findAppByKey(apps, selectedAppKey);
  const now = Date.now();

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand__mark">
            <Bell aria-hidden />
          </span>
          <div>
            <div className="brand__title-row">
              <h1>{t('app.title')}</h1>
              <span className="app-version">{__APP_VERSION__}</span>
            </div>
            <span className="brand__tagline">{t('app.tagline')}</span>
          </div>
        </div>
        <div className="topbar__actions">
          {homeSettingsSupported && globalEnabled !== null ? (
            <div className="toggle-row">
              <span className="toggle-row__label">{t('global.title')}</span>
              <Switch
                checked={globalEnabled}
                disabled={globalBusy}
                label={t('global.title')}
                onChange={toggleGlobalNotifications}
              />
            </div>
          ) : null}
          {permissionGranted ? (
            <IconButton
              busy={summaryLoading}
              icon={<RefreshCw aria-hidden />}
              label={t('action.refresh')}
              onClick={() => void refreshSummary().catch(() => {})}
            />
          ) : null}
        </div>
      </header>

      {!bridgeLoaded ? (
        <div className="empty-state empty-state--loading">
          <Loader2 aria-hidden className="spinner" />
          <span>{t('state.loading')}</span>
        </div>
      ) : !bridgeState.isHomeBridge ? (
        <div className="bridge-card">
          <h2>{t('bridge.unavailable.title')}</h2>
          <p>{t('bridge.unavailable.body')}</p>
        </div>
      ) : !managerSupported ? (
        <div className="bridge-card">
          <h2>{t('bridge.unsupported.title')}</h2>
          <p>{t('bridge.unsupported.body')}</p>
        </div>
      ) : globalError ? (
        <div className="notice notice--error" role="alert">
          <AlertTriangle aria-hidden />
          <div className="notice__body">{globalError}</div>
        </div>
      ) : null}

      {bridgeLoaded && bridgeState.isHomeBridge && managerSupported && permissionChecked && !permissionGranted ? (
        <div className="permission-card">
          <ShieldCheck aria-hidden style={{ height: 32, width: 32, margin: '0 auto', color: 'var(--qn-accent)' }} />
          <h2>{t('permission.title')}</h2>
          <p>{t('permission.body')}</p>
          {permissionError ? (
            <p className="notice notice--error" role="alert">
              {permissionError}
            </p>
          ) : null}
          <div className="button-row" style={{ justifyContent: 'center' }}>
            <CommandButton busy={permissionBusy} onClick={() => void requestAccess()} variant="primary">
              {t('action.grantAccess')}
            </CommandButton>
          </div>
        </div>
      ) : null}

      {bridgeLoaded && bridgeState.isHomeBridge && managerSupported && permissionGranted ? (
        <>
          {staleNotice ? (
            <div className="notice" role="status">
              <AlertTriangle aria-hidden />
              <div className="notice__body">
                <span className="notice__title">{t('state.stale.title')}</span>
                {t('state.stale.body')}
              </div>
            </div>
          ) : null}
          {actionError ? (
            <div className="notice notice--error" role="alert">
              <AlertTriangle aria-hidden />
              <div className="notice__body">{actionError}</div>
            </div>
          ) : null}

          {summaryLoading && !summary ? (
            <div className="empty-state empty-state--loading">
              <Loader2 aria-hidden className="spinner" />
              <span>{t('state.loading')}</span>
            </div>
          ) : summaryError && !summary ? (
            <div className="empty-state">
              <span>{summaryError}</span>
              <CommandButton onClick={() => void refreshSummary().catch(() => {})}>{t('action.retry')}</CommandButton>
            </div>
          ) : summary && apps.length === 0 ? (
            <div className="empty-state">
              <span>{t('list.empty.title')}</span>
              <span>{t('list.empty.body')}</span>
            </div>
          ) : summary ? (
            <div className={`workspace${selectedApp ? ' has-selection' : ''}`}>
              <div className="app-list-pane">
                <div className="app-list-pane__head">
                  <h2 className="app-list-pane__title">{t('list.title')}</h2>
                </div>
                <p className="app-list-pane__summary">
                  {translatePlural(t, 'summary.appsGranted', countGrantedApps(apps))}
                  {countMutedApps(apps) > 0 ? ` · ${t('summary.appsMuted', { count: countMutedApps(apps) })}` : ''}
                </p>
                <ul className="app-list">
                  {apps.map((app) => (
                    <AppRow app={app} key={app.appKey} onSelect={() => selectApp(app.appKey)} selected={app.appKey === selectedAppKey} t={t} />
                  ))}
                </ul>
              </div>
              <div className="detail-pane">
                {selectedApp ? (
                  <>
                    <button className="command-button command-button--secondary detail-pane__back" onClick={() => selectApp(null)} type="button">
                      <ChevronLeft aria-hidden />
                      {t('action.back')}
                    </button>
                    <div className="detail-header">
                      <div className="detail-header__title">
                        <h2>{formatAppDisplayName(selectedApp.appKey)}</h2>
                        <div className="detail-header__pills">
                          <span className={`status-pill ${!selectedApp.grant || selectedApp.grant.muted ? 'status-pill--muted' : 'status-pill--good'}`}>
                            {!selectedApp.grant ? t('grant.none') : selectedApp.grant.muted ? t('grant.muted') : t('grant.active')}
                          </span>
                          {selectedApp.grant ? (
                            <span className="count-pill">
                              {t('grant.grantedAt', { date: formatRelativeTime(selectedApp.grant.grantedAt, now, displaySettings.language) })}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <div className="detail-header__actions">
                        <CommandButton
                          busy={busyAppKey === selectedApp.appKey}
                          disabled={!canMuteApp(selectedApp)}
                          onClick={() => void toggleMute(selectedApp)}
                          variant="secondary"
                        >
                          {selectedApp.grant?.muted ? <Volume2 aria-hidden /> : <VolumeX aria-hidden />}
                          {selectedApp.grant?.muted ? t('action.unmute') : t('action.mute')}
                        </CommandButton>
                        <CommandButton
                          busy={busyAppKey === selectedApp.appKey}
                          onClick={() => setConfirmRevokeTarget(selectedApp)}
                          variant="danger"
                        >
                          <Trash2 aria-hidden />
                          {t('action.revoke')}
                        </CommandButton>
                      </div>
                    </div>

                    <h3 className="section-title">{t('detail.rulesTitle')}</h3>
                    {selectedApp.rules.length === 0 ? (
                      <p className="app-list-pane__summary">
                        {t(selectedApp.grant ? 'detail.rulesEmpty' : 'detail.rulesEmptyNoGrant')}
                      </p>
                    ) : (
                      <>
                        <div className="button-row">
                          <CommandButton
                            disabled={selectedRuleIds.size === selectedApp.rules.length}
                            onClick={() => setSelectedRuleIds(new Set(selectedApp.rules.map((rule) => rule.notificationId)))}
                            variant="secondary"
                          >
                            {t('action.selectAll')}
                          </CommandButton>
                          <CommandButton disabled={selectedRuleIds.size === 0} onClick={() => setSelectedRuleIds(new Set())} variant="secondary">
                            {t('action.clearSelection')}
                          </CommandButton>
                          <CommandButton
                            busy={busyAppKey === selectedApp.appKey}
                            disabled={selectedRuleIds.size === 0}
                            onClick={() => setConfirmRemoveTarget(selectedApp)}
                            variant="danger"
                          >
                            <Trash2 aria-hidden />
                            {t('action.removeSelected')}
                          </CommandButton>
                        </div>
                        <ul className="rule-list">
                          {selectedApp.rules.map((rule) => (
                            <RuleCard
                              identityMap={identityMap}
                              key={rule.notificationId}
                              language={displaySettings.language}
                              now={now}
                              onToggleSelect={() =>
                                setSelectedRuleIds((current) => {
                                  const next = new Set(current);
                                  if (next.has(rule.notificationId)) next.delete(rule.notificationId);
                                  else next.add(rule.notificationId);
                                  return next;
                                })
                              }
                              rule={rule}
                              selected={selectedRuleIds.has(rule.notificationId)}
                              t={t}
                            />
                          ))}
                        </ul>
                      </>
                    )}
                  </>
                ) : (
                  <p className="app-list-pane__summary">{t('detail.selectPrompt')}</p>
                )}
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      {confirmRevokeTarget ? (
        <ConfirmDialog
          body={translatePlural(t, 'confirm.revoke.body', confirmRevokeTarget.rules.length, {
            appName: formatAppDisplayName(confirmRevokeTarget.appKey),
          })}
          busy={busyAppKey === confirmRevokeTarget.appKey}
          confirmLabel={t('action.revoke')}
          onCancel={() => setConfirmRevokeTarget(null)}
          onConfirm={() => void performRevoke()}
          t={t}
          title={t('confirm.revoke.title')}
        />
      ) : null}

      {confirmRemoveTarget ? (
        <ConfirmDialog
          body={translatePlural(t, 'confirm.removeRules.body', selectedRuleIds.size, {
            appName: formatAppDisplayName(confirmRemoveTarget.appKey),
          })}
          busy={busyAppKey === confirmRemoveTarget.appKey}
          confirmLabel={t('action.removeSelected')}
          onCancel={() => setConfirmRemoveTarget(null)}
          onConfirm={() => void performRemoveSelected()}
          t={t}
          title={t('confirm.removeRules.title')}
        />
      ) : null}
    </div>
  );
}
