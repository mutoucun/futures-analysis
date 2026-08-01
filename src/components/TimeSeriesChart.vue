<template>
  <div class="chart-card">
    <div class="chart-header">
      <span class="chart-title">连续时序图</span>
      <button class="toggle-btn" @click="toggleExpand">
        {{ expanded ? '收起' : '展开' }}
      </button>
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
  tooltipSub: '#8a93a6'
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
  tooltipSub: '#999'
})

const chartRef = ref(null)
const expanded = ref(false)
let chart = null

function toggleExpand() {
  expanded.value = !expanded.value
  nextTick(() => {
    setTimeout(() => chart && chart.resize(), 320)
  })
}

function buildOption() {
  const { dates, closes, segments } = props.timeSeriesData
  const th = chartTheme.value

  // 换合约分段（真实数据才有）：交替色带 + 分段中点刻度标签 + tooltip 合约周期
  const hasSeg = Array.isArray(segments) && segments.length > 1
  const segLabelAt = new Map() // 采样索引(分段中点) -> 合约标签
  const segOfIndex = []        // 采样索引 -> 所属分段
  const bandData = []          // markArea 数据（奇数分段铺浅底，偶数分段留白形成交替）
  if (hasSeg) {
    for (let i = 0; i < dates.length; i++) segOfIndex[i] = null
    segments.forEach((seg, si) => {
      for (let i = seg.startIndex; i <= seg.endIndex && i < dates.length; i++) {
        segOfIndex[i] = seg
      }
      // 分段太窄（采样点<4个，约不足一个月）不放下标签，避免重叠
      if (seg.endIndex - seg.startIndex >= 3) {
        segLabelAt.set(Math.round((seg.startIndex + seg.endIndex) / 2), seg.label)
      }
      if (si % 2 === 1) {
        bandData.push([
          { xAxis: dates[seg.startIndex], itemStyle: { color: th.band } },
          { xAxis: dates[seg.endIndex] }
        ])
      }
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
          ? `<div style="margin-top:4px;font-size:11px;color:${th.tooltipSub}">合约 ${seg.label}（${seg.start} ~ ${seg.end}）</div>`
          : ''
        return `<div style="font-weight:600">${p.axisValue}</div>${segLine}
          <div style="margin-top:4px">${p.marker} 收盘价：<b>${val}</b></div>`
      }
    },
    grid: {
      left: 70,
      right: 20,
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
        // 有分段：逐个索引判断，只在分段中点打合约标签；无分段：自动间隔显示年份
        interval: hasSeg ? 0 : 'auto',
        formatter: hasSeg
          ? (val, idx) => (segLabelAt.has(idx) ? segLabelAt.get(idx) : '')
          : (val) => val.substring(0, 4)
      },
      axisTick: { show: false }
    },
    yAxis: {
      type: 'value',
      name: '收盘价',
      nameTextStyle: { color: th.axisLabel, fontSize: 12 },
      scale: true,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: th.axisLabel, fontSize: 12 },
      splitLine: { lineStyle: { color: th.splitLine, type: 'dashed' } }
    },
    series: [
      {
        name: props.symbolName || '收盘价',
        type: 'line',
        data: closes,
        showSymbol: false,
        smooth: false,
        lineStyle: { color: th.line, width: 1.5 },
        itemStyle: { color: th.line },
        // 换合约交替色带：标识不同合约的接管区间
        markArea: bandData.length ? { silent: true, data: bandData } : undefined,
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: th.areaTop },
            { offset: 1, color: th.areaBottom }
          ])
        }
      }
    ]
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

.chart-body {
  padding: 10px 12px 12px;
}

.chart-container {
  width: 100%;
  height: 260px;
  transition: height 0.3s ease;
}

.chart-container.expanded {
  height: 520px;
}

/* ===== 移动端适配 ===== */
@media (max-width: 768px) {
  .chart-header {
    padding: 10px 12px;
    flex-wrap: wrap;
    gap: 8px;
  }

  .chart-container {
    height: 220px;
  }

  .chart-container.expanded {
    height: 420px;
  }
}
</style>
