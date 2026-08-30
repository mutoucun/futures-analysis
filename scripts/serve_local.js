// 本地服务：静态文件托管 + 新浪期货日K代理（离线可用、在线实时更新）
// 用法：npm run serve  （或 node scripts/serve_local.js）
// 数据更新后先 npm run build 重新生成 dist，再启动本服务
import { createServer } from 'node:http'
import { get as httpGet } from 'node:http'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { extname, join, dirname, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { networkInterfaces } from 'node:os'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist')
const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
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

// ============ 新浪期货日K线 API 代理 ============
// Sina API 不支持 CORS，需通过本地服务中转：
//   GET /api/sina/kline?symbol=rb2509
//   GET /api/sina/kline?symbol=IF2509   (中金所走 CffexFuturesService)
function sinaKlineProxy(req, res) {
  const params = new URL(req.url, 'http://localhost').searchParams
  const symbol = params.get('symbol')
  if (!symbol) {
    res.writeHead(400, corsJsonHeaders())
    res.end(JSON.stringify({ error: 'missing symbol parameter' }))
    return
  }

  const isCffex = /^(IF|IC|IH|IM|T|TF)\d/.test(symbol)
  const service = isCffex
    ? 'CffexFuturesService.getCffexFuturesDailyKLine'
    : 'IndexService.getInnerFuturesDailyKLine'
  const apiUrl = `http://stock2.finance.sina.com.cn/futures/api/json.php/${service}?symbol=${encodeURIComponent(symbol)}`

  httpGet(apiUrl, (proxyRes) => {
    // 301/302 跟随重定向
    if (proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && proxyRes.headers.location) {
      httpGet(proxyRes.headers.location, (r2) => {
        consumeAndRespond(r2)
      }).on('error', proxyErr)
      return
    }
    consumeAndRespond(proxyRes)
  }).on('error', proxyErr)

  function consumeAndRespond(resp) {
    const chunks = []
    resp.on('data', c => chunks.push(c))
    resp.on('end', () => {
      const buf = Buffer.concat(chunks)
      // Sina 返回 charset=gbk，但日K数据全为 ASCII 数字/日期，
      // 用 UTF-8 解码不会丢失精度；TextDecoder('gbk') 在无完整 icu 的 Node 构建下可能不可用
      const text = buf.toString('utf-8')
      res.writeHead(200, corsJsonHeaders())
      res.end(text)
    })
  }

  function proxyErr(err) {
    console.error('[sina-proxy]', symbol, err.message)
    res.writeHead(502, corsJsonHeaders())
    res.end(JSON.stringify({ error: err.message }))
  }
}

function corsJsonHeaders() {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Cache-Control': 'no-cache'
  }
}

// ============ 数据更新 API ============
// 通过 Python akshare 从新浪拉取最新数据，更新 JSON 文件
//   POST /api/update  →  { success, output }
let _updating = false
function updateData(req, res) {
  if (_updating) {
    res.writeHead(409, corsJsonHeaders())
    res.end(JSON.stringify({ success: false, error: '更新正在进行中' }))
    return
  }
  _updating = true

  // 从 query string 获取品种过滤（可选），只更新指定品种时很快（几秒）
  const params = new URL(req.url, 'http://localhost').searchParams
  const symbol = params.get('symbol') || ''
  const args = ['-u', 'scripts/update_data.py']
  if (symbol) args.push(symbol.toUpperCase())

  console.log(`[update] 开始更新${symbol ? ' ' + symbol : '全部'}...`)
  const child = execFile('python', args, {
    cwd: PROJECT_ROOT,
    timeout: 300000,
    maxBuffer: 10 * 1024 * 1024,
    windowsHide: true,
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
  }, (err, stdout, stderr) => {
    console.log('[update] callback fired, err=', err ? err.message : 'null')
    _updating = false
    if (err) {
      console.error('[update] 失败:', err.message)
      res.writeHead(500, corsJsonHeaders())
      res.end(JSON.stringify({ success: false, error: stderr || err.message }))
    } else {
      console.log('[update] 完成')
      const statsMatch = stdout.match(/__STATS__(\{[^}]+\})/)
      let contractsUpdated = 0, pointsAdded = 0
      if (statsMatch) {
        try {
          const stats = JSON.parse(statsMatch[1])
          contractsUpdated = stats.contractsUpdated || 0
          pointsAdded = stats.pointsAdded || 0
        } catch { /* ignore */ }
      }
      res.writeHead(200, corsJsonHeaders())
      res.end(JSON.stringify({ success: true, contractsUpdated, pointsAdded }))
    }
  })
  child.on('error', (e) => console.error('[update] child error:', e.message))
  child.on('spawn', () => console.log('[update] child spawned, pid=', child.pid))
}

// ============ HTTP 服务 ============
const server = createServer(async (req, res) => {
  // OPTIONS 预检（CORS）
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsJsonHeaders())
    res.end()
    return
  }

  try {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)

    // API 路由
    if (urlPath === '/api/sina/kline') {
      sinaKlineProxy(req, res)
      return
    }
    if (urlPath === '/api/update') {
      updateData(req, res)
      return
    }
    // 提供 src/data/futures/ 下的 JSON 文件（更新后的原始数据，无需重建即可获取）
    if (urlPath.startsWith('/api/data/')) {
      const filename = urlPath.slice('/api/data/'.length)
      if (/^[A-Z]+_\d+\.json$/.test(filename)) {
        const dataPath = join(PROJECT_ROOT, 'src', 'data', 'futures', filename)
        try {
          const raw = await readFile(dataPath)
          res.writeHead(200, corsJsonHeaders())
          res.end(raw)
        } catch {
          res.writeHead(404, corsJsonHeaders())
          res.end(JSON.stringify({ error: 'not found' }))
        }
        return
      }
      res.writeHead(400, corsJsonHeaders())
      res.end(JSON.stringify({ error: 'invalid filename' }))
      return
    }

    // 静态文件
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
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*'
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

// 获取局域网 IP（手机访问用）
function getLanIP() {
  const nets = networkInterfaces()
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) return net.address
    }
  }
  return null
}

server.listen(PORT, '0.0.0.0', () => {
  const lanIP = getLanIP()
  console.log(`期货数据分析平台已启动:`)
  console.log(`  本机访问：http://localhost:${PORT}`)
  if (lanIP) {
    console.log(`  手机访问：http://${lanIP}:${PORT}`)
  }
  console.log('  静态文件：dist/')
  console.log('  数据代理：/api/sina/kline?symbol=<合约代码>')
  console.log('按 Ctrl+C 停止服务')
})
