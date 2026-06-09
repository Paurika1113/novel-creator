/**
 * 番茄小说在线下载器
 *
 * 移植自 novel_agent (blackzhanzhan) 的 Python 实现，
 * 纯 Node.js 实现，无外部依赖。
 * 用于 dev.js 的 /api/tomato/* 路由。
 *
 * API：
 *   searchNovels(query, count)         → 搜索结果
 *   getBookInfoUrl(bookId)              → 书名/作者/章节数
 *   downloadBook(bookId, onProgress)    → 全部章节正文
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ─── 常量 ───────────────────────────────────────────────

const UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.230 Mobile Safari/537.36'

const BOOK_PAGE_URL = (id) => `https://fanqienovel.com/page/${id}`
const READER_PAGE_URL = (id) => `https://fanqienovel.com/reader/${id}`
const CHAPTER_API_URL = 'https://fanqienovel.com/api/reader/full'

const CODE_RANGES = [
  [58344, 58715],
  [58345, 58716],
]

// ─── charset 解码 ───────────────────────────────────────

let _charsetMap = null

function loadCharset() {
  if (_charsetMap) return _charsetMap
  const p = path.join(__dirname, '_tomato_charset.json')
  if (!existsSync(p)) throw new Error('_tomato_charset.json not found')
  _charsetMap = JSON.parse(readFileSync(p, 'utf-8'))
  return _charsetMap
}

/**
 * 番茄小说的自定义字符集反混淆
 * 每个字符落在两个 code range 之一，对应 charset 表中偏移位置的字
 */
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
        if (bias >= 0 && bias < arr.length && arr[bias] !== '?') {
          decoded = arr[bias]
        }
        break
      }
    }
    out.push(decoded)
  }
  return out.join('')
}

// ─── HTTP 工具 ──────────────────────────────────────────

const HEADERS = {
  'User-Agent': UA,
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.5',
  'Accept-Encoding': 'gzip, deflate',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
}

function randomDelay() {
  return Math.floor(Math.random() * 1000) + 500
}

// ─── Cookie 管理层 ──────────────────────────────────────
// 用户从浏览器粘贴的 Cookie，用于绕过 WAF 验证码

let _cookies = ''

/** 设置浏览器 Cookie（完整 Cookie 头字符串） */
export function setCookies(cookieString) {
  _cookies = (cookieString || '').trim()
}

/** 获取当前 Cookie */
export function getCookies() {
  return _cookies
}

/** 清除 Cookie（恢复无 Cookie 模式） */
export function clearCookies() {
  _cookies = ''
}

async function fetchText(url, extraHeaders = {}) {
  let lastErr
  const maxRetries = 5
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // 如果有浏览器 Cookie，优先使用；且不再传随机 cookie
      const headers = { ...HEADERS, ...extraHeaders }
      if (_cookies && !headers.cookie) {
        headers.cookie = _cookies
      }

      const resp = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(30000),
      })

      const text = await resp.text()

      // 检测验证码中间页
      if (text.includes('验证码中间页')) {
        if (attempt < maxRetries) {
          const delay = Math.min(2000 * Math.pow(1.5, attempt - 1), 10000) + randomDelay()
          await new Promise((r) => setTimeout(r, delay))
          continue
        }
        // 最后一次重试仍失败，给出明确指引
        const hint = _cookies
          ? '验证码触发频繁，请前往浏览器访问 fanqienovel.com，Ctrl+F5 强制刷新通过验证后，重新复制 Cookie 粘贴到工具中'
          : 'Web 应用防火墙拦截了请求，请在番茄小说网页版 (fanqienovel.com) 登录后，复制浏览器 Cookie 粘贴到下方的 Cookie 设置中'
        throw new Error(hint)
      }

      return text
    } catch (e) {
      lastErr = e.message || String(e)
      if (attempt < maxRetries) {
        const delay = Math.min(2000 * Math.pow(1.5, attempt - 1), 10000) + randomDelay()
        await new Promise((r) => setTimeout(r, delay))
      }
    }
  }
  throw new Error(`请求失败（已重试 ${maxRetries} 次）：${lastErr}`)
}

