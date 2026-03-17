const DAILY_RUNTIME_CODE = __DAILY_RUNTIME_CODE__;
const DAILY_RUNTIME_CSS = __DAILY_RUNTIME_CSS__;
const PERIODIC_RUNTIME_CODE = __PERIODIC_RUNTIME_CODE__;
const PERIODIC_RUNTIME_CSS = __PERIODIC_RUNTIME_CSS__;
const DAILY_PLUGIN_TEMPLATE = __DAILY_PLUGIN_TEMPLATE__;
const PERIODIC_PLUGIN_TEMPLATES = __PERIODIC_PLUGIN_TEMPLATES__;

class Plugin extends AppPlugin {
  onLoad() {
    this._version = '0.1.2';
    this._commands = [];

    this.ui.injectCSS(this._css());
    this.ui.registerCustomPanelType('cadence-control-panel', (panel) => {
      this._mountSettingsPanel(panel);
    });

    this._commands.push(this.ui.addCommandPaletteCommand({
      label: 'Cadence: Settings',
      icon: 'ti-calendar-event',
      onSelected: () => this.openSettingsPanel({ newPanel: false }),
    }));

    this._commands.push(this.ui.addCommandPaletteCommand({
      label: 'Cadence: Repair Workspace',
      icon: 'ti-refresh',
      onSelected: async () => {
        try {
          const options = this._getWorkspaceOptions();
          await this._applyWorkspaceOptions(options, { showToasts: true });
        } catch (error) {
          this._toast('Thymer Cadence', error?.message || 'Could not repair the Cadence workspace.', 5000);
        }
      },
    }));

    setTimeout(() => {
      void this._maybePromptSetup();
    }, 400);
  }

  onUnload() {
    for (const cmd of this._commands || []) {
      try {
        cmd.remove();
      } catch (error) {
        // ignore
      }
    }
    this._commands = [];
  }

  _toast(title, message, ms) {
    try {
      this.ui.addToaster({
        title,
        message,
        dismissible: true,
        autoDestroyTime: typeof ms === 'number' ? ms : 3500,
      });
    } catch (error) {
      // ignore
    }
  }

  _storageKey(suffix) {
    return `cadence-control:${this.getGuid()}:${suffix}`;
  }

  async _maybePromptSetup() {
    const options = this._getWorkspaceOptions();
    if (options.setupComplete && options.daily.collectionGuid) return;

    const key = this._storageKey('setup-prompted');
    try {
      if (sessionStorage.getItem(key) === '1') return;
      sessionStorage.setItem(key, '1');
    } catch (error) {
      // ignore
    }

    this._toast('Thymer Cadence', 'Choose your Daily Notes collection to finish setup.', 4500);
    await this.openSettingsPanel({ newPanel: true });
  }

  async openSettingsPanel(options) {
    const opts = options && typeof options === 'object' ? options : {};
    const forceNewPanel = !!opts.newPanel;
    const active = this.ui.getActivePanel();
    let panel = (!forceNewPanel && active) ? active : null;

    if (!panel) {
      try {
        panel = await this.ui.createPanel(active ? { afterPanel: active } : undefined);
      } catch (error) {
        panel = null;
      }
    }

    if (!panel && active) panel = active;
    if (!panel) {
      this._toast('Thymer Cadence', 'Could not open the Cadence settings panel.', 5000);
      return;
    }

    panel.navigateToCustomType('cadence-control-panel');
  }

