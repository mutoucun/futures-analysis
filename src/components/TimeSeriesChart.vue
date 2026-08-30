<template>
  <div class="chart-card">
    <div class="chart-header">
      <span class="chart-title">连续时序图</span>
      <div class="header-actions">
        <button
          v-if="props.crossMode && props.contractAData"
          :class="['toggle-btn', { active: showContractA }]"
          @click="toggleContractA"
        >
          {{ showContractA ? '隐藏' : '显示' }}合约A价格
        </button>
        <button class="toggle-btn" @click="toggleExpand">
          {{ expanded ? '收起' : '展开' }}
        </button>
      </div>
    </div>
    <div class="chart-body">
      <div ref="chartRef" :class="['chart-container', { expanded: expanded }]"></div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import * as echarts from 'echarts'

const props = defineProps({
  timeSeriesData: { type: Object, default: () => ({ dates: [], closes: [] }) },
  contractAData: { type: Object, default: null }, // { dates, closes, name } or null
  symbolName: { type: String, default: '' },
  crossMode: { type: String, default: '' }, // '' | 'spread' | 'ratio'
  decimals: { type: Number, default: 2 }, // 价格显示小数位（按品种最小变动价位）
  isDark: { type: Boolean, default: false } // 夜间模式
})

// ECharts 内部配色随主题切换（CSS变量无法作用于canvas，需JS联动）
const chartTheme = computed(() => props.isDark ? {
  axisLine: '#3a4356',
  axisLabel: '#8a93a6',
  splitLine: '#262d3b',
  cross: '#566073',
  tooltipBg: 'rgba(27,32,43,0.96)',
  tooltipBorder: '#2b3242',
  tooltipText: '#dde2ea',
  tooltipShadow: '0 4px 16px rgba(0,0,0,0.5)',
  line: '#6aa5f4',
  areaTop: 'rgba(106,165,244,0.18)',
  areaBottom: 'rgba(106,165,244,0.01)',
  zoomBorder: '#2b3242',
  zoomFiller: 'rgba(77,148,240,0.12)',
  zoomHandle: '#4d94f0',
  zoomText: '#7d8798',
  band: 'rgba(255,255,255,0.045)',
  tooltipSub: '#8a93a6',
  lineA: '#e8a735'
} : {
  axisLine: '#d9d9d9',
  axisLabel: '#666',
  splitLine: '#f0f0f0',
  cross: '#999',
  tooltipBg: 'rgba(255,255,255,0.96)',
  tooltipBorder: '#e8e8e8',
  tooltipText: '#333',
  tooltipShadow: '0 4px 16px rgba(0,0,0,0.12)',
  line: '#1a3a6b',
  areaTop: 'rgba(26, 58, 107, 0.12)',
  areaBottom: 'rgba(26, 58, 107, 0.01)',
  zoomBorder: '#e8e8e8',
  zoomFiller: 'rgba(26,111,224,0.08)',
  zoomHandle: '#1a6fe0',
  zoomText: '#999',
  band: 'rgba(0,0,0,0.035)',
  tooltipSub: '#999',
  lineA: '#d4880f'
})

const chartRef = ref(null)
const expanded = ref(false)
const showContractA = ref(true)
let chart = null

function toggleExpand() {
  expanded.value = !expanded.value
  nextTick(() => {
    setTimeout(() => chart && chart.resize(), 320)
  })
}

function toggleContractA() {
  showContractA.value = !showContractA.value
  nextTick(renderChart)
}

