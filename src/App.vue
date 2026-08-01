<template>
  <div class="app-root">
    <!-- 页面标题栏 -->
    <header class="app-header">
      <div class="header-left">
        <button class="menu-btn" title="合约列表" @click="sidebarOpen = true">
          <svg
            xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
          ><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        </button>
        <h1 class="app-title">国内期货日线数据分析平台</h1>
      </div>
      <div class="header-right">
        <button
          class="theme-btn"
          :title="isDark ? '切换到白天模式' : '切换到夜间模式'"
          @click="toggleTheme"
        >
          <svg
            v-if="isDark"
            xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
          ><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>
          <svg
            v-else
            xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
          ><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
        </button>
        <span class="update-info">数据更新：{{ dataUpdateDate }}<span class="update-suffix"> | 仅日线收盘价</span></span>
      </div>
    </header>

    <div class="app-body">
      <!-- 左侧合约列表（移动端为抽屉，桌面端常驻） -->
      <ContractSidebar
        :selected-symbol="currentSymbol"
        :open="sidebarOpen"
        @select="handleSidebarSelect"
        @close="sidebarOpen = false"
      />

      <!-- 右侧区域：筛选区固定 + 内容区滚动 -->
      <div class="right-column">
        <!-- 筛选条件操作区：固定在顶部，不随内容滚动 -->
        <div class="filter-wrap">
          <FilterBar
            ref="filterBarRef"
            :initial-symbol="currentSymbol"
            @query="handleQuery"
            @save="openSaveDialog"
          />
          <FavoritesBar
            :favorites="favorites"
            @run="runFavoriteQuery"
            @reorder="onReorder"
            @delete="onDeleteNode"
          />
        </div>

        <!-- 可滚动内容区：图表 + 数据表格 -->
        <main class="main-content">
          <!-- 图表展示区 -->
          <div class="charts-area">
            <SeasonalChart
              :seasonal-data="seasonalData"
              :cross-mode="currentCrossMode"
              :unit="currentUnit"
              :decimals="currentDecimals"
              :is-dark="isDark"
            />
            <TimeSeriesChart
              :time-series-data="timeSeriesData"
              :symbol-name="currentSymbolName"
              :cross-mode="currentCrossMode"
              :decimals="currentDecimals"
              :is-dark="isDark"
            />
          </div>

          <!-- 数据表格区 -->
          <MonthDetailTable
            :detail-data="detailData"
            :index-mode="currentIndexMode"
            :cross-mode="currentCrossMode"
            :symbol-code="currentSymbol"
            @update:index-mode="onIndexModeChange"
          />
        </main>
      </div>
    </div>

    <!-- 收藏查询弹窗 -->
    <SaveFavoriteDialog
      :visible="saveDialogVisible"
      :default-name="defaultFavName"
      :folders="favoriteFolders"
      @confirm="onFavConfirm"
      @cancel="saveDialogVisible = false"
    />
  </div>
</template>

<script>
// 首屏渲染前应用主题：优先 localStorage 设置，否则跟随系统偏好，避免闪烁
;(function initTheme() {
  try {
    const saved = localStorage.getItem('futures-theme')
    const dark = saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches
    if (dark) document.documentElement.classList.add('dark')
  } catch (e) {
    /* localStorage 不可用时忽略，默认白天模式 */
  }
})()
</script>

<script setup>
import { ref, computed, onMounted } from 'vue'
import ContractSidebar from './components/ContractSidebar.vue'
import FilterBar from './components/FilterBar.vue'
import SeasonalChart from './components/SeasonalChart.vue'
import TimeSeriesChart from './components/TimeSeriesChart.vue'
import MonthDetailTable from './components/MonthDetailTable.vue'
import FavoritesBar from './components/FavoritesBar.vue'
import SaveFavoriteDialog from './components/SaveFavoriteDialog.vue'
import {
  findSymbol,
  getSymbolDecimals,
  getSeasonalData,
  getTimeSeriesData,
  getMonthlyDetailData,
  getCrossSeasonalData,
  getCrossTimeSeriesData,
  getCrossMonthlyDetailData,
  getCrossMonthSeasonalData,
  getCrossMonthTimeSeriesData,
  getCrossMonthDetailData,
  getDataUpdateDate
} from './mock/data.js'
// 真实数据按需加载：查询前动态导入对应 品种+月份 的 JSON（首屏 bundle 只含文件清单）
import { ensureRealData } from './data/index.js'