// ─── __INITIAL_STATE__ 提取 ─────────────────────────────

function extractInitialState(html) {
  const marker = 'window.__INITIAL_STATE__='
  const idx = html.indexOf(marker)
  if (idx < 0) return null

  // 跳过 = 后面的空白
  let start = idx + marker.length
  while (start < html.length && (html[start] === ' ' || html[start] === '\t' || html[start] === '\n' || html[start] === '\r')) start++

  // 追踪 JS 对象深度，同时跳过字符串内部的 {} 和正则字面量
  let depth = 0
  let end = start
  let inString = false
  let stringChar = ''
  let escaped = false
  let inRegex = false

  for (let i = start; i < Math.min(start + 600000, html.length); i++) {
    const c = html[i]

    if (inString) {
      if (escaped) { escaped = false; continue }
      if (c === '\\') { escaped = true; continue }
      if (c === stringChar) inString = false
      if (c === '\n') inString = false // unterminated string guard
      continue
    }

    if (inRegex) {
      if (escaped) { escaped = false; continue }
      if (c === '\\') { escaped = true; continue }
      if (c === '/') inRegex = false
      continue
    }

    if (c === '"' || c === "'") {
      inString = true
      stringChar = c
      escaped = false
      continue
    }

    if (c === '/') {
      // 简单判断：如果前一个字符是行起始或空格/运算符/punctuation，可能是正则
      const prev = i > 0 ? html[i - 1] : ' '
      if (prev === ' ' || prev === '=' || prev === '(' || prev === '[' || prev === ',' || prev === ':' || prev === '!' || prev === '&' || prev === '|' || prev === '{' || prev === ';') {
        inRegex = true
        escaped = false
        continue
      }
    }

    if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) { end = i + 1; break }
    }
  }

  let raw = html.slice(start, end)
  raw = raw.replace(/:undefined/g, ':null').replace(/,undefined/g, ',null')
  try {
    return JSON.parse(raw)
  } catch (parseErr) {
    // 截取前后的片段以帮助诊断
    const preview = raw.slice(0, 200) + '...(truncated)...' + raw.slice(-100)
    throw new Error(`Failed to parse __INITIAL_STATE__ (${parseErr.message}).\nRaw length: ${raw.length}, expected end at HTML offset ${end}.\nPreview: ${preview}`)
  }
}

// ─── 书籍元数据解析 ─────────────────────────────────────

function parsePageMeta(state) {
  const page = state.page || {}
  return {
    bookName: page.bookName || '',
    author: page.author || '',
    abstract: page.abstract || '',
    wordCount: page.wordCount || 0,
  }
}

function parseChapterList(state) {
  // 优先 chapterListWithVolume（正序，有锁定状态）
  const volumes = state.page?.chapterListWithVolume
  if (Array.isArray(volumes) && volumes.length > 0) {
    const chapters = []
    for (const vol of volumes) {
      for (const ch of vol) {
        chapters.push({
          itemId: String(ch.itemId || ''),
          title: ch.title || '',
          isLocked: !!ch.isChapterLock,
        })
      }
    }
    if (chapters.length > 0) return chapters
  }

  // 备选1：chapterList（逆序，含标题，仅最后 N 条）
  const chList = state.page?.chapterList
  const chMap = {}
  if (Array.isArray(chList)) {
    for (const ch of chList) {
      chMap[String(ch.itemId || ch.item_id || '')] = ch.title || ch.chapter_title || ''
    }
  }

  // 备选2：flat itemIds（逆序！先反转）
  let itemIds = state.page?.itemIds
  if (!itemIds || !Array.isArray(itemIds)) {
    itemIds = state.tocItem?.itemIds
  }
  if (!Array.isArray(itemIds) || itemIds.length === 0) {
    throw new Error('No chapter IDs found')
  }

  // itemIds 是从最新到最早的逆序，反转成正序
  const reversed = [...itemIds].reverse()

  return reversed.map((id) => ({
    itemId: String(id),
    title: chMap[String(id)] || '',
    isLocked: false,
  }))
}