  _mountSettingsPanel(panel) {
    const host = panel && typeof panel.getElement === 'function' ? panel.getElement() : null;
    if (!host) return;

    try {
      panel.setTitle('Cadence Settings');
    } catch (error) {
      // ignore
    }

    const state = {
      loading: true,
      saving: false,
      error: '',
      success: '',
      options: this._normalizeWorkspaceOptions(this._getWorkspaceOptions()),
      collections: [],
    };

    const refreshCollections = async (autoDetect = false) => {
      state.loading = true;
      render();
      try {
        const collections = await this.data.getAllCollections();
        state.collections = collections;
        state.options = autoDetect
          ? await this._autoDetectWorkspaceOptions(state.options, collections)
          : this._hydrateCollectionNames(state.options, collections);
        state.error = '';
      } catch (error) {
        state.error = error?.message || 'Could not load workspace collections.';
      } finally {
        state.loading = false;
        render();
      }
    };

    const render = () => {
      host.innerHTML = '';

      if (state.loading) {
        host.innerHTML = '<div class="cadence-shell"><div class="form-field-group"><div class="form-field"><div class="text-details">Loading Cadence settings…</div></div></div></div>';
        return;
      }

      const validation = this._validateWorkspaceOptions(state.options, state.collections);
      const dailyChoices = this._getDailyCollectionChoices(state.collections);
      const periodChoices = this._getPeriodCollectionChoices(state.collections);

      host.innerHTML = `
        <div class="cadence-shell">
          <div class="cadence-header">
            <div>
              <div class="cadence-title">Thymer Cadence</div>
              <div class="text-details cadence-subtitle">Configure the Daily Notes upgrade, enable or disable weekly/monthly/quarterly/yearly notes, and create or adopt collections without manual code edits.</div>
            </div>
            <div class="cadence-header-actions">
              <button type="button" class="button-normal button-normal-hover button-small cadence-action-autodetect">Auto-detect</button>
              <button type="button" class="button-primary button-primary-hover button-small id--ok-btn cadence-action-save">${state.saving ? 'Applying…' : (state.options.setupComplete ? 'Save & Repair' : 'Set Up Cadence')}</button>
            </div>
          </div>
          ${this._renderStatus(validation, state)}
          ${this._renderDailySection(state, dailyChoices)}
          ${this._renderPeriodSection('weekly', state, periodChoices)}
          ${this._renderPeriodSection('monthly', state, periodChoices)}
          ${this._renderPeriodSection('quarterly', state, periodChoices)}
          ${this._renderPeriodSection('yearly', state, periodChoices)}
        </div>
      `;

      host.querySelector('.cadence-action-autodetect')?.addEventListener('click', async () => {
        state.success = '';
        state.error = '';
        await refreshCollections(true);
      });

      host.querySelector('.cadence-action-save')?.addEventListener('click', async () => {
        const latestValidation = this._validateWorkspaceOptions(state.options, state.collections);
        if (latestValidation.errors.length) {
          state.error = latestValidation.errors[0];
          state.success = '';
          render();
          return;
        }

        state.saving = true;
        state.error = '';
        state.success = '';
        render();
        try {
          state.options = await this._applyWorkspaceOptions(state.options, { showToasts: true });
          state.options.setupComplete = true;
          state.success = 'Cadence settings saved and synced to the selected collections. Reopen this panel if you want to refresh the auto-detected collection lists.';
        } catch (error) {
          state.error = error?.message || 'Could not save Cadence settings.';
        } finally {
          state.saving = false;
          render();
        }
      });

      host.querySelector('.cadence-daily-select')?.addEventListener('change', (ev) => {
        const guid = String(ev.target.value || '');
        const collection = this._findCollectionByGuidOrName(state.collections, guid, '', { journalOnly: true });
        state.options.daily.collectionGuid = collection?.getGuid() || '';
        state.options.daily.collectionName = collection?.getName() || '';
        state.success = '';
      });

      for (const periodMode of this._periodModes()) {
        const toggle = host.querySelector(`[data-action="toggle-period"][data-mode="${periodMode}"]`);
        toggle?.addEventListener('click', () => {
          state.options.periods[periodMode].enabled = !state.options.periods[periodMode].enabled;
          state.success = '';
          render();
        });

        const collectionSelect = host.querySelector(`[data-role="period-collection"][data-mode="${periodMode}"]`);
        collectionSelect?.addEventListener('change', (ev) => {
          const value = String(ev.target.value || '');
          if (value === '__create__') {
            state.options.periods[periodMode].sourceMode = 'create';
            if (!state.options.periods[periodMode].newCollectionName) {
              state.options.periods[periodMode].newCollectionName = this._defaultCollectionName(periodMode);
            }
          } else {
            const collection = this._findCollectionByGuidOrName(state.collections, value, '', { journalOnly: false });
            state.options.periods[periodMode].sourceMode = 'existing';
            state.options.periods[periodMode].collectionGuid = collection?.getGuid() || '';
            state.options.periods[periodMode].collectionName = collection?.getName() || '';
          }
          state.success = '';
          render();
        });

        const newNameInput = host.querySelector(`[data-role="new-name"][data-mode="${periodMode}"]`);
        newNameInput?.addEventListener('change', (ev) => {
          state.options.periods[periodMode].newCollectionName = String(ev.target.value || '').trim();
          state.success = '';
        });

        const formatInput = host.querySelector(`[data-role="title-format"][data-mode="${periodMode}"]`);
        formatInput?.addEventListener('change', (ev) => {
          state.options.periods[periodMode].titleFormat = String(ev.target.value || '').trim() || this._defaultTitleFormat(periodMode);
          state.success = '';
          render();
        });
      }
    };

    void refreshCollections(true);
  }

  _renderStatus(validation, state) {
    const messages = [];
    if (state.error) {
      messages.push(`<div class="form-field cadence-message cadence-message-error">${this._escapeHtml(state.error)}</div>`);
    }
    if (state.success) {
      messages.push(`<div class="form-field cadence-message cadence-message-success">${this._escapeHtml(state.success)}</div>`);
    }
    if (!state.error && validation.errors.length) {
      messages.push(`<div class="form-field cadence-message cadence-message-error">${this._escapeHtml(validation.errors[0])}</div>`);
    } else if (!state.error && validation.warnings.length) {
      messages.push(`<div class="form-field cadence-message cadence-message-warning">${this._escapeHtml(validation.warnings[0])}</div>`);
    }
    if (!messages.length) return '';
    return `<div class="form-field-group cadence-status-group">${messages.join('')}</div>`;
  }

  _renderDailySection(state, dailyChoices) {
    const current = state.options.daily.collectionGuid || '';
    const optionsHtml = ['<option value="">Choose a journal collection…</option>']
      .concat(dailyChoices.map((choice) => `<option value="${this._escapeHtml(choice.guid)}"${choice.guid === current ? ' selected' : ''}>${this._escapeHtml(choice.name)}</option>`))
      .join('');

    return `
      <div class="form-field-group cadence-section-group">
        <div class="form-field">
          <div class="form-field-row cadence-section-row">
            <div>
              <div class="cadence-section-title">Daily Notes</div>
              <div class="text-details">Select the journal collection that Cadence should upgrade with the native calendar popup and period links.</div>
            </div>
            <div class="cadence-required-pill">Required</div>
          </div>
        </div>
        <div class="form-field">
          <div class="text-details cadence-field-label">Journal collection</div>
          <select class="form-input cadence-daily-select w-full">${optionsHtml}</select>
          <div class="text-details cadence-help">Cadence upgrades the selected journal plugin in place. Existing custom code and CSS on that journal collection will be replaced.</div>
        </div>
      </div>
    `;
  }

