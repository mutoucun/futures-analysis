// 一键发布：提交本地改动并推送到 GitHub，Pages 由 Actions 在云端自动构建部署。
// 用法：npm run deploy [提交说明]
import { execSync } from 'node:child_process'

function run(cmd, opts = {}) {
  console.log('> ' + cmd)
  return execSync(cmd, { stdio: 'inherit', ...opts })
}

function quiet(cmd) {
  try {
    execSync(cmd, { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

// 1. 暂存所有改动
run('git add -A')

// 2. 有改动才提交
if (quiet('git diff --cached --quiet')) {
  console.log('没有新的改动，跳过提交。')
} else {
  const msg = process.argv[2] || 'update: ' + new Date().toISOString().slice(0, 10)
  run(`git commit -m "${msg.replace(/"/g, '')}"`)
}

// 3. 推送（触发 GitHub Actions 自动构建发布）
run('git push')

console.log('')
console.log('推送完成，GitHub Actions 正在云端构建并发布，约 1-2 分钟后线上生效。')
console.log('可在仓库 Actions 页面查看进度。')
