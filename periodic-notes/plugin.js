class Plugin extends CollectionPlugin {
  onLoad() {
    this._version = '0.1.0';
    this._periodMode = this.getConfiguration()?.custom?.periodMode || 'weekly';
    this._prevButton = this.addCollectionNavigationButton({
      icon: 'chevron-left',
      tooltip: this._buttonTooltip('previous'),
      onlyWhenExpanded: false,
      onClick: ({ ev, panel, record }) => this._openRelativePeriod({
        ev,
        panel,
        record,
        direction: -1,
      }),
    });
    this._currentButton = this.addCollectionNavigationButton({
      label: this._currentPeriodLabel(),
      tooltip: this._buttonTooltip('current'),
      onlyWhenExpanded: false,
      onClick: ({ ev, panel }) => this._openCurrentPeriod({ ev, panel }),
    });
    this._nextButton = this.addCollectionNavigationButton({
      icon: 'chevron-right',
      tooltip: this._buttonTooltip('next'),
      onlyWhenExpanded: false,
      onClick: ({ ev, panel, record }) => this._openRelativePeriod({
        ev,
        panel,
        record,
        direction: 1,
      }),
    });

    this.events.on('panel.navigated', () => {
      this._refreshCurrentButton();
      this._syncActiveRecordPeriodStart();
    });
    this.events.on('panel.focused', () => {
      this._refreshCurrentButton();
      this._syncActiveRecordPeriodStart();
    });
    this._syncActiveRecordPeriodStart();
  }

  onUnload() {
    if (this._prevButton) this._prevButton.remove();
    if (this._currentButton) this._currentButton.remove();
    if (this._nextButton) this._nextButton.remove();
  }

  async _openRelativePeriod({ ev, panel, record, direction }) {
    try {
      const baseDate = this._recordPeriodStart(record) || this._today();
      const targetDate = this._shiftPeriod(baseDate, direction);
      await this._openPeriodRecord({ ev, panel, sourceDate: targetDate });
    } catch (error) {
      this._toast('Journal Notes', error?.message || `Unable to open ${this._periodWord()} note.`);
    }
  }

  async _openCurrentPeriod({ ev, panel }) {
    try {
      await this._openPeriodRecord({ ev, panel, sourceDate: this._today() });
    } catch (error) {
      this._toast('Journal Notes', error?.message || `Unable to open ${this._periodWord()} note.`);
    }
  }

  async _openPeriodRecord({ ev, panel, sourceDate }) {
    const record = await this._findOrCreatePeriodRecord(sourceDate);
    if (!record) {
      this._toast('Journal Notes', `Unable to open ${this._periodWord()} note.`);
      return;
    }

    this._navigateToRecord(record.guid, ev);
  }

  async _findOrCreatePeriodRecord(sourceDate) {
    const collection = await this._getCollectionApi();
    if (!collection) return null;

    const periodStart = this._normalizePeriodStart(sourceDate);
    const existing = await this._findRecordByPeriodStart(collection, periodStart);
    if (existing) return existing;

    const guid = collection.createRecord(this._periodTitle(periodStart));
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

  async _getCollectionApi() {
    const collections = await this.data.getAllCollections();
    return collections.find((collection) => collection.guid === this.guid || collection.getName() === this.getName()) || null;
  }

  _syncActiveRecordPeriodStart() {
    const activePanel = this.ui.getActivePanel();
    const activeRecord = activePanel && typeof activePanel.getActiveRecord === 'function'
      ? activePanel.getActiveRecord()
      : null;
    if (!activeRecord || typeof activeRecord.prop !== 'function' || typeof activeRecord.getName !== 'function') {
      return;
    }

    const periodProp = activeRecord.prop('period_start') || activeRecord.prop('Period Start');
    if (!periodProp) return;

    let currentValue = null;
    if (typeof activeRecord.date === 'function') {
      currentValue = activeRecord.date('period_start') || activeRecord.date('Period Start');
    }
    if (!currentValue && typeof periodProp.date === 'function') {
      currentValue = periodProp.date();
    }
    if (currentValue) return;

    const parsed = this._parsePeriodStartFromTitle(activeRecord.getName());
    if (!parsed) return;
    periodProp.set(this._dateTimeValue(parsed));
  }

  _refreshCurrentButton() {
    if (!this._currentButton) return;
    this._currentButton.setLabel(this._currentPeriodLabel());
    this._currentButton.setTooltip(this._buttonTooltip('current'));
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

  _recordPeriodStart(record) {
    if (!record) return null;
    let periodStart = null;

    if (typeof record.date === 'function') {
      periodStart = record.date('period_start') || record.date('Period Start');
    }

    if (!periodStart && typeof record.prop === 'function') {
      const periodProp = record.prop('period_start') || record.prop('Period Start');
      if (periodProp && typeof periodProp.date === 'function') {
        periodStart = periodProp.date();
      }
    }

    return periodStart ? this._dateOnly(periodStart) : null;
  }

  _parsePeriodStartFromTitle(title) {
    if (!title || typeof title !== 'string') return null;

    if (this._periodMode === 'weekly') {
      const match = title.match(/^(\d{4})\s+W(\d{1,2})$/);
      if (!match) return null;
      return this._isoWeekStartForYearWeek(Number(match[1]), Number(match[2]));
    }

    if (this._periodMode === 'monthly') {
      const match = title.match(/^([A-Za-z]{3})\s+(\d{4})$/);
      if (!match) return null;
      const monthIndex = this._monthIndexFromShortName(match[1]);
      if (monthIndex === null) return null;
      return this._dateOnly(new Date(Number(match[2]), monthIndex, 1));
    }

    const yearMatch = title.match(/^(\d{4})$/);
    if (!yearMatch) return null;
    return this._dateOnly(new Date(Number(yearMatch[1]), 0, 1));
  }

  _monthIndexFromShortName(label) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const index = months.indexOf(label);
    return index === -1 ? null : index;
  }

  _isoWeekStartForYearWeek(year, week) {
    const firstWeekStart = this._startOfIsoWeek(new Date(year, 0, 4));
    const date = this._dateOnly(firstWeekStart);
    date.setDate(firstWeekStart.getDate() + ((week - 1) * 7));
    return this._dateOnly(date);
  }

  _shiftPeriod(sourceDate, direction) {
    const base = this._normalizePeriodStart(sourceDate);

    if (this._periodMode === 'weekly') {
      const next = this._dateOnly(base);
      next.setDate(base.getDate() + (direction * 7));
      return this._normalizePeriodStart(next);
    }

    if (this._periodMode === 'monthly') {
      return this._dateOnly(new Date(base.getFullYear(), base.getMonth() + direction, 1));
    }

    return this._dateOnly(new Date(base.getFullYear() + direction, 0, 1));
  }

  _buttonTooltip(kind) {
    const word = this._periodWord();
    if (kind === 'previous') return `Show previous ${word} note`;
    if (kind === 'next') return `Show next ${word} note`;
    return `Show this ${word} note`;
  }

  _periodWord() {
    if (this._periodMode === 'weekly') return 'week';
    if (this._periodMode === 'monthly') return 'month';
    return 'year';
  }

  _currentPeriodLabel() {
    return this._periodButtonLabel(this._today());
  }

  _periodButtonLabel(date) {
    if (this._periodMode === 'weekly') {
      return `W${this._isoWeekInfo(date).week}`;
    }

    if (this._periodMode === 'monthly') {
      return date.toLocaleDateString('en-US', { month: 'short' });
    }

    return String(date.getFullYear());
  }

  _periodTitle(date) {
    if (this._periodMode === 'weekly') {
      const info = this._isoWeekInfo(date);
      return `${info.year} W${info.week}`;
    }

    if (this._periodMode === 'monthly') {
      return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    }

    return String(date.getFullYear());
  }

  _normalizePeriodStart(inputDate) {
    const date = this._dateOnly(inputDate);

    if (this._periodMode === 'weekly') return this._startOfIsoWeek(date);
    if (this._periodMode === 'monthly') return this._dateOnly(new Date(date.getFullYear(), date.getMonth(), 1));
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

  _today() {
    return this._normalizePeriodStart(new Date());
  }

  _dateKey(inputDate) {
    const date = this._dateOnly(inputDate);
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0'),
    ].join('-');
  }

  async _waitForRecord(guid) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const record = this.data.getRecord(guid);
      if (record) return record;
      await this._sleep(50);
    }

    return null;
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