  _renderPeriodSection(periodMode, state, periodChoices) {
    const settings = state.options.periods[periodMode];
    const collectionValue = settings.sourceMode === 'create'
      ? '__create__'
      : (settings.collectionGuid || '');
    const collectionOptions = [`<option value="">Choose a collection…</option>`, '<option value="__create__">Create a new collection…</option>']
      .concat(periodChoices.map((choice) => `<option value="${this._escapeHtml(choice.guid)}"${choice.guid === collectionValue ? ' selected' : ''}>${this._escapeHtml(choice.name)}</option>`))
      .join('');

    return `
      <div class="form-field-group cadence-section-group">
        <div class="form-field">
          <div class="form-field-row cadence-section-row">
            <div>
              <div class="cadence-section-title">${this._periodLabel(periodMode)} Notes</div>
              <div class="text-details">${this._periodDescription(periodMode)}</div>
            </div>
            <button type="button" class="cadence-switch ${settings.enabled ? 'is-on' : ''}" data-action="toggle-period" data-mode="${periodMode}" aria-pressed="${settings.enabled ? 'true' : 'false'}">
              <span class="cadence-switch-track"><span class="cadence-switch-thumb"></span></span>
            </button>
          </div>
        </div>
        ${settings.enabled ? `
          <div class="form-field">
            <div class="text-details cadence-field-label">Collection</div>
            <select class="form-input w-full" data-role="period-collection" data-mode="${periodMode}">${collectionOptions}</select>
            <div class="text-details cadence-help">Pick an existing collection to adopt or create a new managed collection. Adopting will replace any custom code and CSS already installed on that collection.</div>
          </div>
          ${settings.sourceMode === 'create' ? `
            <div class="form-field">
              <div class="text-details cadence-field-label">New collection name</div>
              <input class="form-input w-full" data-role="new-name" data-mode="${periodMode}" value="${this._escapeHtml(settings.newCollectionName || this._defaultCollectionName(periodMode))}" placeholder="${this._escapeHtml(this._defaultCollectionName(periodMode))}">
            </div>
          ` : ''}
          <div class="form-field">
            <div class="text-details cadence-field-label">Title format</div>
            <input class="form-input w-full" data-role="title-format" data-mode="${periodMode}" value="${this._escapeHtml(settings.titleFormat)}" placeholder="${this._escapeHtml(this._defaultTitleFormat(periodMode))}">
            <div class="text-details cadence-help">Supported subset: <code>GGGG</code>, <code>YYYY</code>, <code>YY</code>, <code>Q</code>, <code>M</code>, <code>MM</code>, <code>MMM</code>, <code>MMMM</code>, <code>W</code>, <code>WW</code>, plus literals in square brackets. Preview: <strong>${this._escapeHtml(this._formatPeriodTitle(periodMode, new Date(), settings.titleFormat))}</strong></div>
          </div>
          <div class="form-field">
            <div class="text-details cadence-help">Cadence always uses its hidden <code>Cadence Period Key</code> metadata for ordering. It also replaces the collection's standard Related Section query with a native <code>Upcoming</code> task section that follows the active ${this._periodLabel(periodMode).toLowerCase()} page.</div>
          </div>
        ` : `
          <div class="form-field">
            <div class="text-details">Disabled. Daily Notes nav and popup links for ${this._periodLabel(periodMode).toLowerCase()} notes stay hidden until you turn this on.</div>
          </div>
        `}
      </div>
    `;
  }

  _periodModes() {
    return ['weekly', 'monthly', 'quarterly', 'yearly'];
  }

  _periodLabel(periodMode) {
    if (periodMode === 'weekly') return 'Weekly';
    if (periodMode === 'monthly') return 'Monthly';
    if (periodMode === 'quarterly') return 'Quarterly';
    return 'Yearly';
  }

  _periodDescription(periodMode) {
    if (periodMode === 'weekly') {
      return 'Enable ISO week notes and add a week link to the Daily Notes nav and popup.';
    }
    if (periodMode === 'monthly') {
      return 'Enable monthly notes and add month links across Daily, Weekly, Monthly, and Yearly surfaces.';
    }
    if (periodMode === 'quarterly') {
      return 'Enable quarterly notes and add quarter links across Daily Notes and every Cadence popup.';
    }
    return 'Enable yearly notes and add year links where Cadence surfaces period navigation.';
  }

  _defaultCollectionName(periodMode) {
    if (periodMode === 'weekly') return 'Weekly Notes';
    if (periodMode === 'monthly') return 'Monthly Notes';
    if (periodMode === 'quarterly') return 'Quarterly Notes';
    return 'Yearly Notes';
  }

  _defaultTitleFormat(periodMode) {
    if (periodMode === 'weekly') return 'GGGG-[W]WW';
    if (periodMode === 'monthly') return 'MMM YYYY';
    if (periodMode === 'quarterly') return 'YYYY-[Q]Q';
    return 'YYYY';
  }

  _defaultWorkspaceOptions() {
    return {
      version: 1,
      setupComplete: false,
      daily: {
        collectionGuid: '',
        collectionName: '',
      },
      periods: {
        weekly: this._defaultPeriodOptions('weekly'),
        monthly: this._defaultPeriodOptions('monthly'),
        quarterly: this._defaultPeriodOptions('quarterly'),
        yearly: this._defaultPeriodOptions('yearly'),
      },
    };
  }

  _defaultPeriodOptions(periodMode) {
    return {
      enabled: false,
      sourceMode: 'existing',
      collectionGuid: '',
      collectionName: this._defaultCollectionName(periodMode),
      newCollectionName: this._defaultCollectionName(periodMode),
      titleFormat: this._defaultTitleFormat(periodMode),
      periodStartFieldId: 'period_start',
      orderFieldId: 'period_key',
      orderFieldKind: 'period_key',
    };
  }

  _normalizeWorkspaceOptions(raw) {
    const defaults = this._defaultWorkspaceOptions();
    const input = raw && typeof raw === 'object' ? raw : {};
    const out = this._clone(defaults);

    out.version = Number(input.version || defaults.version) || defaults.version;
    out.setupComplete = !!input.setupComplete;

    const dailyIn = input.daily && typeof input.daily === 'object' ? input.daily : {};
    out.daily.collectionGuid = typeof dailyIn.collectionGuid === 'string' ? dailyIn.collectionGuid.trim() : '';
    out.daily.collectionName = typeof dailyIn.collectionName === 'string' ? dailyIn.collectionName.trim() : '';

    const periodsIn = input.periods && typeof input.periods === 'object' ? input.periods : {};
    for (const periodMode of this._periodModes()) {
      const source = periodsIn[periodMode] && typeof periodsIn[periodMode] === 'object' ? periodsIn[periodMode] : {};
      out.periods[periodMode].enabled = typeof source.enabled === 'boolean' ? source.enabled : defaults.periods[periodMode].enabled;
      out.periods[periodMode].sourceMode = source.sourceMode === 'create' ? 'create' : 'existing';
      out.periods[periodMode].collectionGuid = typeof source.collectionGuid === 'string' ? source.collectionGuid.trim() : '';
      out.periods[periodMode].collectionName = typeof source.collectionName === 'string' && source.collectionName.trim() ? source.collectionName.trim() : defaults.periods[periodMode].collectionName;
      out.periods[periodMode].newCollectionName = typeof source.newCollectionName === 'string' && source.newCollectionName.trim() ? source.newCollectionName.trim() : out.periods[periodMode].collectionName;
      out.periods[periodMode].titleFormat = typeof source.titleFormat === 'string' && source.titleFormat.trim() ? source.titleFormat.trim() : defaults.periods[periodMode].titleFormat;
      out.periods[periodMode].periodStartFieldId = 'period_start';
      out.periods[periodMode].orderFieldId = 'period_key';
      out.periods[periodMode].orderFieldKind = 'period_key';
    }

    return out;
  }