const filterBarRef = ref(null)
// 移动端合约列表抽屉开关（桌面端不使用）
const sidebarOpen = ref(false)
const currentSymbol = ref('RB')
const currentSymbolB = ref('HC')
const currentIndexMode = ref('percent')
// 记录最近一次查询的合约月份与年份范围，供表头切换指标模式时重新取数使用
const currentContractMonth = ref('09')
const currentYearRange = ref('all')
// 当前分析类型：single | crossMonth | crossSymbol | crossRatio
const currentAnalyzeType = ref('single')
// 跨月价差的两个合约月份
const currentMonthA = ref('09')
const currentMonthB = ref('01')
// '' = 单合约 | 'spread' = 价差（跨月/跨品种） | 'ratio' = 跨品种比值
const currentCrossMode = ref('')
const dataUpdateDate = ref(getDataUpdateDate())

// 白天 / 夜间主题（首屏已由前置脚本应用 html.dark 类）
const isDark = ref(document.documentElement.classList.contains('dark'))

function toggleTheme() {
  isDark.value = !isDark.value
  document.documentElement.classList.toggle('dark', isDark.value)
  try {
    localStorage.setItem('futures-theme', isDark.value ? 'dark' : 'light')
  } catch (e) {
    /* 存储不可用时仅本次会话生效 */
  }
}

const seasonalData = ref({ years: [], data: {} })
const timeSeriesData = ref({ dates: [], closes: [] })
const detailData = ref({ contracts: [], rows: [] })

// ===== 收藏夹（参考浏览器书签：可存查询、分文件夹、前后移动）=====
// 节点结构：文件夹 { id, type:'folder', name, children:[...] } / 收藏项 { id, type:'item', name, query }
const favorites = ref([])
const saveDialogVisible = ref(false)
const pendingQuery = ref(null)
const defaultFavName = ref('')
const favoriteFolders = computed(() => favorites.value.filter(n => n.type === 'folder'))

const currentSymbolName = computed(() => {
  const symA = findSymbol(currentSymbol.value)
  if (!symA) return ''
  const t = currentAnalyzeType.value
  if (t === 'single') return `${symA.name} ${symA.code}`
  if (t === 'crossMonth') {
    return `${symA.name}${symA.code} ${currentMonthA.value}-${currentMonthB.value} 价差`
  }
  // 跨品种价差 / 比值
  const symB = findSymbol(currentSymbolB.value)
  const sep = t === 'crossRatio' ? ' / ' : ' - '
  const suffix = t === 'crossRatio' ? ' 比值' : ' 价差'
  return `${symA.code}${sep}${symB ? symB.code : ''}${suffix}`
})

// 品种A的价格单位（季节性叠线图Y轴名称使用）
const currentUnit = computed(() => {
  const sym = findSymbol(currentSymbol.value)
  return sym ? sym.unit : ''
})

// 品种A的价格显示小数位（按最小变动价位，整数品种为0）
const currentDecimals = computed(() => getSymbolDecimals(currentSymbol.value))

/**
 * 核心查询逻辑：
 * 模拟将筛选参数传给后端接口，返回三类数据并渲染
 * 单合约入参：{ analyzeType:'single', symbol, contractMonth, yearRange, indexMode }
 * 跨月价差入参：{ analyzeType:'crossMonth', symbol, contractMonth, contractMonthB, yearRange }
 * 跨品种入参：{ analyzeType:'crossSymbol'|'crossRatio', symbol, symbolB, crossMode, contractMonth, yearRange }
 */
