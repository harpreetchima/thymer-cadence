class Plugin extends JournalCorePlugin {
  onLoad() {
    this._version = '0.1.5';
    if (typeof super.onLoad === 'function') super.onLoad();

    this._weeklyButton = this.addCollectionNavigationButton({
      label: 'W',
      tooltip: 'Open weekly note',
      onlyWhenExpanded: true,
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
      onlyWhenExpanded: true,
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
      onlyWhenExpanded: true,
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
    this._installDatepickerEnhancements();
  }

  onUnload() {
    if (this._datepickerObserver) this._datepickerObserver.disconnect();
    if (this._datepickerPatchTimer) clearTimeout(this._datepickerPatchTimer);
    if (this._weeklyButton) this._weeklyButton.remove();
    if (this._monthlyButton) this._monthlyButton.remove();
    if (this._yearlyButton) this._yearlyButton.remove();
  }

  _installDatepickerEnhancements() {
    if (typeof document === 'undefined' || !document.body || typeof MutationObserver !== 'function') return;
    this._datepickerObserver = new MutationObserver(() => this._queueDatepickerPatch());
    this._datepickerObserver.observe(document.body, { childList: true, subtree: true });
    this._queueDatepickerPatch();
  }

  _queueDatepickerPatch() {
    if (this._datepickerPatchTimer) return;
    this._datepickerPatchTimer = setTimeout(() => {
      this._datepickerPatchTimer = null;
      this._patchOpenDatepickers();
    }, 0);
  }

  _patchOpenDatepickers() {
    if (typeof document === 'undefined') return;
    const wrappers = document.querySelectorAll('.cmdpal--inline .autocomplete-date-widget .id--datepicker .datepicker-wrapper.datepicker-compact');
    wrappers.forEach((wrapper) => this._patchDatepicker(wrapper));
  }

  _patchDatepicker(wrapper) {
    const popup = wrapper.closest('.cmdpal--inline');
    const inlineInput = popup?.querySelector('.cmdpal--inline-input[placeholder*="monday"]');
    const header = wrapper.querySelector('.datepicker-header');
    const currentMonthTrigger = header?.querySelector('.current-month');
    const navControls = currentMonthTrigger?.nextElementSibling;
    const weekdays = wrapper.querySelector('.datepicker-weekdays');
    const dayGrid = wrapper.querySelector('.datepicker-days');
    if (!popup || !inlineInput || !header || !currentMonthTrigger || !navControls || !weekdays || !dayGrid) return;

    const dayCells = [...dayGrid.querySelectorAll(':scope > .day')];
    if (!dayCells.length || dayCells.length % 7 !== 0) return;

    const firstCurrentDay = dayCells.find((cell) => cell.classList.contains('current-month'));
    const displayedDate = this._dateFromPickerValue(firstCurrentDay?.dataset?.date || dayCells[0]?.dataset?.date || '');
    if (!displayedDate) return;

    popup.classList.add('cadence-datepicker-popup');
    wrapper.classList.add('cadence-datepicker-enhanced');
    currentMonthTrigger.classList.add('cadence-native-month-trigger');
    navControls.classList.add('cadence-native-nav');

    const todayButton = navControls.querySelector('.go-to-today');
    if (todayButton) {
      todayButton.classList.add('cadence-today-button');
      this._bridgeNativeDatepickerClick(todayButton);
    }
    this._bridgeNativeDatepickerClick(currentMonthTrigger);

    this._patchDatepickerHeaderLinks({ header, currentMonthTrigger, displayedDate });
    this._patchDatepickerGrid({ weekdays, dayGrid, dayCells });
    dayCells.forEach((cell) => this._bridgeNativeDatepickerClick(cell));
    this._patchDatepickerShell({ popup, wrapper });
  }

  _patchDatepickerHeaderLinks({ header, currentMonthTrigger, displayedDate }) {
    let links = header.querySelector('.cadence-datepicker-links');
    if (!links) {
      links = document.createElement('div');
      links.className = 'cadence-datepicker-links';
      links.innerHTML = [
        '<button class="cadence-datepicker-link cadence-datepicker-month" type="button"></button>',
        '<button class="cadence-datepicker-link cadence-datepicker-year" type="button"></button>',
      ].join('');
      header.insertBefore(links, currentMonthTrigger);
    }

    const monthButton = links.querySelector('.cadence-datepicker-month');
    const yearButton = links.querySelector('.cadence-datepicker-year');
    links.querySelector('.cadence-datepicker-dot')?.remove();
    if (!monthButton || !yearButton) return;

    monthButton.textContent = displayedDate.toLocaleDateString('en-US', { month: 'long' });
    yearButton.textContent = String(displayedDate.getFullYear());
    currentMonthTrigger.title = 'Open month and year picker';

    this._bindDatepickerAction(monthButton, (ev) => this._handleDatepickerPeriodOpen(ev, 'monthly', displayedDate));
    this._bindDatepickerAction(yearButton, (ev) => this._handleDatepickerPeriodOpen(ev, 'yearly', displayedDate));
  }

  _patchDatepickerGrid({ weekdays, dayGrid, dayCells }) {
    weekdays.querySelector('.cadence-datepicker-weeklabel')?.remove();
    dayGrid.querySelectorAll('.cadence-datepicker-weeknum').forEach((node) => node.remove());

    const weekLabel = document.createElement('div');
    weekLabel.className = 'cadence-datepicker-weeklabel';
    weekLabel.textContent = 'W';
    weekdays.insertBefore(weekLabel, weekdays.firstChild);

    const weekdayLabels = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
    [...weekdays.querySelectorAll('.weekday')].forEach((label, index) => {
      label.textContent = weekdayLabels[index] || label.textContent;
    });

    dayCells.forEach((cell) => dayGrid.appendChild(cell));
    for (let index = 0; index < dayCells.length; index += 7) {
      const mondayCell = dayCells[index];
      const mondayDate = this._dateFromPickerValue(mondayCell?.dataset?.date || '');
      if (!mondayDate) continue;
      const weekInfo = this._isoWeekInfo(mondayDate);

      const weekButton = document.createElement('button');
      weekButton.type = 'button';
      weekButton.className = 'cadence-datepicker-weeknum';
      weekButton.textContent = String(weekInfo.week);
      weekButton.title = `Open weekly note for W${weekInfo.week} ${weekInfo.year}`;
      this._bindDatepickerAction(weekButton, (ev) => this._handleDatepickerPeriodOpen(ev, 'weekly', mondayDate));
      dayGrid.insertBefore(weekButton, mondayCell);
    }
  }

  _patchDatepickerShell({ popup, wrapper }) {
    const inputContainer = popup.querySelector('.cmdpal--inline-input-container');
    const inputRow = inputContainer?.firstElementChild;
    const input = popup.querySelector('.cmdpal--inline-input');
    const autocomplete = popup.querySelector('.autocomplete.clickable');
    const scrollNode = popup.querySelector('.vscroll-node');
    const vcontent = popup.querySelector('.vcontent');
    const scrollbar = popup.querySelector('.vscrollbar.scrollbar');
    if (!inputContainer || !inputRow || !input || !autocomplete || !scrollNode || !vcontent) return;

    const desiredWidth = Math.max(Math.ceil(wrapper.scrollWidth), 256);
    popup.style.width = `${desiredWidth + 2}px`;
    inputContainer.style.width = `${desiredWidth}px`;
    inputRow.style.width = `${desiredWidth}px`;
    input.style.width = `${Math.max(desiredWidth - 16, 120)}px`;
    autocomplete.style.width = `${desiredWidth}px`;
    autocomplete.style.overflow = 'visible';
    autocomplete.style.maxHeight = 'none';
    scrollNode.style.width = `${desiredWidth}px`;
    scrollNode.style.overflow = 'visible';
    scrollNode.style.height = 'auto';
    scrollNode.style.maxHeight = 'none';
    vcontent.style.width = `${desiredWidth}px`;
    vcontent.style.overflow = 'visible';
    if (scrollbar) scrollbar.style.display = 'none';
  }

  _bridgeNativeDatepickerClick(element) {
    if (!element || element.dataset.cadenceNativeBridge === '1') return;

    const onPointerDown = (ev) => {
      if (typeof ev.button === 'number' && ev.button !== 0) return;
      ev.preventDefault();
      ev.stopPropagation();
      element.__cadenceSuppressNativeClick = true;
      element.__cadenceBridgeInvoking = true;
      element.click();
      element.__cadenceBridgeInvoking = false;
    };

    const onClick = (ev) => {
      if (element.__cadenceBridgeInvoking) return;
      if (!element.__cadenceSuppressNativeClick) return;
      element.__cadenceSuppressNativeClick = false;
      ev.preventDefault();
      ev.stopPropagation();
    };

    element.addEventListener('pointerdown', onPointerDown, true);
    element.addEventListener('click', onClick, true);
    element.dataset.cadenceNativeBridge = '1';
  }

  _bindDatepickerAction(element, onActivate) {
    let activatedFromPointer = false;
    const consume = (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
    };
    element.onpointerdown = (ev) => {
      activatedFromPointer = true;
      consume(ev);
      onActivate(ev);
    };
    element.onpointerup = consume;
    element.onmousedown = consume;
    element.onclick = (ev) => {
      consume(ev);
      if (activatedFromPointer) {
        activatedFromPointer = false;
        return;
      }
      onActivate(ev);
    };
    element.onkeydown = (ev) => {
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      activatedFromPointer = false;
      consume(ev);
      onActivate(ev);
    };
    element.onblur = () => {
      activatedFromPointer = false;
    };
  }

  _handleDatepickerPeriodOpen(ev, periodMode, sourceDate) {
    ev.preventDefault();
    ev.stopPropagation();
    void this._openPeriodNote({
      ev,
      panel: this.ui.getActivePanel(),
      periodMode,
      sourceDate,
    });
  }

  _dateFromPickerValue(value) {
    if (!value || typeof value !== 'string') return null;
    const [year, month, day] = value.split('-').map(Number);
    if (!year || !month || !day) return null;
    return this._dateOnly(new Date(year, month - 1, day));
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
      this._toast('Thymer Cadence', `Collection not found for ${periodMode} notes.`);
      return;
    }

    const record = await this._findOrCreatePeriodRecord(collection, periodMode, sourceDate);
    if (!record) {
      this._toast('Thymer Cadence', `Unable to open ${periodMode} note.`);
      return;
    }

    const targetPanel = await this._getTargetPanel(panel, ev);
    if (targetPanel && this._navigateToRecord(targetPanel, record.guid)) {
      return;
    }

    this._navigateToUrl(record.guid, ev);
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
    const existing = await this._findRecordByPeriodStart(collection, periodMode, periodStart);
    if (existing) return existing;

    const guid = collection.createRecord(this._periodTitle(periodMode, periodStart));
    if (!guid) return null;

    const record = this.data.getRecord(guid);
    if (record) {
      this._setPeriodMetadata(record, periodMode, periodStart);
      return record;
    }

    this._finalizeCreatedRecord(guid, periodMode, periodStart);
    return { guid };
  }

  async _finalizeCreatedRecord(guid, periodMode, periodStart) {
    const record = await this._waitForRecord(guid);
    if (record) {
      this._setPeriodMetadata(record, periodMode, periodStart);
    }
  }

  _setPeriodMetadata(record, periodMode, periodStart) {
    const periodProperty = record.prop('period_start') || record.prop('Period Start');
    if (periodProperty) {
      periodProperty.set(this._dateTimeValue(periodStart));
    }

    const keyProperty = record.prop('period_key') || record.prop('Period Key');
    if (keyProperty) {
      keyProperty.set(this._periodKey(periodMode, periodStart));
    }
  }

  async _findRecordByPeriodStart(collection, periodMode, targetDate) {
    const targetKey = this._periodKey(periodMode, targetDate);
    const records = await collection.getAllRecords();

    for (const record of records) {
      const recordKey = this._recordPeriodKey(periodMode, record);
      if (recordKey === targetKey) {
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

  _navigateToRecord(panel, guid) {
    const workspaceGuid = this.collectionRoot?.wsguid || this.data.getActiveUsers()?.[0]?.workspaceGuid || null;
    if (!workspaceGuid || !guid || !panel || typeof panel.navigateTo !== 'function') return false;

    try {
      panel.navigateTo({
        type: 'edit_panel',
        rootId: guid,
        subId: null,
        workspaceGuid,
      });
      if (typeof this.ui.setActivePanel === 'function') {
        this.ui.setActivePanel(panel);
      }
      return true;
    } catch (error) {
      return false;
    }
  }

  _navigateToUrl(guid, ev) {
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

  _recordPeriodKey(periodMode, record) {
    if (!record) return null;

    if (typeof record.text === 'function') {
      const keyText = record.text('period_key') || record.text('Period Key');
      if (keyText) return keyText;
    }

    const derivedDate = this._recordPeriodStartFromTitle(periodMode, record);
    return derivedDate ? this._periodKey(periodMode, derivedDate) : null;
  }

  _recordPeriodStartFromTitle(periodMode, record) {
    if (!record) return null;

    let periodStart = null;
    if (typeof record.date === 'function') {
      periodStart = record.date('period_start') || record.date('Period Start');
    }
    if (!periodStart && typeof record.prop === 'function') {
      const prop = record.prop('period_start') || record.prop('Period Start');
      if (prop && typeof prop.date === 'function') {
        periodStart = prop.date();
      }
    }
    if (periodStart) return this._dateOnly(periodStart);

    const title = typeof record.getName === 'function' ? record.getName() : null;
    return this._parsePeriodStartFromTitle(periodMode, title);
  }

  _periodKey(periodMode, date) {
    const normalized = this._normalizePeriodStart(periodMode, date);
    if (periodMode === 'weekly') {
      const info = this._isoWeekInfo(normalized);
      return `${info.year}-${String(info.week).padStart(2, '0')}`;
    }
    if (periodMode === 'monthly') {
      return `${normalized.getFullYear()}-${String(normalized.getMonth() + 1).padStart(2, '0')}`;
    }
    return String(normalized.getFullYear());
  }

  _parsePeriodStartFromTitle(periodMode, title) {
    if (!title || typeof title !== 'string') return null;

    if (periodMode === 'weekly') {
      const match = title.match(/^(\d{4})\s+W(\d{1,2})$/);
      if (!match) return null;
      return this._isoWeekStartForYearWeek(Number(match[1]), Number(match[2]));
    }

    if (periodMode === 'monthly') {
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
