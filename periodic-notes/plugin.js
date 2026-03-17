class Plugin extends CollectionPlugin {
  onLoad() {
    this._version = '0.4.6';
    this._periodMode = this.getConfiguration()?.custom?.periodMode || 'weekly';
    this._cadenceConfig = this._getCadenceConfig();
    this._periodSettings = this._getPeriodSettings(this._periodMode);
    if (!this._periodSettings.enabled) return;

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
    this._boundObservePanelDom = () => this._observeActivePanelDom();

    this.events.on('panel.navigated', () => {
      this._closeCalendarPopup();
      this._refreshCurrentButton();
      this._syncActiveRecordPeriodStart();
      this._observeActivePanelDom();
      this._scheduleRelatedTasksRefresh();
      this._scheduleRelatedTasksRefresh(250);
    });
    this.events.on('panel.focused', () => {
      this._closeCalendarPopup();
      this._refreshCurrentButton();
      this._syncActiveRecordPeriodStart();
      this._observeActivePanelDom();
      this._scheduleRelatedTasksRefresh();
      this._scheduleRelatedTasksRefresh(250);
    });
    this._syncActiveRecordPeriodStart();
    this._observeActivePanelDom();
    this._scheduleRelatedTasksRefresh();
    this._scheduleRelatedTasksRefresh(800);
  }

  onUnload() {
    this._closeCalendarPopup();
    this._removeRelatedTasksBlock();
    if (this._relatedTasksRefreshTimer) clearTimeout(this._relatedTasksRefreshTimer);
    if (this._panelDomObserver) this._panelDomObserver.disconnect();
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

  _scheduleRelatedTasksRefresh() {
    const delay = typeof arguments[0] === 'number' ? arguments[0] : 0;
    if (this._relatedTasksRefreshTimer) clearTimeout(this._relatedTasksRefreshTimer);
    this._relatedTasksRefreshTimer = setTimeout(() => {
      this._relatedTasksRefreshTimer = null;
      void this._renderRelatedTasksBlock();
    }, delay);
  }

  _observeActivePanelDom() {
    if (typeof MutationObserver !== 'function') return;
    const panel = this._getRelevantPeriodPanel();
    const host = panel && typeof panel.getElement === 'function' ? panel.getElement() : null;
    if (!panel || !host) return;

    const panelId = typeof panel.getId === 'function' ? panel.getId() : null;
    if (this._panelDomObserver && this._observedPanelId === panelId) return;

    if (this._panelDomObserver) {
      this._panelDomObserver.disconnect();
    }

    this._observedPanelId = panelId;
    this._panelDomObserver = new MutationObserver(() => {
      this._scheduleRelatedTasksRefresh(120);
    });
    this._panelDomObserver.observe(host, { childList: true, subtree: true });
  }

  async _renderRelatedTasksBlock() {
    const panel = this._getRelevantPeriodPanel();
    const host = panel && typeof panel.getElement === 'function' ? panel.getElement() : null;
    const record = panel && typeof panel.getActiveRecord === 'function' ? panel.getActiveRecord() : null;
    if (!panel || !host || !record) {
      this._removeRelatedTasksBlock(host);
      return;
    }

    const periodStart = this._recordPeriodStart(record);
    if (!periodStart) {
      this._removeRelatedTasksBlock(host);
      return;
    }

    const anchor = this._findRelatedTasksAnchor(host);
    if (!anchor) {
      this._removeRelatedTasksBlock(host);
      return;
    }

    const tasks = await this._searchRelatedTasks(periodStart);
    if (!tasks.length) {
      this._removeRelatedTasksBlock(host);
      return;
    }

    const block = this._ensureRelatedTasksBlock(anchor, host);
    block.innerHTML = '';

    const title = document.createElement('div');
    title.className = 'cadence-related-title';
    title.textContent = 'Upcoming';
    block.appendChild(title);

    const list = document.createElement('div');
    list.className = 'cadence-related-list';
    block.appendChild(list);

    for (const task of tasks) {
      list.appendChild(this._createRelatedTaskRow(task, panel));
    }
  }

  _findRelatedTasksAnchor(host) {
    const preferredSelectors = [
      '.id--h1-area .title.id--h1',
      'h1.title.id--h1',
      '.title.id--h1',
    ];
    for (const selector of preferredSelectors) {
      const anchor = (host && host.querySelector(selector)) || document.querySelector(selector);
      if (anchor) return anchor;
    }

    const selectors = [
      '.version-title h1',
      'h1',
    ];
    for (const selector of selectors) {
      const anchor = this._pickVisibleElement(host ? host.querySelectorAll(selector) : []);
      if (anchor) return anchor;
    }

    for (const selector of selectors) {
      const anchor = this._pickVisibleElement(document.querySelectorAll(selector));
      if (anchor) return anchor;
    }

    return null;
  }

  _pickVisibleElement(elements) {
    const candidates = Array.from(elements || []).filter((element) => this._isVisibleElement(element));
    if (!candidates.length) return null;
    candidates.sort((a, b) => this._visibleElementScore(b) - this._visibleElementScore(a));
    return candidates[0];
  }

  _isVisibleElement(element) {
    if (!element || !element.isConnected || typeof window === 'undefined') return false;
    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  _visibleElementScore(element) {
    const rect = element.getBoundingClientRect();
    return (rect.width * rect.height) - Math.max(rect.top, 0);
  }

  _getRelevantPeriodPanel() {
    const active = this.ui.getActivePanel();
    if (this._panelMatchesThisCollection(active)) return active;

    const panels = typeof this.ui.getPanels === 'function' ? this.ui.getPanels() : [];
    return panels.find((panel) => this._panelMatchesThisCollection(panel)) || active;
  }

  _panelMatchesThisCollection(panel) {
    if (!panel) return false;

    const record = typeof panel.getActiveRecord === 'function' ? panel.getActiveRecord() : null;
    if (record) {
      const collection = typeof record.getCollection === 'function' ? record.getCollection() : null;
      if (collection && typeof collection.getGuid === 'function' && collection.getGuid() === this.guid) {
        return true;
      }
    }

    const navigation = typeof panel.getNavigation === 'function' ? panel.getNavigation() : null;
    const rootId = navigation && typeof navigation.rootId === 'string' ? navigation.rootId : null;
    if (!rootId) return false;

    const navRecord = this.data.getRecord(rootId);
    const navCollection = navRecord && typeof navRecord.getCollection === 'function' ? navRecord.getCollection() : null;
    return !!(navCollection && typeof navCollection.getGuid === 'function' && navCollection.getGuid() === this.guid);
  }

  _ensureRelatedTasksBlock(anchor, host) {
    const container = anchor && anchor.parentElement ? anchor.parentElement : host;
    this._lastRelatedTasksContainer = container || this._lastRelatedTasksContainer || null;
    this._cleanupRelatedTasksBlocks(container, this._relatedTasksBlockElement);
    if (!this._relatedTasksBlockElement || !this._relatedTasksBlockElement.isConnected) {
      this._relatedTasksBlockElement = document.createElement('section');
      this._relatedTasksBlockElement.className = 'cadence-related-block';
      this._relatedTasksBlockElement.dataset.cadenceRelatedBlock = 'true';
    }
    if (anchor.nextElementSibling !== this._relatedTasksBlockElement) {
      anchor.insertAdjacentElement('afterend', this._relatedTasksBlockElement);
    }
    return this._relatedTasksBlockElement;
  }

  _removeRelatedTasksBlock(host) {
    const container = host || this._lastRelatedTasksContainer || (this._relatedTasksBlockElement && this._relatedTasksBlockElement.parentElement) || null;
    this._cleanupRelatedTasksBlocks(container, this._relatedTasksBlockElement);
    if (this._relatedTasksBlockElement && this._relatedTasksBlockElement.isConnected) {
      this._relatedTasksBlockElement.remove();
    }
    this._relatedTasksBlockElement = null;
  }

  _cleanupRelatedTasksBlocks(host, keep) {
    if (!host || typeof host.querySelectorAll !== 'function') return;
    for (const block of host.querySelectorAll('.cadence-related-block')) {
      if (keep && block === keep) continue;
      block.remove();
    }
  }

  async _searchRelatedTasks(periodStart) {
    const nextBoundary = this._nextPeriodBoundary(periodStart);
    const query = `@due AND @due < "${this._dateKey(nextBoundary)}"`;
    const results = await this.data.searchByQuery(query, 200);
    if (results.error) {
      this._toast('Thymer Cadence', results.error);
      return [];
    }

    const seen = new Set();
    return results.lines
      .filter((line) => line && line.type === 'task')
      .filter((line) => {
        if (seen.has(line.guid)) return false;
        seen.add(line.guid);
        return true;
      })
      .map((line) => ({
        line,
        dueDate: this._extractLineDueDate(line),
        text: this._plainTaskText(line),
      }))
      .sort((a, b) => {
        const aTime = a.dueDate ? a.dueDate.getTime() : Number.MAX_SAFE_INTEGER;
        const bTime = b.dueDate ? b.dueDate.getTime() : Number.MAX_SAFE_INTEGER;
        if (aTime !== bTime) return aTime - bTime;
        return a.text.localeCompare(b.text);
      })
      .slice(0, 24);
  }

  _nextPeriodBoundary(periodStart) {
    const base = this._normalizePeriodStart(periodStart);
    if (this._periodMode === 'weekly') {
      return this._dateOnly(new Date(base.getFullYear(), base.getMonth(), base.getDate() + 7));
    }
    if (this._periodMode === 'monthly') {
      return this._dateOnly(new Date(base.getFullYear(), base.getMonth() + 1, 1));
    }
    if (this._periodMode === 'quarterly') {
      return this._dateOnly(new Date(base.getFullYear(), base.getMonth() + 3, 1));
    }
    return this._dateOnly(new Date(base.getFullYear() + 1, 0, 1));
  }

  _createRelatedTaskRow(task, panel) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'cadence-related-item';
    row.setAttribute('aria-label', task.text || 'Open related task');

    const checkbox = document.createElement('span');
    checkbox.className = 'cadence-related-checkbox ti ti-square';
    checkbox.setAttribute('aria-hidden', 'true');
    row.appendChild(checkbox);

    const textWrap = document.createElement('span');
    textWrap.className = 'cadence-related-text';
    textWrap.textContent = task.text || 'Untitled task';
    row.appendChild(textWrap);

    const meta = document.createElement('span');
    meta.className = 'cadence-related-meta';
    if (task.dueDate) {
      const due = document.createElement('span');
      due.className = 'cadence-related-date';
      due.textContent = this._formatRelatedDueDate(task.dueDate);
      meta.appendChild(due);
    }
    const arrow = document.createElement('span');
    arrow.className = 'cadence-related-arrow ti ti-arrow-up-right';
    arrow.setAttribute('aria-hidden', 'true');
    meta.appendChild(arrow);
    row.appendChild(meta);

    row.addEventListener('click', (ev) => {
      void this._openRelatedTask(ev, task.line, panel);
    });
    return row;
  }

  async _openRelatedTask(ev, line, panel) {
    ev.preventDefault();
    ev.stopPropagation();
    const targetPanel = await this._getTargetPanel(panel, ev);
    if (targetPanel && typeof targetPanel.navigateTo === 'function') {
      try {
        const ok = await targetPanel.navigateTo({ itemGuid: line.guid, highlight: true });
        if (ok) {
          if (typeof this.ui.setActivePanel === 'function') {
            this.ui.setActivePanel(targetPanel);
          }
          return;
        }
      } catch (error) {
        // ignore and fall through
      }
    }

    const record = line.getRecord ? line.getRecord() : null;
    if (record && targetPanel && this._navigateToRecord(targetPanel, record.guid)) {
      return;
    }
    if (record) {
      this._navigateToUrl(record.guid, ev);
    }
  }

  _extractLineDueDate(line) {
    const segments = Array.isArray(line.segments) ? [...line.segments].reverse() : [];
    for (const segment of segments) {
      const parsed = this._dateFromSegmentValue(segment?.type === 'datetime' ? segment.text : null);
      if (parsed) return parsed;
    }

    const rawValues = line.props && typeof line.props === 'object' ? Object.values(line.props) : [];
    for (const value of rawValues) {
      const parsed = this._dateFromSegmentValue(value);
      if (parsed) return parsed;
    }
    return null;
  }

  _dateFromSegmentValue(value) {
    if (!value || typeof value !== 'object' || typeof value.d !== 'string' || value.d.length !== 8) return null;
    const year = Number(value.d.slice(0, 4));
    const month = Number(value.d.slice(4, 6));
    const day = Number(value.d.slice(6, 8));
    if (!year || !month || !day) return null;
    return this._dateOnly(new Date(year, month - 1, day));
  }

  _plainTaskText(line) {
    const parts = [];
    for (const segment of Array.isArray(line.segments) ? line.segments : []) {
      if (!segment || segment.type === 'datetime') continue;
      const value = segment.text;
      if (segment.type === 'mention' && typeof value === 'string') {
        parts.push(`@${this._userLabel(value)}`);
        continue;
      }
      if (segment.type === 'ref' && value && typeof value === 'object') {
        const title = typeof value.title === 'string' ? value.title : '';
        parts.push(title || '[Link]');
        continue;
      }
      if (segment.type === 'linkobj' && value && typeof value === 'object') {
        parts.push(String(value.title || value.link || ''));
        continue;
      }
      if (typeof value === 'string') {
        parts.push(value);
      }
    }

    return parts.join('').replace(/\s+/g, ' ').trim();
  }

  _userLabel(guid) {
    const user = (this.data.getActiveUsers?.() || []).find((candidate) => candidate && candidate.guid === guid);
    return user?.getName?.() || guid;
  }

  _formatRelatedDueDate(date) {
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    }).replace(',', '');
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
    const quarterLabel = this._periodButtonLabelForMode('quarterly', state.selectedDate);
    const yearLabel = String(state.displayedMonth.getFullYear());
    const bodyHtml = state.view === 'years'
      ? this._renderCalendarYearPicker(state)
      : this._renderCalendarMonthView(state);

    this._calendarPopupElement.innerHTML = `
      <div class="cadence-period-picker-body">
        <div class="cadence-period-picker-header">
          <div class="cadence-period-picker-links">
            <button type="button" class="cadence-period-picker-link cadence-period-picker-month">${monthLabel}</button>
            <button type="button" class="cadence-period-picker-link cadence-period-picker-quarter">${quarterLabel}</button>
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

    this._syncPopupPeriodLink(this._calendarPopupElement.querySelector('.cadence-period-picker-month'), 'monthly', state.selectedDate, state.panel);
    this._syncPopupPeriodLink(this._calendarPopupElement.querySelector('.cadence-period-picker-quarter'), 'quarterly', state.selectedDate, state.panel);
    this._syncPopupPeriodLink(this._calendarPopupElement.querySelector('.cadence-period-picker-year'), 'yearly', state.selectedDate, state.panel);
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
      const weeklyEnabled = this._isPeriodEnabled('weekly');
      button.disabled = !weeklyEnabled;
      button.classList.toggle('is-disabled', !weeklyEnabled);
      if (!weeklyEnabled) return;
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
      const dailyEnabled = !!this._getDailyNoteCollectionConfig().collectionGuid || !!this._getDailyNoteCollectionConfig().collectionName;
      button.disabled = !dailyEnabled;
      button.classList.toggle('is-disabled', !dailyEnabled);
      if (!dailyEnabled) return;
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
      if (!this._hasDailyNoteTarget()) return;
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
      if (!this._hasDailyNoteTarget()) {
        this._toast('Thymer Cadence', 'Daily Notes are not configured.');
        return;
      }
      await this._openDailyNote({ ev, panel, sourceDate });
      return;
    }

    if (!this._isPeriodEnabled(targetMode)) {
      this._toast('Thymer Cadence', `${this._periodLabel(targetMode)} notes are not enabled.`);
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
    const dailyCollection = await this._getDailyNoteCollectionApi();
    const user = this.data.getActiveUsers()?.[0] || null;
    if (!dailyCollection || !user) {
      this._toast('Thymer Cadence', 'Daily Notes collection not found.');
      return;
    }

    const targetDate = DateTime.dateOnly(sourceDate.getFullYear(), sourceDate.getMonth(), sourceDate.getDate());
    const targetPanel = await this._getTargetPanel(panel, ev);
    if (targetPanel && typeof targetPanel.navigateToJournal === 'function') {
      const navigated = targetPanel.navigateToJournal(user, targetDate);
      if (navigated) {
        if (typeof this.ui.setActivePanel === 'function') {
          this.ui.setActivePanel(targetPanel);
        }
        return;
      }
    }

    const journalRecord = await dailyCollection.getJournalRecord(user, targetDate);
    if (!journalRecord) {
      this._toast('Thymer Cadence', 'Could not open that daily note.');
      return;
    }

    if (targetPanel && this._navigateToRecord(targetPanel, journalRecord.guid)) {
      return;
    }

    this._navigateToUrl(journalRecord.guid, ev);
  }

  async _findDailyNoteCollectionGuid() {
    const settings = this._getDailyNoteCollectionConfig();
    const collections = await this.data.getAllCollections();

    const byGuid = settings.collectionGuid
      ? collections.find((collection) => collection.guid === settings.collectionGuid)
      : null;
    if (byGuid) return byGuid.guid;

    const byName = settings.collectionName
      ? collections.find((collection) => collection.getName() === settings.collectionName)
      : null;
    if (byName) return byName.guid;

    const journal = collections.find((collection) => collection.isJournalPlugin && collection.isJournalPlugin());
    return journal?.guid || null;
  }

  async _getDailyNoteCollectionApi() {
    const dailyGuid = await this._findDailyNoteCollectionGuid();
    if (!dailyGuid) return null;

    const collection = this.data.getPluginByGuid(dailyGuid);
    if (!collection || typeof collection.isJournalPlugin !== 'function' || !collection.isJournalPlugin()) {
      return null;
    }
    return collection;
  }

  async _findPeriodCollection(periodMode) {
    const settings = this._getPeriodSettings(periodMode);
    if (!settings.enabled) return null;

    if (periodMode === this._periodMode) {
      const currentCollection = await this._getCollectionApi();
      if (currentCollection) return currentCollection;
    }

    const collections = await this.data.getAllCollections();
    if (settings.collectionGuid) {
      const byGuid = collections.find((collection) => collection.guid === settings.collectionGuid);
      if (byGuid) return byGuid;
    }

    if (settings.collectionName) {
      const byName = collections.find((collection) => collection.getName() === settings.collectionName);
      if (byName) return byName;
    }

    return null;
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
    const settings = this._getPeriodSettings(periodMode);
    const periodProperty = this._resolveProperty(record, [
      settings.periodStartFieldId,
      'period_start',
      'Period Start',
    ]);
    if (periodProperty) {
      periodProperty.set(this._dateTimeValue(periodStart));
    }

    const canonicalKeyProperty = this._resolveProperty(record, ['period_key', 'Period Key']);
    if (canonicalKeyProperty) {
      canonicalKeyProperty.set(this._periodKeyForMode(periodMode, periodStart));
    }

    const orderProperty = this._resolveProperty(record, [
      settings.orderFieldId,
      'period_key',
      'Period Key',
    ]);
    if (orderProperty) {
      if (settings.orderFieldKind === 'period_start') {
        orderProperty.set(this._dateTimeValue(periodStart));
      } else {
        orderProperty.set(this._periodKeyForMode(periodMode, periodStart));
      }
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

    const settings = this._getPeriodSettings(periodMode);

    if (settings.orderFieldKind === 'period_start') {
      const orderDate = this._recordDateValue(record, [
        settings.orderFieldId,
        settings.periodStartFieldId,
        'period_start',
        'Period Start',
      ]);
      if (orderDate) return this._periodKeyForMode(periodMode, orderDate);
    }

    const keyText = this._recordTextValue(record, [
      settings.orderFieldId,
      'period_key',
      'Period Key',
    ]);
    if (keyText) return keyText;

    const derivedDate = this._recordPeriodStartFromTitleForMode(periodMode, record);
    return derivedDate ? this._periodKeyForMode(periodMode, derivedDate) : null;
  }

  _recordPeriodStartFromTitleForMode(periodMode, record) {
    if (!record) return null;

    const settings = this._getPeriodSettings(periodMode);
    let periodStart = this._recordDateValue(record, [
      settings.periodStartFieldId,
      settings.orderFieldKind === 'period_start' ? settings.orderFieldId : null,
      'period_start',
      'Period Start',
    ]);
    if (periodStart) return this._dateOnly(periodStart);

    const title = typeof record.getName === 'function' ? record.getName() : null;
    return this._parsePeriodStartFromTitleForMode(periodMode, title);
  }

  _normalizePeriodStartForMode(periodMode, inputDate) {
    const date = this._dateOnly(inputDate);

    if (periodMode === 'weekly') return this._startOfIsoWeek(date);
    if (periodMode === 'monthly') return this._dateOnly(new Date(date.getFullYear(), date.getMonth(), 1));
    if (periodMode === 'quarterly') return this._quarterStartForDate(date);
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
    if (periodMode === 'quarterly') {
      return `${normalized.getFullYear()}-Q${this._quarterOfDate(normalized)}`;
    }
    return String(normalized.getFullYear());
  }

  _periodTitleForMode(periodMode, date) {
    const settings = this._getPeriodSettings(periodMode);
    return this._formatPeriodTitle(periodMode, date, settings.titleFormat);
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

    if (periodMode === 'quarterly') {
      const match = title.match(/^(?:Q([1-4])\s+(\d{4})|(\d{4})[-\s]Q([1-4]))$/i);
      if (!match) return null;
      const year = Number(match[2] || match[3]);
      const quarter = Number(match[1] || match[4]);
      return this._quarterStartForYearQuarter(year, quarter);
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
    const settings = this._getPeriodSettings(this._periodMode);
    const periodProperty = this._resolveProperty(record, [
      settings.periodStartFieldId,
      'period_start',
      'Period Start',
    ]);
    if (periodProperty) {
      periodProperty.set(this._dateTimeValue(periodStart));
    }

    const canonicalKeyProperty = this._resolveProperty(record, ['period_key', 'Period Key']);
    if (canonicalKeyProperty) {
      canonicalKeyProperty.set(this._periodKey(periodStart));
    }

    const orderProperty = this._resolveProperty(record, [
      settings.orderFieldId,
      'period_key',
      'Period Key',
    ]);
    if (orderProperty) {
      if (settings.orderFieldKind === 'period_start') {
        orderProperty.set(this._dateTimeValue(periodStart));
      } else {
        orderProperty.set(this._periodKey(periodStart));
      }
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

    const settings = this._getPeriodSettings(this._periodMode);

    if (settings.orderFieldKind === 'period_start') {
      const orderDate = this._recordDateValue(record, [
        settings.orderFieldId,
        settings.periodStartFieldId,
        'period_start',
        'Period Start',
      ]);
      if (orderDate) return this._periodKey(orderDate);
    }

    const keyText = this._recordTextValue(record, [
      settings.orderFieldId,
      'period_key',
      'Period Key',
    ]);
    if (keyText) return keyText;

    const derivedDate = this._recordPeriodStart(record);
    return derivedDate ? this._periodKey(derivedDate) : null;
  }

  _recordPeriodStart(record) {
    if (!record) return null;
    const settings = this._getPeriodSettings(this._periodMode);
    let periodStart = this._recordDateValue(record, [
      settings.periodStartFieldId,
      settings.orderFieldKind === 'period_start' ? settings.orderFieldId : null,
      'period_start',
      'Period Start',
    ]);

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

  _quarterOfDate(date) {
    return Math.floor(date.getMonth() / 3) + 1;
  }

  _quarterStartForDate(date) {
    return this._dateOnly(new Date(date.getFullYear(), (this._quarterOfDate(date) - 1) * 3, 1));
  }

  _quarterStartForYearQuarter(year, quarter) {
    return this._dateOnly(new Date(year, (quarter - 1) * 3, 1));
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

    if (this._periodMode === 'quarterly') {
      return this._dateOnly(new Date(base.getFullYear(), base.getMonth() + (direction * 3), 1));
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
    if (this._periodMode === 'quarterly') return 'quarter';
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

    if (this._periodMode === 'quarterly') {
      return `Q${this._quarterOfDate(date)}`;
    }

    return String(date.getFullYear());
  }

  _periodTitle(date) {
    return this._formatPeriodTitle(this._periodMode, date, this._periodSettings.titleFormat);
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
    if (this._periodMode === 'quarterly') {
      return `${normalized.getFullYear()}-Q${this._quarterOfDate(normalized)}`;
    }
    return String(normalized.getFullYear());
  }

  _normalizePeriodStart(inputDate) {
    const date = this._dateOnly(inputDate);

    if (this._periodMode === 'weekly') return this._startOfIsoWeek(date);
    if (this._periodMode === 'monthly') return this._dateOnly(new Date(date.getFullYear(), date.getMonth(), 1));
    if (this._periodMode === 'quarterly') return this._quarterStartForDate(date);
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

  _getCadenceConfig() {
    const custom = this.getConfiguration()?.custom || {};
    const cadence = custom.cadence && typeof custom.cadence === 'object' ? custom.cadence : {};
    const periods = {};

    for (const periodMode of ['weekly', 'monthly', 'quarterly', 'yearly']) {
      const source = cadence.periods?.[periodMode] || {};
      const collectionGuid = source.collectionGuid || custom[`${periodMode}CollectionGuid`] || '';
      const collectionName = source.collectionName || custom[`${periodMode}CollectionName`] || this._defaultCollectionName(periodMode);
      const enabled = typeof source.enabled === 'boolean'
        ? source.enabled
        : (periodMode === this._periodMode ? true : !!collectionGuid);
      const periodStartFieldId = source.periodStartFieldId || 'period_start';
      const orderFieldId = source.orderFieldId || 'period_key';
      const orderFieldKind = source.orderFieldKind || (orderFieldId === periodStartFieldId ? 'period_start' : 'period_key');

      periods[periodMode] = {
        enabled,
        collectionGuid,
        collectionName,
        titleFormat: source.titleFormat || this._defaultTitleFormat(periodMode),
        periodStartFieldId,
        orderFieldId,
        orderFieldKind,
      };
    }

    return {
      schemaVersion: cadence.schemaVersion || 1,
      daily: {
        collectionGuid: cadence.daily?.collectionGuid || custom.dailyNoteCollectionGuid || '',
        collectionName: cadence.daily?.collectionName || custom.dailyNoteCollectionName || 'Daily Notes',
      },
      periods,
    };
  }

  _getDailyNoteCollectionConfig() {
    return this._cadenceConfig?.daily || { collectionGuid: '', collectionName: 'Daily Notes' };
  }

  _getPeriodSettings(periodMode) {
    return this._cadenceConfig?.periods?.[periodMode] || {
      enabled: false,
      collectionGuid: '',
      collectionName: this._defaultCollectionName(periodMode),
      titleFormat: this._defaultTitleFormat(periodMode),
      periodStartFieldId: 'period_start',
      orderFieldId: 'period_key',
      orderFieldKind: 'period_key',
    };
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

  _isPeriodEnabled(periodMode) {
    return !!this._getPeriodSettings(periodMode).enabled;
  }

  _hasDailyNoteTarget() {
    const daily = this._getDailyNoteCollectionConfig();
    return !!(daily.collectionGuid || daily.collectionName);
  }

  _periodLabel(periodMode) {
    if (periodMode === 'weekly') return 'Weekly';
    if (periodMode === 'monthly') return 'Monthly';
    if (periodMode === 'quarterly') return 'Quarterly';
    return 'Yearly';
  }

  _periodButtonLabelForMode(periodMode, date) {
    if (periodMode === 'weekly') {
      return `W${this._isoWeekInfo(date).week}`;
    }
    if (periodMode === 'monthly') {
      return date.toLocaleDateString('en-US', { month: 'short' });
    }
    if (periodMode === 'quarterly') {
      return `Q${this._quarterOfDate(date)}`;
    }
    return String(date.getFullYear());
  }

  _syncPopupPeriodLink(button, periodMode, sourceDate, panel) {
    if (!button) return;

    const enabled = this._isPeriodEnabled(periodMode);
    button.disabled = !enabled;
    button.classList.toggle('is-disabled', !enabled);
    button.onclick = null;
    if (!enabled) return;

    button.onclick = (ev) => {
      this._closeCalendarPopup();
      void this._openCadenceTarget({
        ev,
        panel,
        targetMode: periodMode,
        sourceDate,
      });
    };
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