// 查询序号：快速连续查询时，先发出的查询后加载完数据也不覆盖新查询结果
let querySeq = 0

async function fetchData(params) {
  const { symbol, contractMonth, yearRange, indexMode, analyzeType } = params
  const seq = ++querySeq

  // 按需预加载真实数据 JSON：跨月价差需同品种两个月份，跨品种需两个品种同一月份；
  // 无真实文件的品种/月份 ensureRealData 返回 false，后续取数自动回退 mock
  const loads = [ensureRealData(symbol, contractMonth)]
  if (analyzeType === 'crossMonth') {
    loads.push(ensureRealData(symbol, params.contractMonthB))
  } else if (analyzeType === 'crossSymbol' || analyzeType === 'crossRatio') {
    loads.push(ensureRealData(params.symbolB, contractMonth))
  }
  await Promise.all(loads)
  if (seq !== querySeq) return // 已有更新的查询发出，丢弃本次过期结果

  // 真实数据就绪后刷新顶部"数据更新"日期（首次加载前显示 mock 兜底日期）
  dataUpdateDate.value = getDataUpdateDate()

  currentSymbol.value = symbol
  currentAnalyzeType.value = analyzeType
  currentContractMonth.value = contractMonth
  currentYearRange.value = yearRange

  if (analyzeType === 'crossMonth') {
    // 跨月价差：同品种、两个到期月份
    const monthB = params.contractMonthB
    currentMonthA.value = contractMonth
    currentMonthB.value = monthB
    currentCrossMode.value = 'spread'
    // 价差明细展示价差涨跌值（绝对数值），指标模式固定"涨跌值"
    currentIndexMode.value = 'absolute'
    seasonalData.value = getCrossMonthSeasonalData(symbol, contractMonth, monthB, yearRange)
    timeSeriesData.value = getCrossMonthTimeSeriesData(symbol, contractMonth, monthB)
    detailData.value = getCrossMonthDetailData(symbol, contractMonth, monthB, yearRange)
  } else if (analyzeType === 'crossSymbol' || analyzeType === 'crossRatio') {
    // 跨品种价差 / 比值：两个品种、同一合约月份
    const { symbolB, crossMode } = params
    currentSymbolB.value = symbolB
    currentCrossMode.value = crossMode
    // 价差明细展示价差涨跌值、比值明细展示比值水平（绝对数值），指标模式固定"涨跌值"
    currentIndexMode.value = 'absolute'
    seasonalData.value = getCrossSeasonalData(symbol, symbolB, contractMonth, yearRange, crossMode)
    timeSeriesData.value = getCrossTimeSeriesData(symbol, symbolB, contractMonth, crossMode)
    detailData.value = getCrossMonthlyDetailData(symbol, symbolB, contractMonth, crossMode, yearRange)
  } else {
    // 单合约：指标模式保留表头当前选择（初始加载时由入参指定）
    currentCrossMode.value = ''
    if (indexMode) currentIndexMode.value = indexMode
    seasonalData.value = getSeasonalData(symbol, contractMonth, yearRange)
    timeSeriesData.value = getTimeSeriesData(symbol, contractMonth)
    detailData.value = getMonthlyDetailData(symbol, contractMonth, currentIndexMode.value, yearRange)
  }
}

// 表头切换指标模式：单合约明细数据依赖该口径，需按当前查询条件重新取数
function onIndexModeChange(mode) {
  currentIndexMode.value = mode
  if (currentAnalyzeType.value === 'single') {
    detailData.value = getMonthlyDetailData(
      currentSymbol.value,
      currentContractMonth.value,
      mode,
      currentYearRange.value
    )
  }
}

// ===== 收藏夹逻辑 =====
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