  _getWorkspaceOptions() {
    try {
      const conf = this.getConfiguration() || {};
      const custom = conf.custom && typeof conf.custom === 'object' ? conf.custom : {};
      return this._normalizeWorkspaceOptions(custom.workspaceOptions || null);
    } catch (error) {
      return this._defaultWorkspaceOptions();
    }
  }

  async _saveWorkspaceOptions(options) {
    const nextOptions = this._normalizeWorkspaceOptions(options);
    const pluginApi = this.data.getPluginByGuid(this.getGuid());
    if (!pluginApi || typeof pluginApi.saveConfiguration !== 'function' || typeof pluginApi.getConfiguration !== 'function') {
      throw new Error('Cannot access plugin configuration API.');
    }

    const conf = pluginApi.getConfiguration() || {};
    const custom = conf.custom && typeof conf.custom === 'object' ? { ...conf.custom } : {};
    custom.workspaceOptions = nextOptions;
    const nextConf = { ...conf, custom };
    const ok = await pluginApi.saveConfiguration(nextConf);
    if (!ok) {
      throw new Error('Could not save Cadence settings.');
    }
    return nextOptions;
  }

  _clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  _escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  _findCollectionByGuidOrName(collections, guid, name, options) {
    const opts = options && typeof options === 'object' ? options : {};
    const list = Array.isArray(collections) ? collections : [];
    const wantedGuid = String(guid || '').trim();
    const wantedName = String(name || '').trim().toLowerCase();

    if (wantedGuid) {
      const byGuid = list.find((collection) => collection && typeof collection.getGuid === 'function' && collection.getGuid() === wantedGuid) || null;
      if (byGuid) {
        if (opts.journalOnly && !(byGuid.isJournalPlugin && byGuid.isJournalPlugin())) return null;
        if (opts.nonJournalOnly && byGuid.isJournalPlugin && byGuid.isJournalPlugin()) return null;
        return byGuid;
      }
    }

    if (wantedName) {
      const byName = list.find((collection) => {
        if (!collection || typeof collection.getName !== 'function') return false;
        if (opts.journalOnly && !(collection.isJournalPlugin && collection.isJournalPlugin())) return false;
        if (opts.nonJournalOnly && collection.isJournalPlugin && collection.isJournalPlugin()) return false;
        return String(collection.getName() || '').trim().toLowerCase() === wantedName;
      }) || null;
      if (byName) return byName;
    }

    return null;
  }

  _hydrateCollectionNames(options, collections) {
    const next = this._normalizeWorkspaceOptions(options);
    const daily = this._findCollectionByGuidOrName(collections, next.daily.collectionGuid, next.daily.collectionName, { journalOnly: true });
    if (daily) {
      next.daily.collectionGuid = daily.getGuid();
      next.daily.collectionName = daily.getName();
    }

    for (const periodMode of this._periodModes()) {
      const settings = next.periods[periodMode];
      if (!settings.collectionGuid) continue;
      const collection = this._findCollectionByGuidOrName(collections, settings.collectionGuid, settings.collectionName, { nonJournalOnly: true });
      if (!collection) continue;
      settings.collectionGuid = collection.getGuid();
      settings.collectionName = collection.getName();
      settings.orderFieldId = 'period_key';
      settings.orderFieldKind = 'period_key';
    }

    return next;
  }

  async _autoDetectWorkspaceOptions(baseOptions, allCollections) {
    const options = this._normalizeWorkspaceOptions(baseOptions);
    const collections = Array.isArray(allCollections) ? allCollections : await this.data.getAllCollections();

    const daily = this._findCollectionByGuidOrName(collections, options.daily.collectionGuid, options.daily.collectionName, { journalOnly: true })
      || this._findCollectionByGuidOrName(collections, '', 'Daily Notes', { journalOnly: true })
      || this._findCollectionByGuidOrName(collections, '', 'Daily Note', { journalOnly: true })
      || collections.find((collection) => collection && collection.isJournalPlugin && collection.isJournalPlugin())
      || null;
    if (daily) {
      options.daily.collectionGuid = daily.getGuid();
      options.daily.collectionName = daily.getName();
    }

    for (const periodMode of this._periodModes()) {
      const current = options.periods[periodMode];
      const collection = this._findCollectionByGuidOrName(collections, current.collectionGuid, current.collectionName, { nonJournalOnly: true })
        || collections.find((candidate) => {
          const conf = candidate && typeof candidate.getConfiguration === 'function' ? candidate.getConfiguration() : null;
          const custom = conf && conf.custom && typeof conf.custom === 'object' ? conf.custom : {};
          if (custom.cadence && custom.cadence.role === periodMode) return true;
          if (custom.periodMode === periodMode) return true;
          return candidate && typeof candidate.getName === 'function' && candidate.getName() === this._defaultCollectionName(periodMode);
        })
        || null;
      if (collection) {
        current.collectionGuid = collection.getGuid();
        current.collectionName = collection.getName();
        current.enabled = current.enabled || (!options.setupComplete && !!collection.getGuid());
        current.sourceMode = 'existing';
        current.orderFieldId = 'period_key';
        current.orderFieldKind = 'period_key';
      }
    }

    return options;
  }

