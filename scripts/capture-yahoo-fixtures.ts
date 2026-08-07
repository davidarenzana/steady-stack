/**
 * Captures Yahoo Finance responses to disk, once, by hand.
 *
 * Run with `pnpm capture:fixtures`. This is the only script in the project
 * that touches the network: task 8's tests read the files this writes and
 * never open a socket.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const USER_AGENT = 'Mozilla/5.0'
const DELAY_MS = 500

const FIXTURES_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'server/providers/__fixtures__/recorded'
)

interface CaptureRequest {
  url: string
  file: string
}

const requests: CaptureRequest[] = [
  {
    url: 'https://query2.finance.yahoo.com/v1/finance/search?q=IE00BYX5NX33&quotesCount=10&newsCount=0',
    file: 'search-IE00BYX5NX33.json'
  },
  {
    url: 'https://query2.finance.yahoo.com/v1/finance/search?q=IE0031786696&quotesCount=10&newsCount=0',
    file: 'search-IE0031786696.json'
  },
  {
    url: 'https://query2.finance.yahoo.com/v8/finance/chart/0P0001CLDK.F?range=1y&interval=1d',
    file: 'chart-0P0001CLDK.F.json'
  },
  {
    url: 'https://query2.finance.yahoo.com/v8/finance/chart/IE00BYX5NX33.SG?range=1y&interval=1d',
    file: 'chart-IE00BYX5NX33.SG.json'
  },
  {
    url: 'https://query2.finance.yahoo.com/v8/finance/chart/0P00012I6A.F?range=1y&interval=1d',
    file: 'chart-0P00012I6A.F.json'
  }
]

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function capture(request: CaptureRequest): Promise<void> {
  const response = await fetch(request.url, {
    headers: { 'User-Agent': USER_AGENT }
  })

  if (!response.ok) {
    console.error(`${request.url} responded with status ${response.status}`)
    process.exit(1)
  }

  const payload = await response.json()
  const outputPath = join(FIXTURES_DIR, request.file)
  const content = JSON.stringify(payload, null, 2)
  await writeFile(outputPath, content)

  const sizeKb = (Buffer.byteLength(content) / 1024).toFixed(1)
  console.log(`Wrote ${outputPath} (${sizeKb} kB)`)
}

async function main(): Promise<void> {
  await mkdir(FIXTURES_DIR, { recursive: true })

  for (let i = 0; i < requests.length; i++) {
    await capture(requests[i])
    if (i < requests.length - 1) {
      await sleep(DELAY_MS)
    }
  }
}

main()
