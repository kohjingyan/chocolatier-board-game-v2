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
await page.setViewport({ width: 1440, height: 980 })
await page.setCacheEnabled(false)
const errors = []
page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`))
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(`console: ${msg.text()}`)
})

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

let n = 0
async function dump(label) {
  n += 1
  const info = await page.evaluate(() => {
    const root = document.querySelector('[data-phase]')
    return {
      phase: root?.getAttribute('data-phase') ?? '?',
      heading: document.querySelector('h2')?.textContent ?? '',
      buttons: [...document.querySelectorAll('button')].map((b) => b.textContent.trim()),
      text: document.body.innerText,
    }
  })
  const file = `${String(n).padStart(2, '0')}-${label}.png`
  await page.screenshot({ path: new URL(file, OUT).pathname, fullPage: true })
  console.log(`${file}  phase=${info.phase}  h2=${info.heading}  buttons=${JSON.stringify(info.buttons)}`)
  writeFileSync(new URL(`${String(n).padStart(2, '0')}-${label}.txt`, OUT), info.text)
  return info
}

async function clickText(substr) {
  const clicked = await page.evaluate((needle) => {
    const btn = [...document.querySelectorAll('button')].find((b) =>
      (b.textContent || '').includes(needle),
    )
    if (!btn || btn.disabled) return false
    btn.click()
    return true
  }, substr)
  if (clicked) await sleep(350)
  return clicked
}

async function clickSel(sel) {
  const exists = await page.$(sel)
  if (!exists) return false
  const disabled = await page.$eval(sel, (el) => el.disabled)
  if (disabled) return false
  await exists.click()
  await sleep(350)
  return true
}

await page.goto('http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' })
await page.evaluate(() => localStorage.removeItem('chocolatier-v2-playtest'))
await page.goto('http://127.0.0.1:5173/?fresh=1', { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => document.body.innerText.includes('Open the atelier'), {
  timeout: 10000,
})
await dump('setup')

if (!(await clickSel('[data-testid="start-game"]')) && !(await clickText('Open the atelier'))) {
  throw new Error('Could not start the game')
}
await page.waitForFunction(() => !document.body.innerText.includes('Open the atelier'), {
  timeout: 8000,
})
await dump('after-start')

let assigned = false
for (let step = 0; step < 60; step += 1) {
  const info = await dump(`loop-${step}`)

  if (info.phase === 'assignment' || info.heading.includes('Assignment')) {
    console.log('--- assignment excerpt ---')
    console.log(info.text.slice(0, 2800))
    const clickedReady =
      (await clickSel('[data-testid="ready-recipe-basic"]')) ||
      (await clickText('Basic Chocolate ($1M')) ||
      (await clickText('Assign Basic Chocolate')) ||
      (await clickText('Assign'))
    await sleep(400)
    const after = await dump('assignment-after-click')
    assigned = /Basic Chocolate/.test(after.text) && /Empty factory/.test(after.text)
      ? after.text.indexOf('Basic Chocolate') < after.text.lastIndexOf('Empty factory') ||
        after.text.includes('Basic Chocolate ($1M') === false && after.text.includes('Basic Chocolate')
      : after.text.includes('Basic Chocolate')
    const factories = await page.evaluate(() => document.body.innerText)
    console.log('Assigned flag heuristic:', assigned)
    console.log(factories.match(/Factories:.*$/gm))
    break
  }

  if (await clickSel('[data-testid="ack-curtain"]')) continue
  if (await clickText('I am ')) continue
  if (await clickSel('[data-testid="decline-veto"]')) continue
  if (await clickText('Decline')) continue
  if (await clickSel('[data-testid="ack-bids"]')) continue
  if (await clickText('Set turn order')) continue
  if (await clickSel('[data-testid="roll-dice"]')) continue
  if (await clickText('Roll 2d6')) continue
  if (info.phase === 'bid' || info.phase === 'bid_tie' || /bid/i.test(info.heading)) {
    if (await clickSel('[data-testid="submit-bid"]')) continue
    if (await clickText('Bid $')) continue
  }
  if (await clickSel('[data-testid="contribute-card"]')) continue
  if (info.heading.includes('Market composition') && (await clickText('Face'))) continue
  if (await clickSel('[data-testid="pass-pv"]')) continue
  if (await clickText('Pass')) continue
  if (await clickSel('[data-testid="discard-pool"]')) continue
  if (await clickText('Discard +$5M')) continue
  if (await clickSel('[data-testid="skip-scheme"]')) continue
  if (await clickText('End scheme phase')) continue
  if (await clickSel('[data-testid="ack-income"]')) continue
  if (await clickText('Next round')) continue

  console.log('STUCK')
  break
}

if (errors.length) {
  console.log('PAGE ERRORS')
  for (const err of errors) console.log(' ', err)
}

await browser.close()
process.exitCode = assigned ? 0 : 1