  _getDailyCollectionChoices(collections) {
    return (collections || [])
      .filter((collection) => collection && collection.isJournalPlugin && collection.isJournalPlugin())
      .map((collection) => ({ guid: collection.getGuid(), name: collection.getName() }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  _getPeriodCollectionChoices(collections) {
    return (collections || [])
      .filter((collection) => !(collection && collection.isJournalPlugin && collection.isJournalPlugin()))
      .map((collection) => ({ guid: collection.getGuid(), name: collection.getName() }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  _validateWorkspaceOptions(options, collections) {
    const current = this._normalizeWorkspaceOptions(options);
    const errors = [];
    const warnings = [];

    const daily = this._findCollectionByGuidOrName(collections, current.daily.collectionGuid, current.daily.collectionName, { journalOnly: true });
    if (!daily) {
      errors.push('Choose a valid Daily Notes journal collection.');
    }

    for (const periodMode of this._periodModes()) {
      const settings = current.periods[periodMode];
      if (!settings.enabled) continue;
      if (settings.sourceMode === 'create') {
        if (!settings.newCollectionName) {
          errors.push(`Enter a name for the ${this._periodLabel(periodMode).toLowerCase()} collection you want to create.`);
        }
      } else {
        const collection = this._findCollectionByGuidOrName(collections, settings.collectionGuid, settings.collectionName, { nonJournalOnly: true });
        if (!collection) {
          errors.push(`Choose a ${this._periodLabel(periodMode).toLowerCase()} collection or switch that section to create a new one.`);
        }
      }
      if (!settings.titleFormat) {
        errors.push(`${this._periodLabel(periodMode)} notes need a title format.`);
      }
    }

    if (!current.periods.weekly.enabled && !current.periods.monthly.enabled && !current.periods.quarterly.enabled && !current.periods.yearly.enabled) {
      warnings.push('Cadence is installed, but no weekly/monthly/quarterly/yearly collections are enabled yet.');
    }

    return { errors, warnings };
  }

  async _applyWorkspaceOptions(options, runtimeOptions) {
    const opts = runtimeOptions && typeof runtimeOptions === 'object' ? runtimeOptions : {};
    const resolved = this._normalizeWorkspaceOptions(options);
    const collections = await this.data.getAllCollections();
    const validation = this._validateWorkspaceOptions(resolved, collections);
    if (validation.errors.length) {
      throw new Error(validation.errors[0]);
    }

    const dailyCollection = this._findCollectionByGuidOrName(collections, resolved.daily.collectionGuid, resolved.daily.collectionName, { journalOnly: true });
    if (!dailyCollection) {
      throw new Error('Could not resolve the selected Daily Notes collection.');
    }
    resolved.daily.collectionGuid = dailyCollection.getGuid();
    resolved.daily.collectionName = dailyCollection.getName();

    const periodCollections = {};
    for (const periodMode of this._periodModes()) {
      const settings = resolved.periods[periodMode];
      if (!settings.enabled && !settings.collectionGuid) continue;

      let collection = null;
      let created = false;
      if (settings.enabled && settings.sourceMode === 'create') {
        collection = await this.data.createCollection();
        if (!collection) {
          throw new Error(`Could not create the ${this._periodLabel(periodMode).toLowerCase()} collection.`);
        }
        created = true;
        settings.collectionGuid = collection.getGuid();
        settings.collectionName = settings.newCollectionName || this._defaultCollectionName(periodMode);
        settings.sourceMode = 'existing';
      } else if (settings.collectionGuid) {
        collection = this._findCollectionByGuidOrName(collections, settings.collectionGuid, settings.collectionName, { nonJournalOnly: true }) || this.data.getPluginByGuid(settings.collectionGuid);
      }

      if (!collection || typeof collection.getConfiguration !== 'function') {
        if (settings.enabled) {
          throw new Error(`Could not resolve the ${this._periodLabel(periodMode).toLowerCase()} collection.`);
        }
        continue;
      }

      settings.collectionGuid = collection.getGuid();
      settings.collectionName = settings.collectionName || collection.getName();
      settings.orderFieldId = 'period_key';
      settings.orderFieldKind = 'period_key';
      periodCollections[periodMode] = { api: collection, created };
    }

    for (const periodMode of this._periodModes()) {
      const payload = periodCollections[periodMode];
      if (!payload) continue;
      await this._configurePeriodCollectionPlugin(payload.api, periodMode, resolved, payload.created);
      if (resolved.periods[periodMode].enabled) {
        await this._repairPeriodCollectionRecords(payload.api, periodMode, resolved);
      }
    }

    await this._configureDailyCollectionPlugin(dailyCollection, resolved);

    resolved.setupComplete = true;
    if (opts.persistConfig !== false) {
      await this._saveWorkspaceOptions(resolved);
    }

    if (opts.showToasts) {
      this._toast('Thymer Cadence', 'Cadence settings applied successfully.', 3500);
    }
    return resolved;
  }

  async _configureDailyCollectionPlugin(collection, options) {
    const conf = this._clone(collection.getConfiguration ? (collection.getConfiguration() || DAILY_PLUGIN_TEMPLATE) : DAILY_PLUGIN_TEMPLATE);
    const custom = conf.custom && typeof conf.custom === 'object' ? { ...conf.custom } : {};
    custom.cadence = this._buildRuntimeCadenceConfig('daily', options);
    for (const periodMode of this._periodModes()) {
      const period = options.periods[periodMode];
      custom[`${periodMode}CollectionGuid`] = period.collectionGuid || '';
      custom[`${periodMode}CollectionName`] = period.collectionName || this._defaultCollectionName(periodMode);
    }
    conf.custom = custom;
    conf.name = collection.getName ? collection.getName() : conf.name;
    const ok = await collection.savePlugin(conf, DAILY_RUNTIME_CODE);
    if (!ok) {
      throw new Error('Could not update the Daily Notes runtime plugin.');
    }
    await collection.saveCSS(DAILY_RUNTIME_CSS);
  }

  async _configurePeriodCollectionPlugin(collection, periodMode, options, created) {
    const settings = options.periods[periodMode];
    const conf = created
      ? this._clone(PERIODIC_PLUGIN_TEMPLATES[periodMode])
      : this._clone(collection.getConfiguration ? (collection.getConfiguration() || PERIODIC_PLUGIN_TEMPLATES[periodMode]) : PERIODIC_PLUGIN_TEMPLATES[periodMode]);

    conf.name = settings.collectionName || collection.getName() || this._defaultCollectionName(periodMode);
    conf.icon = conf.icon || 'ti-calendar';
    conf.item_name = conf.item_name || this._periodLabel(periodMode).slice(0, -2);
    conf.custom = conf.custom && typeof conf.custom === 'object' ? { ...conf.custom } : {};
    conf.custom.periodMode = periodMode;
    conf.custom.labelStyle = 'compact';
    conf.custom.dailyNoteCollectionGuid = options.daily.collectionGuid;
    conf.custom.dailyNoteCollectionName = options.daily.collectionName;
    conf.custom.cadence = this._buildRuntimeCadenceConfig(periodMode, options);

    this._ensureCadenceFields(conf, settings);
    this._ensureCadenceView(conf, periodMode, settings);
    conf.sidebar_record_sort_field_id = settings.orderFieldId || 'period_key';
    conf.sidebar_record_sort_dir = 'desc';
    conf.page_field_ids = [];
    conf.related_query = '';

    const ok = await collection.savePlugin(conf, PERIODIC_RUNTIME_CODE);
    if (!ok) {
      throw new Error(`Could not update the ${this._periodLabel(periodMode).toLowerCase()} runtime plugin.`);
    }
    await collection.saveCSS(PERIODIC_RUNTIME_CSS);
  }

  _ensureCadenceFields(conf, settings) {
    conf.fields = Array.isArray(conf.fields) ? conf.fields : [];
    this._ensureField(conf.fields, {
      id: 'period_start',
      label: 'Period Start',
      type: 'datetime',
      icon: 'ti-calendar',
      active: false,
      many: false,
      read_only: false,
    });
    this._ensureField(conf.fields, {
      id: 'period_key',
      label: 'Period Key',
      type: 'text',
      icon: 'ti-hash',
      active: false,
      many: false,
      read_only: false,
    });

  }

  _ensureField(fields, spec) {
    const existing = fields.find((field) => field && field.id === spec.id);
    if (existing) {
      existing.label = existing.label || spec.label;
      existing.type = existing.type || spec.type;
      existing.icon = existing.icon || spec.icon;
      if (typeof existing.active !== 'boolean') existing.active = !!spec.active;
      if (typeof existing.many !== 'boolean') existing.many = !!spec.many;
      if (typeof existing.read_only !== 'boolean') existing.read_only = !!spec.read_only;
      return existing;
    }
    fields.push({ ...spec });
    return fields[fields.length - 1];
  }

  _ensureCadenceView(conf, periodMode, settings) {
    conf.views = Array.isArray(conf.views) ? conf.views : [];
    const template = this._clone(PERIODIC_PLUGIN_TEMPLATES[periodMode]);
    const baseView = (template.views && template.views[0]) || {
      id: 'table',
      type: 'table',
      icon: '',
      label: this._defaultCollectionName(periodMode),
      description: '',
      read_only: false,
      shown: true,
      field_ids: ['title', 'period_start', 'updated_at'],
      sort_dir: 'desc',
      sort_field_id: settings.orderFieldId || 'period_key',
      group_by_field_id: null,
    };

    const tableView = conf.views.find((view) => view && view.type === 'table') || null;
    if (!tableView) {
      baseView.sort_field_id = settings.orderFieldId || 'period_key';
      conf.views.push(baseView);
      return;
    }

    tableView.field_ids = this._unique((tableView.field_ids || []).concat(['title', 'period_start', 'updated_at']));
    tableView.sort_field_id = settings.orderFieldId || 'period_key';
    tableView.sort_dir = tableView.sort_dir || 'desc';
  }

  _buildRuntimeCadenceConfig(role, options) {
    const periods = {};
    for (const periodMode of this._periodModes()) {
      const source = options.periods[periodMode];
      periods[periodMode] = {
        enabled: !!source.enabled,
        collectionGuid: source.collectionGuid || '',
        collectionName: source.collectionName || this._defaultCollectionName(periodMode),
        titleFormat: source.titleFormat || this._defaultTitleFormat(periodMode),
        periodStartFieldId: 'period_start',
        orderFieldId: 'period_key',
        orderFieldKind: 'period_key',
      };
    }

    return {
      schemaVersion: 1,
      role,
      managedByCadence: true,
      daily: {
        collectionGuid: options.daily.collectionGuid,
        collectionName: options.daily.collectionName,
      },
      periods,
    };
  }

  async _repairPeriodCollectionRecords(collection, periodMode, options) {
    const settings = options.periods[periodMode];
    const records = await collection.getAllRecords();
    for (const record of records) {
      const periodStart = this._extractPeriodStartForRecord(record, periodMode, settings);
      if (!periodStart) continue;
      this._setPeriodMetadataOnRecord(record, periodMode, settings, periodStart);
      this._setRecordTitle(record, this._formatPeriodTitle(periodMode, periodStart, settings.titleFormat));
    }
  }

  _extractPeriodStartForRecord(record, periodMode, settings) {
    const direct = this._recordDateValue(record, [settings.periodStartFieldId, settings.orderFieldKind === 'period_start' ? settings.orderFieldId : null, 'period_start', 'Period Start']);
    if (direct) return this._dateOnly(direct);

    const keyText = this._recordTextValue(record, [settings.orderFieldId, 'period_key', 'Period Key']);
    if (keyText) {
      const parsedFromKey = this._parsePeriodStartFromKey(periodMode, keyText);
      if (parsedFromKey) return parsedFromKey;
    }

    const title = typeof record.getName === 'function' ? record.getName() : '';
    return this._parseLegacyPeriodTitle(periodMode, title);
  }

  _parsePeriodStartFromKey(periodMode, key) {
    const value = String(key || '').trim();
    if (!value) return null;
    if (periodMode === 'weekly') {
      const match = value.match(/^(\d{4})-(\d{2})$/);
      if (!match) return null;
      return this._isoWeekStartForYearWeek(Number(match[1]), Number(match[2]));
    }
    if (periodMode === 'monthly') {
      const match = value.match(/^(\d{4})-(\d{2})$/);
      if (!match) return null;
      return this._dateOnly(new Date(Number(match[1]), Number(match[2]) - 1, 1));
    }
    if (periodMode === 'quarterly') {
      const match = value.match(/^(\d{4})-Q([1-4])$/i);
      if (!match) return null;
      return this._quarterStartForYearQuarter(Number(match[1]), Number(match[2]));
    }
    const match = value.match(/^(\d{4})$/);
    if (!match) return null;
    return this._dateOnly(new Date(Number(match[1]), 0, 1));
  }

  _parseLegacyPeriodTitle(periodMode, title) {
    const value = String(title || '').trim();
    if (!value) return null;
    if (periodMode === 'weekly') {
      const match = value.match(/^(\d{4})\s+W(\d{1,2})$/);
      if (!match) return null;
      return this._isoWeekStartForYearWeek(Number(match[1]), Number(match[2]));
    }
    if (periodMode === 'monthly') {
      const match = value.match(/^([A-Za-z]{3})\s+(\d{4})$/);
      if (!match) return null;
      const monthIndex = this._monthIndexFromShortName(match[1]);
      if (monthIndex === null) return null;
      return this._dateOnly(new Date(Number(match[2]), monthIndex, 1));
    }
    if (periodMode === 'quarterly') {
      const match = value.match(/^(?:Q([1-4])\s+(\d{4})|(\d{4})[-\s]Q([1-4]))$/i);
      if (!match) return null;
      const year = Number(match[2] || match[3]);
      const quarter = Number(match[1] || match[4]);
      return this._quarterStartForYearQuarter(year, quarter);
    }
    const match = value.match(/^(\d{4})$/);
    if (!match) return null;
    return this._dateOnly(new Date(Number(match[1]), 0, 1));
  }

  _setPeriodMetadataOnRecord(record, periodMode, settings, periodStart) {
    const periodProperty = this._resolveProperty(record, [settings.periodStartFieldId, 'period_start', 'Period Start']);
    if (periodProperty) {
      periodProperty.set(this._dateTimeValue(periodStart));
    }
    const canonicalKeyProperty = this._resolveProperty(record, ['period_key', 'Period Key']);
    if (canonicalKeyProperty) {
      canonicalKeyProperty.set(this._periodKeyForMode(periodMode, periodStart));
    }
    const orderProperty = this._resolveProperty(record, [settings.orderFieldId, 'period_key', 'Period Key']);
    if (orderProperty) {
      if (settings.orderFieldKind === 'period_start') {
        orderProperty.set(this._dateTimeValue(periodStart));
      } else {
        orderProperty.set(this._periodKeyForMode(periodMode, periodStart));
      }
    }
  }

  _setRecordTitle(record, title) {
    try {
      const prop = this._resolveProperty(record, ['title', 'Title']);
      if (prop) {
        prop.set(title);
      }
    } catch (error) {
      // ignore
    }
  }

  _resolveProperty(record, candidates) {
    if (!record || typeof record.prop !== 'function') return null;
    for (const candidate of candidates) {
      if (!candidate) continue;
      const prop = record.prop(candidate);
      if (prop) return prop;
    }
    return null;
  }

  _recordTextValue(record, candidates) {
    if (!record || typeof record.text !== 'function') return '';
    for (const candidate of candidates) {
      if (!candidate) continue;
      const value = record.text(candidate);
      if (typeof value === 'string' && value) return value;
    }
    return '';
  }

  _recordDateValue(record, candidates) {
    if (!record) return null;
    for (const candidate of candidates) {
      if (!candidate) continue;
      if (typeof record.date === 'function') {
        const value = record.date(candidate);
        if (value instanceof Date) return value;
      }
      if (typeof record.prop === 'function') {
        const prop = record.prop(candidate);
        if (prop && typeof prop.date === 'function') {
          const value = prop.date();
          if (value instanceof Date) return value;
        }
      }
    }
    return null;
  }

  _periodKeyForMode(periodMode, date) {
    const normalized = this._normalizePeriodStartForMode(periodMode, date);
    if (periodMode === 'weekly') {
      const info = this._isoWeekInfo(normalized);
      return `${info.year}-${String(info.week).padStart(2, '0')}`;
    }
    if (periodMode === 'monthly') {
      return `${normalized.getFullYear()}-${String(normalized.getMonth() + 1).padStart(2, '0')}`;
    }
    if (periodMode === 'quarterly') {
      return `${normalized.getFullYear()}-Q${this._quarterOfDate(normalized)}`;
    }
    return String(normalized.getFullYear());
  }

  _normalizePeriodStartForMode(periodMode, inputDate) {
    const date = this._dateOnly(inputDate);
    if (periodMode === 'weekly') return this._startOfIsoWeek(date);
    if (periodMode === 'monthly') return this._dateOnly(new Date(date.getFullYear(), date.getMonth(), 1));
    if (periodMode === 'quarterly') return this._quarterStartForDate(date);
    return this._dateOnly(new Date(date.getFullYear(), 0, 1));
  }

  _formatPeriodTitle(periodMode, date, format) {
    const normalized = this._normalizePeriodStartForMode(periodMode, date);
    const info = this._isoWeekInfo(normalized);
    const monthShort = normalized.toLocaleDateString('en-US', { month: 'short' });
    const monthLong = normalized.toLocaleDateString('en-US', { month: 'long' });
    const replacements = {
      GGGG: String(info.year),
      gggg: String(info.year),
      YYYY: String(normalized.getFullYear()),
      YY: String(normalized.getFullYear()).slice(-2),
      Q: String(this._quarterOfDate(normalized)),
      MMMM: monthLong,
      MMM: monthShort,
      MM: String(normalized.getMonth() + 1).padStart(2, '0'),
      M: String(normalized.getMonth() + 1),
      DD: String(normalized.getDate()).padStart(2, '0'),
      D: String(normalized.getDate()),
      WW: String(info.week).padStart(2, '0'),
      ww: String(info.week).padStart(2, '0'),
      W: String(info.week),
      w: String(info.week),
    };
    return this._applyLimitedFormat(format || this._defaultTitleFormat(periodMode), replacements);
  }

  _applyLimitedFormat(format, replacements) {
    const source = String(format || '');
    let output = '';
    for (let index = 0; index < source.length;) {
      if (source[index] === '[') {
        const endIndex = source.indexOf(']', index + 1);
        if (endIndex !== -1) {
          output += source.slice(index + 1, endIndex);
          index = endIndex + 1;
          continue;
        }
      }

      let matched = false;
      for (const token of ['GGGG', 'gggg', 'YYYY', 'MMMM', 'MMM', 'MM', 'M', 'DD', 'D', 'WW', 'ww', 'W', 'w', 'YY', 'Q']) {
        if (!source.startsWith(token, index)) continue;
        output += replacements[token] ?? token;
        index += token.length;
        matched = true;
        break;
      }
      if (matched) continue;
      output += source[index];
      index += 1;
    }
    return output;
  }

  _startOfIsoWeek(inputDate) {
    const date = this._dateOnly(inputDate);
    const day = date.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    date.setDate(date.getDate() + diff);
    return this._dateOnly(date);
  }

  _isoWeekInfo(inputDate) {
    const date = this._startOfIsoWeek(inputDate);
    const thursday = this._dateOnly(date);
    thursday.setDate(date.getDate() + 3);
    const year = thursday.getFullYear();
    const firstWeekStart = this._startOfIsoWeek(new Date(year, 0, 4));
    const diffDays = Math.round((date.getTime() - firstWeekStart.getTime()) / 86400000);
    const week = Math.floor(diffDays / 7) + 1;
    return { year, week };
  }

  _isoWeekStartForYearWeek(year, week) {
    const firstWeekStart = this._startOfIsoWeek(new Date(year, 0, 4));
    const date = this._dateOnly(firstWeekStart);
    date.setDate(firstWeekStart.getDate() + ((week - 1) * 7));
    return this._dateOnly(date);
  }

  _quarterOfDate(date) {
    return Math.floor(date.getMonth() / 3) + 1;
  }

  _quarterStartForDate(date) {
    return this._dateOnly(new Date(date.getFullYear(), (this._quarterOfDate(date) - 1) * 3, 1));
  }

  _quarterStartForYearQuarter(year, quarter) {
    return this._dateOnly(new Date(year, (quarter - 1) * 3, 1));
  }

  _monthIndexFromShortName(label) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const index = months.indexOf(label);
    return index === -1 ? null : index;
  }

  _dateOnly(inputDate) {
    return new Date(inputDate.getFullYear(), inputDate.getMonth(), inputDate.getDate(), 12, 0, 0, 0);
  }

  _dateTimeValue(inputDate) {
    const date = this._dateOnly(inputDate);
    return DateTime.dateOnly(date.getFullYear(), date.getMonth(), date.getDate()).value();
  }

  _unique(items) {
    return Array.from(new Set((items || []).filter(Boolean)));
  }

  _css() {
    return `
      .cadence-shell {
        padding: 18px;
        max-width: 920px;
      }
      .cadence-header {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        align-items: flex-start;
        margin-bottom: 16px;
      }
      .cadence-header-actions {
        display: flex;
        gap: 8px;
        flex-shrink: 0;
      }
      .cadence-title {
        font-size: 20px;
        font-weight: 600;
        line-height: 1.15;
        margin-bottom: 4px;
      }
      .cadence-subtitle {
        max-width: 720px;
      }
      .cadence-status-group {
        margin-bottom: 16px;
      }
      .cadence-message {
        border-radius: var(--radius-normal);
      }
      .cadence-message-error {
        color: var(--cmdpal-selected-fg-color, var(--panel-fg-color));
        background: color-mix(in srgb, var(--cmdpal-selected-bg-color, var(--button-bg-selected-color, var(--button-bg-hover-color))) 65%, transparent);
      }
      .cadence-message-success {
        color: var(--panel-fg-color);
        background: color-mix(in srgb, var(--cmdpal-selected-bg-color, var(--button-bg-selected-color, var(--button-bg-hover-color))) 50%, transparent);
      }
      .cadence-message-warning {
        color: var(--panel-fg-color);
        background: color-mix(in srgb, var(--button-bg-hover-color, rgba(0,0,0,0.05)) 55%, transparent);
      }
      .cadence-section-group {
        margin-bottom: 16px;
      }
      .cadence-section-row {
        align-items: center;
        justify-content: space-between;
        gap: 16px;
      }
      .cadence-section-title {
        font-size: 16px;
        font-weight: 600;
        line-height: 1.15;
        margin-bottom: 4px;
      }
      .cadence-required-pill {
        border-radius: 999px;
        padding: 4px 10px;
        font-size: 12px;
        line-height: 1;
        color: var(--text-muted);
        background: var(--button-bg-hover-color, rgba(0,0,0,0.05));
      }
      .cadence-field-label {
        margin-bottom: 6px;
      }
      .cadence-help {
        margin-top: 8px;
      }
      .cadence-switch {
        border: none;
        background: transparent;
        padding: 0;
        margin: 0;
        cursor: pointer;
      }
      .cadence-switch-track {
        display: inline-flex;
        align-items: center;
        width: 42px;
        height: 24px;
        padding: 2px;
        border-radius: 999px;
        background: var(--button-bg-hover-color, rgba(0,0,0,0.12));
        transition: background-color 120ms ease-out;
      }
      .cadence-switch-thumb {
        width: 20px;
        height: 20px;
        border-radius: 999px;
        background: var(--bg-panel, #fff);
        box-shadow: 0 1px 2px rgba(0,0,0,0.16);
        transform: translateX(0);
        transition: transform 120ms ease-out;
      }
      .cadence-switch.is-on .cadence-switch-track {
        background: var(--cmdpal-selected-bg-color, var(--button-bg-selected-color, rgba(0,0,0,0.18)));
      }
      .cadence-switch.is-on .cadence-switch-thumb {
        transform: translateX(18px);
      }
      .cadence-shell code {
        font-family: var(--font-monospace, monospace);
        font-size: 0.95em;
      }
      @media (max-width: 760px) {
        .cadence-header,
        .cadence-section-row {
          flex-direction: column;
          align-items: stretch;
        }
        .cadence-header-actions {
          width: 100%;
        }
      }
    `;
  }
}
