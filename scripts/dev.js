/**
 * Novel Creator — 开发服务器
 * Vite dev server（绕过 esbuild 配置加载）
 * 包含 API 代理中间件解决 CORS 问题
 */

import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

import { searchNovels, getBookInfoUrl, downloadBook, setCookies, getCookies, clearCookies } from './tomatoDownloader.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

// 拦截 esbuild 异步崩溃
process.on('uncaughtException', (err) => {
  if (err.message?.includes('spawn') || err.message?.includes('EPERM') || err.message?.includes('esbuild')) return
  console.error('[Fatal]', err)
})
process.on('unhandledRejection', (err) => {
  if (err?.message?.includes('spawn') || err?.message?.includes('EPERM') || err?.message?.includes('esbuild')) return
  console.error('[Fatal]', err)
})

async function startDev() {
  const server = await createServer({
    root,
    configFile: false,
    plugins: [
      react(),
      // API 代理：转发 POST 请求，绕开浏览器 CORS 限制
      {
        name: 'api-proxy',
        configureServer(server) {
          server.middlewares.use('/api/proxy', async (req, res) => {
            if (req.method !== 'POST') {
              res.statusCode = 405
              res.end('Method Not Allowed')
              return
            }

            let raw = ''
            for await (const chunk of req) raw += chunk

            let params
            try {
              params = JSON.parse(raw)
            } catch {
              res.statusCode = 400
              res.end('Bad Request: invalid JSON')
              return
            }

            const { url, headers, body, method = 'POST' } = params
            if (!url) {
              res.statusCode = 400
              res.end('Bad Request: missing url')
              return
            }

            try {
              const response = await fetch(url, {
                method,
                headers: headers || {},
                body: body ? JSON.stringify(body) : undefined,
                signal: AbortSignal.timeout(300000), // 5分钟超时
              })

              res.statusCode = response.status
              res.statusMessage = response.statusText
              const contentType = response.headers.get('content-type') || 'application/octet-stream'
              res.setHeader('Content-Type', contentType)

              // 流式转发（SSE 流逐块推送，不退化为全量缓冲）
              const reader = response.body.getReader()
              const decoder = new TextDecoder()
              while (true) {
                const { done, value } = await reader.read()
                if (done) break
                res.write(decoder.decode(value, { stream: true }))
              }
              res.end()
            } catch (e) {
              res.statusCode = 502
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ proxyError: e.message || String(e) }))
            }
          })
        },
      },
      // 番茄小说搜索/下载路由
      {
        name: 'tomato-import',
        configureServer(server) {
          // 搜索
          server.middlewares.use('/api/tomato/search', async (req, res) => {
            if (req.method !== 'POST') { res.statusCode = 405; res.end('Method Not Allowed'); return }
            let raw = ''
            for await (const chunk of req) raw += chunk
            try {
              const { query, count = 20 } = JSON.parse(raw)
              if (!query) { res.statusCode = 400; res.end('missing query'); return }
              const results = await searchNovels(query, count)
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ status: 'success', results }))
            } catch (e) {
              console.error('[tomato/search]', e.message)
              res.statusCode = 500
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ status: 'error', message: e.message }))
            }
          })

          // 书籍元信息（预览）
          server.middlewares.use('/api/tomato/book-info', async (req, res) => {
            if (req.method !== 'POST') { res.statusCode = 405; res.end('Method Not Allowed'); return }
            let raw = ''
            for await (const chunk of req) raw += chunk
            try {
              const { bookId } = JSON.parse(raw)
              if (!bookId) { res.statusCode = 400; res.end('missing bookId'); return }
              const info = await getBookInfoUrl(bookId)
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ status: 'success', info }))
            } catch (e) {
              console.error('[tomato/book-info]', e.message)
              res.statusCode = 500
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ status: 'error', message: e.message }))
            }
          })

          // 下载全部章节（异步任务）
          const downloadTasks = new Map()

          server.middlewares.use('/api/tomato/download', async (req, res) => {
            if (req.method !== 'POST') { res.statusCode = 405; res.end('Method Not Allowed'); return }
            let raw = ''
            for await (const chunk of req) raw += chunk
            try {
              const { bookId, chapters: chapterMeta } = JSON.parse(raw)
              if (!bookId) { res.statusCode = 400; res.end('missing bookId'); return }

              const taskId = `tomato_${bookId}_${Date.now()}`
              const chapterProgress = Array.isArray(chapterMeta)
                ? chapterMeta.map((ch) => ({ index: ch.index, title: ch.title, status: 'waiting' }))
                : []
              const task = {
                taskId,
                bookId,
                status: 'running',
                progress: 0,
                total: 0,
                chapterProgress,
                currentChapter: null, // { index, title, status }
                result: null,
                error: null,
              }
              downloadTasks.set(taskId, task)

              // 异步执行下载
              downloadBook(bookId, (current, total, title, status) => {
                task.progress = current
                task.total = total
                task.currentChapter = { index: current, title: title || '', status }
                if (task.chapterProgress && task.chapterProgress[current - 1]) {
                  task.chapterProgress[current - 1].status = status || 'done'
                }
              }).then((result) => {
                task.status = 'done'
                task.result = result
                console.log('[tomato/download] done:', bookId, result.chapterCount, 'chapters')
              }).catch((err) => {
                task.status = 'failed'
                task.error = err.message
                console.error('[tomato/download] failed:', bookId, err.message)
              })

              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ status: 'started', taskId }))
            } catch (e) {
              console.error('[tomato/download]', e.message)
              res.statusCode = 500
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ status: 'error', message: e.message }))
            }
          })

          // 下载进度轮询
          server.middlewares.use('/api/tomato/download-progress', async (req, res) => {
            if (req.method !== 'POST') { res.statusCode = 405; res.end('Method Not Allowed'); return }
            let raw = ''
            for await (const chunk of req) raw += chunk
            try {
              const { taskId } = JSON.parse(raw)
              const task = downloadTasks.get(taskId)
              if (!task) { res.statusCode = 404; res.end('task not found'); return }

              res.setHeader('Content-Type', 'application/json')
              if (task.status === 'done') {
                res.end(JSON.stringify({ status: 'done', progress: task.progress, total: task.total, result: task.result }))
                downloadTasks.delete(taskId)
              } else if (task.status === 'failed') {
                res.end(JSON.stringify({ status: 'failed', error: task.error }))
                downloadTasks.delete(taskId)
              } else {
                res.end(JSON.stringify({
                  status: 'running',
                  progress: task.progress,
                  total: task.total,
                  currentChapter: task.currentChapter,
                  chapterProgress: task.chapterProgress,
                }))
              }
            } catch (e) {
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ status: 'error', message: e.message }))
            }
          })

          // 浏览器批量下载——接收一章结果（跨域 POST）
          server.middlewares.use('/api/tomato/browser-chapter', async (req, res) => {
            // 允许跨域（浏览器在 fanqienovel.com 上执行）
            res.setHeader('Access-Control-Allow-Origin', '*')
            res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

            if (req.method === 'OPTIONS') { res.statusCode = 200; res.end(); return }
            if (req.method !== 'POST') { res.statusCode = 405; res.end('Method Not Allowed'); return }

            let raw = ''
            for await (const chunk of req) raw += chunk
            try {
              const { taskId, itemId, index, title, content, error } = JSON.parse(raw)
              const task = downloadTasks.get(taskId)
              if (task) {
                // 存储章节内容
                if (!task.browserChapters) task.browserChapters = []
                task.browserChapters.push({ index, itemId, title: title || '', content: content || '', error: error || undefined })
                
                // 更新进度状态
                if (task.chapterProgress && task.chapterProgress[index - 1]) {
                  task.chapterProgress[index - 1].status = error ? 'failed' : 'done'
                }
                task.progress = (task.browserChapters.length)
                task.currentChapter = { index, title: title || '', status: error ? 'failed' : 'done' }
              }
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ status: 'ok' }))
            } catch (e) {
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ status: 'error', message: e.message }))
            }
          })

          // 设置 Cookie（从浏览器获取，绕过 WAF 验证码）
          server.middlewares.use('/api/tomato/cookies', async (req, res) => {
            if (req.method !== 'POST') { res.statusCode = 405; res.end('Method Not Allowed'); return }
            let raw = ''
            for await (const chunk of req) raw += chunk
            try {
              const { cookies } = JSON.parse(raw)
              if (cookies) {
                setCookies(cookies)
                console.log('[tomato/cookies] Cookie 已更新')
              } else {
                clearCookies && clearCookies()
                console.log('[tomato/cookies] Cookie 已清除')
              }
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ status: 'success' }))
            } catch (e) {
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ status: 'error', message: e.message }))
            }
          })

          // 浏览器批量下载——接收并解码一章（跨域 POST）
          server.middlewares.use('/api/tomato/browser-acc', async (req, res) => {
            res.setHeader('Access-Control-Allow-Origin', '*')
            res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
            if (req.method === 'OPTIONS') { res.statusCode = 200; res.end(); return }
            if (req.method !== 'POST') { res.statusCode = 405; res.end('Method Not Allowed'); return }

            let raw = ''
            for await (const chunk of req) raw += chunk
            try {
              const { taskId, idx, title, rawContent } = JSON.parse(raw)
              const task = downloadTasks.get(taskId)
              if (!task) { res.statusCode = 404; res.end('task not found'); return }

              // 用后端的 decodeContent 解码
              if (rawContent && !task._error) {
                try {
                  const { decodeContent } = await import('./tomatoDownloader.js')
                  let text = rawContent.replace(/<\/p>/g, '\n\n').replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, '')
                  const decoded = decodeContent(text).trim()
                  if (decoded.length >= 50) {
                    if (!task.browserChapters) task.browserChapters = {}
                    task.browserChapters[String(idx)] = { index: idx, title: title || '', body: decoded }
                  }
                } catch { /* decoding failed, skip */ }
              }

              task.progress = Object.keys(task.browserChapters || {}).length
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ status: 'ok' }))
            } catch (e) {
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ status: 'error', message: e.message }))
            }
          })

          // 浏览器批量下载完成——汇总
          server.middlewares.use('/api/tomato/browser-done', async (req, res) => {
            res.setHeader('Access-Control-Allow-Origin', '*')
            res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

            if (req.method === 'OPTIONS') { res.statusCode = 200; res.end(); return }
            if (req.method !== 'POST') { res.statusCode = 405; res.end('Method Not Allowed'); return }

            let raw = ''
            for await (const chunk of req) raw += chunk
            try {
              const { taskId, bookId, bookName, author, chapters } = JSON.parse(raw)
              const task = downloadTasks.get(taskId)
              if (!task) { res.statusCode = 404; res.end('task not found'); return }

              // 转换成下载器兼容的格式
              const resultChapters = chapters.map((ch) => ({
                index: ch.index,
                title: ch.title || '',
                body: ch.body || '',
                isLocked: !!ch.error,
                error: ch.error || undefined,
              }))

              const result = {
                bookId,
                bookName: bookName || '',
                author: author || '',
                chapterCount: resultChapters.length,
                chapters: resultChapters,
                quality: { canConfirm: true, riskLevel: 'ok', blockCount: 0, warnCount: 0, issues: [] },
              }

              task.status = 'done'
              task.progress = resultChapters.length
              task.total = resultChapters.length
              task.result = result
              task.chapterProgress = resultChapters.map((ch) => ({ index: ch.index, title: ch.title, status: ch.isLocked ? 'failed' : 'done' }))

              console.log('[tomato/browser-done]', bookName, resultChapters.length, 'chapters')
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ status: 'success', chapterCount: resultChapters.length }))
            } catch (e) {
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ status: 'error', message: e.message }))
            }
          })
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(root, 'src'),
      },
    },
    server: {
      port: 5174,
      strictPort: false,
    },
    build: {
      target: 'es2020',
    },
  })

  // 尝试监听，忽略 esbuild 相关错误
  try {
    await server.listen()
  } catch (e) {
    if (e.message?.includes('spawn') || e.message?.includes('external')) {
      console.log('[Vite] 忽略 esbuild 限制，尝试继续...')
    } else {
      throw e
    }
  }

  const address = server.resolvedUrls?.local?.[0] || 'http://localhost:5173/'
  console.log(`\n  🖋️  Novel Creator — 开发模式\n`)
  console.log(`  ➜  本地: ${address}`)
  console.log(`  ➜  API 代理已启用 (CORS 规避)\n`)
}

startDev().catch((err) => {
  console.error('[Dev] 启动失败:', err.message)
  process.exit(1)
})
