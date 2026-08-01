// 零依赖本地静态服务：离线访问构建产物 dist/
// 用法：npm run serve  （或 node scripts/serve_local.js）
// 数据更新后先 npm run build 重新生成 dist，再启动本服务
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { extname, join, dirname, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist')
const PORT = process.env.PORT || 4173

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
}

if (!existsSync(join(ROOT, 'index.html'))) {
  console.error('未找到 dist/index.html，请先在项目目录运行: npm run build')
  process.exit(1)
}

const server = createServer(async (req, res) => {
  try {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
    let filePath = normalize(join(ROOT, urlPath))
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403)
      res.end('Forbidden')
      return
    }
    let data
    try {
      data = await readFile(filePath)
    } catch {
      // SPA 回退：未命中的路径统一返回 index.html
      filePath = join(ROOT, 'index.html')
      data = await readFile(filePath)
    }
    res.writeHead(200, {
      'Content-Type': MIME[extname(filePath)] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    })
    res.end(data)
  } catch (err) {
    res.writeHead(500)
    res.end(String(err))
  }
})

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`端口 ${PORT} 已被占用（服务可能已在运行），直接访问 http://localhost:${PORT}`)
    process.exit(0)
  }
  throw err
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`期货数据分析平台已启动（离线可用）: http://localhost:${PORT}`)
  console.log('按 Ctrl+C 停止服务')
})
