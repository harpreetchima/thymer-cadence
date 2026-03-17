class Plugin extends CollectionPlugin {
  onLoad() {
    this._version = '0.2.4';
    this._periodMode = this.getConfiguration()?.custom?.periodMode || 'weekly';
    this._dailyNoteCollectionGuid = this.getConfiguration()?.custom?.dailyNoteCollectionGuid || '16S1WSXAWSHVHJZ72G6J3JRTCP';
    this._dailyNoteCollectionName = this.getConfiguration()?.custom?.dailyNoteCollectionName || 'Daily Notes';
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
    this._calendarButton = this.addCollectionNavigationButton({
      htmlLabel: '<span class="ti ti-calendar-event"></span>',
      tooltip: `Open ${this._periodWord()} calendar`,
      onlyWhenExpanded: false,
      onClick: ({ ev, panel, record, element }) => {
        ev.preventDefault();
        ev.stopPropagation();
        this._toggleCalendarPopup({ ev, panel, record, anchorElement: element });
      },
    });
    this._boundHandlePopupPointerDown = (ev) => this._handlePopupPointerDown(ev);
    this._boundHandlePopupKeyDown = (ev) => this._handlePopupKeyDown(ev);
    this._boundRepositionCalendarPopup = () => this._positionCalendarPopup();

    this.events.on('panel.navigated', () => {
      this._closeCalendarPopup();
      this._refreshCurrentButton();
      this._syncActiveRecordPeriodStart();
    });
    this.events.on('panel.focused', () => {
      this._closeCalendarPopup();
      this._refreshCurrentButton();
      this._syncActiveRecordPeriodStart();
    });
    this._refreshTimer = setInterval(() => {
      this._refreshCurrentButton();
      this._syncActiveRecordPeriodStart();
    }, 500);
    this._syncActiveRecordPeriodStart();
  }

  onUnload() {
    this._closeCalendarPopup();
    if (this._refreshTimer) clearInterval(this._refreshTimer);
    if (this._prevButton) this._prevButton.remove();
    if (this._currentButton) this._currentButton.remove();
    if (this._nextButton) this._nextButton.remove();
    if (this._calendarButton) this._calendarButton.remove();
  }

  _toggleCalendarPopup({ panel, record, anchorElement }) {
    if (this._calendarPopupElement) {
      this._closeCalendarPopup();
      return;
    }

    this._openCalendarPopup({ panel, record, anchorElement });
  }

  _openCalendarPopup({ panel, record, anchorElement }) {
    if (typeof document === 'undefined' || !document.body) return;

    this._closeCalendarPopup();

    const activePanel = panel || this.ui.getActivePanel();
    const selectedDate = this._currentDailyDate();
    const displayedMonth = this._dateOnly(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));

    this._calendarPopupAnchor = anchorElement || null;
    this._calendarPopupState = {
      panel: activePanel,
      selectedDate,
      displayedMonth,
      view: 'calendar',
      yearPickerStart: this._yearPickerStart(displayedMonth.getFullYear()),
    };

    this._calendarPopupElement = document.createElement('div');
    this._calendarPopupElement.className = 'cmdpal--inline cadence-period-picker-popup';
    document.body.appendChild(this._calendarPopupElement);

    document.addEventListener('pointerdown', this._boundHandlePopupPointerDown, true);
    document.addEventListener('keydown', this._boundHandlePopupKeyDown, true);
    window.addEventListener('resize', this._boundRepositionCalendarPopup);
    window.addEventListener('scroll', this._boundRepositionCalendarPopup, true);

    this._renderCalendarPopup();
  }

  _closeCalendarPopup() {
    if (typeof document !== 'undefined') {
      document.removeEventListener('pointerdown', this._boundHandlePopupPointerDown, true);
      document.removeEventListener('keydown', this._boundHandlePopupKeyDown, true);
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', this._boundRepositionCalendarPopup);
      window.removeEventListener('scroll', this._boundRepositionCalendarPopup, true);
    }
    if (this._calendarPopupElement) {
      this._calendarPopupElement.remove();
    }

    this._calendarPopupElement = null;
    this._calendarPopupAnchor = null;
    this._calendarPopupState = null;
  }

  _handlePopupPointerDown(ev) {
    if (!this._calendarPopupElement) return;
    if (this._calendarPopupElement.contains(ev.target)) return;
    if (this._calendarPopupAnchor && this._calendarPopupAnchor.contains(ev.target)) return;
    this._closeCalendarPopup();
  }

  _handlePopupKeyDown(ev) {
    if (ev.key !== 'Escape') return;
    this._closeCalendarPopup();
  }

  _positionCalendarPopup() {
    if (!this._calendarPopupElement || !this._calendarPopupAnchor) return;

    const anchorRect = this._calendarPopupAnchor.getBoundingClientRect();
    const popupRect = this._calendarPopupElement.getBoundingClientRect();
    const left = Math.max(12, Math.min(anchorRect.right - popupRect.width, window.innerWidth - popupRect.width - 12));
    const top = Math.max(12, Math.min(anchorRect.bottom + 8, window.innerHeight - popupRect.height - 12));

    this._calendarPopupElement.style.left = `${left}px`;
    this._calendarPopupElement.style.top = `${top}px`;
  }

  _renderCalendarPopup() {
    if (!this._calendarPopupElement || !this._calendarPopupState) return;

    const state = this._calendarPopupState;
    const monthLabel = state.displayedMonth.toLocaleDateString('en-US', { month: 'long' });
    const yearLabel = String(state.displayedMonth.getFullYear());
    const bodyHtml = state.view === 'years'
      ? this._renderCalendarYearPicker(state)
      : this._renderCalendarMonthView(state);

    this._calendarPopupElement.innerHTML = `
      <div class="cadence-period-picker-body">
        <div class="cadence-period-picker-header">
          <div class="cadence-period-picker-links">
            <button type="button" class="cadence-period-picker-link cadence-period-picker-month">${monthLabel}</button>
            <button type="button" class="cadence-period-picker-link cadence-period-picker-year">${yearLabel}</button>
            <button type="button" class="cadence-period-picker-dot" aria-label="Open month and year picker"></button>
          </div>
          <div class="cadence-period-picker-nav">
            <button type="button" class="button-none button-small button-minimal-hover cadence-period-picker-navbtn cadence-period-picker-prev" aria-label="Previous ${state.view === 'years' ? 'years' : 'month'}"><span class="ti ti-chevron-left"></span></button>
            <button type="button" class="button-none button-small button-minimal-hover cadence-period-picker-today">Today</button>
            <button type="button" class="button-none button-small button-minimal-hover cadence-period-picker-navbtn cadence-period-picker-next" aria-label="Next ${state.view === 'years' ? 'years' : 'month'}"><span class="ti ti-chevron-right"></span></button>
          </div>
        </div>
        ${bodyHtml}
      </div>
    `;

    this._calendarPopupElement.querySelector('.cadence-period-picker-month')?.addEventListener('click', (ev) => {
      this._closeCalendarPopup();
      void this._openCadenceTarget({
        ev,
        panel: state.panel,
        targetMode: 'monthly',
        sourceDate: state.selectedDate,
      });
    });
    this._calendarPopupElement.querySelector('.cadence-period-picker-year')?.addEventListener('click', (ev) => {
      this._closeCalendarPopup();
      void this._openCadenceTarget({
        ev,
        panel: state.panel,
        targetMode: 'yearly',
        sourceDate: state.selectedDate,
      });
    });
    this._calendarPopupElement.querySelector('.cadence-period-picker-dot')?.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      this._calendarPopupState.view = this._calendarPopupState.view === 'years' ? 'calendar' : 'years';
      this._calendarPopupState.yearPickerStart = this._yearPickerStart(this._calendarPopupState.displayedMonth.getFullYear());
      this._renderCalendarPopup();
    });
    this._calendarPopupElement.querySelector('.cadence-period-picker-prev')?.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      if (this._calendarPopupState.view === 'years') {
        this._calendarPopupState.yearPickerStart -= 30;
      } else {
        this._calendarPopupState.displayedMonth = this._dateOnly(new Date(
          this._calendarPopupState.displayedMonth.getFullYear(),
          this._calendarPopupState.displayedMonth.getMonth() - 1,
          1,
        ));
      }
      this._renderCalendarPopup();
    });
    this._calendarPopupElement.querySelector('.cadence-period-picker-next')?.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      if (this._calendarPopupState.view === 'years') {
        this._calendarPopupState.yearPickerStart += 30;
      } else {
        this._calendarPopupState.displayedMonth = this._dateOnly(new Date(
          this._calendarPopupState.displayedMonth.getFullYear(),
          this._calendarPopupState.displayedMonth.getMonth() + 1,
          1,
        ));
      }
      this._renderCalendarPopup();
    });
    this._calendarPopupElement.querySelector('.cadence-period-picker-today')?.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const today = this._currentDailyDate();
      this._calendarPopupState.selectedDate = today;
      this._calendarPopupState.displayedMonth = this._dateOnly(new Date(today.getFullYear(), today.getMonth(), 1));
      this._calendarPopupState.yearPickerStart = this._yearPickerStart(today.getFullYear());
      this._calendarPopupState.view = 'calendar';
      this._renderCalendarPopup();
    });

    this._calendarPopupElement.querySelectorAll('.cadence-period-picker-weeknum').forEach((button) => {
      button.addEventListener('click', (ev) => {
        const sourceDate = this._dateFromKey(button.dataset.date || '');
        if (!sourceDate) return;
        this._closeCalendarPopup();
        void this._openCadenceTarget({
          ev,
          panel: state.panel,
          targetMode: 'weekly',
          sourceDate,
        });
      });
    });
    this._calendarPopupElement.querySelectorAll('.cadence-period-picker-day').forEach((button) => {
      button.addEventListener('click', (ev) => {
        const sourceDate = this._dateFromKey(button.dataset.date || '');
        if (!sourceDate) return;
        this._closeCalendarPopup();
        void this._openCadenceTarget({
          ev,
          panel: state.panel,
          targetMode: 'daily',
          sourceDate,
        });
      });
    });
    this._calendarPopupElement.querySelector('.cadence-period-picker-selected')?.addEventListener('click', (ev) => {
      this._closeCalendarPopup();
      void this._openCadenceTarget({
        ev,
        panel: state.panel,
        targetMode: 'daily',
        sourceDate: state.selectedDate,
      });
    });
    this._calendarPopupElement.querySelectorAll('.cadence-period-picker-year-option').forEach((button) => {
      button.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const year = Number(button.dataset.year || '0');
        if (!year) return;
        const month = this._calendarPopupState.displayedMonth.getMonth();
        const day = Math.min(this._calendarPopupState.selectedDate.getDate(), this._daysInMonth(year, month));
        this._calendarPopupState.selectedDate = this._dateOnly(new Date(year, month, day));
        this._calendarPopupState.displayedMonth = this._dateOnly(new Date(year, month, 1));
        this._calendarPopupState.view = 'calendar';
        this._renderCalendarPopup();
      });
    });

    requestAnimationFrame(() => this._positionCalendarPopup());
  }

  _renderCalendarMonthView(state) {
    const weekdayLabels = ['W', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
    const weekdayHtml = weekdayLabels.map((label, index) => {
      const className = index === 0 ? 'cadence-period-picker-weeklabel' : 'cadence-period-picker-weekday';
      return `<div class="${className}">${label}</div>`;
    }).join('');
    const rows = this._buildCalendarRows(state.displayedMonth);
    const daysHtml = rows.flatMap((row) => {
      const weekButton = `<button type="button" class="cadence-period-picker-weeknum" data-date="${this._dateKey(row.weekStart)}" title="Open weekly note for W${row.weekInfo.week} ${row.weekInfo.year}">${row.weekInfo.week}</button>`;
      const dayButtons = row.days.map((date) => this._renderCalendarDayButton(date, state));
      return [weekButton, ...dayButtons];
    }).join('');

    return `
      <div class="cadence-period-picker-weekdays">${weekdayHtml}</div>
      <div class="cadence-period-picker-days">${daysHtml}</div>
      <button type="button" class="cadence-period-picker-selected">
        <span class="ti ti-calendar-event"></span>
        <span>${this._popupDateLabel(state.selectedDate)}</span>
      </button>
    `;
  }

  _renderCalendarYearPicker(state) {
    const years = Array.from({ length: 30 }, (_, index) => state.yearPickerStart + index);
    const items = years.map((year) => {
      const className = year === state.displayedMonth.getFullYear()
        ? 'cadence-period-picker-year-option is-active'
        : 'cadence-period-picker-year-option';
      return `<button type="button" class="${className}" data-year="${year}">${year}</button>`;
    }).join('');

    return `<div class="cadence-period-picker-years">${items}</div>`;
  }

  _buildCalendarRows(displayedMonth) {
    const monthStart = this._dateOnly(new Date(displayedMonth.getFullYear(), displayedMonth.getMonth(), 1));
    const gridStart = this._startOfIsoWeek(monthStart);
    const rows = [];

    for (let rowIndex = 0; rowIndex < 6; rowIndex += 1) {
      const weekStart = this._dateOnly(new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + (rowIndex * 7)));
      const days = [];
      for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
        days.push(this._dateOnly(new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + dayIndex)));
      }
      rows.push({
        weekStart,
        weekInfo: this._isoWeekInfo(weekStart),
        days,
      });
    }

    return rows;
  }

  _renderCalendarDayButton(date, state) {
    const classes = ['cadence-period-picker-day'];
    if (date.getMonth() !== state.displayedMonth.getMonth()) classes.push('is-outside');
    if (this._dateKey(date) === this._dateKey(state.selectedDate)) classes.push('is-selected');
    if (this._dateKey(date) === this._dateKey(this._currentDailyDate())) classes.push('is-today');

    return `
      <button type="button" class="${classes.join(' ')}" data-date="${this._dateKey(date)}">
        <span class="day-inner">${date.getDate()}</span>
      </button>
    `;
  }

  async _openCadenceTarget({ ev, panel, targetMode, sourceDate }) {
    if (targetMode === 'daily') {
      await this._openDailyNote({ ev, panel, sourceDate });
      return;
    }

    if (targetMode === this._periodMode) {
      await this._openPeriodRecord({ ev, panel, sourceDate });
      return;
    }

    const collection = await this._findPeriodCollection(targetMode);
    if (!collection) {
      this._toast('Thymer Cadence', `Collection not found for ${targetMode} notes.`);
      return;
    }

    const record = await this._findOrCreatePeriodRecordForMode(collection, targetMode, sourceDate);
    if (!record) {
      this._toast('Thymer Cadence', `Unable to open ${targetMode} note.`);
      return;
    }

    const targetPanel = await this._getTargetPanel(panel, ev);
    if (targetPanel && this._navigateToRecord(targetPanel, record.guid)) {
      return;
    }

    this._navigateToUrl(record.guid, ev);
  }

  async _openDailyNote({ ev, panel, sourceDate }) {
    const dailyGuid = await this._findDailyNoteCollectionGuid();
    if (!dailyGuid) {
      this._toast('Thymer Cadence', 'Daily Notes collection not found.');
      return;
    }

    const journalGuid = this._dailyJournalRecordGuid(sourceDate, dailyGuid);
    const targetPanel = await this._getTargetPanel(panel, ev);
    if (targetPanel && this._navigateToRecord(targetPanel, journalGuid)) {
      return;
    }

    this._navigateToUrl(journalGuid, ev);
  }

  async _findDailyNoteCollectionGuid() {
    if (this._dailyNoteCollectionGuid) return this._dailyNoteCollectionGuid;
    const collections = await this.data.getAllCollections();
    const dailyCollection = collections.find((collection) => (
      collection.guid === this._dailyNoteCollectionGuid
      || collection.getName() === this._dailyNoteCollectionName
      || collection.getName() === 'Daily Note'
    ));
    this._dailyNoteCollectionGuid = dailyCollection?.guid || null;
    return this._dailyNoteCollectionGuid;
  }

  _dailyJournalRecordGuid(sourceDate, collectionGuid) {
    const date = this._dateOnly(sourceDate);
    const yyyymmdd = [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0'),
    ].join('');
    return `S-${collectionGuid}-P000000000-0-${yyyymmdd}`;
  }

  async _findPeriodCollection(periodMode) {
    const defaults = {
      weekly: 'Weekly Notes',
      monthly: 'Monthly Notes',
      yearly: 'Yearly Notes',
    };
    const collections = await this.data.getAllCollections();
    return collections.find((collection) => collection.getName() === defaults[periodMode]) || null;
  }

  async _findOrCreatePeriodRecordForMode(collection, periodMode, sourceDate) {
    const periodStart = this._normalizePeriodStartForMode(periodMode, sourceDate);
    const existing = await this._findRecordByPeriodStartForMode(collection, periodMode, periodStart);
    if (existing) return existing;

    const guid = collection.createRecord(this._periodTitleForMode(periodMode, periodStart));
    if (!guid) return null;

    const record = this.data.getRecord(guid);
    if (record) {
      this._setPeriodMetadataForMode(record, periodMode, periodStart);
      return record;
    }

    this._finalizeCreatedRecordForMode(guid, periodMode, periodStart);
    return { guid };
  }

  async _finalizeCreatedRecordForMode(guid, periodMode, periodStart) {
    const record = await this._waitForRecord(guid);
    if (record) {
      this._setPeriodMetadataForMode(record, periodMode, periodStart);
    }
  }

  _setPeriodMetadataForMode(record, periodMode, periodStart) {
    const periodProperty = record.prop('period_start') || record.prop('Period Start');
    if (periodProperty) {
      periodProperty.set(this._dateTimeValue(periodStart));
    }

    const keyProperty = record.prop('period_key') || record.prop('Period Key');
    if (keyProperty) {
      keyProperty.set(this._periodKeyForMode(periodMode, periodStart));
    }
  }

  async _findRecordByPeriodStartForMode(collection, periodMode, targetDate) {
    const targetKey = this._periodKeyForMode(periodMode, targetDate);
    const records = await collection.getAllRecords();

    for (const record of records) {
      const recordKey = this._recordPeriodKeyForMode(periodMode, record);
      if (recordKey === targetKey) {
        return record;
      }
    }

    return null;
  }

  _recordPeriodKeyForMode(periodMode, record) {
    if (!record) return null;

    if (typeof record.text === 'function') {
      const keyText = record.text('period_key') || record.text('Period Key');
      if (keyText) return keyText;
    }

    const derivedDate = this._recordPeriodStartFromTitleForMode(periodMode, record);
    return derivedDate ? this._periodKeyForMode(periodMode, derivedDate) : null;
  }

  _recordPeriodStartFromTitleForMode(periodMode, record) {
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
    return this._parsePeriodStartFromTitleForMode(periodMode, title);
  }

  _normalizePeriodStartForMode(periodMode, inputDate) {
    const date = this._dateOnly(inputDate);

    if (periodMode === 'weekly') return this._startOfIsoWeek(date);
    if (periodMode === 'monthly') return this._dateOnly(new Date(date.getFullYear(), date.getMonth(), 1));
    return this._dateOnly(new Date(date.getFullYear(), 0, 1));
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
    return String(normalized.getFullYear());
  }

  _periodTitleForMode(periodMode, date) {
    const normalized = this._normalizePeriodStartForMode(periodMode, date);
    if (periodMode === 'weekly') {
      const info = this._isoWeekInfo(normalized);
      return `${info.year} W${info.week}`;
    }
    if (periodMode === 'monthly') {
      return normalized.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    }
    return String(normalized.getFullYear());
  }

  _parsePeriodStartFromTitleForMode(periodMode, title) {
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

  _parsePopupDateInput(value) {
    const raw = (value || '').trim();
    if (!raw) return null;
    const normalized = raw.toLowerCase();
    const today = this._today();

    if (normalized === 'today') return today;
    if (normalized === 'tomorrow') return this._dateOnly(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1));
    if (normalized === 'yesterday') return this._dateOnly(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1));

    const dayMatch = normalized.match(/^(-?\d+)\s+days?$/);
    if (dayMatch) {
      return this._dateOnly(new Date(today.getFullYear(), today.getMonth(), today.getDate() + Number(dayMatch[1])));
    }

    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return null;
    return this._dateOnly(parsed);
  }

  _dateFromKey(value) {
    if (!value || typeof value !== 'string') return null;
    const [year, month, day] = value.split('-').map(Number);
    if (!year || !month || !day) return null;
    return this._dateOnly(new Date(year, month - 1, day));
  }

  _daysInMonth(year, monthIndex) {
    return new Date(year, monthIndex + 1, 0).getDate();
  }

  _yearPickerStart(year) {
    return (Math.floor((year - 1) / 30) * 30) + 1;
  }

  _popupDateLabel(date) {
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }

  async _openRelativePeriod({ ev, panel, record, direction }) {
    try {
      const baseDate = this._recordPeriodStart(record) || this._today();
      const targetDate = this._shiftPeriod(baseDate, direction);
      await this._openPeriodRecord({ ev, panel, sourceDate: targetDate });
    } catch (error) {
      this._toast('Thymer Cadence', error?.message || `Unable to open ${this._periodWord()} note.`);
    }
  }

  async _openCurrentPeriod({ ev, panel }) {
    try {
      await this._openPeriodRecord({ ev, panel, sourceDate: this._today() });
    } catch (error) {
      this._toast('Thymer Cadence', error?.message || `Unable to open ${this._periodWord()} note.`);
    }
  }

  async _openPeriodRecord({ ev, panel, sourceDate }) {
    const record = await this._findOrCreatePeriodRecord(sourceDate);
    if (!record) {
      this._toast('Thymer Cadence', `Unable to open ${this._periodWord()} note.`);
      return;
    }

    const targetPanel = await this._getTargetPanel(panel, ev);
    if (targetPanel && this._navigateToRecord(targetPanel, record.guid)) {
      return;
    }

    this._navigateToUrl(record.guid, ev);
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
      this._setPeriodMetadata(record, periodStart);
      return record;
    }

    this._finalizeCreatedRecord(guid, periodStart);
    return { guid };
  }

  async _finalizeCreatedRecord(guid, periodStart) {
    const record = await this._waitForRecord(guid);
    if (record) {
      this._setPeriodMetadata(record, periodStart);
    }
  }

  _setPeriodMetadata(record, periodStart) {
    const periodProperty = record.prop('period_start') || record.prop('Period Start');
    if (periodProperty) {
      periodProperty.set(this._dateTimeValue(periodStart));
    }

    const keyProperty = record.prop('period_key') || record.prop('Period Key');
    if (keyProperty) {
      keyProperty.set(this._periodKey(periodStart));
    }
  }

  async _findRecordByPeriodStart(collection, targetDate) {
    const targetKey = this._periodKey(targetDate);
    const records = await collection.getAllRecords();

    for (const record of records) {
      const recordKey = this._recordPeriodKey(record);
      if (recordKey === targetKey) {
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
    this._setPeriodMetadata(activeRecord, parsed);
  }

  _refreshCurrentButton() {
    if (!this._currentButton) return;
    const label = this._currentPeriodLabel();
    const tooltip = this._buttonTooltip('current');
    if (this._currentButtonLabel === label && this._currentButtonTooltip === tooltip) return;
    this._currentButtonLabel = label;
    this._currentButtonTooltip = tooltip;
    this._currentButton.setLabel(label);
    this._currentButton.setTooltip(tooltip);
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

  _recordPeriodKey(record) {
    if (!record) return null;

    if (typeof record.text === 'function') {
      const keyText = record.text('period_key') || record.text('Period Key');
      if (keyText) return keyText;
    }

    const derivedDate = this._recordPeriodStart(record);
    return derivedDate ? this._periodKey(derivedDate) : null;
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

    if (!periodStart && typeof record.getName === 'function') {
      periodStart = this._parsePeriodStartFromTitle(record.getName());
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

  _periodKey(date) {
    const normalized = this._normalizePeriodStart(date);
    if (this._periodMode === 'weekly') {
      const info = this._isoWeekInfo(normalized);
      return `${info.year}-${String(info.week).padStart(2, '0')}`;
    }
    if (this._periodMode === 'monthly') {
      return `${normalized.getFullYear()}-${String(normalized.getMonth() + 1).padStart(2, '0')}`;
    }
    return String(normalized.getFullYear());
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

  _currentDailyDate() {
    return this._dateOnly(new Date());
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
