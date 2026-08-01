<template>
  <div class="chart-card">
    <div class="chart-header">
      <span class="chart-title">季节性叠线图</span>
      <div class="header-actions">
        <div class="sort-toggle" title="悬停提示框内年份的排序方式">
          <span class="sort-toggle-label">排序</span>
          <button
            :class="['sort-btn', { active: tooltipSort === 'year' }]"
            @click="tooltipSort = 'year'"
          >按年份</button>
          <button
            :class="['sort-btn', { active: tooltipSort === 'value' }]"
            @click="tooltipSort = 'value'"
          >按数值</button>
        </div>
        <button class="toggle-btn" @click="collapsed = !collapsed">
          {{ collapsed ? '展开' : '收起' }}
        </button>
      </div>
    </div>
    <div v-show="!collapsed" class="chart-body">
      <div class="chart-main">
        <div ref="chartRef" class="chart-container"></div>
      </div>
      <div class="year-panel">
        <div class="year-panel-title">年份选择</div>
        <div class="year-list">
          <label
            v-for="year in years"
            :key="year"
            :class="['year-check', { active: activeYear === year }]"
            @mouseenter="onYearHover(year)"
            @mouseleave="onYearLeave"
          >
            <input
              type="checkbox"
              :checked="visibleYears.includes(year)"
              @change="toggleYear(year)"
            />
            <span class="year-dot" :style="{ background: yearColors[year] }"></span>
            <span>{{ year }}</span>
          </label>
        </div>
        <div class="year-actions">
          <button class="mini-btn" @click="selectAll">全选</button>
          <button class="mini-btn" @click="selectNone">清空</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import * as echarts from 'echarts'

const props = defineProps({
  seasonalData: { type: Object, default: () => ({ years: [], dates: [], data: {} }) },
  crossMode: { type: String, default: '' }, // '' | 'spread' | 'ratio'
  unit: { type: String, default: '' }, // 价格单位（单合约模式显示在Y轴名称中）
  decimals: { type: Number, default: 2 }, // 价格显示小数位（按品种最小变动价位）
  isDark: { type: Boolean, default: false } // 夜间模式
})

// ECharts 内部配色随主题切换（CSS变量无法作用于canvas，需JS联动）
const chartTheme = computed(() => props.isDark ? {
  axisLine: '#3a4356',
  axisLabel: '#8a93a6',
  splitLine: '#262d3b',
  tooltipBg: 'rgba(27,32,43,0.96)',
  tooltipBorder: '#2b3242',
  tooltipText: '#dde2ea',
  tooltipShadow: '0 4px 16px rgba(0,0,0,0.5)',
  tooltipActiveBg: 'rgba(77,148,240,0.18)',
  upColor: '#f5704e',
  downColor: '#3ecf8e'
} : {
  axisLine: '#d9d9d9',
  axisLabel: '#666',
  splitLine: '#f0f0f0',
  tooltipBg: 'rgba(255,255,255,0.96)',
  tooltipBorder: '#e8e8e8',
  tooltipText: '#333',
  tooltipShadow: '0 4px 16px rgba(0,0,0,0.12)',
  tooltipActiveBg: 'rgba(26,111,224,0.08)',
  upColor: '#e0453a',
  downColor: '#2ba471'
})

// Y轴名称：单合约为收盘价走势，跨品种/跨月为价差、比值走势
const yAxisName = computed(() => {
  if (props.crossMode === 'spread') return '价差值'
  if (props.crossMode === 'ratio') return '比值'
  return props.unit ? `收盘价(${props.unit})` : '收盘价'
})

// 红绿分界阈值：比值以1为界，其余以0为界（仅跨品种/跨月模式的tooltip着色使用）
const colorThreshold = computed(() => (props.crossMode === 'ratio' ? 1 : 0))

const chartRef = ref(null)
const collapsed = ref(false)
// 悬停提示框排序方式：'year'=按年份升序 | 'value'=按当前数值降序
const tooltipSort = ref('value')
// 可选年份列表（来自查询结果，模板 v-for 依赖此绑定）
const years = computed(() => props.seasonalData.years || [])
const visibleYears = ref([])
// 当前高亮年份（悬停年份面板项 或 悬停图中曲线时联动）
const activeYear = ref(null)
let chart = null

// 悬停年份面板项：突出对应曲线（其余变淡），并加粗该年份
function onYearHover(year) {
  activeYear.value = year
  if (chart && visibleYears.value.includes(year)) {
    chart.dispatchAction({ type: 'highlight', seriesName: String(year) })
  }
}

