import { writeFileSync } from 'fs'
import { readFileSync, existsSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SCRIPTS_DIR = path.resolve(__dirname, 'scripts')

// Copy of decode logic
const CODE_RANGES = [[58344, 58715], [58345, 58716]]

function loadCharset() {
  return JSON.parse(readFileSync(path.join(SCRIPTS_DIR, '_tomato_charset.json'), 'utf-8'))
}

function decodeContent(encoded) {
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

// The browser data will be injected here
// We'll save chapter data incrementally
const outputPath = path.resolve(__dirname, '_browser_book_data.json')

export function saveChapter(chapterData) {
  const { idx, title, rawContent } = chapterData
  if (!rawContent || rawContent.length < 10) return { idx, title, error: 'empty content' }
  
  let text = rawContent.replace(/<\/p>/g, '\n\n').replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, '')
  const decoded = decodeContent(text).trim()
  
  if (decoded.length < 50) return { idx, title, error: `too short (${decoded.length})` }
  
  // Read existing data
  let data = { chapters: {}, bookName: '', author: '' }
  if (existsSync(outputPath)) {
    try { data = JSON.parse(readFileSync(outputPath, 'utf-8')) } catch {}
  }
  
  data.chapters[String(idx)] = { index: idx, title, body: decoded, isLocked: false }
  
  writeFileSync(outputPath, JSON.stringify(data, null, 2), 'utf-8')
  return { idx, title, decodedLength: decoded.length, total: Object.keys(data.chapters).length }
}

export function finalizeBook(bookName, author) {
  let data = { chapters: {} }
  if (existsSync(outputPath)) {
    try { data = JSON.parse(readFileSync(outputPath, 'utf-8')) } catch {}
  }
  data.bookName = bookName
  data.author = author
  writeFileSync(outputPath, JSON.stringify(data, null, 2), 'utf-8')
  
  const chs = Object.values(data.chapters)
  const totalLen = chs.reduce((s, c) => s + (c.body || '').length, 0)
  return { chapterCount: chs.length, totalWords: totalLen }
}
