const DAILY_RUNTIME_CODE = "class Plugin extends JournalCorePlugin {\n  onLoad() {\n    this._version = '0.3.0';\n    if (typeof super.onLoad === 'function') super.onLoad();\n\n    this._cadenceConfig = this._getCadenceConfig();\n\n    this._weeklyButton = this._createPeriodButton('weekly');\n    this._monthlyButton = this._createPeriodButton('monthly');\n    this._quarterlyButton = this._createPeriodButton('quarterly');\n    this._yearlyButton = this._createPeriodButton('yearly');\n\n    this.events.on('panel.navigated', () => this._refreshButtons());\n    this.events.on('panel.focused', () => this._refreshButtons());\n    this._refreshButtons();\n    this._installDatepickerEnhancements();\n  }\n\n  onUnload() {\n    if (this._datepickerObserver) this._datepickerObserver.disconnect();\n    if (this._datepickerPatchTimer) clearTimeout(this._datepickerPatchTimer);\n    if (this._weeklyButton) this._weeklyButton.remove();\n    if (this._monthlyButton) this._monthlyButton.remove();\n    if (this._quarterlyButton) this._quarterlyButton.remove();\n    if (this._yearlyButton) this._yearlyButton.remove();\n  }\n\n  _createPeriodButton(periodMode) {\n    const settings = this._getPeriodSettings(periodMode);\n    if (!settings.enabled) return null;\n\n    return this.addCollectionNavigationButton({\n      label: this._buttonPlaceholder(periodMode),\n      tooltip: `Open ${periodMode} note`,\n      onlyWhenExpanded: true,\n      onClick: ({ ev, panel, record }) => this._openPeriodNote({\n        ev,\n        panel,\n        periodMode,\n        sourceDate: this._sourceDateFromRecord(record),\n      }),\n    });\n  }\n\n  _installDatepickerEnhancements() {\n    if (typeof document === 'undefined' || !document.body || typeof MutationObserver !== 'function') return;\n    this._datepickerObserver = new MutationObserver(() => this._queueDatepickerPatch());\n    this._datepickerObserver.observe(document.body, { childList: true, subtree: true });\n    this._queueDatepickerPatch();\n  }\n\n  _queueDatepickerPatch() {\n    if (this._datepickerPatchTimer) return;\n    this._datepickerPatchTimer = setTimeout(() => {\n      this._datepickerPatchTimer = null;\n      this._patchOpenDatepickers();\n    }, 0);\n  }\n\n  _patchOpenDatepickers() {\n    if (typeof document === 'undefined') return;\n    const wrappers = document.querySelectorAll('.cmdpal--inline .autocomplete-date-widget .id--datepicker .datepicker-wrapper.datepicker-compact');\n    wrappers.forEach((wrapper) => this._patchDatepicker(wrapper));\n  }\n\n  _patchDatepicker(wrapper) {\n    const popup = wrapper.closest('.cmdpal--inline');\n    const inlineInput = popup?.querySelector('.cmdpal--inline-input[placeholder*=\"monday\"]');\n    const header = wrapper.querySelector('.datepicker-header');\n    const currentMonthTrigger = header?.querySelector('.current-month');\n    const navControls = currentMonthTrigger?.nextElementSibling;\n    const weekdays = wrapper.querySelector('.datepicker-weekdays');\n    const dayGrid = wrapper.querySelector('.datepicker-days');\n    if (!popup || !inlineInput || !header || !currentMonthTrigger || !navControls || !weekdays || !dayGrid) return;\n\n    const dayCells = [...dayGrid.querySelectorAll(':scope > .day')];\n    if (!dayCells.length || dayCells.length % 7 !== 0) return;\n\n    const firstCurrentDay = dayCells.find((cell) => cell.classList.contains('current-month'));\n    const displayedDate = this._dateFromPickerValue(firstCurrentDay?.dataset?.date || dayCells[0]?.dataset?.date || '');\n    if (!displayedDate) return;\n\n    popup.classList.add('cadence-datepicker-popup');\n    wrapper.classList.add('cadence-datepicker-enhanced');\n    currentMonthTrigger.classList.add('cadence-native-month-trigger');\n    navControls.classList.add('cadence-native-nav');\n\n    const todayButton = navControls.querySelector('.go-to-today');\n    if (todayButton) {\n      todayButton.classList.add('cadence-today-button');\n      this._bridgeNativeDatepickerClick(todayButton);\n    }\n    this._bridgeNativeDatepickerClick(currentMonthTrigger);\n\n    this._patchDatepickerHeaderLinks({ header, currentMonthTrigger, displayedDate });\n    this._patchDatepickerGrid({ weekdays, dayGrid, dayCells });\n    dayCells.forEach((cell) => this._bridgeNativeDatepickerClick(cell));\n    this._patchDatepickerShell({ popup, wrapper });\n  }\n\n  _patchDatepickerHeaderLinks({ header, currentMonthTrigger, displayedDate }) {\n    let links = header.querySelector('.cadence-datepicker-links');\n    if (!links) {\n      links = document.createElement('div');\n      links.className = 'cadence-datepicker-links';\n      links.innerHTML = [\n        '<button class=\"cadence-datepicker-link cadence-datepicker-month\" type=\"button\"></button>',\n        '<button class=\"cadence-datepicker-link cadence-datepicker-quarter\" type=\"button\"></button>',\n        '<button class=\"cadence-datepicker-link cadence-datepicker-year\" type=\"button\"></button>',\n      ].join('');\n      header.insertBefore(links, currentMonthTrigger);\n    }\n\n    const monthButton = links.querySelector('.cadence-datepicker-month');\n    const quarterButton = links.querySelector('.cadence-datepicker-quarter');\n    const yearButton = links.querySelector('.cadence-datepicker-year');\n    links.querySelector('.cadence-datepicker-dot')?.remove();\n    if (!monthButton || !quarterButton || !yearButton) return;\n\n    this._syncDatepickerPeriodLink(monthButton, 'monthly', displayedDate.toLocaleDateString('en-US', { month: 'long' }), displayedDate);\n    this._syncDatepickerPeriodLink(quarterButton, 'quarterly', this._periodButtonLabel('quarterly', displayedDate), displayedDate);\n    this._syncDatepickerPeriodLink(yearButton, 'yearly', String(displayedDate.getFullYear()), displayedDate);\n    currentMonthTrigger.title = 'Open month and year picker';\n  }\n\n  _patchDatepickerGrid({ weekdays, dayGrid, dayCells }) {\n    weekdays.querySelector('.cadence-datepicker-weeklabel')?.remove();\n    dayGrid.querySelectorAll('.cadence-datepicker-weeknum').forEach((node) => node.remove());\n\n    const weekLabel = document.createElement('div');\n    weekLabel.className = 'cadence-datepicker-weeklabel';\n    weekLabel.textContent = 'W';\n    weekdays.insertBefore(weekLabel, weekdays.firstChild);\n\n    const weekdayLabels = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];\n    [...weekdays.querySelectorAll('.weekday')].forEach((label, index) => {\n      label.textContent = weekdayLabels[index] || label.textContent;\n    });\n\n    dayCells.forEach((cell) => dayGrid.appendChild(cell));\n    const weeklyEnabled = this._getPeriodSettings('weekly').enabled;\n    for (let index = 0; index < dayCells.length; index += 7) {\n      const mondayCell = dayCells[index];\n      const mondayDate = this._dateFromPickerValue(mondayCell?.dataset?.date || '');\n      if (!mondayDate) continue;\n      const weekInfo = this._isoWeekInfo(mondayDate);\n\n      const weekButton = document.createElement('button');\n      weekButton.type = 'button';\n      weekButton.className = 'cadence-datepicker-weeknum';\n      weekButton.textContent = String(weekInfo.week);\n      weekButton.title = `Open weekly note for W${weekInfo.week} ${weekInfo.year}`;\n      weekButton.disabled = !weeklyEnabled;\n      weekButton.classList.toggle('is-disabled', !weeklyEnabled);\n      if (weeklyEnabled) {\n        this._bindDatepickerAction(weekButton, (ev) => this._handleDatepickerPeriodOpen(ev, 'weekly', mondayDate));\n      } else {\n        this._clearDatepickerAction(weekButton);\n      }\n      dayGrid.insertBefore(weekButton, mondayCell);\n    }\n  }\n\n  _syncDatepickerPeriodLink(button, periodMode, label, sourceDate) {\n    const settings = this._getPeriodSettings(periodMode);\n    button.textContent = label;\n    button.disabled = !settings.enabled;\n    button.classList.toggle('is-disabled', !settings.enabled);\n    if (settings.enabled) {\n      this._bindDatepickerAction(button, (ev) => this._handleDatepickerPeriodOpen(ev, periodMode, sourceDate));\n      return;\n    }\n\n    this._clearDatepickerAction(button);\n  }\n\n  _patchDatepickerShell({ popup, wrapper }) {\n    const inputContainer = popup.querySelector('.cmdpal--inline-input-container');\n    const inputRow = inputContainer?.firstElementChild;\n    const input = popup.querySelector('.cmdpal--inline-input');\n    const autocomplete = popup.querySelector('.autocomplete.clickable');\n    const scrollNode = popup.querySelector('.vscroll-node');\n    const vcontent = popup.querySelector('.vcontent');\n    const scrollbar = popup.querySelector('.vscrollbar.scrollbar');\n    if (!inputContainer || !inputRow || !input || !autocomplete || !scrollNode || !vcontent) return;\n\n    const desiredWidth = Math.max(Math.ceil(wrapper.scrollWidth), 256);\n    popup.style.width = `${desiredWidth + 2}px`;\n    inputContainer.style.width = `${desiredWidth}px`;\n    inputRow.style.width = `${desiredWidth}px`;\n    input.style.width = `${Math.max(desiredWidth - 16, 120)}px`;\n    autocomplete.style.width = `${desiredWidth}px`;\n    autocomplete.style.overflow = 'visible';\n    autocomplete.style.maxHeight = 'none';\n    scrollNode.style.width = `${desiredWidth}px`;\n    scrollNode.style.overflow = 'visible';\n    scrollNode.style.height = 'auto';\n    scrollNode.style.maxHeight = 'none';\n    vcontent.style.width = `${desiredWidth}px`;\n    vcontent.style.overflow = 'visible';\n    if (scrollbar) scrollbar.style.display = 'none';\n  }\n\n  _bridgeNativeDatepickerClick(element) {\n    if (!element || element.dataset.cadenceNativeBridge === '1') return;\n\n    const onPointerDown = (ev) => {\n      if (typeof ev.button === 'number' && ev.button !== 0) return;\n      ev.preventDefault();\n      ev.stopPropagation();\n      element.__cadenceSuppressNativeClick = true;\n      element.__cadenceBridgeInvoking = true;\n      element.click();\n      element.__cadenceBridgeInvoking = false;\n    };\n\n    const onClick = (ev) => {\n      if (element.__cadenceBridgeInvoking) return;\n      if (!element.__cadenceSuppressNativeClick) return;\n      element.__cadenceSuppressNativeClick = false;\n      ev.preventDefault();\n      ev.stopPropagation();\n    };\n\n    element.addEventListener('pointerdown', onPointerDown, true);\n    element.addEventListener('click', onClick, true);\n    element.dataset.cadenceNativeBridge = '1';\n  }\n\n  _bindDatepickerAction(element, onActivate) {\n    let activatedFromPointer = false;\n    const consume = (ev) => {\n      ev.preventDefault();\n      ev.stopPropagation();\n    };\n    element.onpointerdown = (ev) => {\n      activatedFromPointer = true;\n      consume(ev);\n      onActivate(ev);\n    };\n    element.onpointerup = consume;\n    element.onmousedown = consume;\n    element.onclick = (ev) => {\n      consume(ev);\n      if (activatedFromPointer) {\n        activatedFromPointer = false;\n        return;\n      }\n      onActivate(ev);\n    };\n    element.onkeydown = (ev) => {\n      if (ev.key !== 'Enter' && ev.key !== ' ') return;\n      activatedFromPointer = false;\n      consume(ev);\n      onActivate(ev);\n    };\n    element.onblur = () => {\n      activatedFromPointer = false;\n    };\n  }\n\n  _clearDatepickerAction(element) {\n    element.onpointerdown = null;\n    element.onpointerup = null;\n    element.onmousedown = null;\n    element.onclick = null;\n    element.onkeydown = null;\n    element.onblur = null;\n  }\n\n  _handleDatepickerPeriodOpen(ev, periodMode, sourceDate) {\n    if (!this._getPeriodSettings(periodMode).enabled) return;\n    ev.preventDefault();\n    ev.stopPropagation();\n    void this._openPeriodNote({\n      ev,\n      panel: this.ui.getActivePanel(),\n      periodMode,\n      sourceDate,\n    });\n  }\n\n  _dateFromPickerValue(value) {\n    if (!value || typeof value !== 'string') return null;\n    const [year, month, day] = value.split('-').map(Number);\n    if (!year || !month || !day) return null;\n    return this._dateOnly(new Date(year, month - 1, day));\n  }\n\n  _refreshButtons() {\n    const activePanel = this.ui.getActivePanel();\n    const activeRecord = activePanel && typeof activePanel.getActiveRecord === 'function'\n      ? activePanel.getActiveRecord()\n      : null;\n    const sourceDate = this._sourceDateFromRecord(activeRecord);\n\n    this._refreshButton(this._weeklyButton, 'weekly', sourceDate);\n    this._refreshButton(this._monthlyButton, 'monthly', sourceDate);\n    this._refreshButton(this._quarterlyButton, 'quarterly', sourceDate);\n    this._refreshButton(this._yearlyButton, 'yearly', sourceDate);\n  }\n\n  _refreshButton(button, periodMode, sourceDate) {\n    if (!button) return;\n    const periodStart = this._normalizePeriodStart(periodMode, sourceDate);\n    button.setLabel(this._periodButtonLabel(periodMode, periodStart));\n    button.setTooltip(`Open ${periodMode} note for ${this._periodTooltipLabel(periodMode, periodStart)}`);\n  }\n\n  async _openPeriodNote({ ev, panel, periodMode, sourceDate }) {\n    if (!this._getPeriodSettings(periodMode).enabled) {\n      this._toast('Thymer Cadence', `${this._periodLabel(periodMode)} notes are not enabled.`);\n      return;\n    }\n\n    const collection = await this._findPeriodCollection(periodMode);\n    if (!collection) {\n      this._toast('Thymer Cadence', `Collection not found for ${periodMode} notes.`);\n      return;\n    }\n\n    const record = await this._findOrCreatePeriodRecord(collection, periodMode, sourceDate);\n    if (!record) {\n      this._toast('Thymer Cadence', `Unable to open ${periodMode} note.`);\n      return;\n    }\n\n    const targetPanel = await this._getTargetPanel(panel, ev);\n    if (targetPanel && this._navigateToRecord(targetPanel, record.guid)) {\n      return;\n    }\n\n    this._navigateToUrl(record.guid, ev);\n  }\n\n  _sourceDateFromRecord(record) {\n    const details = record && typeof record.getJournalDetails === 'function'\n      ? record.getJournalDetails()\n      : null;\n    return details && details.date instanceof Date ? this._dateOnly(details.date) : this._dateOnly(new Date());\n  }\n\n  async _findPeriodCollection(periodMode) {\n    const settings = this._getPeriodSettings(periodMode);\n    if (!settings.enabled) return null;\n\n    const guid = settings.collectionGuid || null;\n    const name = settings.collectionName || this._defaultCollectionName(periodMode);\n    const collections = await this.data.getAllCollections();\n\n    if (guid) {\n      const byGuid = collections.find((collection) => collection.guid === guid);\n      if (byGuid) return byGuid;\n    }\n\n    return collections.find((collection) => collection.getName() === name) || null;\n  }\n\n  async _findOrCreatePeriodRecord(collection, periodMode, sourceDate) {\n    const periodStart = this._normalizePeriodStart(periodMode, sourceDate);\n    const existing = await this._findRecordByPeriodStart(collection, periodMode, periodStart);\n    if (existing) return existing;\n\n    const guid = collection.createRecord(this._periodTitle(periodMode, periodStart));\n    if (!guid) return null;\n\n    const record = this.data.getRecord(guid);\n    if (record) {\n      this._setPeriodMetadata(record, periodMode, periodStart);\n      return record;\n    }\n\n    this._finalizeCreatedRecord(guid, periodMode, periodStart);\n    return { guid };\n  }\n\n  async _finalizeCreatedRecord(guid, periodMode, periodStart) {\n    const record = await this._waitForRecord(guid);\n    if (record) {\n      this._setPeriodMetadata(record, periodMode, periodStart);\n    }\n  }\n\n  _setPeriodMetadata(record, periodMode, periodStart) {\n    const settings = this._getPeriodSettings(periodMode);\n    const periodProperty = this._resolveProperty(record, [\n      settings.periodStartFieldId,\n      'period_start',\n      'Period Start',\n    ]);\n    if (periodProperty) {\n      periodProperty.set(this._dateTimeValue(periodStart));\n    }\n\n    const canonicalKeyProperty = this._resolveProperty(record, ['period_key', 'Period Key']);\n    if (canonicalKeyProperty) {\n      canonicalKeyProperty.set(this._periodKey(periodMode, periodStart));\n    }\n\n    const orderProperty = this._resolveProperty(record, [\n      settings.orderFieldId,\n      'period_key',\n      'Period Key',\n    ]);\n    if (orderProperty) {\n      if (settings.orderFieldKind === 'period_start') {\n        orderProperty.set(this._dateTimeValue(periodStart));\n      } else {\n        orderProperty.set(this._periodKey(periodMode, periodStart));\n      }\n    }\n  }\n\n  async _findRecordByPeriodStart(collection, periodMode, targetDate) {\n    const targetKey = this._periodKey(periodMode, targetDate);\n    const records = await collection.getAllRecords();\n\n    for (const record of records) {\n      const recordKey = this._recordPeriodKey(periodMode, record);\n      if (recordKey === targetKey) {\n        return record;\n      }\n    }\n\n    return null;\n  }\n\n  async _waitForRecord(guid) {\n    for (let attempt = 0; attempt < 20; attempt += 1) {\n      const record = this.data.getRecord(guid);\n      if (record) return record;\n      await this._sleep(50);\n    }\n\n    return null;\n  }\n\n  async _getTargetPanel(panel, ev) {\n    const basePanel = panel || this.ui.getActivePanel();\n    const openInNewPanel = !!(ev && (ev.metaKey || ev.ctrlKey || ev.shiftKey));\n\n    if (!openInNewPanel) return basePanel;\n\n    const options = basePanel ? { afterPanel: basePanel } : undefined;\n    return (await this.ui.createPanel(options)) || basePanel;\n  }\n\n  _navigateToRecord(panel, guid) {\n    const workspaceGuid = this.collectionRoot?.wsguid || this.data.getActiveUsers()?.[0]?.workspaceGuid || null;\n    if (!workspaceGuid || !guid || !panel || typeof panel.navigateTo !== 'function') return false;\n\n    try {\n      panel.navigateTo({\n        type: 'edit_panel',\n        rootId: guid,\n        subId: null,\n        workspaceGuid,\n      });\n      if (typeof this.ui.setActivePanel === 'function') {\n        this.ui.setActivePanel(panel);\n      }\n      return true;\n    } catch (error) {\n      return false;\n    }\n  }\n\n  _navigateToUrl(guid, ev) {\n    const workspaceGuid = this.collectionRoot?.wsguid || this.data.getActiveUsers()?.[0]?.workspaceGuid || null;\n    if (!workspaceGuid || !guid) return;\n\n    const url = `${window.location.origin}/?open=${workspaceGuid}.${guid}`;\n    const openInNewTab = !!(ev && (ev.metaKey || ev.ctrlKey || ev.shiftKey));\n\n    if (openInNewTab) {\n      window.open(url, '_blank', 'noopener');\n      return;\n    }\n\n    window.location.assign(url);\n  }\n\n  _recordPeriodKey(periodMode, record) {\n    if (!record) return null;\n\n    const settings = this._getPeriodSettings(periodMode);\n\n    if (settings.orderFieldKind === 'period_start') {\n      const orderDate = this._recordDateValue(record, [\n        settings.orderFieldId,\n        settings.periodStartFieldId,\n        'period_start',\n        'Period Start',\n      ]);\n      if (orderDate) return this._periodKey(periodMode, orderDate);\n    }\n\n    const keyText = this._recordTextValue(record, [\n      settings.orderFieldId,\n      'period_key',\n      'Period Key',\n    ]);\n    if (keyText) return keyText;\n\n    const derivedDate = this._recordPeriodStartFromTitle(periodMode, record);\n    return derivedDate ? this._periodKey(periodMode, derivedDate) : null;\n  }\n\n  _recordPeriodStartFromTitle(periodMode, record) {\n    if (!record) return null;\n\n    let periodStart = null;\n    const settings = this._getPeriodSettings(periodMode);\n    periodStart = this._recordDateValue(record, [\n      settings.periodStartFieldId,\n      settings.orderFieldKind === 'period_start' ? settings.orderFieldId : null,\n      'period_start',\n      'Period Start',\n    ]);\n    if (periodStart) return this._dateOnly(periodStart);\n\n    const title = typeof record.getName === 'function' ? record.getName() : null;\n    return this._parsePeriodStartFromTitle(periodMode, title);\n  }\n\n  _periodKey(periodMode, date) {\n    const normalized = this._normalizePeriodStart(periodMode, date);\n    if (periodMode === 'weekly') {\n      const info = this._isoWeekInfo(normalized);\n      return `${info.year}-${String(info.week).padStart(2, '0')}`;\n    }\n    if (periodMode === 'monthly') {\n      return `${normalized.getFullYear()}-${String(normalized.getMonth() + 1).padStart(2, '0')}`;\n    }\n    if (periodMode === 'quarterly') {\n      return `${normalized.getFullYear()}-Q${this._quarterOfDate(normalized)}`;\n    }\n    return String(normalized.getFullYear());\n  }\n\n  _parsePeriodStartFromTitle(periodMode, title) {\n    if (!title || typeof title !== 'string') return null;\n\n    if (periodMode === 'weekly') {\n      const match = title.match(/^(\\d{4})\\s+W(\\d{1,2})$/);\n      if (!match) return null;\n      return this._isoWeekStartForYearWeek(Number(match[1]), Number(match[2]));\n    }\n\n    if (periodMode === 'monthly') {\n      const match = title.match(/^([A-Za-z]{3})\\s+(\\d{4})$/);\n      if (!match) return null;\n      const monthIndex = this._monthIndexFromShortName(match[1]);\n      if (monthIndex === null) return null;\n      return this._dateOnly(new Date(Number(match[2]), monthIndex, 1));\n    }\n\n    if (periodMode === 'quarterly') {\n      const match = title.match(/^(?:Q([1-4])\\s+(\\d{4})|(\\d{4})[-\\s]Q([1-4]))$/i);\n      if (!match) return null;\n      const year = Number(match[2] || match[3]);\n      const quarter = Number(match[1] || match[4]);\n      return this._quarterStartForYearQuarter(year, quarter);\n    }\n\n    const yearMatch = title.match(/^(\\d{4})$/);\n    if (!yearMatch) return null;\n    return this._dateOnly(new Date(Number(yearMatch[1]), 0, 1));\n  }\n\n  _monthIndexFromShortName(label) {\n    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];\n    const index = months.indexOf(label);\n    return index === -1 ? null : index;\n  }\n\n  _isoWeekStartForYearWeek(year, week) {\n    const firstWeekStart = this._startOfIsoWeek(new Date(year, 0, 4));\n    const date = this._dateOnly(firstWeekStart);\n    date.setDate(firstWeekStart.getDate() + ((week - 1) * 7));\n    return this._dateOnly(date);\n  }\n\n  _quarterOfDate(date) {\n    return Math.floor(date.getMonth() / 3) + 1;\n  }\n\n  _quarterStartForDate(date) {\n    return this._dateOnly(new Date(date.getFullYear(), (this._quarterOfDate(date) - 1) * 3, 1));\n  }\n\n  _quarterStartForYearQuarter(year, quarter) {\n    return this._dateOnly(new Date(year, (quarter - 1) * 3, 1));\n  }\n\n  _periodButtonLabel(periodMode, date) {\n    if (periodMode === 'weekly') {\n      return `W${this._isoWeekInfo(date).week}`;\n    }\n\n    if (periodMode === 'monthly') {\n      return date.toLocaleDateString('en-US', { month: 'short' });\n    }\n\n    if (periodMode === 'quarterly') {\n      return `Q${this._quarterOfDate(date)}`;\n    }\n\n    return String(date.getFullYear());\n  }\n\n  _periodTooltipLabel(periodMode, date) {\n    if (periodMode === 'weekly') {\n      const info = this._isoWeekInfo(date);\n      return `W${info.week} ${info.year}`;\n    }\n\n    if (periodMode === 'monthly') {\n      return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });\n    }\n\n    if (periodMode === 'quarterly') {\n      return `Q${this._quarterOfDate(date)} ${date.getFullYear()}`;\n    }\n\n    return String(date.getFullYear());\n  }\n\n  _periodTitle(periodMode, date) {\n    const settings = this._getPeriodSettings(periodMode);\n    return this._formatPeriodTitle(periodMode, date, settings.titleFormat);\n  }\n\n  _normalizePeriodStart(periodMode, inputDate) {\n    const date = this._dateOnly(inputDate);\n\n    if (periodMode === 'weekly') return this._startOfIsoWeek(date);\n    if (periodMode === 'monthly') return this._dateOnly(new Date(date.getFullYear(), date.getMonth(), 1));\n    if (periodMode === 'quarterly') return this._quarterStartForDate(date);\n    return this._dateOnly(new Date(date.getFullYear(), 0, 1));\n  }\n\n  _startOfIsoWeek(inputDate) {\n    const date = this._dateOnly(inputDate);\n    const day = date.getDay();\n    const diff = day === 0 ? -6 : 1 - day;\n    date.setDate(date.getDate() + diff);\n    return this._dateOnly(date);\n  }\n\n  _isoWeekInfo(inputDate) {\n    const date = this._startOfIsoWeek(inputDate);\n    const thursday = this._dateOnly(date);\n    thursday.setDate(date.getDate() + 3);\n    const year = thursday.getFullYear();\n    const firstWeekStart = this._startOfIsoWeek(new Date(year, 0, 4));\n    const diffDays = Math.round((date.getTime() - firstWeekStart.getTime()) / 86400000);\n    const week = Math.floor(diffDays / 7) + 1;\n    return { year, week };\n  }\n\n  _dateTimeValue(inputDate) {\n    const date = this._dateOnly(inputDate);\n    return DateTime.dateOnly(date.getFullYear(), date.getMonth(), date.getDate()).value();\n  }\n\n  _dateOnly(inputDate) {\n    return new Date(inputDate.getFullYear(), inputDate.getMonth(), inputDate.getDate(), 12, 0, 0, 0);\n  }\n\n  _dateKey(inputDate) {\n    const date = this._dateOnly(inputDate);\n    return [\n      date.getFullYear(),\n      String(date.getMonth() + 1).padStart(2, '0'),\n      String(date.getDate()).padStart(2, '0'),\n    ].join('-');\n  }\n\n  _sleep(ms) {\n    return new Promise((resolve) => setTimeout(resolve, ms));\n  }\n\n  _toast(title, message) {\n    this.ui.addToaster({\n      title,\n      message,\n      dismissible: true,\n      autoDestroyTime: 3000,\n    });\n  }\n\n  _getCadenceConfig() {\n    const custom = this.getConfiguration()?.custom || {};\n    const cadence = custom.cadence && typeof custom.cadence === 'object' ? custom.cadence : {};\n    const periods = {};\n\n    for (const periodMode of ['weekly', 'monthly', 'quarterly', 'yearly']) {\n      const source = cadence.periods?.[periodMode] || {};\n      const collectionGuid = source.collectionGuid || custom[`${periodMode}CollectionGuid`] || '';\n      const collectionName = source.collectionName || custom[`${periodMode}CollectionName`] || this._defaultCollectionName(periodMode);\n      const enabled = typeof source.enabled === 'boolean'\n        ? source.enabled\n        : !!(collectionGuid || custom[`${periodMode}CollectionName`]);\n      const periodStartFieldId = source.periodStartFieldId || 'period_start';\n      const orderFieldId = source.orderFieldId || 'period_key';\n      const orderFieldKind = source.orderFieldKind || (orderFieldId === periodStartFieldId ? 'period_start' : 'period_key');\n\n      periods[periodMode] = {\n        enabled,\n        collectionGuid,\n        collectionName,\n        titleFormat: source.titleFormat || this._defaultTitleFormat(periodMode),\n        periodStartFieldId,\n        orderFieldId,\n        orderFieldKind,\n      };\n    }\n\n    return {\n      schemaVersion: cadence.schemaVersion || 1,\n      periods,\n    };\n  }\n\n  _getPeriodSettings(periodMode) {\n    if (!this._cadenceConfig) {\n      this._cadenceConfig = this._getCadenceConfig();\n    }\n    return this._cadenceConfig.periods?.[periodMode] || {\n      enabled: false,\n      collectionGuid: '',\n      collectionName: this._defaultCollectionName(periodMode),\n      titleFormat: this._defaultTitleFormat(periodMode),\n      periodStartFieldId: 'period_start',\n      orderFieldId: 'period_key',\n      orderFieldKind: 'period_key',\n    };\n  }\n\n  _defaultCollectionName(periodMode) {\n    if (periodMode === 'weekly') return 'Weekly Notes';\n    if (periodMode === 'monthly') return 'Monthly Notes';\n    if (periodMode === 'quarterly') return 'Quarterly Notes';\n    return 'Yearly Notes';\n  }\n\n  _defaultTitleFormat(periodMode) {\n    if (periodMode === 'weekly') return 'GGGG-[W]WW';\n    if (periodMode === 'monthly') return 'MMM YYYY';\n    if (periodMode === 'quarterly') return 'YYYY-[Q]Q';\n    return 'YYYY';\n  }\n\n  _buttonPlaceholder(periodMode) {\n    if (periodMode === 'weekly') return 'W';\n    if (periodMode === 'monthly') return 'Mon';\n    if (periodMode === 'quarterly') return 'Q';\n    return 'YYYY';\n  }\n\n  _periodLabel(periodMode) {\n    if (periodMode === 'weekly') return 'Weekly';\n    if (periodMode === 'monthly') return 'Monthly';\n    if (periodMode === 'quarterly') return 'Quarterly';\n    return 'Yearly';\n  }\n\n  _resolveProperty(record, candidates) {\n    if (!record || typeof record.prop !== 'function') return null;\n    for (const candidate of candidates) {\n      if (!candidate) continue;\n      const prop = record.prop(candidate);\n      if (prop) return prop;\n    }\n    return null;\n  }\n\n  _recordTextValue(record, candidates) {\n    if (!record || typeof record.text !== 'function') return '';\n    for (const candidate of candidates) {\n      if (!candidate) continue;\n      const value = record.text(candidate);\n      if (typeof value === 'string' && value) return value;\n    }\n    return '';\n  }\n\n  _recordDateValue(record, candidates) {\n    if (!record) return null;\n    for (const candidate of candidates) {\n      if (!candidate) continue;\n      if (typeof record.date === 'function') {\n        const value = record.date(candidate);\n        if (value instanceof Date) return value;\n      }\n      if (typeof record.prop === 'function') {\n        const prop = record.prop(candidate);\n        if (prop && typeof prop.date === 'function') {\n          const value = prop.date();\n          if (value instanceof Date) return value;\n        }\n      }\n    }\n    return null;\n  }\n\n  _formatPeriodTitle(periodMode, date, format) {\n    const normalized = this._normalizePeriodStart(periodMode, date);\n    const info = this._isoWeekInfo(normalized);\n    const monthShort = normalized.toLocaleDateString('en-US', { month: 'short' });\n    const monthLong = normalized.toLocaleDateString('en-US', { month: 'long' });\n    const replacements = {\n      GGGG: String(info.year),\n      gggg: String(info.year),\n      YYYY: String(normalized.getFullYear()),\n      YY: String(normalized.getFullYear()).slice(-2),\n      Q: String(this._quarterOfDate(normalized)),\n      MMMM: monthLong,\n      MMM: monthShort,\n      MM: String(normalized.getMonth() + 1).padStart(2, '0'),\n      M: String(normalized.getMonth() + 1),\n      DD: String(normalized.getDate()).padStart(2, '0'),\n      D: String(normalized.getDate()),\n      WW: String(info.week).padStart(2, '0'),\n      ww: String(info.week).padStart(2, '0'),\n      W: String(info.week),\n      w: String(info.week),\n    };\n    return this._applyLimitedFormat(format || this._defaultTitleFormat(periodMode), replacements);\n  }\n\n  _applyLimitedFormat(format, replacements) {\n    const source = String(format || '');\n    let output = '';\n    for (let index = 0; index < source.length;) {\n      if (source[index] === '[') {\n        const endIndex = source.indexOf(']', index + 1);\n        if (endIndex !== -1) {\n          output += source.slice(index + 1, endIndex);\n          index = endIndex + 1;\n          continue;\n        }\n      }\n\n      let matched = false;\n      for (const token of ['GGGG', 'gggg', 'YYYY', 'MMMM', 'MMM', 'MM', 'M', 'DD', 'D', 'WW', 'ww', 'W', 'w', 'YY', 'Q']) {\n        if (!source.startsWith(token, index)) continue;\n        output += replacements[token] ?? token;\n        index += token.length;\n        matched = true;\n        break;\n      }\n      if (matched) continue;\n\n      output += source[index];\n      index += 1;\n    }\n    return output;\n  }\n}\n";
const DAILY_RUNTIME_CSS = ".panel-menubar-buttons button[data-tooltip-html^=\"Open weekly note\"],\n.panel-menubar-buttons button[data-tooltip-html^=\"Open monthly note\"],\n.panel-menubar-buttons button[data-tooltip-html^=\"Open quarterly note\"],\n.panel-menubar-buttons button[data-tooltip-html^=\"Open yearly note\"] {\n  padding-left: 5px;\n  padding-right: 5px;\n  transition: background-color 0.3s, border-color 0.3s;\n}\n\n.cmdpal--inline.cadence-datepicker-popup {\n  width: auto !important;\n  max-width: calc(100vw - 40px) !important;\n}\n\n.cmdpal--inline.cadence-datepicker-popup .id--datepicker .datepicker-wrapper.cadence-datepicker-enhanced {\n  width: auto;\n  max-width: none;\n  padding: 10px 12px 10px;\n}\n\n.cmdpal--inline.cadence-datepicker-popup .id--datepicker .datepicker-wrapper.cadence-datepicker-enhanced .datepicker-header {\n  gap: 10px;\n  margin-bottom: 8px;\n  padding: 0;\n}\n\n.cmdpal--inline.cadence-datepicker-popup .id--datepicker .current-month.cadence-native-month-trigger {\n  display: inline-flex !important;\n  align-items: center;\n  justify-content: center;\n  width: 16px;\n  height: 16px;\n  flex: 0 0 16px;\n  margin-left: -2px;\n  overflow: hidden;\n  white-space: nowrap;\n  color: transparent;\n  font-size: 0;\n  border-radius: 999px;\n}\n\n.cmdpal--inline.cadence-datepicker-popup .id--datepicker .current-month.cadence-native-month-trigger::after {\n  content: '';\n  width: 4px;\n  height: 4px;\n  border-radius: 999px;\n  background: var(--text-muted);\n}\n\n.cmdpal--inline.cadence-datepicker-popup .id--datepicker .current-month.cadence-native-month-trigger:hover {\n  background: var(--button-bg-hover-color);\n}\n\n.cmdpal--inline.cadence-datepicker-popup .id--datepicker .cadence-datepicker-links {\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  flex: 1 1 auto;\n  min-width: 0;\n}\n\n.cmdpal--inline.cadence-datepicker-popup .id--datepicker .cadence-datepicker-link,\n.cmdpal--inline.cadence-datepicker-popup .id--datepicker .cadence-datepicker-weeknum {\n  border: none;\n  background: transparent;\n  color: var(--panel-fg-color);\n  font: inherit;\n  padding: 0;\n  margin: 0;\n  cursor: pointer;\n}\n\n.cmdpal--inline.cadence-datepicker-popup .id--datepicker .cadence-datepicker-link {\n  font-weight: var(--font-weight-medium);\n  line-height: 1.15;\n}\n\n.cmdpal--inline.cadence-datepicker-popup .id--datepicker .cadence-datepicker-link:hover,\n.cmdpal--inline.cadence-datepicker-popup .id--datepicker .cadence-datepicker-weeknum:hover {\n  color: var(--text-hilite);\n}\n\n.cmdpal--inline.cadence-datepicker-popup .id--datepicker .cadence-datepicker-link.is-disabled,\n.cmdpal--inline.cadence-datepicker-popup .id--datepicker .cadence-datepicker-weeknum.is-disabled {\n  color: var(--text-muted);\n  cursor: default;\n  opacity: 0.75;\n}\n\n.cmdpal--inline.cadence-datepicker-popup .id--datepicker .cadence-native-nav {\n  display: flex !important;\n  gap: 4px !important;\n  align-items: center;\n}\n\n.cmdpal--inline.cadence-datepicker-popup .id--datepicker .cadence-native-nav .go-to-today {\n  width: auto;\n  min-width: 0;\n  padding: 0 6px;\n  color: transparent;\n  font-size: 0;\n}\n\n.cmdpal--inline.cadence-datepicker-popup .id--datepicker .cadence-native-nav .go-to-today::after {\n  content: 'Today';\n  font-size: var(--text-size-smaller);\n  color: var(--text-muted);\n  line-height: 1.15;\n}\n\n.cmdpal--inline.cadence-datepicker-popup .autocomplete.clickable {\n  overflow: visible;\n}\n\n.cmdpal--inline.cadence-datepicker-popup .vscroll-node,\n.cmdpal--inline.cadence-datepicker-popup .vcontent {\n  overflow: visible !important;\n  max-height: none !important;\n}\n\n.cmdpal--inline.cadence-datepicker-popup .vscrollbar.scrollbar {\n  display: none !important;\n}\n\n.cmdpal--inline.cadence-datepicker-popup .id--datepicker .datepicker-weekdays,\n.cmdpal--inline.cadence-datepicker-popup .id--datepicker .datepicker-days {\n  display: grid;\n  grid-template-columns: 20px repeat(7, 28px);\n  column-gap: 4px;\n  width: max-content;\n}\n\n.cmdpal--inline.cadence-datepicker-popup .id--datepicker .datepicker-weekdays {\n  margin-bottom: 2px;\n}\n\n.cmdpal--inline.cadence-datepicker-popup .id--datepicker .datepicker-days {\n  height: auto;\n  row-gap: 2px;\n}\n\n.cmdpal--inline.cadence-datepicker-popup .id--datepicker .datepicker-weekdays .weekday,\n.cmdpal--inline.cadence-datepicker-popup .id--datepicker .cadence-datepicker-weeklabel,\n.cmdpal--inline.cadence-datepicker-popup .id--datepicker .cadence-datepicker-weeknum {\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  width: auto;\n  min-width: 0;\n}\n\n.cmdpal--inline.cadence-datepicker-popup .id--datepicker .datepicker-weekdays .weekday,\n.cmdpal--inline.cadence-datepicker-popup .id--datepicker .cadence-datepicker-weeklabel {\n  font-size: 9px;\n  letter-spacing: 0.08em;\n  text-transform: uppercase;\n  color: var(--text-muted);\n}\n\n.cmdpal--inline.cadence-datepicker-popup .id--datepicker .cadence-datepicker-weeknum {\n  font-size: var(--text-size-smaller);\n  color: var(--text-muted);\n  border-radius: var(--radius-normal);\n  height: 28px;\n  min-height: 28px;\n  line-height: 28px;\n  justify-self: stretch;\n  position: relative;\n  z-index: 1;\n  pointer-events: auto;\n}\n\n.cmdpal--inline.cadence-datepicker-popup .id--datepicker .datepicker-days .day {\n  width: 28px;\n  height: 28px;\n  line-height: 28px;\n  min-width: 0;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n}\n\n.cmdpal--inline.cadence-datepicker-popup .id--datepicker .datepicker-days .day .day-inner {\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  width: 24px;\n  height: 24px;\n  line-height: 24px;\n}\n";
const PERIODIC_RUNTIME_CODE = "class Plugin extends CollectionPlugin {\n  onLoad() {\n    this._version = '0.4.10';\n    this._periodMode = this.getConfiguration()?.custom?.periodMode || 'weekly';\n    this._cadenceConfig = this._getCadenceConfig();\n    this._periodSettings = this._getPeriodSettings(this._periodMode);\n    this._periodContextByGuid = new Map();\n    if (!this._periodSettings.enabled) return;\n\n    this._prevButton = this.addCollectionNavigationButton({\n      icon: 'chevron-left',\n      tooltip: this._buttonTooltip('previous'),\n      onlyWhenExpanded: false,\n      onClick: ({ ev, panel, record }) => this._openRelativePeriod({\n        ev,\n        panel,\n        record,\n        direction: -1,\n      }),\n    });\n    this._currentButton = this.addCollectionNavigationButton({\n      label: this._currentPeriodLabel(),\n      tooltip: this._buttonTooltip('current'),\n      onlyWhenExpanded: false,\n      onClick: ({ ev, panel }) => this._openCurrentPeriod({ ev, panel }),\n    });\n    this._nextButton = this.addCollectionNavigationButton({\n      icon: 'chevron-right',\n      tooltip: this._buttonTooltip('next'),\n      onlyWhenExpanded: false,\n      onClick: ({ ev, panel, record }) => this._openRelativePeriod({\n        ev,\n        panel,\n        record,\n        direction: 1,\n      }),\n    });\n    this._calendarButton = this.addCollectionNavigationButton({\n      htmlLabel: '<span class=\"ti ti-calendar-event\"></span>',\n      tooltip: `Open ${this._periodWord()} calendar`,\n      onlyWhenExpanded: false,\n      onClick: ({ ev, panel, record, element }) => {\n        ev.preventDefault();\n        ev.stopPropagation();\n        this._toggleCalendarPopup({ ev, panel, record, anchorElement: element });\n      },\n    });\n    this._boundHandlePopupPointerDown = (ev) => this._handlePopupPointerDown(ev);\n    this._boundHandlePopupKeyDown = (ev) => this._handlePopupKeyDown(ev);\n    this._boundRepositionCalendarPopup = () => this._positionCalendarPopup();\n    this._removeLegacyRelatedTasksBlocks();\n\n    this.events.on('panel.navigated', () => {\n      this._closeCalendarPopup();\n      this._refreshCurrentButton();\n      this._syncActiveRecordPeriodStart();\n    });\n    this.events.on('panel.focused', () => {\n      this._closeCalendarPopup();\n      this._refreshCurrentButton();\n      this._syncActiveRecordPeriodStart();\n    });\n    this._syncActiveRecordPeriodStart();\n  }\n\n  onUnload() {\n    this._closeCalendarPopup();\n    this._removeLegacyRelatedTasksBlocks();\n    if (this._prevButton) this._prevButton.remove();\n    if (this._currentButton) this._currentButton.remove();\n    if (this._nextButton) this._nextButton.remove();\n    if (this._calendarButton) this._calendarButton.remove();\n  }\n\n  _toggleCalendarPopup({ panel, record, anchorElement }) {\n    if (this._calendarPopupElement) {\n      this._closeCalendarPopup();\n      return;\n    }\n\n    this._openCalendarPopup({ panel, record, anchorElement });\n  }\n\n  _openCalendarPopup({ panel, record, anchorElement }) {\n    if (typeof document === 'undefined' || !document.body) return;\n\n    this._closeCalendarPopup();\n\n    const activePanel = panel || this.ui.getActivePanel();\n    const selectedDate = this._currentDailyDate();\n    const displayedMonth = this._dateOnly(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));\n\n    this._calendarPopupAnchor = anchorElement || null;\n    this._calendarPopupState = {\n      panel: activePanel,\n      selectedDate,\n      displayedMonth,\n      view: 'calendar',\n      yearPickerStart: this._yearPickerStart(displayedMonth.getFullYear()),\n    };\n\n    this._calendarPopupElement = document.createElement('div');\n    this._calendarPopupElement.className = 'cmdpal--inline cadence-period-picker-popup';\n    document.body.appendChild(this._calendarPopupElement);\n\n    document.addEventListener('pointerdown', this._boundHandlePopupPointerDown, true);\n    document.addEventListener('keydown', this._boundHandlePopupKeyDown, true);\n    window.addEventListener('resize', this._boundRepositionCalendarPopup);\n    window.addEventListener('scroll', this._boundRepositionCalendarPopup, true);\n\n    this._renderCalendarPopup();\n  }\n\n  _closeCalendarPopup() {\n    if (typeof document !== 'undefined') {\n      document.removeEventListener('pointerdown', this._boundHandlePopupPointerDown, true);\n      document.removeEventListener('keydown', this._boundHandlePopupKeyDown, true);\n    }\n    if (typeof window !== 'undefined') {\n      window.removeEventListener('resize', this._boundRepositionCalendarPopup);\n      window.removeEventListener('scroll', this._boundRepositionCalendarPopup, true);\n    }\n    if (this._calendarPopupElement) {\n      this._calendarPopupElement.remove();\n    }\n\n    this._calendarPopupElement = null;\n    this._calendarPopupAnchor = null;\n    this._calendarPopupState = null;\n  }\n\n  _getRelevantPeriodPanel() {\n    const active = this.ui.getActivePanel();\n    if (this._panelMatchesThisCollection(active)) return active;\n\n    const panels = typeof this.ui.getPanels === 'function' ? this.ui.getPanels() : [];\n    return panels.find((panel) => this._panelMatchesThisCollection(panel)) || active;\n  }\n\n  _panelMatchesThisCollection(panel) {\n    if (!panel) return false;\n\n    const record = typeof panel.getActiveRecord === 'function' ? panel.getActiveRecord() : null;\n    if (record) {\n      const collection = typeof record.getCollection === 'function' ? record.getCollection() : null;\n      if (collection && typeof collection.getGuid === 'function' && collection.getGuid() === this.guid) {\n        return true;\n      }\n    }\n\n    const navigation = typeof panel.getNavigation === 'function' ? panel.getNavigation() : null;\n    const rootId = navigation && typeof navigation.rootId === 'string' ? navigation.rootId : null;\n    if (!rootId) return false;\n\n    const navRecord = this.data.getRecord(rootId);\n    const navCollection = navRecord && typeof navRecord.getCollection === 'function' ? navRecord.getCollection() : null;\n    return !!(navCollection && typeof navCollection.getGuid === 'function' && navCollection.getGuid() === this.guid);\n  }\n\n  _removeLegacyRelatedTasksBlocks() {\n    if (typeof document === 'undefined') return;\n    for (const block of document.querySelectorAll('.cadence-related-block')) {\n      block.remove();\n    }\n  }\n\n  getRelatedItemsSearchQuery(recordGuid) {\n    const record = this._resolveRelatedRecord(recordGuid);\n    const pageGuid = typeof recordGuid === 'string'\n      ? recordGuid\n      : (record?.guid || (typeof record?.getGuid === 'function' ? record.getGuid() : null));\n    const periodStart = this._recordPeriodStart(record) || this._getRememberedPeriodContext(pageGuid);\n    if (!periodStart || !pageGuid) return null;\n\n    const nextBoundary = this._nextPeriodBoundary(periodStart);\n    return [\n      '@todo',\n      '@due',\n      `@due < ${this._quoteQueryValue(this._dateKey(nextBoundary))}`,\n      `@backref!=${this._quoteQueryValue(pageGuid)}`,\n    ].join(' && ');\n  }\n\n  getRelatedSectionTitle() {\n    return 'Upcoming';\n  }\n\n  getRelatedSectionDescription() {\n    return `Shows due and overdue tasks through the end of this ${this._periodWord()}`;\n  }\n\n  _resolveRelatedRecord(recordGuid) {\n    if (recordGuid && typeof recordGuid === 'object') return recordGuid;\n    if (typeof recordGuid === 'string') {\n      const record = this.data.getRecord(recordGuid);\n      if (record) return record;\n    }\n\n    const panel = this._getRelevantPeriodPanel();\n    return panel && typeof panel.getActiveRecord === 'function' ? panel.getActiveRecord() : null;\n  }\n\n  _rememberPeriodContext(recordOrGuid, periodStart) {\n    const guid = typeof recordOrGuid === 'string'\n      ? recordOrGuid\n      : (recordOrGuid?.guid || (typeof recordOrGuid?.getGuid === 'function' ? recordOrGuid.getGuid() : null));\n    if (!guid || !periodStart) return;\n    this._periodContextByGuid.set(guid, this._dateOnly(periodStart));\n  }\n\n  _getRememberedPeriodContext(guid) {\n    if (!guid) return null;\n    const date = this._periodContextByGuid.get(guid);\n    return date ? this._dateOnly(date) : null;\n  }\n\n  _nextPeriodBoundary(periodStart) {\n    const base = this._normalizePeriodStart(periodStart);\n    if (this._periodMode === 'weekly') {\n      return this._dateOnly(new Date(base.getFullYear(), base.getMonth(), base.getDate() + 7));\n    }\n    if (this._periodMode === 'monthly') {\n      return this._dateOnly(new Date(base.getFullYear(), base.getMonth() + 1, 1));\n    }\n    if (this._periodMode === 'quarterly') {\n      return this._dateOnly(new Date(base.getFullYear(), base.getMonth() + 3, 1));\n    }\n    return this._dateOnly(new Date(base.getFullYear() + 1, 0, 1));\n  }\n\n  _quoteQueryValue(value) {\n    return `\"${String(value).replaceAll('\\\\', '\\\\\\\\').replaceAll('\"', '\\\\\"')}\"`;\n  }\n\n  _handlePopupPointerDown(ev) {\n    if (!this._calendarPopupElement) return;\n    if (this._calendarPopupElement.contains(ev.target)) return;\n    if (this._calendarPopupAnchor && this._calendarPopupAnchor.contains(ev.target)) return;\n    this._closeCalendarPopup();\n  }\n\n  _handlePopupKeyDown(ev) {\n    if (ev.key !== 'Escape') return;\n    this._closeCalendarPopup();\n  }\n\n  _positionCalendarPopup() {\n    if (!this._calendarPopupElement || !this._calendarPopupAnchor) return;\n\n    const anchorRect = this._calendarPopupAnchor.getBoundingClientRect();\n    const popupRect = this._calendarPopupElement.getBoundingClientRect();\n    const left = Math.max(12, Math.min(anchorRect.right - popupRect.width, window.innerWidth - popupRect.width - 12));\n    const top = Math.max(12, Math.min(anchorRect.bottom + 8, window.innerHeight - popupRect.height - 12));\n\n    this._calendarPopupElement.style.left = `${left}px`;\n    this._calendarPopupElement.style.top = `${top}px`;\n  }\n\n  _renderCalendarPopup() {\n    if (!this._calendarPopupElement || !this._calendarPopupState) return;\n\n    const state = this._calendarPopupState;\n    const monthLabel = state.displayedMonth.toLocaleDateString('en-US', { month: 'long' });\n    const quarterLabel = this._periodButtonLabelForMode('quarterly', state.selectedDate);\n    const yearLabel = String(state.displayedMonth.getFullYear());\n    const bodyHtml = state.view === 'years'\n      ? this._renderCalendarYearPicker(state)\n      : this._renderCalendarMonthView(state);\n\n    this._calendarPopupElement.innerHTML = `\n      <div class=\"cadence-period-picker-body\">\n        <div class=\"cadence-period-picker-header\">\n          <div class=\"cadence-period-picker-links\">\n            <button type=\"button\" class=\"cadence-period-picker-link cadence-period-picker-month\">${monthLabel}</button>\n            <button type=\"button\" class=\"cadence-period-picker-link cadence-period-picker-quarter\">${quarterLabel}</button>\n            <button type=\"button\" class=\"cadence-period-picker-link cadence-period-picker-year\">${yearLabel}</button>\n            <button type=\"button\" class=\"cadence-period-picker-dot\" aria-label=\"Open month and year picker\"></button>\n          </div>\n          <div class=\"cadence-period-picker-nav\">\n            <button type=\"button\" class=\"button-none button-small button-minimal-hover cadence-period-picker-navbtn cadence-period-picker-prev\" aria-label=\"Previous ${state.view === 'years' ? 'years' : 'month'}\"><span class=\"ti ti-chevron-left\"></span></button>\n            <button type=\"button\" class=\"button-none button-small button-minimal-hover cadence-period-picker-today\">Today</button>\n            <button type=\"button\" class=\"button-none button-small button-minimal-hover cadence-period-picker-navbtn cadence-period-picker-next\" aria-label=\"Next ${state.view === 'years' ? 'years' : 'month'}\"><span class=\"ti ti-chevron-right\"></span></button>\n          </div>\n        </div>\n        ${bodyHtml}\n      </div>\n    `;\n\n    this._syncPopupPeriodLink(this._calendarPopupElement.querySelector('.cadence-period-picker-month'), 'monthly', state.selectedDate, state.panel);\n    this._syncPopupPeriodLink(this._calendarPopupElement.querySelector('.cadence-period-picker-quarter'), 'quarterly', state.selectedDate, state.panel);\n    this._syncPopupPeriodLink(this._calendarPopupElement.querySelector('.cadence-period-picker-year'), 'yearly', state.selectedDate, state.panel);\n    this._calendarPopupElement.querySelector('.cadence-period-picker-dot')?.addEventListener('click', (ev) => {\n      ev.preventDefault();\n      ev.stopPropagation();\n      this._calendarPopupState.view = this._calendarPopupState.view === 'years' ? 'calendar' : 'years';\n      this._calendarPopupState.yearPickerStart = this._yearPickerStart(this._calendarPopupState.displayedMonth.getFullYear());\n      this._renderCalendarPopup();\n    });\n    this._calendarPopupElement.querySelector('.cadence-period-picker-prev')?.addEventListener('click', (ev) => {\n      ev.preventDefault();\n      ev.stopPropagation();\n      if (this._calendarPopupState.view === 'years') {\n        this._calendarPopupState.yearPickerStart -= 30;\n      } else {\n        this._calendarPopupState.displayedMonth = this._dateOnly(new Date(\n          this._calendarPopupState.displayedMonth.getFullYear(),\n          this._calendarPopupState.displayedMonth.getMonth() - 1,\n          1,\n        ));\n      }\n      this._renderCalendarPopup();\n    });\n    this._calendarPopupElement.querySelector('.cadence-period-picker-next')?.addEventListener('click', (ev) => {\n      ev.preventDefault();\n      ev.stopPropagation();\n      if (this._calendarPopupState.view === 'years') {\n        this._calendarPopupState.yearPickerStart += 30;\n      } else {\n        this._calendarPopupState.displayedMonth = this._dateOnly(new Date(\n          this._calendarPopupState.displayedMonth.getFullYear(),\n          this._calendarPopupState.displayedMonth.getMonth() + 1,\n          1,\n        ));\n      }\n      this._renderCalendarPopup();\n    });\n    this._calendarPopupElement.querySelector('.cadence-period-picker-today')?.addEventListener('click', (ev) => {\n      ev.preventDefault();\n      ev.stopPropagation();\n      const today = this._currentDailyDate();\n      this._calendarPopupState.selectedDate = today;\n      this._calendarPopupState.displayedMonth = this._dateOnly(new Date(today.getFullYear(), today.getMonth(), 1));\n      this._calendarPopupState.yearPickerStart = this._yearPickerStart(today.getFullYear());\n      this._calendarPopupState.view = 'calendar';\n      this._renderCalendarPopup();\n    });\n\n    this._calendarPopupElement.querySelectorAll('.cadence-period-picker-weeknum').forEach((button) => {\n      const weeklyEnabled = this._isPeriodEnabled('weekly');\n      button.disabled = !weeklyEnabled;\n      button.classList.toggle('is-disabled', !weeklyEnabled);\n      if (!weeklyEnabled) return;\n      button.addEventListener('click', (ev) => {\n        const sourceDate = this._dateFromKey(button.dataset.date || '');\n        if (!sourceDate) return;\n        this._closeCalendarPopup();\n        void this._openCadenceTarget({\n          ev,\n          panel: state.panel,\n          targetMode: 'weekly',\n          sourceDate,\n        });\n      });\n    });\n    this._calendarPopupElement.querySelectorAll('.cadence-period-picker-day').forEach((button) => {\n      const dailyEnabled = !!this._getDailyNoteCollectionConfig().collectionGuid || !!this._getDailyNoteCollectionConfig().collectionName;\n      button.disabled = !dailyEnabled;\n      button.classList.toggle('is-disabled', !dailyEnabled);\n      if (!dailyEnabled) return;\n      button.addEventListener('click', (ev) => {\n        const sourceDate = this._dateFromKey(button.dataset.date || '');\n        if (!sourceDate) return;\n        this._closeCalendarPopup();\n        void this._openCadenceTarget({\n          ev,\n          panel: state.panel,\n          targetMode: 'daily',\n          sourceDate,\n        });\n      });\n    });\n    this._calendarPopupElement.querySelector('.cadence-period-picker-selected')?.addEventListener('click', (ev) => {\n      if (!this._hasDailyNoteTarget()) return;\n      this._closeCalendarPopup();\n      void this._openCadenceTarget({\n        ev,\n        panel: state.panel,\n        targetMode: 'daily',\n        sourceDate: state.selectedDate,\n      });\n    });\n    this._calendarPopupElement.querySelectorAll('.cadence-period-picker-year-option').forEach((button) => {\n      button.addEventListener('click', (ev) => {\n        ev.preventDefault();\n        ev.stopPropagation();\n        const year = Number(button.dataset.year || '0');\n        if (!year) return;\n        const month = this._calendarPopupState.displayedMonth.getMonth();\n        const day = Math.min(this._calendarPopupState.selectedDate.getDate(), this._daysInMonth(year, month));\n        this._calendarPopupState.selectedDate = this._dateOnly(new Date(year, month, day));\n        this._calendarPopupState.displayedMonth = this._dateOnly(new Date(year, month, 1));\n        this._calendarPopupState.view = 'calendar';\n        this._renderCalendarPopup();\n      });\n    });\n\n    requestAnimationFrame(() => this._positionCalendarPopup());\n  }\n\n  _renderCalendarMonthView(state) {\n    const weekdayLabels = ['W', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];\n    const weekdayHtml = weekdayLabels.map((label, index) => {\n      const className = index === 0 ? 'cadence-period-picker-weeklabel' : 'cadence-period-picker-weekday';\n      return `<div class=\"${className}\">${label}</div>`;\n    }).join('');\n    const rows = this._buildCalendarRows(state.displayedMonth);\n    const daysHtml = rows.flatMap((row) => {\n      const weekButton = `<button type=\"button\" class=\"cadence-period-picker-weeknum\" data-date=\"${this._dateKey(row.weekStart)}\" title=\"Open weekly note for W${row.weekInfo.week} ${row.weekInfo.year}\">${row.weekInfo.week}</button>`;\n      const dayButtons = row.days.map((date) => this._renderCalendarDayButton(date, state));\n      return [weekButton, ...dayButtons];\n    }).join('');\n\n    return `\n      <div class=\"cadence-period-picker-weekdays\">${weekdayHtml}</div>\n      <div class=\"cadence-period-picker-days\">${daysHtml}</div>\n      <button type=\"button\" class=\"cadence-period-picker-selected\">\n        <span class=\"ti ti-calendar-event\"></span>\n        <span>${this._popupDateLabel(state.selectedDate)}</span>\n      </button>\n    `;\n  }\n\n  _renderCalendarYearPicker(state) {\n    const years = Array.from({ length: 30 }, (_, index) => state.yearPickerStart + index);\n    const items = years.map((year) => {\n      const className = year === state.displayedMonth.getFullYear()\n        ? 'cadence-period-picker-year-option is-active'\n        : 'cadence-period-picker-year-option';\n      return `<button type=\"button\" class=\"${className}\" data-year=\"${year}\">${year}</button>`;\n    }).join('');\n\n    return `<div class=\"cadence-period-picker-years\">${items}</div>`;\n  }\n\n  _buildCalendarRows(displayedMonth) {\n    const monthStart = this._dateOnly(new Date(displayedMonth.getFullYear(), displayedMonth.getMonth(), 1));\n    const gridStart = this._startOfIsoWeek(monthStart);\n    const rows = [];\n\n    for (let rowIndex = 0; rowIndex < 6; rowIndex += 1) {\n      const weekStart = this._dateOnly(new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + (rowIndex * 7)));\n      const days = [];\n      for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {\n        days.push(this._dateOnly(new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + dayIndex)));\n      }\n      rows.push({\n        weekStart,\n        weekInfo: this._isoWeekInfo(weekStart),\n        days,\n      });\n    }\n\n    return rows;\n  }\n\n  _renderCalendarDayButton(date, state) {\n    const classes = ['cadence-period-picker-day'];\n    if (date.getMonth() !== state.displayedMonth.getMonth()) classes.push('is-outside');\n    if (this._dateKey(date) === this._dateKey(state.selectedDate)) classes.push('is-selected');\n    if (this._dateKey(date) === this._dateKey(this._currentDailyDate())) classes.push('is-today');\n\n    return `\n      <button type=\"button\" class=\"${classes.join(' ')}\" data-date=\"${this._dateKey(date)}\">\n        <span class=\"day-inner\">${date.getDate()}</span>\n      </button>\n    `;\n  }\n\n  async _openCadenceTarget({ ev, panel, targetMode, sourceDate }) {\n    if (targetMode === 'daily') {\n      if (!this._hasDailyNoteTarget()) {\n        this._toast('Thymer Cadence', 'Daily Notes are not configured.');\n        return;\n      }\n      await this._openDailyNote({ ev, panel, sourceDate });\n      return;\n    }\n\n    if (!this._isPeriodEnabled(targetMode)) {\n      this._toast('Thymer Cadence', `${this._periodLabel(targetMode)} notes are not enabled.`);\n      return;\n    }\n\n    if (targetMode === this._periodMode) {\n      await this._openPeriodRecord({ ev, panel, sourceDate });\n      return;\n    }\n\n    const collection = await this._findPeriodCollection(targetMode);\n    if (!collection) {\n      this._toast('Thymer Cadence', `Collection not found for ${targetMode} notes.`);\n      return;\n    }\n\n    const record = await this._findOrCreatePeriodRecordForMode(collection, targetMode, sourceDate);\n    if (!record) {\n      this._toast('Thymer Cadence', `Unable to open ${targetMode} note.`);\n      return;\n    }\n\n    const targetPanel = await this._getTargetPanel(panel, ev);\n    if (targetPanel && this._navigateToRecord(targetPanel, record.guid)) {\n      return;\n    }\n\n    this._navigateToUrl(record.guid, ev);\n  }\n\n  async _openDailyNote({ ev, panel, sourceDate }) {\n    const dailyCollection = await this._getDailyNoteCollectionApi();\n    const user = this.data.getActiveUsers()?.[0] || null;\n    if (!dailyCollection || !user) {\n      this._toast('Thymer Cadence', 'Daily Notes collection not found.');\n      return;\n    }\n\n    const targetDate = DateTime.dateOnly(sourceDate.getFullYear(), sourceDate.getMonth(), sourceDate.getDate());\n    const targetPanel = await this._getTargetPanel(panel, ev);\n    if (targetPanel && typeof targetPanel.navigateToJournal === 'function') {\n      const navigated = targetPanel.navigateToJournal(user, targetDate);\n      if (navigated) {\n        if (typeof this.ui.setActivePanel === 'function') {\n          this.ui.setActivePanel(targetPanel);\n        }\n        return;\n      }\n    }\n\n    const journalRecord = await dailyCollection.getJournalRecord(user, targetDate);\n    if (!journalRecord) {\n      this._toast('Thymer Cadence', 'Could not open that daily note.');\n      return;\n    }\n\n    if (targetPanel && this._navigateToRecord(targetPanel, journalRecord.guid)) {\n      return;\n    }\n\n    this._navigateToUrl(journalRecord.guid, ev);\n  }\n\n  async _findDailyNoteCollectionGuid() {\n    const settings = this._getDailyNoteCollectionConfig();\n    const collections = await this.data.getAllCollections();\n\n    const byGuid = settings.collectionGuid\n      ? collections.find((collection) => collection.guid === settings.collectionGuid)\n      : null;\n    if (byGuid) return byGuid.guid;\n\n    const byName = settings.collectionName\n      ? collections.find((collection) => collection.getName() === settings.collectionName)\n      : null;\n    if (byName) return byName.guid;\n\n    const journal = collections.find((collection) => collection.isJournalPlugin && collection.isJournalPlugin());\n    return journal?.guid || null;\n  }\n\n  async _getDailyNoteCollectionApi() {\n    const dailyGuid = await this._findDailyNoteCollectionGuid();\n    if (!dailyGuid) return null;\n\n    const collection = this.data.getPluginByGuid(dailyGuid);\n    if (!collection || typeof collection.isJournalPlugin !== 'function' || !collection.isJournalPlugin()) {\n      return null;\n    }\n    return collection;\n  }\n\n  async _findPeriodCollection(periodMode) {\n    const settings = this._getPeriodSettings(periodMode);\n    if (!settings.enabled) return null;\n\n    if (periodMode === this._periodMode) {\n      const currentCollection = await this._getCollectionApi();\n      if (currentCollection) return currentCollection;\n    }\n\n    const collections = await this.data.getAllCollections();\n    if (settings.collectionGuid) {\n      const byGuid = collections.find((collection) => collection.guid === settings.collectionGuid);\n      if (byGuid) return byGuid;\n    }\n\n    if (settings.collectionName) {\n      const byName = collections.find((collection) => collection.getName() === settings.collectionName);\n      if (byName) return byName;\n    }\n\n    return null;\n  }\n\n  async _findOrCreatePeriodRecordForMode(collection, periodMode, sourceDate) {\n    const periodStart = this._normalizePeriodStartForMode(periodMode, sourceDate);\n    const existing = await this._findRecordByPeriodStartForMode(collection, periodMode, periodStart);\n    if (existing) return existing;\n\n    const guid = collection.createRecord(this._periodTitleForMode(periodMode, periodStart));\n    if (!guid) return null;\n\n    const record = this.data.getRecord(guid);\n    if (record) {\n      this._setPeriodMetadataForMode(record, periodMode, periodStart);\n      return record;\n    }\n\n    this._finalizeCreatedRecordForMode(guid, periodMode, periodStart);\n    return { guid };\n  }\n\n  async _finalizeCreatedRecordForMode(guid, periodMode, periodStart) {\n    const record = await this._waitForRecord(guid);\n    if (record) {\n      this._setPeriodMetadataForMode(record, periodMode, periodStart);\n    }\n  }\n\n  _setPeriodMetadataForMode(record, periodMode, periodStart) {\n    const settings = this._getPeriodSettings(periodMode);\n    const periodProperty = this._resolveProperty(record, [\n      settings.periodStartFieldId,\n      'period_start',\n      'Period Start',\n    ]);\n    if (periodProperty) {\n      periodProperty.set(this._dateTimeValue(periodStart));\n    }\n\n    const canonicalKeyProperty = this._resolveProperty(record, ['period_key', 'Period Key']);\n    if (canonicalKeyProperty) {\n      canonicalKeyProperty.set(this._periodKeyForMode(periodMode, periodStart));\n    }\n\n    const orderProperty = this._resolveProperty(record, [\n      settings.orderFieldId,\n      'period_key',\n      'Period Key',\n    ]);\n    if (orderProperty) {\n      if (settings.orderFieldKind === 'period_start') {\n        orderProperty.set(this._dateTimeValue(periodStart));\n      } else {\n        orderProperty.set(this._periodKeyForMode(periodMode, periodStart));\n      }\n    }\n  }\n\n  async _findRecordByPeriodStartForMode(collection, periodMode, targetDate) {\n    const targetKey = this._periodKeyForMode(periodMode, targetDate);\n    const records = await collection.getAllRecords();\n\n    for (const record of records) {\n      const recordKey = this._recordPeriodKeyForMode(periodMode, record);\n      if (recordKey === targetKey) {\n        return record;\n      }\n    }\n\n    return null;\n  }\n\n  _recordPeriodKeyForMode(periodMode, record) {\n    if (!record) return null;\n\n    const settings = this._getPeriodSettings(periodMode);\n\n    if (settings.orderFieldKind === 'period_start') {\n      const orderDate = this._recordDateValue(record, [\n        settings.orderFieldId,\n        settings.periodStartFieldId,\n        'period_start',\n        'Period Start',\n      ]);\n      if (orderDate) return this._periodKeyForMode(periodMode, orderDate);\n    }\n\n    const keyText = this._recordTextValue(record, [\n      settings.orderFieldId,\n      'period_key',\n      'Period Key',\n    ]);\n    if (keyText) return keyText;\n\n    const derivedDate = this._recordPeriodStartFromTitleForMode(periodMode, record);\n    return derivedDate ? this._periodKeyForMode(periodMode, derivedDate) : null;\n  }\n\n  _recordPeriodStartFromTitleForMode(periodMode, record) {\n    if (!record) return null;\n\n    const settings = this._getPeriodSettings(periodMode);\n    let periodStart = this._recordDateValue(record, [\n      settings.periodStartFieldId,\n      settings.orderFieldKind === 'period_start' ? settings.orderFieldId : null,\n      'period_start',\n      'Period Start',\n    ]);\n    if (periodStart) return this._dateOnly(periodStart);\n\n    const title = typeof record.getName === 'function' ? record.getName() : null;\n    return this._parsePeriodStartFromTitleForMode(periodMode, title);\n  }\n\n  _normalizePeriodStartForMode(periodMode, inputDate) {\n    const date = this._dateOnly(inputDate);\n\n    if (periodMode === 'weekly') return this._startOfIsoWeek(date);\n    if (periodMode === 'monthly') return this._dateOnly(new Date(date.getFullYear(), date.getMonth(), 1));\n    if (periodMode === 'quarterly') return this._quarterStartForDate(date);\n    return this._dateOnly(new Date(date.getFullYear(), 0, 1));\n  }\n\n  _periodKeyForMode(periodMode, date) {\n    const normalized = this._normalizePeriodStartForMode(periodMode, date);\n    if (periodMode === 'weekly') {\n      const info = this._isoWeekInfo(normalized);\n      return `${info.year}-${String(info.week).padStart(2, '0')}`;\n    }\n    if (periodMode === 'monthly') {\n      return `${normalized.getFullYear()}-${String(normalized.getMonth() + 1).padStart(2, '0')}`;\n    }\n    if (periodMode === 'quarterly') {\n      return `${normalized.getFullYear()}-Q${this._quarterOfDate(normalized)}`;\n    }\n    return String(normalized.getFullYear());\n  }\n\n  _periodTitleForMode(periodMode, date) {\n    const settings = this._getPeriodSettings(periodMode);\n    return this._formatPeriodTitle(periodMode, date, settings.titleFormat);\n  }\n\n  _parsePeriodStartFromTitleForMode(periodMode, title) {\n    if (!title || typeof title !== 'string') return null;\n\n    if (periodMode === 'weekly') {\n      const match = title.match(/^(\\d{4})\\s+W(\\d{1,2})$/);\n      if (!match) return null;\n      return this._isoWeekStartForYearWeek(Number(match[1]), Number(match[2]));\n    }\n\n    if (periodMode === 'monthly') {\n      const match = title.match(/^([A-Za-z]{3})\\s+(\\d{4})$/);\n      if (!match) return null;\n      const monthIndex = this._monthIndexFromShortName(match[1]);\n      if (monthIndex === null) return null;\n      return this._dateOnly(new Date(Number(match[2]), monthIndex, 1));\n    }\n\n    if (periodMode === 'quarterly') {\n      const match = title.match(/^(?:Q([1-4])\\s+(\\d{4})|(\\d{4})[-\\s]Q([1-4]))$/i);\n      if (!match) return null;\n      const year = Number(match[2] || match[3]);\n      const quarter = Number(match[1] || match[4]);\n      return this._quarterStartForYearQuarter(year, quarter);\n    }\n\n    const yearMatch = title.match(/^(\\d{4})$/);\n    if (!yearMatch) return null;\n    return this._dateOnly(new Date(Number(yearMatch[1]), 0, 1));\n  }\n\n  _parsePopupDateInput(value) {\n    const raw = (value || '').trim();\n    if (!raw) return null;\n    const normalized = raw.toLowerCase();\n    const today = this._today();\n\n    if (normalized === 'today') return today;\n    if (normalized === 'tomorrow') return this._dateOnly(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1));\n    if (normalized === 'yesterday') return this._dateOnly(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1));\n\n    const dayMatch = normalized.match(/^(-?\\d+)\\s+days?$/);\n    if (dayMatch) {\n      return this._dateOnly(new Date(today.getFullYear(), today.getMonth(), today.getDate() + Number(dayMatch[1])));\n    }\n\n    const parsed = new Date(raw);\n    if (Number.isNaN(parsed.getTime())) return null;\n    return this._dateOnly(parsed);\n  }\n\n  _dateFromKey(value) {\n    if (!value || typeof value !== 'string') return null;\n    const [year, month, day] = value.split('-').map(Number);\n    if (!year || !month || !day) return null;\n    return this._dateOnly(new Date(year, month - 1, day));\n  }\n\n  _daysInMonth(year, monthIndex) {\n    return new Date(year, monthIndex + 1, 0).getDate();\n  }\n\n  _yearPickerStart(year) {\n    return (Math.floor((year - 1) / 30) * 30) + 1;\n  }\n\n  _popupDateLabel(date) {\n    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });\n  }\n\n  async _openRelativePeriod({ ev, panel, record, direction }) {\n    try {\n      const baseDate = this._recordPeriodStart(record) || this._today();\n      const targetDate = this._shiftPeriod(baseDate, direction);\n      await this._openPeriodRecord({ ev, panel, sourceDate: targetDate });\n    } catch (error) {\n      this._toast('Thymer Cadence', error?.message || `Unable to open ${this._periodWord()} note.`);\n    }\n  }\n\n  async _openCurrentPeriod({ ev, panel }) {\n    try {\n      await this._openPeriodRecord({ ev, panel, sourceDate: this._today() });\n    } catch (error) {\n      this._toast('Thymer Cadence', error?.message || `Unable to open ${this._periodWord()} note.`);\n    }\n  }\n\n  async _openPeriodRecord({ ev, panel, sourceDate }) {\n    const targetPeriodStart = this._normalizePeriodStart(sourceDate);\n    const record = await this._findOrCreatePeriodRecord(sourceDate);\n    if (!record) {\n      this._toast('Thymer Cadence', `Unable to open ${this._periodWord()} note.`);\n      return;\n    }\n\n    this._rememberPeriodContext(record, targetPeriodStart);\n\n    const targetPanel = await this._getTargetPanel(panel, ev);\n    if (targetPanel && this._navigateToRecord(targetPanel, record.guid)) {\n      return;\n    }\n\n    this._navigateToUrl(record.guid, ev);\n  }\n\n  async _findOrCreatePeriodRecord(sourceDate) {\n    const collection = await this._getCollectionApi();\n    if (!collection) return null;\n\n    const periodStart = this._normalizePeriodStart(sourceDate);\n    const existing = await this._findRecordByPeriodStart(collection, periodStart);\n    if (existing) {\n      this._rememberPeriodContext(existing, periodStart);\n      return existing;\n    }\n\n    const guid = collection.createRecord(this._periodTitle(periodStart));\n    if (!guid) return null;\n    this._rememberPeriodContext(guid, periodStart);\n\n    const record = this.data.getRecord(guid);\n    if (record) {\n      this._setPeriodMetadata(record, periodStart);\n      return record;\n    }\n\n    this._finalizeCreatedRecord(guid, periodStart);\n    return { guid };\n  }\n\n  async _finalizeCreatedRecord(guid, periodStart) {\n    const record = await this._waitForRecord(guid);\n    if (record) {\n      this._setPeriodMetadata(record, periodStart);\n    }\n  }\n\n  _setPeriodMetadata(record, periodStart) {\n    this._rememberPeriodContext(record, periodStart);\n    const settings = this._getPeriodSettings(this._periodMode);\n    const periodProperty = this._resolveProperty(record, [\n      settings.periodStartFieldId,\n      'period_start',\n      'Period Start',\n    ]);\n    if (periodProperty) {\n      periodProperty.set(this._dateTimeValue(periodStart));\n    }\n\n    const canonicalKeyProperty = this._resolveProperty(record, ['period_key', 'Period Key']);\n    if (canonicalKeyProperty) {\n      canonicalKeyProperty.set(this._periodKey(periodStart));\n    }\n\n    const orderProperty = this._resolveProperty(record, [\n      settings.orderFieldId,\n      'period_key',\n      'Period Key',\n    ]);\n    if (orderProperty) {\n      if (settings.orderFieldKind === 'period_start') {\n        orderProperty.set(this._dateTimeValue(periodStart));\n      } else {\n        orderProperty.set(this._periodKey(periodStart));\n      }\n    }\n  }\n\n  async _findRecordByPeriodStart(collection, targetDate) {\n    const targetKey = this._periodKey(targetDate);\n    const records = await collection.getAllRecords();\n\n    for (const record of records) {\n      const recordKey = this._recordPeriodKey(record);\n      if (recordKey === targetKey) {\n        return record;\n      }\n    }\n\n    return null;\n  }\n\n  async _getCollectionApi() {\n    const collections = await this.data.getAllCollections();\n    return collections.find((collection) => collection.guid === this.guid || collection.getName() === this.getName()) || null;\n  }\n\n  _syncActiveRecordPeriodStart() {\n    const activePanel = this.ui.getActivePanel();\n    const activeRecord = activePanel && typeof activePanel.getActiveRecord === 'function'\n      ? activePanel.getActiveRecord()\n      : null;\n    if (!activeRecord || typeof activeRecord.prop !== 'function' || typeof activeRecord.getName !== 'function') {\n      return;\n    }\n\n    const existingPeriodStart = this._recordPeriodStart(activeRecord);\n    if (existingPeriodStart) {\n      this._rememberPeriodContext(activeRecord, existingPeriodStart);\n      return;\n    }\n\n    const periodProp = activeRecord.prop('period_start') || activeRecord.prop('Period Start');\n    if (!periodProp) return;\n\n    let currentValue = null;\n    if (typeof activeRecord.date === 'function') {\n      currentValue = activeRecord.date('period_start') || activeRecord.date('Period Start');\n    }\n    if (!currentValue && typeof periodProp.date === 'function') {\n      currentValue = periodProp.date();\n    }\n    if (currentValue) {\n      this._rememberPeriodContext(activeRecord, currentValue);\n      return;\n    }\n\n    const parsed = this._parsePeriodStartFromTitle(activeRecord.getName());\n    if (!parsed) return;\n    this._rememberPeriodContext(activeRecord, parsed);\n    this._setPeriodMetadata(activeRecord, parsed);\n  }\n\n  _refreshCurrentButton() {\n    if (!this._currentButton) return;\n    const label = this._currentPeriodLabel();\n    const tooltip = this._buttonTooltip('current');\n    if (this._currentButtonLabel === label && this._currentButtonTooltip === tooltip) return;\n    this._currentButtonLabel = label;\n    this._currentButtonTooltip = tooltip;\n    this._currentButton.setLabel(label);\n    this._currentButton.setTooltip(tooltip);\n  }\n\n  async _getTargetPanel(panel, ev) {\n    const basePanel = panel || this.ui.getActivePanel();\n    const openInNewPanel = !!(ev && (ev.metaKey || ev.ctrlKey || ev.shiftKey));\n\n    if (!openInNewPanel) return basePanel;\n\n    const options = basePanel ? { afterPanel: basePanel } : undefined;\n    return (await this.ui.createPanel(options)) || basePanel;\n  }\n\n  _navigateToRecord(panel, guid) {\n    const workspaceGuid = this.collectionRoot?.wsguid || this.data.getActiveUsers()?.[0]?.workspaceGuid || null;\n    if (!workspaceGuid || !guid || !panel || typeof panel.navigateTo !== 'function') return false;\n\n    try {\n      panel.navigateTo({\n        type: 'edit_panel',\n        rootId: guid,\n        subId: null,\n        workspaceGuid,\n      });\n      if (typeof this.ui.setActivePanel === 'function') {\n        this.ui.setActivePanel(panel);\n      }\n      return true;\n    } catch (error) {\n      return false;\n    }\n  }\n\n  _navigateToUrl(guid, ev) {\n    const workspaceGuid = this.collectionRoot?.wsguid || this.data.getActiveUsers()?.[0]?.workspaceGuid || null;\n    if (!workspaceGuid || !guid) return;\n\n    const url = `${window.location.origin}/?open=${workspaceGuid}.${guid}`;\n    const openInNewTab = !!(ev && (ev.metaKey || ev.ctrlKey || ev.shiftKey));\n\n    if (openInNewTab) {\n      window.open(url, '_blank', 'noopener');\n      return;\n    }\n\n    window.location.assign(url);\n  }\n\n  _recordPeriodKey(record) {\n    if (!record) return null;\n\n    const settings = this._getPeriodSettings(this._periodMode);\n\n    if (settings.orderFieldKind === 'period_start') {\n      const orderDate = this._recordDateValue(record, [\n        settings.orderFieldId,\n        settings.periodStartFieldId,\n        'period_start',\n        'Period Start',\n      ]);\n      if (orderDate) return this._periodKey(orderDate);\n    }\n\n    const keyText = this._recordTextValue(record, [\n      settings.orderFieldId,\n      'period_key',\n      'Period Key',\n    ]);\n    if (keyText) return keyText;\n\n    const derivedDate = this._recordPeriodStart(record);\n    return derivedDate ? this._periodKey(derivedDate) : null;\n  }\n\n  _recordPeriodStart(record) {\n    if (!record) return null;\n    const settings = this._getPeriodSettings(this._periodMode);\n    let periodStart = this._recordDateValue(record, [\n      settings.periodStartFieldId,\n      settings.orderFieldKind === 'period_start' ? settings.orderFieldId : null,\n      'period_start',\n      'Period Start',\n    ]);\n\n    if (!periodStart && typeof record.getName === 'function') {\n      periodStart = this._parsePeriodStartFromTitle(record.getName());\n    }\n\n    return periodStart ? this._dateOnly(periodStart) : null;\n  }\n\n  _parsePeriodStartFromTitle(title) {\n    if (!title || typeof title !== 'string') return null;\n\n    if (this._periodMode === 'weekly') {\n      const match = title.match(/^(\\d{4})\\s+W(\\d{1,2})$/);\n      if (!match) return null;\n      return this._isoWeekStartForYearWeek(Number(match[1]), Number(match[2]));\n    }\n\n    if (this._periodMode === 'monthly') {\n      const match = title.match(/^([A-Za-z]{3})\\s+(\\d{4})$/);\n      if (!match) return null;\n      const monthIndex = this._monthIndexFromShortName(match[1]);\n      if (monthIndex === null) return null;\n      return this._dateOnly(new Date(Number(match[2]), monthIndex, 1));\n    }\n\n    if (this._periodMode === 'quarterly') {\n      const match = title.match(/^(?:Q([1-4])\\s+(\\d{4})|(\\d{4})[-\\s]Q([1-4]))$/i);\n      if (!match) return null;\n      const year = Number(match[2] || match[3]);\n      const quarter = Number(match[1] || match[4]);\n      return this._quarterStartForYearQuarter(year, quarter);\n    }\n\n    const yearMatch = title.match(/^(\\d{4})$/);\n    if (!yearMatch) return null;\n    return this._dateOnly(new Date(Number(yearMatch[1]), 0, 1));\n  }\n\n  _monthIndexFromShortName(label) {\n    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];\n    const index = months.indexOf(label);\n    return index === -1 ? null : index;\n  }\n\n  _isoWeekStartForYearWeek(year, week) {\n    const firstWeekStart = this._startOfIsoWeek(new Date(year, 0, 4));\n    const date = this._dateOnly(firstWeekStart);\n    date.setDate(firstWeekStart.getDate() + ((week - 1) * 7));\n    return this._dateOnly(date);\n  }\n\n  _quarterOfDate(date) {\n    return Math.floor(date.getMonth() / 3) + 1;\n  }\n\n  _quarterStartForDate(date) {\n    return this._dateOnly(new Date(date.getFullYear(), (this._quarterOfDate(date) - 1) * 3, 1));\n  }\n\n  _quarterStartForYearQuarter(year, quarter) {\n    return this._dateOnly(new Date(year, (quarter - 1) * 3, 1));\n  }\n\n  _shiftPeriod(sourceDate, direction) {\n    const base = this._normalizePeriodStart(sourceDate);\n\n    if (this._periodMode === 'weekly') {\n      const next = this._dateOnly(base);\n      next.setDate(base.getDate() + (direction * 7));\n      return this._normalizePeriodStart(next);\n    }\n\n    if (this._periodMode === 'monthly') {\n      return this._dateOnly(new Date(base.getFullYear(), base.getMonth() + direction, 1));\n    }\n\n    if (this._periodMode === 'quarterly') {\n      return this._dateOnly(new Date(base.getFullYear(), base.getMonth() + (direction * 3), 1));\n    }\n\n    return this._dateOnly(new Date(base.getFullYear() + direction, 0, 1));\n  }\n\n  _buttonTooltip(kind) {\n    const word = this._periodWord();\n    if (kind === 'previous') return `Show previous ${word} note`;\n    if (kind === 'next') return `Show next ${word} note`;\n    return `Show this ${word} note`;\n  }\n\n  _periodWord() {\n    if (this._periodMode === 'weekly') return 'week';\n    if (this._periodMode === 'monthly') return 'month';\n    if (this._periodMode === 'quarterly') return 'quarter';\n    return 'year';\n  }\n\n  _currentPeriodLabel() {\n    return this._periodButtonLabel(this._today());\n  }\n\n  _periodButtonLabel(date) {\n    if (this._periodMode === 'weekly') {\n      return `W${this._isoWeekInfo(date).week}`;\n    }\n\n    if (this._periodMode === 'monthly') {\n      return date.toLocaleDateString('en-US', { month: 'short' });\n    }\n\n    if (this._periodMode === 'quarterly') {\n      return `Q${this._quarterOfDate(date)}`;\n    }\n\n    return String(date.getFullYear());\n  }\n\n  _periodTitle(date) {\n    return this._formatPeriodTitle(this._periodMode, date, this._periodSettings.titleFormat);\n  }\n\n  _periodKey(date) {\n    const normalized = this._normalizePeriodStart(date);\n    if (this._periodMode === 'weekly') {\n      const info = this._isoWeekInfo(normalized);\n      return `${info.year}-${String(info.week).padStart(2, '0')}`;\n    }\n    if (this._periodMode === 'monthly') {\n      return `${normalized.getFullYear()}-${String(normalized.getMonth() + 1).padStart(2, '0')}`;\n    }\n    if (this._periodMode === 'quarterly') {\n      return `${normalized.getFullYear()}-Q${this._quarterOfDate(normalized)}`;\n    }\n    return String(normalized.getFullYear());\n  }\n\n  _normalizePeriodStart(inputDate) {\n    const date = this._dateOnly(inputDate);\n\n    if (this._periodMode === 'weekly') return this._startOfIsoWeek(date);\n    if (this._periodMode === 'monthly') return this._dateOnly(new Date(date.getFullYear(), date.getMonth(), 1));\n    if (this._periodMode === 'quarterly') return this._quarterStartForDate(date);\n    return this._dateOnly(new Date(date.getFullYear(), 0, 1));\n  }\n\n  _startOfIsoWeek(inputDate) {\n    const date = this._dateOnly(inputDate);\n    const day = date.getDay();\n    const diff = day === 0 ? -6 : 1 - day;\n    date.setDate(date.getDate() + diff);\n    return this._dateOnly(date);\n  }\n\n  _isoWeekInfo(inputDate) {\n    const date = this._startOfIsoWeek(inputDate);\n    const thursday = this._dateOnly(date);\n    thursday.setDate(date.getDate() + 3);\n    const year = thursday.getFullYear();\n    const firstWeekStart = this._startOfIsoWeek(new Date(year, 0, 4));\n    const diffDays = Math.round((date.getTime() - firstWeekStart.getTime()) / 86400000);\n    const week = Math.floor(diffDays / 7) + 1;\n    return { year, week };\n  }\n\n  _dateTimeValue(inputDate) {\n    const date = this._dateOnly(inputDate);\n    return DateTime.dateOnly(date.getFullYear(), date.getMonth(), date.getDate()).value();\n  }\n\n  _dateOnly(inputDate) {\n    return new Date(inputDate.getFullYear(), inputDate.getMonth(), inputDate.getDate(), 12, 0, 0, 0);\n  }\n\n  _today() {\n    return this._normalizePeriodStart(new Date());\n  }\n\n  _currentDailyDate() {\n    return this._dateOnly(new Date());\n  }\n\n  _getCadenceConfig() {\n    const custom = this.getConfiguration()?.custom || {};\n    const cadence = custom.cadence && typeof custom.cadence === 'object' ? custom.cadence : {};\n    const periods = {};\n\n    for (const periodMode of ['weekly', 'monthly', 'quarterly', 'yearly']) {\n      const source = cadence.periods?.[periodMode] || {};\n      const collectionGuid = source.collectionGuid || custom[`${periodMode}CollectionGuid`] || '';\n      const collectionName = source.collectionName || custom[`${periodMode}CollectionName`] || this._defaultCollectionName(periodMode);\n      const enabled = typeof source.enabled === 'boolean'\n        ? source.enabled\n        : (periodMode === this._periodMode ? true : !!collectionGuid);\n      const periodStartFieldId = source.periodStartFieldId || 'period_start';\n      const orderFieldId = source.orderFieldId || 'period_key';\n      const orderFieldKind = source.orderFieldKind || (orderFieldId === periodStartFieldId ? 'period_start' : 'period_key');\n\n      periods[periodMode] = {\n        enabled,\n        collectionGuid,\n        collectionName,\n        titleFormat: source.titleFormat || this._defaultTitleFormat(periodMode),\n        periodStartFieldId,\n        orderFieldId,\n        orderFieldKind,\n      };\n    }\n\n    return {\n      schemaVersion: cadence.schemaVersion || 1,\n      daily: {\n        collectionGuid: cadence.daily?.collectionGuid || custom.dailyNoteCollectionGuid || '',\n        collectionName: cadence.daily?.collectionName || custom.dailyNoteCollectionName || 'Daily Notes',\n      },\n      periods,\n    };\n  }\n\n  _getDailyNoteCollectionConfig() {\n    return this._cadenceConfig?.daily || { collectionGuid: '', collectionName: 'Daily Notes' };\n  }\n\n  _getPeriodSettings(periodMode) {\n    return this._cadenceConfig?.periods?.[periodMode] || {\n      enabled: false,\n      collectionGuid: '',\n      collectionName: this._defaultCollectionName(periodMode),\n      titleFormat: this._defaultTitleFormat(periodMode),\n      periodStartFieldId: 'period_start',\n      orderFieldId: 'period_key',\n      orderFieldKind: 'period_key',\n    };\n  }\n\n  _defaultCollectionName(periodMode) {\n    if (periodMode === 'weekly') return 'Weekly Notes';\n    if (periodMode === 'monthly') return 'Monthly Notes';\n    if (periodMode === 'quarterly') return 'Quarterly Notes';\n    return 'Yearly Notes';\n  }\n\n  _defaultTitleFormat(periodMode) {\n    if (periodMode === 'weekly') return 'GGGG-[W]WW';\n    if (periodMode === 'monthly') return 'MMM YYYY';\n    if (periodMode === 'quarterly') return 'YYYY-[Q]Q';\n    return 'YYYY';\n  }\n\n  _isPeriodEnabled(periodMode) {\n    return !!this._getPeriodSettings(periodMode).enabled;\n  }\n\n  _hasDailyNoteTarget() {\n    const daily = this._getDailyNoteCollectionConfig();\n    return !!(daily.collectionGuid || daily.collectionName);\n  }\n\n  _periodLabel(periodMode) {\n    if (periodMode === 'weekly') return 'Weekly';\n    if (periodMode === 'monthly') return 'Monthly';\n    if (periodMode === 'quarterly') return 'Quarterly';\n    return 'Yearly';\n  }\n\n  _periodButtonLabelForMode(periodMode, date) {\n    if (periodMode === 'weekly') {\n      return `W${this._isoWeekInfo(date).week}`;\n    }\n    if (periodMode === 'monthly') {\n      return date.toLocaleDateString('en-US', { month: 'short' });\n    }\n    if (periodMode === 'quarterly') {\n      return `Q${this._quarterOfDate(date)}`;\n    }\n    return String(date.getFullYear());\n  }\n\n  _syncPopupPeriodLink(button, periodMode, sourceDate, panel) {\n    if (!button) return;\n\n    const enabled = this._isPeriodEnabled(periodMode);\n    button.disabled = !enabled;\n    button.classList.toggle('is-disabled', !enabled);\n    button.onclick = null;\n    if (!enabled) return;\n\n    button.onclick = (ev) => {\n      this._closeCalendarPopup();\n      void this._openCadenceTarget({\n        ev,\n        panel,\n        targetMode: periodMode,\n        sourceDate,\n      });\n    };\n  }\n\n  _resolveProperty(record, candidates) {\n    if (!record || typeof record.prop !== 'function') return null;\n    for (const candidate of candidates) {\n      if (!candidate) continue;\n      const prop = record.prop(candidate);\n      if (prop) return prop;\n    }\n    return null;\n  }\n\n  _recordTextValue(record, candidates) {\n    if (!record || typeof record.text !== 'function') return '';\n    for (const candidate of candidates) {\n      if (!candidate) continue;\n      const value = record.text(candidate);\n      if (typeof value === 'string' && value) return value;\n    }\n    return '';\n  }\n\n  _recordDateValue(record, candidates) {\n    if (!record) return null;\n    for (const candidate of candidates) {\n      if (!candidate) continue;\n      if (typeof record.date === 'function') {\n        const value = record.date(candidate);\n        if (value instanceof Date) return value;\n      }\n      if (typeof record.prop === 'function') {\n        const prop = record.prop(candidate);\n        if (prop && typeof prop.date === 'function') {\n          const value = prop.date();\n          if (value instanceof Date) return value;\n        }\n      }\n    }\n    return null;\n  }\n\n  _formatPeriodTitle(periodMode, date, format) {\n    const normalized = this._normalizePeriodStartForMode(periodMode, date);\n    const info = this._isoWeekInfo(normalized);\n    const monthShort = normalized.toLocaleDateString('en-US', { month: 'short' });\n    const monthLong = normalized.toLocaleDateString('en-US', { month: 'long' });\n    const replacements = {\n      GGGG: String(info.year),\n      gggg: String(info.year),\n      YYYY: String(normalized.getFullYear()),\n      YY: String(normalized.getFullYear()).slice(-2),\n      Q: String(this._quarterOfDate(normalized)),\n      MMMM: monthLong,\n      MMM: monthShort,\n      MM: String(normalized.getMonth() + 1).padStart(2, '0'),\n      M: String(normalized.getMonth() + 1),\n      DD: String(normalized.getDate()).padStart(2, '0'),\n      D: String(normalized.getDate()),\n      WW: String(info.week).padStart(2, '0'),\n      ww: String(info.week).padStart(2, '0'),\n      W: String(info.week),\n      w: String(info.week),\n    };\n    return this._applyLimitedFormat(format || this._defaultTitleFormat(periodMode), replacements);\n  }\n\n  _applyLimitedFormat(format, replacements) {\n    const source = String(format || '');\n    let output = '';\n    for (let index = 0; index < source.length;) {\n      if (source[index] === '[') {\n        const endIndex = source.indexOf(']', index + 1);\n        if (endIndex !== -1) {\n          output += source.slice(index + 1, endIndex);\n          index = endIndex + 1;\n          continue;\n        }\n      }\n\n      let matched = false;\n      for (const token of ['GGGG', 'gggg', 'YYYY', 'MMMM', 'MMM', 'MM', 'M', 'DD', 'D', 'WW', 'ww', 'W', 'w', 'YY', 'Q']) {\n        if (!source.startsWith(token, index)) continue;\n        output += replacements[token] ?? token;\n        index += token.length;\n        matched = true;\n        break;\n      }\n      if (matched) continue;\n\n      output += source[index];\n      index += 1;\n    }\n    return output;\n  }\n\n  _dateKey(inputDate) {\n    const date = this._dateOnly(inputDate);\n    return [\n      date.getFullYear(),\n      String(date.getMonth() + 1).padStart(2, '0'),\n      String(date.getDate()).padStart(2, '0'),\n    ].join('-');\n  }\n\n  async _waitForRecord(guid) {\n    for (let attempt = 0; attempt < 20; attempt += 1) {\n      const record = this.data.getRecord(guid);\n      if (record) return record;\n      await this._sleep(50);\n    }\n\n    return null;\n  }\n\n  _sleep(ms) {\n    return new Promise((resolve) => setTimeout(resolve, ms));\n  }\n\n  _toast(title, message) {\n    this.ui.addToaster({\n      title,\n      message,\n      dismissible: true,\n      autoDestroyTime: 3000,\n    });\n  }\n}\n";
const PERIODIC_RUNTIME_CSS = ".cmdpal--inline.cadence-period-picker-popup {\n  position: fixed;\n  z-index: 1000;\n  width: max-content;\n  min-width: 270px;\n  max-width: calc(100vw - 24px);\n  overflow: hidden;\n  background: var(--cmdpal-bg-color, var(--bg-panel, #fff));\n  border: 1px solid var(--cmdpal-border-color, var(--divider-color, rgba(0, 0, 0, 0.12)));\n  box-shadow: var(--cmdpal-box-shadow, 0 8px 24px rgba(0, 0, 0, 0.14));\n  border-radius: var(--radius-normal, 4px);\n}\n\n.cmdpal--inline.cadence-period-picker-popup .cadence-period-picker-body {\n  width: max-content;\n  max-width: 100%;\n  padding: 12px 12px 10px;\n}\n\n.cmdpal--inline.cadence-period-picker-popup .cadence-period-picker-header {\n  display: flex;\n  align-items: center;\n  gap: 10px;\n  margin-bottom: 8px;\n}\n\n.cmdpal--inline.cadence-period-picker-popup .cadence-period-picker-links {\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  flex: 1 1 auto;\n  min-width: 0;\n}\n\n.cmdpal--inline.cadence-period-picker-popup .cadence-period-picker-link,\n.cmdpal--inline.cadence-period-picker-popup .cadence-period-picker-weeknum,\n.cmdpal--inline.cadence-period-picker-popup .cadence-period-picker-selected,\n.cmdpal--inline.cadence-period-picker-popup .cadence-period-picker-year-option,\n.cmdpal--inline.cadence-period-picker-popup .cadence-period-picker-day {\n  border: none;\n  background: transparent;\n  color: var(--panel-fg-color);\n  font: inherit;\n  padding: 0;\n  margin: 0;\n  cursor: pointer;\n}\n\n.cmdpal--inline.cadence-period-picker-popup .cadence-period-picker-link {\n  font-weight: var(--font-weight-medium);\n  line-height: 1.15;\n}\n\n.cmdpal--inline.cadence-period-picker-popup .cadence-period-picker-link:hover,\n.cmdpal--inline.cadence-period-picker-popup .cadence-period-picker-weeknum:hover,\n.cmdpal--inline.cadence-period-picker-popup .cadence-period-picker-selected:hover,\n.cmdpal--inline.cadence-period-picker-popup .cadence-period-picker-year-option:hover {\n  color: var(--cmdpal-hover-fg-color, var(--text-hilite));\n}\n\n.cmdpal--inline.cadence-period-picker-popup .cadence-period-picker-link.is-disabled,\n.cmdpal--inline.cadence-period-picker-popup .cadence-period-picker-weeknum.is-disabled,\n.cmdpal--inline.cadence-period-picker-popup .cadence-period-picker-day.is-disabled {\n  color: var(--text-muted);\n  opacity: 0.75;\n  cursor: default;\n}\n\n.cmdpal--inline.cadence-period-picker-popup .cadence-period-picker-dot {\n  border: none;\n  background: transparent;\n  width: 16px;\n  height: 16px;\n  padding: 0;\n  margin: 0;\n  border-radius: 999px;\n  cursor: pointer;\n}\n\n.cmdpal--inline.cadence-period-picker-popup .cadence-period-picker-dot::after {\n  content: '';\n  display: block;\n  width: 4px;\n  height: 4px;\n  margin: 6px auto;\n  border-radius: 999px;\n  background: var(--text-muted);\n}\n\n.cmdpal--inline.cadence-period-picker-popup .cadence-period-picker-dot:hover {\n  background: var(--cmdpal-hover-bg-color, var(--button-bg-hover-color));\n}\n\n.cmdpal--inline.cadence-period-picker-popup .cadence-period-picker-nav {\n  display: flex;\n  align-items: center;\n  gap: 4px;\n}\n\n.cmdpal--inline.cadence-period-picker-popup .cadence-period-picker-today {\n  border: none;\n  background: transparent;\n  color: var(--text-muted);\n  font: inherit;\n  font-size: var(--text-size-smaller);\n  line-height: 1.15;\n  padding: 0 6px;\n  cursor: pointer;\n}\n\n.cmdpal--inline.cadence-period-picker-popup .cadence-period-picker-today:hover {\n  color: var(--cmdpal-hover-fg-color, var(--text-hilite));\n}\n\n.cmdpal--inline.cadence-period-picker-popup .cadence-period-picker-weekdays,\n.cmdpal--inline.cadence-period-picker-popup .cadence-period-picker-days {\n  display: grid;\n  grid-template-columns: 20px repeat(7, 28px);\n  column-gap: 4px;\n  width: max-content;\n}\n\n.cmdpal--inline.cadence-period-picker-popup .cadence-period-picker-weekdays {\n  margin-bottom: 2px;\n}\n\n.cmdpal--inline.cadence-period-picker-popup .cadence-period-picker-days {\n  row-gap: 2px;\n}\n\n.cmdpal--inline.cadence-period-picker-popup .cadence-period-picker-weeklabel,\n.cmdpal--inline.cadence-period-picker-popup .cadence-period-picker-weekday {\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  font-size: 9px;\n  letter-spacing: 0.08em;\n  text-transform: uppercase;\n  color: var(--text-muted);\n}\n\n.cmdpal--inline.cadence-period-picker-popup .cadence-period-picker-weeknum {\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  width: 20px;\n  height: 28px;\n  line-height: 28px;\n  border-radius: var(--radius-normal);\n  color: var(--text-muted);\n}\n\n.cmdpal--inline.cadence-period-picker-popup .cadence-period-picker-day {\n  width: 28px;\n  height: 28px;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  line-height: 28px;\n}\n\n.cmdpal--inline.cadence-period-picker-popup .cadence-period-picker-day .day-inner {\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  width: 24px;\n  height: 24px;\n  line-height: 24px;\n  border-radius: var(--radius-normal);\n}\n\n.cmdpal--inline.cadence-period-picker-popup .cadence-period-picker-day:hover .day-inner {\n  background: var(--cmdpal-hover-bg-color, var(--button-bg-hover-color));\n  color: var(--cmdpal-hover-fg-color, var(--text-hilite));\n}\n\n.cmdpal--inline.cadence-period-picker-popup .cadence-period-picker-day.is-outside {\n  color: var(--text-muted);\n  opacity: 0.65;\n}\n\n.cmdpal--inline.cadence-period-picker-popup .cadence-period-picker-day.is-selected .day-inner {\n  background: var(--button-bg-selected-color, var(--cmdpal-current-bg-color, var(--button-bg-hover-color)));\n  color: var(--cmdpal-current-fg-color, var(--panel-fg-color));\n}\n\n.cmdpal--inline.cadence-period-picker-popup .cadence-period-picker-day.is-today:not(.is-selected) .day-inner {\n  box-shadow: inset 0 0 0 1px var(--text-muted);\n}\n\n.cmdpal--inline.cadence-period-picker-popup .cadence-period-picker-selected {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  width: 100%;\n  margin-top: 8px;\n  padding: 6px 10px;\n  border-radius: var(--radius-normal);\n  color: var(--cmdpal-selected-fg-color, var(--panel-fg-color));\n  background: var(--cmdpal-selected-bg-color, var(--button-bg-selected-color, var(--button-bg-hover-color)));\n}\n\n.cmdpal--inline.cadence-period-picker-popup .cadence-period-picker-selected:hover {\n  background: var(--cmdpal-selected-bg-color, var(--button-bg-selected-color, var(--button-bg-hover-color)));\n}\n\n.cmdpal--inline.cadence-period-picker-popup .cadence-period-picker-years {\n  display: grid;\n  grid-template-columns: repeat(5, minmax(0, 1fr));\n  gap: 4px;\n  width: 100%;\n}\n\n.cmdpal--inline.cadence-period-picker-popup .cadence-period-picker-year-option {\n  padding: 6px 4px;\n  border-radius: var(--radius-normal);\n  text-align: center;\n}\n\n.cmdpal--inline.cadence-period-picker-popup .cadence-period-picker-year-option.is-active {\n  background: var(--cmdpal-current-bg-color, var(--button-bg-selected-color, var(--button-bg-hover-color)));\n  color: var(--cmdpal-current-fg-color, var(--panel-fg-color));\n}\n";
const DAILY_PLUGIN_TEMPLATE = {
  "ver": 1,
  "name": "Daily Notes",
  "icon": "ti-notes",
  "color": null,
  "home": false,
  "page_field_ids": [],
  "item_name": "Note",
  "description": "Notes",
  "show_sidebar_items": true,
  "show_cmdpal_items": true,
  "fields": [
    {
      "icon": "ti-abc",
      "id": "title",
      "label": "Title",
      "many": false,
      "read_only": true,
      "active": true,
      "type": "text"
    },
    {
      "icon": "ti-clock-edit",
      "id": "updated_at",
      "label": "Modified",
      "many": false,
      "read_only": true,
      "active": true,
      "type": "datetime"
    },
    {
      "icon": "ti-clock-plus",
      "id": "created_at",
      "label": "Created",
      "many": false,
      "read_only": true,
      "active": true,
      "type": "datetime"
    },
    {
      "icon": "ti-photo",
      "id": "banner",
      "label": "Banner",
      "many": false,
      "read_only": false,
      "active": true,
      "type": "banner"
    }
  ],
  "sidebar_record_sort_dir": "desc",
  "sidebar_record_sort_field_id": "updated_at",
  "managed": {
    "fields": false,
    "views": false,
    "sidebar": false
  },
  "custom": {},
  "views": []
};
const PERIODIC_PLUGIN_TEMPLATES = {
  "weekly": {
    "ver": 1,
    "name": "Weekly Notes",
    "icon": "ti-calendar",
    "color": null,
    "home": false,
    "page_field_ids": [],
    "item_name": "Week",
    "description": "Weekly notes with compact ISO week navigation",
    "show_sidebar_items": true,
    "show_cmdpal_items": true,
    "fields": [
      {
        "icon": "ti-abc",
        "id": "title",
        "label": "Title",
        "many": false,
        "read_only": false,
        "active": true,
        "type": "text"
      },
      {
        "icon": "ti-calendar",
        "id": "period_start",
        "label": "Period Start",
        "many": false,
        "read_only": false,
        "active": false,
        "type": "datetime"
      },
      {
        "icon": "ti-hash",
        "id": "period_key",
        "label": "Period Key",
        "many": false,
        "read_only": true,
        "active": false,
        "type": "text"
      },
      {
        "icon": "ti-clock-edit",
        "id": "updated_at",
        "label": "Modified",
        "many": false,
        "read_only": true,
        "active": true,
        "type": "datetime"
      },
      {
        "icon": "ti-clock-plus",
        "id": "created_at",
        "label": "Created",
        "many": false,
        "read_only": true,
        "active": true,
        "type": "datetime"
      },
      {
        "icon": "ti-photo",
        "id": "banner",
        "label": "Banner",
        "many": false,
        "read_only": false,
        "active": true,
        "type": "banner"
      },
      {
        "icon": "ti-align-left",
        "id": "icon",
        "label": "Icon",
        "many": false,
        "read_only": false,
        "active": true,
        "type": "text"
      }
    ],
    "sidebar_record_sort_dir": "desc",
    "sidebar_record_sort_field_id": "period_key",
    "managed": {
      "fields": false,
      "views": false,
      "sidebar": false
    },
    "custom": {
      "periodMode": "weekly",
      "weekStart": "iso-monday",
      "labelStyle": "compact"
    },
    "views": [
      {
        "id": "table",
        "type": "table",
        "icon": "",
        "label": "Weeks",
        "description": "",
        "read_only": false,
        "shown": true,
        "field_ids": [
          "title",
          "period_start",
          "updated_at"
        ],
        "sort_dir": "desc",
        "sort_field_id": "period_key",
        "group_by_field_id": null
      }
    ]
  },
  "monthly": {
    "ver": 1,
    "name": "Monthly Notes",
    "icon": "ti-calendar",
    "color": null,
    "home": false,
    "page_field_ids": [],
    "item_name": "Month",
    "description": "Monthly notes with compact month navigation",
    "show_sidebar_items": true,
    "show_cmdpal_items": true,
    "fields": [
      {
        "icon": "ti-abc",
        "id": "title",
        "label": "Title",
        "many": false,
        "read_only": false,
        "active": true,
        "type": "text"
      },
      {
        "icon": "ti-calendar",
        "id": "period_start",
        "label": "Period Start",
        "many": false,
        "read_only": false,
        "active": false,
        "type": "datetime"
      },
      {
        "icon": "ti-hash",
        "id": "period_key",
        "label": "Period Key",
        "many": false,
        "read_only": true,
        "active": false,
        "type": "text"
      },
      {
        "icon": "ti-clock-edit",
        "id": "updated_at",
        "label": "Modified",
        "many": false,
        "read_only": true,
        "active": true,
        "type": "datetime"
      },
      {
        "icon": "ti-clock-plus",
        "id": "created_at",
        "label": "Created",
        "many": false,
        "read_only": true,
        "active": true,
        "type": "datetime"
      },
      {
        "icon": "ti-photo",
        "id": "banner",
        "label": "Banner",
        "many": false,
        "read_only": false,
        "active": true,
        "type": "banner"
      },
      {
        "icon": "ti-align-left",
        "id": "icon",
        "label": "Icon",
        "many": false,
        "read_only": false,
        "active": true,
        "type": "text"
      }
    ],
    "sidebar_record_sort_dir": "desc",
    "sidebar_record_sort_field_id": "period_key",
    "managed": {
      "fields": false,
      "views": false,
      "sidebar": false
    },
    "custom": {
      "periodMode": "monthly",
      "labelStyle": "compact"
    },
    "views": [
      {
        "id": "table",
        "type": "table",
        "icon": "",
        "label": "Months",
        "description": "",
        "read_only": false,
        "shown": true,
        "field_ids": [
          "title",
          "period_start",
          "updated_at"
        ],
        "sort_dir": "desc",
        "sort_field_id": "period_key",
        "group_by_field_id": null
      }
    ]
  },
  "quarterly": {
    "ver": 1,
    "name": "Quarterly Notes",
    "icon": "ti-calendar",
    "color": null,
    "home": false,
    "page_field_ids": [],
    "item_name": "Quarter",
    "description": "Quarterly notes with compact quarter navigation",
    "show_sidebar_items": true,
    "show_cmdpal_items": true,
    "fields": [
      {
        "icon": "ti-abc",
        "id": "title",
        "label": "Title",
        "many": false,
        "read_only": false,
        "active": true,
        "type": "text"
      },
      {
        "icon": "ti-calendar",
        "id": "period_start",
        "label": "Period Start",
        "many": false,
        "read_only": false,
        "active": false,
        "type": "datetime"
      },
      {
        "icon": "ti-hash",
        "id": "period_key",
        "label": "Period Key",
        "many": false,
        "read_only": true,
        "active": false,
        "type": "text"
      },
      {
        "icon": "ti-clock-edit",
        "id": "updated_at",
        "label": "Modified",
        "many": false,
        "read_only": true,
        "active": true,
        "type": "datetime"
      },
      {
        "icon": "ti-clock-plus",
        "id": "created_at",
        "label": "Created",
        "many": false,
        "read_only": true,
        "active": true,
        "type": "datetime"
      },
      {
        "icon": "ti-photo",
        "id": "banner",
        "label": "Banner",
        "many": false,
        "read_only": false,
        "active": true,
        "type": "banner"
      },
      {
        "icon": "ti-align-left",
        "id": "icon",
        "label": "Icon",
        "many": false,
        "read_only": false,
        "active": true,
        "type": "text"
      }
    ],
    "sidebar_record_sort_dir": "desc",
    "sidebar_record_sort_field_id": "period_key",
    "managed": {
      "fields": false,
      "views": false,
      "sidebar": false
    },
    "custom": {
      "periodMode": "quarterly",
      "labelStyle": "compact"
    },
    "views": [
      {
        "id": "table",
        "type": "table",
        "icon": "",
        "label": "Quarters",
        "description": "",
        "read_only": false,
        "shown": true,
        "field_ids": [
          "title",
          "period_start",
          "updated_at"
        ],
        "sort_dir": "desc",
        "sort_field_id": "period_key",
        "group_by_field_id": null
      }
    ]
  },
  "yearly": {
    "ver": 1,
    "name": "Yearly Notes",
    "icon": "ti-calendar",
    "color": null,
    "home": false,
    "page_field_ids": [],
    "item_name": "Year",
    "description": "Yearly notes with compact year navigation",
    "show_sidebar_items": true,
    "show_cmdpal_items": true,
    "fields": [
      {
        "icon": "ti-abc",
        "id": "title",
        "label": "Title",
        "many": false,
        "read_only": false,
        "active": true,
        "type": "text"
      },
      {
        "icon": "ti-calendar",
        "id": "period_start",
        "label": "Period Start",
        "many": false,
        "read_only": false,
        "active": false,
        "type": "datetime"
      },
      {
        "icon": "ti-hash",
        "id": "period_key",
        "label": "Period Key",
        "many": false,
        "read_only": true,
        "active": false,
        "type": "text"
      },
      {
        "icon": "ti-clock-edit",
        "id": "updated_at",
        "label": "Modified",
        "many": false,
        "read_only": true,
        "active": true,
        "type": "datetime"
      },
      {
        "icon": "ti-clock-plus",
        "id": "created_at",
        "label": "Created",
        "many": false,
        "read_only": true,
        "active": true,
        "type": "datetime"
      },
      {
        "icon": "ti-photo",
        "id": "banner",
        "label": "Banner",
        "many": false,
        "read_only": false,
        "active": true,
        "type": "banner"
      },
      {
        "icon": "ti-align-left",
        "id": "icon",
        "label": "Icon",
        "many": false,
        "read_only": false,
        "active": true,
        "type": "text"
      }
    ],
    "sidebar_record_sort_dir": "desc",
    "sidebar_record_sort_field_id": "period_key",
    "managed": {
      "fields": false,
      "views": false,
      "sidebar": false
    },
    "custom": {
      "periodMode": "yearly",
      "labelStyle": "compact"
    },
    "views": [
      {
        "id": "table",
        "type": "table",
        "icon": "",
        "label": "Years",
        "description": "",
        "read_only": false,
        "shown": true,
        "field_ids": [
          "title",
          "period_start",
          "updated_at"
        ],
        "sort_dir": "desc",
        "sort_field_id": "period_key",
        "group_by_field_id": null
      }
    ]
  }
};

