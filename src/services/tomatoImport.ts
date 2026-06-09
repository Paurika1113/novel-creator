/**
 * 番茄小说导入 API 客户端
 * 通过 dev.js 代理进行搜索、预览和下载
 */

export interface TomatoSearchResult {
  bookId: string
  bookName: string
  author: string
  wordCount: number
  chapterCount: number
  coverUrl: string
  abstract: string
}

export interface TomatoChapterMeta {
  index: number
  itemId: string
  title: string
  isLocked: boolean
}

export interface BookInfo {
  bookId: string
  bookName: string
  author: string
  abstract: string
  wordCount: number
  chapterCount: number
  chapters: TomatoChapterMeta[]
}

export interface TomatoChapter {
  index: number
  title: string
  body: string
  isLocked: boolean
  error?: string
}

export interface QualityIssue {
  severity: 'block' | 'warn'
  code: string
  message: string
  chapter?: string
  first?: string
}

export interface Quality {
  canConfirm: boolean
  riskLevel: 'ok' | 'warn' | 'block'
  blockCount: number
  warnCount: number
  issues: QualityIssue[]
}

export interface DownloadResult {
  bookId: string
  bookName: string
  author: string
  chapterCount: number
  chapters: TomatoChapter[]
  quality: Quality
}

async function tomatoFetch(path: string, body: unknown): Promise<any> {
  const resp = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  })

  // 确保响应是 JSON（代理出错时可能返回纯文本）
  const text = await resp.text()
  let data: any
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error(`服务器返回了非 JSON 响应 (HTTP ${resp.status}): ${text.slice(0, 200)}`)
  }

  if (data.status === 'error') throw new Error(data.message)
  return data
}

/** 搜索番茄小说 */
export async function searchTomatoNovels(query: string, count = 20): Promise<TomatoSearchResult[]> {
  const data = await tomatoFetch('/api/tomato/search', { query, count })
  return data.results
}

/** 获取书籍预览信息 */
export async function getTomatoBookInfo(bookId: string): Promise<BookInfo> {
  const data = await tomatoFetch('/api/tomato/book-info', { bookId })
  return data.info
}

/** 发起异步下载，返回 taskId */
export async function startTomatoDownload(bookId: string, chapters?: Array<{ index: number; title: string }>): Promise<string> {
  const data = await tomatoFetch('/api/tomato/download', { bookId, chapters })
  return data.taskId
}

/** 轮询下载进度 */
export async function pollDownloadProgress(taskId: string): Promise<{
  status: 'running' | 'done' | 'failed'
  progress?: number
  total?: number
  result?: DownloadResult
  error?: string
  currentChapter?: { index: number; title: string; status: string }
  chapterProgress?: Array<{ index: number; title: string; status: string }>
}> {
  return tomatoFetch('/api/tomato/download-progress', { taskId })
}

/** 设置浏览器 Cookie（从番茄小说网页版复制） */
export async function setTomatoCookies(cookies: string): Promise<void> {
  await tomatoFetch('/api/tomato/cookies', { cookies })
}

/** 清除 Cookie */
export async function clearTomatoCookies(): Promise<void> {
  await tomatoFetch('/api/tomato/cookies', { cookies: '' })
}
