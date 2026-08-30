import { createServer } from 'node:http'
import { execFile } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
let _updating = false

const server = createServer(async (req, res) => {
  if (req.url === '/api/update' && req.method === 'POST') {
    if (_updating) { res.end(JSON.stringify({ error: 'busy' })); return }
    _updating = true
    console.log('[update] start, cwd=', PROJECT_ROOT)
    const child = execFile('python', ['-u', 'scripts/update_data.py', 'RB'], {
      cwd: PROJECT_ROOT,
      timeout: 300000,
      maxBuffer: 10 * 1024 * 1024,
      windowsHide: true,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
    }, (err, stdout, stderr) => {
      console.log('[update] callback, err=', err ? err.message : 'null')
      _updating = false
      if (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: false, error: err.message }))
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: true, stdout: stdout.slice(-200) }))
      }
    })
    child.on('error', (e) => console.error('[update] child error:', e.message))
    child.on('spawn', () => console.log('[update] spawned pid=', child.pid))
    return
  }
  res.end('test server')
})

server.listen(4177, () => console.log('test on 4177, PROJECT_ROOT=' + PROJECT_ROOT))