function buildOption() {
  const { dates, closes, segments } = props.timeSeriesData
  const th = chartTheme.value

  // 日期显示用斜线格式：2024-10-08 -> 2024/10/08
  const slashDate = (d) => String(d).split('-').join('/')

  // 合约A价格对齐到价差时序轴（按日期匹配）
  const showA = showContractA.value && props.contractAData && props.contractAData.closes && props.contractAData.closes.length > 0
  let contractACloses = null
  if (showA) {
    const aMap = new Map()
    props.contractAData.dates.forEach((d, i) => aMap.set(d, props.contractAData.closes[i]))
    contractACloses = dates.map(d => aMap.get(d) ?? null)
  }

  // 换合约分段（真实数据才有）：交替色带 + 分段中点刻度标签 + tooltip 合约周期
  const hasSeg = Array.isArray(segments) && segments.length > 1
  const segOfIndex = []        // 采样索引 -> 所属分段
  const bandData = []          // markArea 数据（奇数分段铺浅底，偶数分段留白形成交替）
  const segMarkLineData = []   // markLine 合约周期标注（锚定日期，跟随缩放）
  if (hasSeg) {
    for (let i = 0; i < dates.length; i++) segOfIndex[i] = null
    segments.forEach((seg, si) => {
      for (let i = seg.startIndex; i <= seg.endIndex && i < dates.length; i++) {
        segOfIndex[i] = seg
      }
      // 合约周期标注：锚定在分段中点日期上，跟随 dataZoom
      if (seg.endIndex - seg.startIndex >= 3) {
        const midDate = dates[Math.round((seg.startIndex + seg.endIndex) / 2)]
        segMarkLineData.push({
          name: `${slashDate(seg.start)}~${slashDate(seg.end)}`,
          xAxis: midDate,
          label: {
            show: true,
            formatter: '{b}',
            position: 'start',
            distance: 8,
            color: th.axisLabel,
            fontSize: 10,
            textBorderColor: props.isDark ? '#1b202b' : '#fff',
            textBorderWidth: 2
          },
          lineStyle: { width: 1, type: 'dashed', opacity: 0.25, color: th.axisLabel }
        })
      }
      if (si % 2 === 1) {
        bandData.push([
          { xAxis: dates[seg.startIndex], itemStyle: { color: th.band } },
          { xAxis: dates[seg.endIndex] }
        ])
      }
    })
  }

  // Y轴配置：左侧为主（价差/比值），右侧为合约A价格（仅showA时显示）
  const yAxisList = [{
    type: 'value',
    name: '收盘价',
    nameTextStyle: { color: th.axisLabel, fontSize: 12 },
    scale: true,
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { color: th.axisLabel, fontSize: 12 },
    splitLine: { lineStyle: { color: th.splitLine, type: 'dashed' } }
  }]
  if (showA) {
    yAxisList.push({
      type: 'value',
      name: props.contractAData.name || '合约A',
      nameTextStyle: { color: th.lineA, fontSize: 12 },
      scale: true,
      position: 'right',
      axisLine: { show: true, lineStyle: { color: th.lineA } },
      axisTick: { show: false },
      axisLabel: { color: th.lineA, fontSize: 12 },
      splitLine: { show: false }
    })
  }

  // 系列：主系列（价差/比值）+ 可选合约A
  const seriesList = [{
    name: props.symbolName || '收盘价',
    type: 'line',
    data: closes,
    showSymbol: false,
    smooth: false,
    lineStyle: { color: th.line, width: 1.5 },
    itemStyle: { color: th.line },
    markArea: bandData.length ? { silent: true, data: bandData } : undefined,
    markLine: segMarkLineData.length ? {
      silent: true,
      symbol: 'none',
      data: segMarkLineData
    } : undefined,
    areaStyle: showA ? undefined : {
      color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
        { offset: 0, color: th.areaTop },
        { offset: 1, color: th.areaBottom }
      ])
    }
  }]
  if (showA) {
    seriesList.push({
      name: props.contractAData.name || '合约A',
      type: 'line',
      yAxisIndex: 1,
      data: contractACloses,
      showSymbol: false,
      smooth: false,
      lineStyle: { color: th.lineA, width: 1.5, type: 'dashed' },
      itemStyle: { color: th.lineA },
      connectNulls: true
    })
  }

  return {
    tooltip: {
      trigger: 'axis',
      backgroundColor: th.tooltipBg,
      borderColor: th.tooltipBorder,
      borderWidth: 1,
      textStyle: { color: th.tooltipText, fontSize: 12 },
      axisPointer: { type: 'cross', crossStyle: { color: th.cross } },
      formatter: (params) => {
        const p = params[0]
        // 价格按品种最小变动价位的小数位显示（整数品种无小数）；比值4位、价差2位
        const val = props.crossMode === 'ratio'
          ? p.value.toFixed(4)
          : props.crossMode === 'spread'
            ? p.value.toFixed(2)
            : p.value.toFixed(props.decimals)
        // 换合约分段：显示该日期所属合约及其周期
        const seg = hasSeg ? segOfIndex[p.dataIndex] : null
        const segLine = seg
          ? `<div style="margin-top:4px;font-size:11px;color:${th.tooltipSub}">合约 ${seg.label}（${slashDate(seg.start)} ~ ${slashDate(seg.end)}）</div>`
          : ''
        // 合约A价格（tooltip 第二行）
        let aLine = ''
        if (showA && params.length > 1) {
          const pa = params[1]
          if (pa.value != null) {
            aLine = `<div style="margin-top:3px"><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${th.lineA};margin-right:5px"></span>${props.contractAData.name}：<b>${pa.value.toFixed(props.decimals)}</b></div>`
          }
        }
        return `<div style="font-weight:600">${p.axisValue}</div>${segLine}
          <div style="margin-top:4px">${p.marker} ${props.crossMode ? '价差' : '收盘价'}：<b>${val}</b></div>${aLine}`
      }
    },
    grid: {
      left: 70,
      right: showA ? 75 : 20,
      top: 30,
      bottom: 60
    },
    dataZoom: [
      {
        type: 'inside',
        start: 0,
        end: 100
      },
      {
        type: 'slider',
        start: 0,
        end: 100,
        height: 20,
        bottom: 10,
        borderColor: th.zoomBorder,
        fillerColor: th.zoomFiller,
        handleStyle: { color: th.zoomHandle, borderColor: th.zoomHandle },
        textStyle: { fontSize: 11, color: th.zoomText }
      }
    ],
    xAxis: {
      type: 'category',
      data: dates,
      boundaryGap: false,
      axisLine: { lineStyle: { color: th.axisLine } },
      axisLabel: {
        color: th.axisLabel,
        fontSize: 11,
        formatter: (val) => val.substring(0, 4)
      },
      axisTick: { show: false }
    },
    yAxis: yAxisList,
    series: seriesList
  }
}

