import { readFileSync, writeFileSync } from 'node:fs'

const root = '/home/chima/Projects/chima-thymer/plugins/thymer-cadence'

const template = readFileSync(`${root}/cadence-control/plugin.template.js`, 'utf8')
const dailyCode = readFileSync(`${root}/daily-note/plugin.js`, 'utf8')
const dailyCss = readFileSync(`${root}/daily-note/plugin.css`, 'utf8')
const periodicCode = readFileSync(`${root}/periodic-notes/plugin.js`, 'utf8')
const periodicCss = readFileSync(`${root}/periodic-notes/plugin.css`, 'utf8')
const dailyConfig = JSON.parse(readFileSync(`${root}/daily-note/plugin.json`, 'utf8'))
const periodicConfigs = {
  weekly: JSON.parse(readFileSync(`${root}/periodic-notes/plugin.weekly.json`, 'utf8')),
  monthly: JSON.parse(readFileSync(`${root}/periodic-notes/plugin.monthly.json`, 'utf8')),
  yearly: JSON.parse(readFileSync(`${root}/periodic-notes/plugin.yearly.json`, 'utf8')),
}

const output = template
  .replace('__DAILY_RUNTIME_CODE__', JSON.stringify(dailyCode))
  .replace('__DAILY_RUNTIME_CSS__', JSON.stringify(dailyCss))
  .replace('__PERIODIC_RUNTIME_CODE__', JSON.stringify(periodicCode))
  .replace('__PERIODIC_RUNTIME_CSS__', JSON.stringify(periodicCss))
  .replace('__DAILY_PLUGIN_TEMPLATE__', JSON.stringify(dailyConfig, null, 2))
  .replace('__PERIODIC_PLUGIN_TEMPLATES__', JSON.stringify(periodicConfigs, null, 2))

writeFileSync(`${root}/cadence-control/plugin.js`, output)
