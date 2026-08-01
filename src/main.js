import { createApp } from 'vue'
import App from './App.vue'

// PWA 版本更新自动刷新：registerType autoUpdate 会让新 SW skipWaiting 接管，
// 但已打开的页面仍持有旧 SW 缓存的旧 bundle（表现为数据停在旧版本）。
// 监听 controller 切换（旧 SW → 新 SW）自动刷新一次页面，使新版本立即生效。
// hadController 守卫：首次访问时 controller 从 null 变为首个 SW 也触发该事件，
// 此时不应刷新，仅记录"已有 SW 接管"，之后再次切换才是真正的版本更新。
if ('serviceWorker' in navigator) {
  let hadController = !!navigator.serviceWorker.controller
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) {
      window.location.reload()
    } else {
      hadController = true
    }
  })
}

createApp(App).mount('#app')