function renderChart() {
  if (!chart) return
  chart.setOption(buildOption(), true)
}

watch(() => props.timeSeriesData, () => {
  nextTick(renderChart)
}, { deep: true })

watch(() => props.symbolName, () => {
  nextTick(renderChart)
})

watch(() => [props.crossMode, props.decimals], () => {
  nextTick(renderChart)
})

// 明/暗主题切换时重绘图表
watch(() => props.isDark, () => {
  nextTick(renderChart)
})

watch(() => props.contractAData, () => {
  showContractA.value = true
  nextTick(renderChart)
}, { deep: true })

onMounted(() => {
  chart = echarts.init(chartRef.value)
  window.addEventListener('resize', handleResize)
  if (props.timeSeriesData.dates.length) {
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

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
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

.toggle-btn.active {
  color: #fff;
  background: var(--accent);
  border-color: var(--accent);
}

.chart-body {
  padding: 10px 12px 12px;
}

.chart-container {
  width: 100%;
  height: 520px;
  transition: height 0.3s ease;
}

.chart-container.expanded {
  height: 760px;
}

/* ===== 移动端适配 ===== */
@media (max-width: 768px) {
  .chart-header {
    padding: 10px 12px;
    flex-wrap: wrap;
    gap: 8px;
  }

  .header-actions {
    gap: 6px;
  }

  .toggle-btn {
    padding: 5px 12px;
    font-size: 11px;
  }

  .chart-title {
    font-size: 13px;
  }

  .chart-body {
    padding: 8px 8px 10px;
  }

  .chart-container {
    height: 320px;
  }

  .chart-container.expanded {
    height: 560px;
  }
}
</style>
