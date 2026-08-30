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
          class="refresh-btn"
          :class="{ 'is-loading': isRefreshing, 'is-done': refreshDone }"
          :disabled="isRefreshing"
          :title="isRefreshing ? '正在获取最新数据...' : '从新浪获取最新日K数据'"
          @click="handleRefresh"
        >
          <svg
            v-if="refreshDone"
            xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
          ><polyline points="20 6 9 17 4 12"/></svg>
          <svg
            v-else
            xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
          ><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
        </button>
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
          <!-- 无真实数据空态 -->
          <div v-if="noRealData" class="no-data-placeholder">
            <p class="no-data-icon">📭</p>
            <p class="no-data-text">该品种暂无历史数据</p>
          </div>

          <template v-else>
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
              :contract-a-data="contractAData"
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
          </template>
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

    <!-- 数据刷新结果提示 -->
    <transition name="toast">
      <div v-if="refreshToast" class="refresh-toast" :class="refreshToast.type">
        {{ refreshToast.msg }}
      </div>
    </transition>
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
// 新浪实时数据刷新：点击刷新按钮从 Sina 拉取最新日K并合并进内存
import { refreshAll, refreshAllFromServer } from './services/sina.js'

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
// 当前查询是否无真实数据（true 时图表区显示空态提示，不渲染 mock）
const noRealData = ref(false)