function onYearLeave() {
  if (chart && activeYear.value !== null) {
    chart.dispatchAction({ type: 'downplay', seriesName: String(activeYear.value) })
  }
  activeYear.value = null
}

// 年份颜色分配（参照原型多色曲线）
// 前16色按色相均匀分布、明度错开，避免任意两个年份撞色；
// 且不包含红(#e0453a)/蓝(#1a6fe0)——这两色预留给最近两年（见 assignColors）
const COLOR_PALETTE = [
  '#10b981', '#f59e0b', '#8b5cf6', '#0ea5c9', '#ec4899',
  '#84cc16', '#d946ef', '#14b8a6', '#eab308', '#6366f1',
  '#f97316', '#65a30d', '#a16207', '#64748b', '#c084fc',
  '#2dd4bf', '#94a3b8', '#fb923c', '#4ade80', '#f472b6', '#a3e635'
]

const yearColors = ref({})

function assignColors(years) {
  const colors = {}
  years.forEach((y, i) => {
    colors[y] = COLOR_PALETTE[i % COLOR_PALETTE.length]
  })
  // 特殊年份高亮：最近年份用醒目颜色
  if (years.length > 0) {
    const lastYear = years[years.length - 1]
    colors[lastYear] = '#e0453a'
    if (years.length > 1) {
      colors[years[years.length - 2]] = '#1a6fe0'
    }
  }
  yearColors.value = colors
}

function buildOption() {
  const dates = props.seasonalData.dates || []
  const maxYear = visibleYears.value.length ? Math.max(...visibleYears.value) : 0

  // 横轴刻度：每月首个交易日显示「X月」，其余刻度隐藏
  const monthLabelAt = new Map()
  let lastMonth = ''
  dates.forEach((d, i) => {
    const mm = d.slice(0, 2)
    if (mm !== lastMonth) {
      monthLabelAt.set(i, `${parseInt(mm, 10)}月`)
      lastMonth = mm
    }
  })

  const series = visibleYears.value.map(year => ({
    name: String(year),
    type: 'line',
    data: props.seasonalData.data[year] || [],
    smooth: false,
    showSymbol: false, // 日线点密集，默认不显示数据点标记
    symbol: 'circle',
    symbolSize: 4,
    lineStyle: {
      width: year === maxYear ? 2.5 : 1.5,
      color: yearColors.value[year]
    },
    itemStyle: { color: yearColors.value[year] },
    connectNulls: true, // 跨年交易日并集中非本年交易日的位置直接连线
    // 悬停单线仅淡出其他年份（focus），绝不加粗——多线加粗重叠会遮挡走势
    emphasis: { focus: 'series' }
  }))

  const th = chartTheme.value
  return {
    tooltip: {
      trigger: 'axis',
      // 挂到 body 上，避免被卡片 overflow:hidden 裁剪或被年份面板遮挡
      appendToBody: true,
      backgroundColor: th.tooltipBg,
      borderColor: th.tooltipBorder,
      borderWidth: 1,
      extraCssText: `box-shadow: ${th.tooltipShadow};`,
      textStyle: { color: th.tooltipText, fontSize: 13 },
      formatter: (params) => {
        const md = params[0].axisValue // 'MM-DD'
        const title = `${parseInt(md.slice(0, 2), 10)}月${parseInt(md.slice(3), 10)}日`
        let html = `<div style="font-weight:600;margin-bottom:4px">${title}</div>`
        // 排序可切换：按年份升序 / 按当前数值降序
        const sorted = tooltipSort.value === 'year'
          ? [...params].sort((a, b) => Number(a.seriesName) - Number(b.seriesName))
          : [...params].sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity))
        const threshold = colorThreshold.value
        const isPrice = !props.crossMode
        for (const p of sorted) {
          if (p.value === null || p.value === undefined) continue
          // 价格按品种最小变动价位的小数位显示（整数品种无小数）；比值4位、价差2位
          const val = props.crossMode === 'ratio'
            ? p.value.toFixed(4)
            : props.crossMode === 'spread'
              ? p.value.toFixed(2)
              : p.value.toFixed(props.decimals)
          // 价格模式：数值用该年份曲线同色，一眼对应走势线；价差/比值保留红涨绿跌
          const lineColor = yearColors.value[p.seriesName]
          const color = isPrice
            ? (lineColor || th.tooltipText)
            : (p.value >= threshold ? th.upColor : th.downColor)
          // 鼠标点中单条走势线（元素级 mouseover 置 activeYear）→ 该行加同色边框+底色突出，字号保持常规；
          // 竖线扫过多年的常规多选（activeYear 为空）→ 所有行保持常规样式，不做突出
          const isActive = activeYear.value !== null && Number(p.seriesName) === activeYear.value
          const frame = isActive
            ? `border:1px solid ${lineColor || th.tooltipBorder};border-radius:4px;background:${th.tooltipActiveBg};`
            : ''
          // 自定义大圆点替代默认 marker：与曲线同色、尺寸醒目，圆点-年份-数值一行对应
          const dot = `<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${lineColor || p.color};flex-shrink:0"></span>`
          html += `<div style="display:flex;align-items:center;gap:7px;margin:3px 0;padding:2px 6px;${frame}">
            ${dot}<span style="font-size:13px;${isActive ? 'font-weight:700;' : ''}">${p.seriesName}</span>
            <span style="margin-left:auto;font-size:14px;font-weight:700;color:${color}">${val}</span>
          </div>`
        }
        return html
      }
    },
    grid: {
      left: 60,
      right: 20,
      top: 30,
      bottom: 36
    },
    xAxis: {
      type: 'category',
      data: dates,
      boundaryGap: false,
      axisLine: { lineStyle: { color: th.axisLine } },
      axisLabel: {
        color: th.axisLabel,
        fontSize: 12,
        interval: 0,
        formatter: (value, index) => monthLabelAt.get(index) || ''
      },
      axisTick: { show: false }
    },
    yAxis: {
      type: 'value',
      name: yAxisName.value,
      scale: true,
      nameTextStyle: { color: th.axisLabel, fontSize: 12, padding: [0, 0, 0, -20] },
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: th.axisLabel, fontSize: 12 },
      splitLine: { lineStyle: { color: th.splitLine, type: 'dashed' } }
    },
    series
  }
}