// ─── 单章下载策略 ───────────────────────────────────────

/**
 * 策略1：Reader 页面爬取（最可靠）
 */
async function fetchViaReader(cid) {
  try {
    const html = await fetchText(READER_PAGE_URL(cid))
    const state = extractInitialState(html)
    if (!state) return null

    const cd = state.reader?.chapterData
    if (!cd) return null

    const title = cd.title || ''
    const contentHtml = cd.content || ''
    if (!contentHtml) return null

    // 保留段落结构后剥离标签
    let text = contentHtml.replace(/<\/p>/g, '\n\n')
    text = text.replace(/<br\s*\/?>/g, '\n')
    text = text.replace(/<[^>]+>/g, '')
    const content = decodeContent(text).trim()
    if (content.length < 50) return null

    return { title, content }
  } catch {
    return null
  }
}

/**
 * 策略2：官方 API + charset 解码
 */
async function fetchViaApi(cid) {
  const url = `${CHAPTER_API_URL}?itemId=${cid}`
  const json = await fetchText(url)
  const body = JSON.parse(json)

  // API 返回错误码表示章节不可用
  if (body.code != null && body.code !== 0) {
    throw new Error(`API error: ${body.message || body.code}`)
  }

  const chapterData = body.data?.chapterData
  if (!chapterData) throw new Error('Empty chapter data from API')

  const title = chapterData.title || ''
  const encoded = chapterData.content || ''
  if (!encoded) throw new Error('Empty content from API')

  const content = decodeContent(encoded).trim()
  if (content.length < 50) throw new Error(`Content too short (${content.length} chars) — likely locked or placeholder`)
  return { title, content }
}

/**
 * 下载单章（三策略降级）
 */
async function downloadChapter(cid, metaTitle) {
  // 策略1：reader 页面
  let result = await fetchViaReader(cid)
  if (result) return result

  // 策略2：官方 API
  result = await fetchViaApi(cid)
  if (result) return result

  throw new Error(`Failed to download chapter ${cid}`)
}

// ─── 公共接口 ───────────────────────────────────────────

/**
 * 搜索番茄小说
 * 优先直接根据 bookId 直查（最可靠），
 * 搜索页返回的内容是异步加载的，不在 __INITIAL_STATE__ 中，已不再支持。
 */
export async function searchNovels(query, count = 20) {
  // 如果输入是 bookId 或 URL，直接查详情
  const bookIdMatch = query.match(/(\d{12,22})/)
  if (bookIdMatch) {
    const info = await getBookInfoUrl(bookIdMatch[1])
    return [info]
  }

  // 搜索页的结果是 JS 异步加载的，不再支持关键词搜索
  throw new Error('关键词搜索暂不可用。请直接输入番茄小说 bookId（数字），或 fanqienovel.com/page/<book_id> URL')
}

/**
 * 获取书籍元信息（不下载章节）
 */
export async function getBookInfoUrl(bookId) {
  const html = await fetchText(BOOK_PAGE_URL(bookId))
  const state = extractInitialState(html)
  if (!state) throw new Error(`Cannot parse book page for ${bookId}`)

  const meta = parsePageMeta(state)

  // 书名为空时说明这本书可能已下架或不存在
  if (!meta.bookName) throw new Error(`书籍信息为空（bookId: ${bookId}），可能已下架或不存在`)

  const chapters = parseChapterList(state)

  return {
    bookId,
    bookName: meta.bookName,
    author: meta.author,
    abstract: meta.abstract,
    wordCount: meta.wordCount,
    chapterCount: chapters.length,
    chapters: chapters.map((ch, i) => ({
      index: i + 1,
      itemId: ch.itemId,
      title: ch.title || `第${i + 1}章`,
      isLocked: ch.isLocked,
    })),
  }
}