// ===== 数据刷新（从新浪拉取最新日K并合并）=====
const isRefreshing = ref(false)
const refreshDone = ref(false)
const refreshToast = ref(null)
let _refreshToastTimer = null

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
const contractAData = ref(null) // 跨月/跨品种时：合约A原始价格 { dates, closes, name }
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

  // 按需预加载真实数据 JSON：跨月价差需同品种两个月份，跨品种需两个品种同一月份
  const loads = [ensureRealData(symbol, contractMonth)]
  if (analyzeType === 'crossMonth') {
    loads.push(ensureRealData(symbol, params.contractMonthB))
  } else if (analyzeType === 'crossSymbol' || analyzeType === 'crossRatio') {
    loads.push(ensureRealData(params.symbolB, contractMonth))
  }
  const results = await Promise.all(loads)
  if (seq !== querySeq) return // 已有更新的查询发出，丢弃本次过期结果

  // 主查询无真实数据时，不渲染图表，显示空态提示
  if (!results[0]) {
    noRealData.value = true
    seasonalData.value = null
    timeSeriesData.value = null
    detailData.value = null
    currentSymbol.value = symbol
    currentContractMonth.value = contractMonth
    return
  }
  noRealData.value = false

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
    contractAData.value = { ...getTimeSeriesData(symbol, contractMonth), name: `${findSymbol(symbol).name} ${contractMonth}月` }
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
    contractAData.value = { ...getTimeSeriesData(symbol, contractMonth), name: `${findSymbol(symbol).name} ${contractMonth}月` }
    detailData.value = getCrossMonthlyDetailData(symbol, symbolB, contractMonth, crossMode, yearRange)
  } else {
    // 单合约：指标模式保留表头当前选择（初始加载时由入参指定）
    currentCrossMode.value = ''
    if (indexMode) currentIndexMode.value = indexMode
    seasonalData.value = getSeasonalData(symbol, contractMonth, yearRange)
    timeSeriesData.value = getTimeSeriesData(symbol, contractMonth)
    contractAData.value = null
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

/**
 * 刷新按钮：从新浪获取当前查看品种的最新日K数据
 * 合并进内存后重新执行查询，图表自动更新，无需重新构建
 */
async function handleRefresh() {
  if (isRefreshing.value) return
  isRefreshing.value = true
  refreshDone.value = false
  refreshToast.value = null
  if (_refreshToastTimer) { clearTimeout(_refreshToastTimer); _refreshToastTimer = null }

  try {
    // 获取当前查询参数（优先 FilterBar 最新状态）
    const fb = filterBarRef.value
    const query = fb ? fb.getQuery() : {
      analyzeType: currentAnalyzeType.value,
      symbol: currentSymbol.value,
      contractMonth: currentContractMonth.value,
      symbolB: currentSymbolB.value,
      contractMonthB: currentMonthB.value,
      yearRange: currentYearRange.value,
      indexMode: currentIndexMode.value
    }

    // 提示用户正在更新（Python 脚本需约 1 分钟）
    refreshToast.value = { type: 'info', msg: '正在从交易所拉取最新数据，请稍候…' }

    const result = await refreshAllFromServer(query)

    if (result.success) {
      // 更新顶部日期显示
      dataUpdateDate.value = getDataUpdateDate()
      noRealData.value = false
      // 重新执行当前查询以刷新图表
      await fetchData(query)
      // 按钮切换为成功状态
      refreshDone.value = true
      const msg = result.pointsAdded > 0
        ? `数据已更新（${result.contractsUpdated} 个合约，+${result.pointsAdded} 个新数据点）`
        : `已是最新（${result.contractsUpdated} 个合约）`
      refreshToast.value = { type: 'success', msg }
      setTimeout(() => { refreshDone.value = false }, 2500)
    } else {
      refreshToast.value = { type: 'error', msg: result.error || '更新失败，请检查本地服务是否启动' }
    }
  } catch (err) {
    refreshToast.value = { type: 'error', msg: `刷新异常: ${err.message || err}` }
  } finally {
    isRefreshing.value = false
    // Toast 5 秒后自动消失（更新过程较长，给更多阅读时间）
    _refreshToastTimer = setTimeout(() => { refreshToast.value = null }, 5000)
  }
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
  /* 红涨绿跌：深底白字 */
  --up-text: #fff;
  --up-bg: #cf1322;
  --down-text: #fff;
  --down-bg: #389e0d;
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
  /* 红涨绿跌：深底白字 */
  --up-text: #fff;
  --up-bg: #a61d24;
  --down-text: #fff;
  --down-bg: #237804;
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

/* 刷新数据按钮 */
.refresh-btn {
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

.refresh-btn:hover:not(:disabled) {
  color: var(--accent);
  border-color: var(--accent);
  background: var(--accent-bg);
}

.refresh-btn:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.refresh-btn.is-loading svg {
  animation: spin 0.8s linear infinite;
}

.refresh-btn.is-done {
  color: #3ecf8e;
  border-color: #3ecf8e;
  background: #f0fff4;
}

html.dark .refresh-btn.is-done {
  color: #3ecf8e;
  border-color: #2a6b4e;
  background: #1c3229;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* 刷新结果 Toast 提示 */
.refresh-toast {
  position: fixed;
  top: 60px;
  left: 50%;
  transform: translateX(-50%);
  padding: 8px 20px;
  border-radius: 6px;
  font-size: 13px;
  z-index: 9999;
  pointer-events: none;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
}

.refresh-toast.success {
  background: #f0fff4;
  color: #0b7a3e;
  border: 1px solid #b7eb8f;
}

html.dark .refresh-toast.success {
  background: #1c3229;
  color: #3ecf8e;
  border-color: #2a6b4e;
}

.refresh-toast.error {
  background: #fff1f0;
  color: #d4380d;
  border: 1px solid #ffa39e;
}

html.dark .refresh-toast.error {
  background: #3a2320;
  color: #f5704e;
  border-color: #6b3028;
}

.refresh-toast.info {
  background: #e6f7ff;
  color: #096dd9;
  border: 1px solid #91d5ff;
}

html.dark .refresh-toast.info {
  background: #112a45;
  color: #69c0ff;
  border-color: #15508a;
}

.toast-enter-active, .toast-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}

.toast-enter-from, .toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-10px);
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

.no-data-placeholder {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 300px;
  gap: 12px;
}
.no-data-icon {
  font-size: 48px;
  margin: 0;
  opacity: 0.6;
}
.no-data-text {
  font-size: 15px;
  color: var(--text-secondary, #888);
  margin: 0;
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

  .no-data-placeholder {
    min-height: 200px;
  }

  .no-data-icon {
    font-size: 36px;
  }

  .no-data-text {
    font-size: 14px;
  }

  /* Toast 在移动端需要更靠近顶部（header 矮了 4px） */
  .refresh-toast {
    top: 54px;
    font-size: 12px;
    padding: 7px 14px;
    max-width: calc(100vw - 24px);
    text-align: center;
  }
}
</style>