function renderChart() {
  if (!chart) return
  chart.setOption(buildOption(), true)
}

function toggleYear(year) {
  const idx = visibleYears.value.indexOf(year)
  if (idx >= 0) {
    visibleYears.value.splice(idx, 1)
  } else {
    visibleYears.value.push(year)
  }
  visibleYears.value.sort()
  renderChart()
}

function selectAll() {
  visibleYears.value = [...props.seasonalData.years]
  renderChart()
}

function selectNone() {
  visibleYears.value = []
  renderChart()
}

watch(() => props.seasonalData, (val) => {
  if (val && val.years) {
    assignColors(val.years)
    // 默认显示全部年份
    visibleYears.value = [...val.years]
    nextTick(renderChart)
  }
}, { deep: true })

watch(() => [props.crossMode, props.unit], () => {
  nextTick(renderChart)
})

// 明/暗主题切换时重绘图表
watch(() => props.isDark, () => {
  nextTick(renderChart)
})

watch(collapsed, (val) => {
  if (!val) {
    nextTick(() => chart && chart.resize())
  }
})

onMounted(() => {
  chart = echarts.init(chartRef.value)
  // 鼠标命中单条走势线：元素级 mouseover（ECharts 转发时带 seriesName）。
  // 注意：元素 hover 只切 emphasis 态、不派发 highlight 动作，不能靠 chart.on('highlight') 捕获
  chart.on('mouseover', (params) => {
    if (params.componentType === 'series' && params.seriesName != null) {
      activeYear.value = Number(params.seriesName)
      // zrender 同一帧内先派发 mousemove（tooltip 已用旧状态渲染）、后派发 mouseover，
      // 此处强制刷新 tooltip，否则鼠标停在线上时突出框不会出现
      const ev = params.event
      if (ev && ev.offsetX != null) {
        chart.dispatchAction({ type: 'showTip', x: ev.offsetX, y: ev.offsetY })
      }
    }
  })
  // 离开走势线 → 恢复常规多选态；仅当离开的正是当前激活年份时清除（兼容跨线 A→B 的事件顺序）
  chart.on('mouseout', (params) => {
    if (params.componentType === 'series' && Number(params.seriesName) === activeYear.value) {
      activeYear.value = null
      // 同样强制刷新，避免鼠标停在线外空白处时旧的高亮框残留
      const ev = params.event
      if (ev && ev.offsetX != null) {
        chart.dispatchAction({ type: 'showTip', x: ev.offsetX, y: ev.offsetY })
      }
    }
  })
  // 年份面板悬停经 dispatchAction 派发 highlight/downplay -> 同步激活年份（与面板联动）
  chart.on('highlight', (params) => {
    if (params.seriesName) activeYear.value = Number(params.seriesName)
  })
  chart.on('downplay', (params) => {
    // 竖线 tooltip 经 axisPointer 派发 batch 式 downplay（多选），不得清除单线命中状态
    if (params.batch) return
    // 仅当取消高亮的正是当前激活年份时清除，避免年份间快速移动时误清
    if (params.seriesName == null || Number(params.seriesName) === activeYear.value) {
      activeYear.value = null
    }
  })
  window.addEventListener('resize', handleResize)
  if (props.seasonalData.years.length) {
    assignColors(props.seasonalData.years)
    visibleYears.value = [...props.seasonalData.years]
    renderChart()
  }
})