function loadFavorites() {
  try {
    const s = localStorage.getItem('futures-favorites')
    if (s) favorites.value = JSON.parse(s)
  } catch (e) {
    favorites.value = []
  }
}

function persistFavorites() {
  try {
    localStorage.setItem('futures-favorites', JSON.stringify(favorites.value))
  } catch (e) {
    /* 存储不可用时仅本次会话生效 */
  }
}

// 根据查询参数自动生成收藏名，如：螺纹钢09 / 螺纹钢09-01价差 / 豆粕09-菜粕09 / 豆粕09/菜粕09比值
function buildFavName(q) {
  const a = findSymbol(q.symbol)
  const an = a ? a.name : q.symbol
  if (q.analyzeType === 'single') return `${an}${q.contractMonth}`
  if (q.analyzeType === 'crossMonth') return `${an}${q.contractMonth}-${q.contractMonthB}价差`
  const b = findSymbol(q.symbolB)
  const bn = b ? b.name : q.symbolB
  if (q.analyzeType === 'crossRatio') return `${an}${q.contractMonth}/${bn}${q.contractMonth}比值`
  return `${an}${q.contractMonth}-${bn}${q.contractMonth}`
}

function openSaveDialog() {
  const q = filterBarRef.value.getQuery()
  pendingQuery.value = q
  defaultFavName.value = buildFavName(q)
  saveDialogVisible.value = true
}

function onFavConfirm({ name, folderId, newFolderName }) {
  const item = { id: uid(), type: 'item', name, query: { ...pendingQuery.value } }
  if (folderId === '__new__') {
    favorites.value.push({ id: uid(), type: 'folder', name: newFolderName, children: [item] })
  } else if (folderId === '__none__') {
    favorites.value.push(item)
  } else {
    const folder = favorites.value.find(n => n.id === folderId && n.type === 'folder')
    if (folder) folder.children.push(item)
    else favorites.value.push(item)
  }
  persistFavorites()
  saveDialogVisible.value = false
}

// 点击收藏夹：回填筛选控件并立即查询
function runFavoriteQuery(query) {
  filterBarRef.value.applyQuery(query)
  fetchData(query)
}

// 拖拽排序：把 dragId 移动到 targetId 的前面/后面（仅同一容器内：顶层 或 同一文件夹）
function onReorder({ dragId, targetId, pos }) {
  if (!dragId || !targetId || dragId === targetId) return

  // 都在顶层
  const dragTop = favorites.value.findIndex(n => n.id === dragId)
  const targetTop = favorites.value.findIndex(n => n.id === targetId)
  if (dragTop >= 0 && targetTop >= 0) {
    reorderInArray(favorites.value, dragId, targetId, pos)
    persistFavorites()
    return
  }

  // 都在同一个文件夹内
  for (const f of favorites.value) {
    if (f.type !== 'folder') continue
    const di = f.children.findIndex(c => c.id === dragId)
    const ti = f.children.findIndex(c => c.id === targetId)
    if (di >= 0 && ti >= 0) {
      reorderInArray(f.children, dragId, targetId, pos)
      persistFavorites()
      return
    }
  }
}

function reorderInArray(arr, dragId, targetId, pos) {
  const di = arr.findIndex(n => n.id === dragId)
  if (di < 0) return
  const [node] = arr.splice(di, 1)
  let ti = arr.findIndex(n => n.id === targetId)
  if (ti < 0) {
    arr.splice(di, 0, node) // 目标不存在则放回原位
    return
  }
  if (pos === 'after') ti += 1
  arr.splice(ti, 0, node)
}

function onDeleteNode(id) {
  const ti = favorites.value.findIndex(n => n.id === id)
  if (ti >= 0) {
    favorites.value.splice(ti, 1)
  } else {
    for (const f of favorites.value) {
      if (f.type !== 'folder') continue
      const ci = f.children.findIndex(c => c.id === id)
      if (ci >= 0) {
        f.children.splice(ci, 1)
        break
      }
    }
  }
  persistFavorites()
}