class Plugin extends AppPlugin {
  onLoad() {
    this._version = '0.1.5';
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
          ${this._renderPeriodsIntro()}
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

  _renderPeriodsIntro() {
    return `
      <div class="form-field-group cadence-section-group cadence-periods-intro">
        <div class="form-field">
          <div class="cadence-section-title">Period Notes</div>
          <div class="text-details cadence-help cadence-help-tight">Cadence automatically orders period notes with hidden <code>Cadence Period Key</code> metadata and replaces the standard Related Section query with a native <code>Upcoming</code> task section tied to the active page. Adopting an existing collection will replace any custom code and CSS on that collection.</div>
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
            <div class="text-details cadence-help cadence-help-tight">Tokens: <code>GGGG</code>, <code>YYYY</code>, <code>YY</code>, <code>Q</code>, <code>M</code>, <code>MM</code>, <code>MMM</code>, <code>MMMM</code>, <code>W</code>, <code>WW</code>. Use square brackets for literals. Preview: <strong>${this._escapeHtml(this._formatPeriodTitle(periodMode, new Date(), settings.titleFormat))}</strong></div>
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
      id: 'title',
      label: 'Title',
      type: 'text',
      icon: 'ti-abc',
      active: true,
      many: false,
      read_only: false,
    });
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
      read_only: true,
    });
    this._ensureField(conf.fields, {
      id: 'updated_at',
      label: 'Modified',
      type: 'datetime',
      icon: 'ti-clock-edit',
      active: true,
      many: false,
      read_only: true,
    });
    this._ensureField(conf.fields, {
      id: 'created_at',
      label: 'Created',
      type: 'datetime',
      icon: 'ti-clock-plus',
      active: true,
      many: false,
      read_only: true,
    });
    this._ensureField(conf.fields, {
      id: 'banner',
      label: 'Banner',
      type: 'banner',
      icon: 'ti-photo',
      active: true,
      many: false,
      read_only: false,
    });
    this._ensureField(conf.fields, {
      id: 'icon',
      label: 'Icon',
      type: 'text',
      icon: 'ti-align-left',
      active: true,
      many: false,
      read_only: false,
    });

  }

  _ensureField(fields, spec) {
    const existing = fields.find((field) => field && field.id === spec.id);
    if (existing) {
      existing.label = spec.label;
      existing.type = spec.type;
      existing.icon = spec.icon;
      existing.active = !!spec.active;
      existing.many = !!spec.many;
      existing.read_only = !!spec.read_only;
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
      .cadence-help-tight {
        margin-top: 4px;
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
