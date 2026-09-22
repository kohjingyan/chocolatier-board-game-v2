import { mkdirSync, writeFileSync } from 'node:fs'
import puppeteer from 'puppeteer-core'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const OUT = new URL('../qa-shots/', import.meta.url)
mkdirSync(OUT, { recursive: true })

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 1100 })
await page.setCacheEnabled(false)
const errors = []
page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`))
page.on('console', (msg) => {
  if (msg.type() === 'error' && !/same key|404/.test(msg.text())) errors.push(`console: ${msg.text()}`)
})

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function dump(label) {
  const text = await page.evaluate(() => document.body.innerText)
  const file = `ui-${label}.png`
  await page.screenshot({ path: new URL(file, OUT).pathname, fullPage: true })
  writeFileSync(new URL(`ui-${label}.txt`, OUT), text)
  console.log(`${file}`)
  return text
}

function assertIncludes(text, needles, label) {
  const missing = needles.filter((n) => !text.includes(n))
  if (missing.length) throw new Error(`${label} missing: ${missing.join(' | ')}`)
}

await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle0' })
await page.evaluate(() => {
    localStorage.removeItem('chocolatier-v2-playtest')
    localStorage.removeItem('chocolatier-v2-income-overrides')
    localStorage.removeItem('chocolatier-v2-cost-overrides')
})
await page.goto('http://127.0.0.1:5173/?fresh=ui', { waitUntil: 'networkidle0' })
await page.waitForFunction(() => document.body.innerText.includes('Open the atelier'), { timeout: 10000 })

await page.evaluate(() => {
  for (const el of document.querySelectorAll('summary')) {
    if (/Developer|Recipes by assembly|Card distribution/.test(el.textContent || '')) el.click()
  }
})
await sleep(200)
const setup = await dump('setup')
assertIncludes(
  setup,
  [
    'How to play',
    'What you start with',
    'A round, in order',
    'Direct draw',
    'Developer · recipe income',
    'Developer · card costs',
    'Recipes by assembly stage',
    'Card distribution',
    'Stage 1',
    'Stage 4',
    'Basic Cocoa',
    'Royal Honey',
    '3×n',
  ],
  'setup',
)

const incomeInputs = await page.$$('.dev-row input')
if (incomeInputs.length < 5) throw new Error('Developer income inputs missing')
await incomeInputs[0].click({ clickCount: 3 })
await incomeInputs[0].type('9')
await sleep(200)

const checked = await page.evaluate(() => {
  const box = [...document.querySelectorAll('input[type="checkbox"]')].find((el) =>
    (el.parentElement?.textContent || '').includes('Direct draw'),
  )
  if (!box) return false
  box.click()
  return box.checked
})
if (!checked) throw new Error('Could not enable direct draw')

await page.click('[data-testid="start-game"]')
await page.waitForFunction(() => !document.body.innerText.includes('Open the atelier'), { timeout: 8000 })
await sleep(400)

if (await page.$('[data-testid="ack-curtain"]')) {
  await page.click('[data-testid="ack-curtain"]')
  await sleep(300)
}
if (await page.$('[data-testid="submit-bid"]')) {
  await page.click('[data-testid="submit-bid"]')
  await sleep(400)
}

await page.evaluate(() => {
  for (const el of document.querySelectorAll('summary')) {
    if (/Developer|Recipes by assembly|Card distribution/.test(el.textContent || '')) el.click()
  }
})
await sleep(200)
const play = await dump('after-direct-start')
assertIncludes(play, ['Supply', 'Idle factory', 'Direct draw', 'Basic Chocolate', '$9M'], 'in-game')
if (play.includes('Market composition')) throw new Error('Direct draw still showed Market Composition')

async function clickSel(sel) {
  const exists = await page.$(sel)
  if (!exists) return false
  const disabled = await page.$eval(sel, (el) => el.disabled)
  if (disabled) return false
  await exists.click()
  await sleep(300)
  return true
}

let reachedAssign = false
for (let i = 0; i < 40; i += 1) {
  const text = await page.evaluate(() => document.body.innerText)
  if (text.includes('Market composition')) throw new Error('Direct draw entered Market Composition')
  if (text.includes('Buy extra slot $10M (Rep L2)')) {
    reachedAssign = true
    await dump('assignment')
    break
  }
  if (await clickSel('[data-testid="ack-curtain"]')) continue
  if (await clickSel('[data-testid="ack-bids"]')) continue
  if (await clickSel('[data-testid="roll-dice"]')) continue
  if (await clickSel('[data-testid="pass-pv"]')) continue
  if (await clickSel('[data-testid="discard-pool"]')) continue
  if (await clickSel('[data-testid="skip-scheme"]')) continue
  if (await clickSel('[data-testid="ack-income"]')) continue
  break
}
if (!reachedAssign) throw new Error('Did not reach assignment to confirm L2 slot')

if (errors.length) {
  console.log('PAGE ERRORS')
  for (const err of errors) console.log(' ', err)
  process.exitCode = 1
} else {
  console.log('UI QA ok')
}

await browser.close()