function handleQuery(params) {
  fetchData(params)
}

function handleSidebarSelect(symbolCode) {
  currentSymbol.value = symbolCode
  // 移动端选中后收起抽屉
  sidebarOpen.value = false
  // 左侧列表选择品种后，使用当前筛选条件自动查询
  // 注意：defineExpose 暴露的 ref 经模板引用自动解包，无需 .value
  const filterBar = filterBarRef.value
  if (filterBar) {
    fetchData({
      analyzeType: filterBar.analyzeType,
      symbol: symbolCode,
      symbolB: filterBar.symbolB,
      crossMode: filterBar.crossMode,
      contractMonth: filterBar.contractMonth,
      contractMonthB: filterBar.contractMonthB,
      yearRange: filterBar.yearRange
    })
  }
}

// 初始加载：默认 螺纹钢RB 09合约 全部历史 涨跌百分比
onMounted(() => {
  loadFavorites()
  fetchData({
    analyzeType: 'single',
    symbol: 'RB',
    contractMonth: '09',
    yearRange: 'all',
    indexMode: 'percent'
  })
})
</script>

<style>
/* ===== 白天模式（默认）主题变量 ===== */
:root {
  color-scheme: light;
  --bg-page: #f4f6f9;
  --bg-card: #ffffff;
  --bg-header: #fafafa;
  --bg-hover: #f7f9fc;
  --bg-active: #f0f6ff;
  --bg-active-strong: #e6f0ff;
  --bg-disabled: #f7f7f7;
  --border: #e8e8e8;
  --border-light: #f0f0f0;
  --border-cell: #eee;
  --border-ctrl: #d9d9d9;
  --border-group: #f5f5f5;
  --border-dropdown: #e0e0e0;
  --text-primary: #333;
  --text-444: #444;
  --text-secondary: #555;
  --text-666: #666;
  --text-tertiary: #999;
  --text-disabled: #bbb;
  --text-placeholder: #ccc;
  --accent: #1a6fe0;
  --accent-hover: #1259b8;
  --accent-active: #0e4a9a;
  --accent-bg: #eef4fd;
  --accent-bg-hover: #dceafb;
  --accent-border: #c8dcf5;
  --accent-disabled-bg: #c5d5ec;
  --accent-focus: rgba(26, 111, 224, 0.1);
  /* 红涨绿跌 */
  --up-text: #d4380d;
  --up-bg: #fff1f0;
  --down-text: #0b7a3e;
  --down-bg: #f0fff4;
  --flat-text: #666;
  --flat-bg: #fafafa;
  --na-text: #ccc;
  --badge-bg: #f0f0f0;
  --caret: #999;
  --stats-sep: #bbb;
  --stats-border: #e0e0e0;
  --scroll-thumb: #b6bdc9;
  --scroll-thumb-hover: #98a1b0;
  --shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
}

/* ===== 夜间模式主题变量（红涨绿跌采用高亮色，保证深色背景下清晰醒目） ===== */
html.dark {
  color-scheme: dark;
  --bg-page: #12151c;
  --bg-card: #1b202b;
  --bg-header: #212736;
  --bg-hover: #232a38;
  --bg-active: #22304a;
  --bg-active-strong: #26364f;
  --bg-disabled: #232936;
  --border: #2b3242;
  --border-light: #262d3b;
  --border-cell: #2a3140;
  --border-ctrl: #3a4356;
  --border-group: #232a38;
  --border-dropdown: #343d50;
  --text-primary: #dde2ea;
  --text-444: #c3cad6;
  --text-secondary: #aeb6c4;
  --text-666: #98a1b3;
  --text-tertiary: #7d8798;
  --text-disabled: #566073;
  --text-placeholder: #4d5666;
  --accent: #4d94f0;
  --accent-hover: #6aa5f4;
  --accent-active: #3a83dd;
  --accent-bg: #1d2c44;
  --accent-bg-hover: #243650;
  --accent-border: #33507a;
  --accent-disabled-bg: #2c3a52;
  --accent-focus: rgba(77, 148, 240, 0.18);
  /* 红涨绿跌：深底上用高明度红绿 */
  --up-text: #f5704e;
  --up-bg: #3a2320;
  --down-text: #3ecf8e;
  --down-bg: #1c3229;
  --flat-text: #98a1b3;
  --flat-bg: #212736;
  --na-text: #4d5666;
  --badge-bg: #2b3242;
  --caret: #7d8798;
  --stats-sep: #566073;
  --stats-border: #3a4356;
  --scroll-thumb: #3a4356;
  --scroll-thumb-hover: #4a5568;
  --shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
}

