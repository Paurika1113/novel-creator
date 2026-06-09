import { readFileSync, writeFileSync, existsSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SCRIPTS_DIR = path.resolve(__dirname, 'scripts')
const OUTPUT = path.resolve(__dirname, '_browser_raw.json')

const CODE_RANGES = [[58344, 58715], [58345, 58716]]

function loadCharset() {
  return JSON.parse(readFileSync(path.join(SCRIPTS_DIR, '_tomato_charset.json'), 'utf-8'))
}

export function decodeContent(encoded) {
  const charset = loadCharset()
  const out = []
  for (let i = 0; i < encoded.length; i++) {
    const cp = encoded.charCodeAt(i)
    let decoded = encoded[i]
    for (let mode = 0; mode < CODE_RANGES.length; mode++) {
      const [start, end] = CODE_RANGES[mode]
      if (cp >= start && cp < end) {
        const bias = cp - start
        const arr = charset[mode]
        if (bias >= 0 && bias < arr.length && arr[bias] !== '?') decoded = arr[bias]
        break
      }
    }
    out.push(decoded)
  }
  return out.join('')
}

// Load existing data
let data = { chapters: {} }
if (existsSync(OUTPUT)) {
  try { data = JSON.parse(readFileSync(OUTPUT, 'utf-8')) } catch {}
}

// Add chapters from cli args
const args = process.argv.slice(2)
if (args.length > 0) {
  // Accept JSON array of chapters from stdin
  let input = ''
  process.stdin.on('data', chunk => input += chunk)
  process.stdin.on('end', () => {
    try {
      const chapters = JSON.parse(input)
      for (const ch of chapters) {
        if (ch.rawContent && ch.rawContent.length > 10) {
          let text = ch.rawContent.replace(/<\/p>/g, '\n\n').replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, '')
          const decoded = decodeContent(text).trim()
          if (decoded.length >= 50) {
            data.chapters[String(ch.idx)] = { index: ch.idx, title: ch.title, body: decoded, isLocked: false }
          }
        }
      }
      writeFileSync(OUTPUT, JSON.stringify(data, null, 2), 'utf-8')
      console.log('Saved:', Object.keys(data.chapters).length, 'chapters')
    } catch(e) {
      console.error('Parse error:', e.message)
    }
  })
} else {
  console.log('Total saved:', Object.keys(data.chapters).length)
}