function handleResize() {
  chart && chart.resize()
}

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  if (chart) {
    chart.dispose()
    chart = null
  }
})
</script>

<style scoped>
.chart-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 4px;
  overflow: hidden;
  transition: background 0.25s, border-color 0.25s;
}

.chart-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 18px;
  border-bottom: 1px solid var(--border-light);
}

.chart-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.toggle-btn {
  padding: 4px 16px;
  font-size: 12px;
  color: var(--accent);
  background: var(--accent-bg);
  border: 1px solid var(--accent-border);
  border-radius: 3px;
  cursor: pointer;
  transition: all 0.2s;
}

.toggle-btn:hover {
  background: var(--accent-bg-hover);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.sort-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
}

.sort-toggle-label {
  font-size: 12px;
  color: var(--text-tertiary);
}

.sort-btn {
  padding: 3px 10px;
  font-size: 12px;
  color: var(--text-666);
  background: var(--bg-card);
  border: 1px solid var(--border-ctrl);
  cursor: pointer;
  transition: all 0.2s;
}

.sort-btn:first-of-type {
  border-radius: 3px 0 0 3px;
}

.sort-btn:last-of-type {
  border-radius: 0 3px 3px 0;
  margin-left: -1px;
}

.sort-btn:hover {
  color: var(--accent);
  border-color: var(--accent);
}

.sort-btn.active {
  position: relative;
  color: var(--accent);
  background: var(--accent-bg);
  border-color: var(--accent);
  z-index: 1;
}

.chart-body {
  display: flex;
  padding: 10px 12px 12px;
}

.chart-main {
  flex: 1;
  min-width: 0;
}

.chart-container {
  width: 100%;
  height: 340px;
}

.year-panel {
  width: 110px;
  min-width: 110px;
  border-left: 1px solid var(--border-light);
  margin-left: 12px;
  padding-left: 12px;
  display: flex;
  flex-direction: column;
}

.year-panel-title {
  font-size: 12px;
  color: var(--text-tertiary);
  margin-bottom: 8px;
  font-weight: 500;
}

.year-list {
  flex: 1;
  overflow-y: auto;
  max-height: 300px;
}

.year-check {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 4px;
  margin: 0 -4px;
  font-size: 12px;
  color: var(--text-secondary);
  cursor: pointer;
  user-select: none;
  border-radius: 3px;
  transition: background 0.15s;
}

.year-check:hover {
  background: var(--bg-hover, rgba(0, 0, 0, 0.04));
}

/* 高亮年份：加粗 + 主题色，与图中加粗曲线联动 */
.year-check.active {
  color: var(--accent);
  font-weight: 700;
  background: var(--accent-bg);
}

.year-check input[type="checkbox"] {
  width: 13px;
  height: 13px;
  accent-color: var(--accent);
  cursor: pointer;
}

.year-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}

.year-actions {
  display: flex;
  gap: 6px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--border-light);
}

.mini-btn {
  flex: 1;
  padding: 3px 0;
  font-size: 11px;
  border: 1px solid var(--border-ctrl);
  border-radius: 3px;
  background: var(--bg-card);
  color: var(--text-666);
  cursor: pointer;
  transition: all 0.2s;
}

.mini-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

/* ===== 移动端适配 ===== */
@media (max-width: 768px) {
  .chart-header {
    padding: 10px 12px;
    flex-wrap: wrap;
    gap: 8px;
  }

  .chart-body {
    flex-direction: column;
    padding: 8px 8px 12px;
  }

  .chart-container {
    height: 280px;
  }

  /* 年份面板移到图表下方，横向流式排布 */
  .year-panel {
    width: auto;
    min-width: 0;
    border-left: none;
    margin-left: 0;
    padding-left: 0;
    border-top: 1px dashed var(--border-light);
    margin-top: 10px;
    padding-top: 10px;
  }

  .year-list {
    display: flex;
    flex-wrap: wrap;
    gap: 2px 8px;
    max-height: none;
    overflow: visible;
  }

  .year-check {
    margin: 0;
    padding: 4px 6px;
  }

  .year-actions {
    margin-top: 6px;
  }
}
</style>