/* 全局样式重置 */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Hiragino Sans GB',
    'Microsoft YaHei', 'Helvetica Neue', Helvetica, Arial, sans-serif;
  background: var(--bg-page);
  color: var(--text-primary);
  font-size: 14px;
  -webkit-font-smoothing: antialiased;
  transition: background-color 0.25s ease, color 0.25s ease;
}

::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-thumb {
  background: var(--scroll-thumb);
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: var(--scroll-thumb-hover);
}

::-webkit-scrollbar-track {
  background: transparent;
}
</style>

<style scoped>
.app-root {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}

.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 52px;
  min-height: 52px;
  background: var(--bg-card);
  border-bottom: 1px solid var(--border);
  padding: 0 20px;
  transition: background-color 0.25s ease, border-color 0.25s ease;
}

.app-title {
  font-size: 17px;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: 0.5px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

/* 汉堡菜单按钮：仅移动端显示（打开合约列表抽屉） */
.menu-btn {
  display: none;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  color: var(--text-666);
  background: var(--bg-card);
  border: 1px solid var(--border-ctrl);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.menu-btn:active {
  color: var(--accent);
  border-color: var(--accent);
  background: var(--accent-bg);
}

.header-right {
  display: flex;
  align-items: center;
  gap: 14px;
}

.theme-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  color: var(--text-666);
  background: var(--bg-card);
  border: 1px solid var(--border-ctrl);
  border-radius: 50%;
  cursor: pointer;
  transition: all 0.2s;
}

.theme-btn:hover {
  color: var(--accent);
  border-color: var(--accent);
  background: var(--accent-bg);
}

.update-info {
  font-size: 12px;
  color: var(--text-tertiary);
}

.app-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.right-column {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 筛选区固定在顶部，不参与滚动 */
.filter-wrap {
  flex-shrink: 0;
  padding: 14px 18px 0;
}

.main-content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 14px 18px 24px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* 关键：滚动区子项不收缩（.table-card 等带 overflow:hidden 的卡片
   min-height 被视为 0，若允许收缩会被压扁而不触发滚动），
   保持自然高度溢出后由 .main-content 整页滚动 */
.main-content > * {
  flex-shrink: 0;
}

.charts-area {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* ===== 移动端适配 ===== */
@media (max-width: 768px) {
  .menu-btn {
    display: inline-flex;
  }

  .app-header {
    height: 48px;
    min-height: 48px;
    padding: 0 12px;
  }

  .app-title {
    font-size: 15px;
    letter-spacing: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .header-right {
    gap: 8px;
    flex-shrink: 0;
  }

  .update-info {
    font-size: 11px;
  }

  .update-suffix {
    display: none;
  }

  /* 移动端取消筛选区置顶固定：整列合并为一个滚动区，
     筛选条件随内容一起滚走，图表/表格获得完整视口高度 */
  .right-column {
    overflow-y: auto;
  }

  .filter-wrap {
    padding: 10px 10px 0;
  }

  .main-content {
    overflow: visible;
    flex: none;
    padding: 10px 10px 20px;
    gap: 10px;
  }

  .charts-area {
    gap: 10px;
  }
}
</style>
