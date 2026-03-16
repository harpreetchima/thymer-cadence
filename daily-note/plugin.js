class Plugin extends JournalCorePlugin {
  onLoad() {
    this._version = '0.1.0';
    if (typeof super.onLoad === 'function') super.onLoad();

    this._weeklyButton = this.addCollectionNavigationButton({
      label: 'W',
      tooltip: 'Open weekly note',
      onlyWhenExpanded: false,
      onClick: ({ ev, panel, record }) => this._openPeriodNote({
        ev,
        panel,
        periodMode: 'weekly',
        sourceDate: this._sourceDateFromRecord(record),
      }),
    });
    this._monthlyButton = this.addCollectionNavigationButton({
      label: 'Mon',
      tooltip: 'Open monthly note',
      onlyWhenExpanded: false,
      onClick: ({ ev, panel, record }) => this._openPeriodNote({
        ev,
        panel,
        periodMode: 'monthly',
        sourceDate: this._sourceDateFromRecord(record),
      }),
    });
    this._yearlyButton = this.addCollectionNavigationButton({
      label: 'YYYY',
      tooltip: 'Open yearly note',
      onlyWhenExpanded: false,
      onClick: ({ ev, panel, record }) => this._openPeriodNote({
        ev,
        panel,
        periodMode: 'yearly',
        sourceDate: this._sourceDateFromRecord(record),
      }),
    });

    this.events.on('panel.navigated', () => this._refreshButtons());
    this.events.on('panel.focused', () => this._refreshButtons());
    this._refreshButtons();
  }

  onUnload() {
    if (this._weeklyButton) this._weeklyButton.remove();
    if (this._monthlyButton) this._monthlyButton.remove();
    if (this._yearlyButton) this._yearlyButton.remove();
  }

  _refreshButtons() {
    const activePanel = this.ui.getActivePanel();
    const activeRecord = activePanel && typeof activePanel.getActiveRecord === 'function'
      ? activePanel.getActiveRecord()
      : null;
    const sourceDate = this._sourceDateFromRecord(activeRecord);

    this._refreshButton(this._weeklyButton, 'weekly', sourceDate);
    this._refreshButton(this._monthlyButton, 'monthly', sourceDate);
    this._refreshButton(this._yearlyButton, 'yearly', sourceDate);
  }

  _refreshButton(button, periodMode, sourceDate) {
    if (!button) return;
    const periodStart = this._normalizePeriodStart(periodMode, sourceDate);
    button.setLabel(this._periodButtonLabel(periodMode, periodStart));
    button.setTooltip(`Open ${periodMode} note for ${this._periodTooltipLabel(periodMode, periodStart)}`);
  }

  async _openPeriodNote({ ev, panel, periodMode, sourceDate }) {
    const collection = await this._findPeriodCollection(periodMode);
    if (!collection) {
      this._toast('Journal Notes', `Collection not found for ${periodMode} notes.`);
      return;
    }

    const record = await this._findOrCreatePeriodRecord(collection, periodMode, sourceDate);
    if (!record) {
      this._toast('Journal Notes', `Unable to open ${periodMode} note.`);
      return;
    }

    this._navigateToRecord(record.guid, ev);
  }

  _sourceDateFromRecord(record) {
    const details = record && typeof record.getJournalDetails === 'function'
      ? record.getJournalDetails()
      : null;
    return details && details.date instanceof Date ? this._dateOnly(details.date) : this._dateOnly(new Date());
  }

  async _findPeriodCollection(periodMode) {
    const config = this.getConfiguration()?.custom || {};
    const defaults = {
      weekly: 'Weekly Notes',
      monthly: 'Monthly Notes',
      yearly: 'Yearly Notes',
    };
    const guid = config[`${periodMode}CollectionGuid`] || null;
    const name = config[`${periodMode}CollectionName`] || defaults[periodMode];
    const collections = await this.data.getAllCollections();

    if (guid) {
      const byGuid = collections.find((collection) => collection.guid === guid);
      if (byGuid) return byGuid;
    }

    return collections.find((collection) => collection.getName() === name) || null;
  }

  async _findOrCreatePeriodRecord(collection, periodMode, sourceDate) {
    const periodStart = this._normalizePeriodStart(periodMode, sourceDate);
    const existing = await this._findRecordByPeriodStart(collection, periodStart);
    if (existing) return existing;

    const guid = collection.createRecord(this._periodTitle(periodMode, periodStart));
    if (!guid) return null;

    const record = this.data.getRecord(guid);
    if (record) {
      this._setPeriodStart(record, periodStart);
      return record;
    }

    this._finalizeCreatedRecord(guid, periodStart);
    return { guid };
  }

  async _finalizeCreatedRecord(guid, periodStart) {
    const record = await this._waitForRecord(guid);
    if (record) {
      this._setPeriodStart(record, periodStart);
    }
  }

  _setPeriodStart(record, periodStart) {
    const periodProperty = record.prop('period_start') || record.prop('Period Start');
    if (periodProperty) {
      periodProperty.set(this._dateTimeValue(periodStart));
    }
  }

  async _findRecordByPeriodStart(collection, targetDate) {
    const targetKey = this._dateKey(targetDate);
    const records = await collection.getAllRecords();

    for (const record of records) {
      const recordDate = record.date('period_start') || record.date('Period Start');
      if (recordDate && this._dateKey(recordDate) === targetKey) {
        return record;
      }
    }

    return null;
  }

  async _waitForRecord(guid) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const record = this.data.getRecord(guid);
      if (record) return record;
      await this._sleep(50);
    }

    return null;
  }

  async _getTargetPanel(panel, ev) {
    const basePanel = panel || this.ui.getActivePanel();
    const openInNewPanel = !!(ev && (ev.metaKey || ev.ctrlKey || ev.shiftKey));

    if (!openInNewPanel) return basePanel;

    const options = basePanel ? { afterPanel: basePanel } : undefined;
    return (await this.ui.createPanel(options)) || basePanel;
  }

  _navigateToRecord(guid, ev) {
    const workspaceGuid = this.collectionRoot?.wsguid || this.data.getActiveUsers()?.[0]?.workspaceGuid || null;
    if (!workspaceGuid || !guid) return;

    const url = `${window.location.origin}/?open=${workspaceGuid}.${guid}`;
    const openInNewTab = !!(ev && (ev.metaKey || ev.ctrlKey || ev.shiftKey));

    if (openInNewTab) {
      window.open(url, '_blank', 'noopener');
      return;
    }

    window.location.assign(url);
  }

  _periodButtonLabel(periodMode, date) {
    if (periodMode === 'weekly') {
      return `W${this._isoWeekInfo(date).week}`;
    }

    if (periodMode === 'monthly') {
      return date.toLocaleDateString('en-US', { month: 'short' });
    }

    return String(date.getFullYear());
  }

  _periodTooltipLabel(periodMode, date) {
    if (periodMode === 'weekly') {
      const info = this._isoWeekInfo(date);
      return `W${info.week} ${info.year}`;
    }

    if (periodMode === 'monthly') {
      return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }

    return String(date.getFullYear());
  }

  _periodTitle(periodMode, date) {
    if (periodMode === 'weekly') {
      const info = this._isoWeekInfo(date);
      return `${info.year} W${info.week}`;
    }

    if (periodMode === 'monthly') {
      return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    }

    return String(date.getFullYear());
  }

  _normalizePeriodStart(periodMode, inputDate) {
    const date = this._dateOnly(inputDate);

    if (periodMode === 'weekly') return this._startOfIsoWeek(date);
    if (periodMode === 'monthly') return this._dateOnly(new Date(date.getFullYear(), date.getMonth(), 1));
    return this._dateOnly(new Date(date.getFullYear(), 0, 1));
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

  _dateTimeValue(inputDate) {
    const date = this._dateOnly(inputDate);
    return DateTime.dateOnly(date.getFullYear(), date.getMonth(), date.getDate()).value();
  }

  _dateOnly(inputDate) {
    return new Date(inputDate.getFullYear(), inputDate.getMonth(), inputDate.getDate(), 12, 0, 0, 0);
  }

  _dateKey(inputDate) {
    const date = this._dateOnly(inputDate);
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0'),
    ].join('-');
  }

  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  _toast(title, message) {
    this.ui.addToaster({
      title,
      message,
      dismissible: true,
      autoDestroyTime: 3000,
    });
  }
}
