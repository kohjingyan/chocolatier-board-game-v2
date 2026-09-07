import { accessSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import puppeteer from 'puppeteer-core'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const OUT_DIR = join(ROOT, 'rulebook')
const HTML = join(OUT_DIR, 'rulebook.html')
const PDF = join(OUT_DIR, 'Chocolatier-Rulebook-v2.2.1.pdf')

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean)

function findChrome() {
  for (const path of CHROME_CANDIDATES) {
    try {
      accessSync(path)
      return path
    } catch {
      /* try next */
    }
  }
  return null
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true })
  const chrome = findChrome()
  if (!chrome) {
    console.error('Chrome not found. Set CHROME_PATH or install Google Chrome.')
    process.exit(1)
  }

  const browser = await puppeteer.launch({
    executablePath: chrome,
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu'],
  })
  const page = await browser.newPage()
  await page.goto(pathToFileURL(HTML).href, { waitUntil: 'networkidle0', timeout: 60000 })
  await page.pdf({
    path: PDF,
    format: 'A5',
    printBackground: true,
    preferCSSPageSize: true,
    margin: { top: '12mm', right: '12mm', bottom: '14mm', left: '12mm' },
  })
  await browser.close()
  console.log(`Wrote ${PDF}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