/**
 * 下载书籍全部章节正文
 * onProgress(index, total) 进度回调
 */
export async function downloadBook(bookId, onProgress) {
  // 先获取元信息 + 章节列表
  const info = await getBookInfoUrl(bookId)
  const total = info.chapters.length
  const chapters = []

  for (let i = 0; i < total; i++) {
    const ch = info.chapters[i]

    // 开始下载前通知（让前端显示"正在下载"状态）
    if (onProgress) onProgress(i + 1, total, ch.title || `第${ch.index}章`, 'downloading')

    let resultTitle = ''
    let resultBody = ''
    let resultError = null

    try {
      const { title, content } = await downloadChapter(ch.itemId, ch.title)
      resultTitle = title
      resultBody = content
    } catch (err) {
      resultError = err.message
    }

    chapters.push({
      index: ch.index,
      title: resultTitle || ch.title,
      body: resultBody,
      isLocked: !!resultError,
      error: resultError || undefined,
    })

    if (onProgress) onProgress(i + 1, total, ch.title || `第${ch.index}章`, resultError ? 'failed' : 'done')

    // 降频
    if (i < total - 1) await new Promise((r) => setTimeout(r, 400))
  }

  // 质量检查
  const quality = evaluateQuality(chapters)

  return {
    bookId,
    bookName: info.bookName,
    author: info.author,
    chapterCount: chapters.length,
    chapters,
    quality,
  }
}

// ─── 质量检查 ───────────────────────────────────────────

function evaluateQuality(chapters) {
  const issues = []
  if (chapters.length === 0) {
    issues.push({ severity: 'block', code: 'NO_CHAPTERS', message: '没有下载到任何章节。' })
  }

  const seenHashes = new Map()
  for (const ch of chapters) {
    const label = `${String(ch.index).padStart(4, '0')} ${ch.title}`
    const nws = ch.body.replace(/\s/g, '').length

    if (ch.isLocked) {
      issues.push({ severity: 'warn', code: 'LOCKED', message: ch.error ? `章节暂时无法下载 (${ch.error})` : '章节已锁定，无法下载', chapter: label })
    } else if (!ch.body.trim()) {
      issues.push({ severity: 'block', code: 'EMPTY', message: '章节正文为空', chapter: label })
    } else if (nws < 80) {
      issues.push({ severity: 'block', code: 'TOO_SHORT', message: '章节正文过短（' + nws + '字），疑似下载失败', chapter: label })
    } else if (nws < 300) {
      issues.push({ severity: 'warn', code: 'SHORT', message: '章节正文偏短（' + nws + '字）', chapter: label })
    }

    if (ch.error && !ch.isLocked) {
      issues.push({ severity: 'block', code: 'DOWNLOAD_ERROR', message: `下载失败: ${ch.error}`, chapter: label })
    }

    // 内容 hash 排重
    const hash = simpleHash(ch.body)
    if (seenHashes.has(hash)) {
      issues.push({
        severity: 'block', code: 'DUPLICATE', message: '章节内容重复',
        chapter: label, first: seenHashes.get(hash),
      })
    } else {
      seenHashes.set(hash, label)
    }
  }

  const blockCount = issues.filter((i) => i.severity === 'block').length
  const warnCount = issues.filter((i) => i.severity === 'warn').length

  return {
    canConfirm: blockCount === 0,
    riskLevel: blockCount ? 'block' : warnCount ? 'warn' : 'ok',
    blockCount,
    warnCount,
    issues,
  }
}

function simpleHash(str) {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + c
    hash |= 0
  }
  return String(hash)
}
