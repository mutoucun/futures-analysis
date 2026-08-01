<template>
  <div class="table-card">
    <div class="table-header">
      <div class="table-header-left">
        <span class="table-title">12个月份涨跌明细表</span>
        <div class="index-mode-toggle" title="仅影响本表展示口径">
          <span class="index-mode-label">指标模式：</span>
          <button
            :class="['mode-btn', { active: effectiveMode === 'percent' }]"
            @click="setMode('percent')"
          >涨跌百分比</button>
          <button
            :class="['mode-btn', { active: effectiveMode === 'absolute' }]"
            @click="setMode('absolute')"
          >涨跌值</button>
        </div>
      </div>
      <button class="export-btn" @click="exportCSV">导出CSV</button>
    </div>
    <div class="table-wrap">
      <table class="detail-table">
        <thead>
          <tr>
            <th class="contract-col">合约</th>
            <th v-for="m in 12" :key="m" class="month-col">{{ m }}月</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in detailData.rows" :key="row.contract">
            <td class="contract-cell">{{ row.contract }}</td>
            <td
              v-for="(val, idx) in row.values"
              :key="idx"
              :class="['value-cell', cellClass(val)]"
            >
              {{ formatCell(val) }}
            </td>
          </tr>
          <tr v-if="!detailData.rows || detailData.rows.length === 0">
            <td colspan="13" class="empty-cell">暂无数据</td>
          </tr>
        </tbody>
        <tfoot v-if="detailData.rows && detailData.rows.length">
          <tr class="stats-row">
            <td class="contract-cell stats-label">上涨/下跌月数</td>
            <td v-for="(s, idx) in monthStats" :key="'cnt-' + idx" class="stats-cell">
              <span class="stat-up">{{ s.upCount }}</span><span class="stat-sep">/</span><span class="stat-down">{{ s.downCount }}</span>
            </td>
          </tr>
          <tr class="stats-row">
            <td class="contract-cell stats-label">平均涨/平均跌</td>
            <td v-for="(s, idx) in monthStats" :key="'avg-' + idx" class="stats-cell">
              <span class="stat-up">{{ formatCell(s.avgUp) }}</span><span class="stat-sep">/</span><span class="stat-down">{{ formatCell(s.avgDown) }}</span>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  detailData: { type: Object, default: () => ({ contracts: [], rows: [] }) },
  indexMode: { type: String, default: 'percent' },
  crossMode: { type: String, default: '' }, // '' | 'spread' | 'ratio'
  symbolCode: { type: String, default: 'RB' }
})

const emit = defineEmits(['update:indexMode'])

// 生效的指标模式：价差明细展示"价差的涨跌值"、比值明细展示比值水平，均为绝对数值，
// 因此恒为"涨跌值"；单合约模式才可在 百分比 / 涨跌值 之间切换
const effectiveMode = computed(() => (props.crossMode ? 'absolute' : props.indexMode))

function setMode(mode) {
  if (!props.crossMode && mode !== props.indexMode) {
    emit('update:indexMode', mode)
  }
}

// 红绿分界阈值：比值以1为界（>1 红 / <1 绿），价差与单合约以0为界
function threshold() {
  return props.crossMode === 'ratio' ? 1 : 0
}

/**
 * 按月统计（对每一列月份，纵向汇总所有年份/合约行）：
 * 上涨月数 = 该月数值 > 阈值 的行数；下跌月数 = < 阈值 的行数
 * 平均涨 = 上涨月份总涨幅 / 上涨月份数；平均跌同理
 */
const monthStats = computed(() => {
  const th = threshold()
  const stats = []
  for (let m = 0; m < 12; m++) {
    const vals = []
    for (const row of props.detailData.rows || []) {
      const v = row.values[m]
      if (v !== null && v !== undefined) vals.push(v)
    }
    const ups = vals.filter(v => v > th)
    const downs = vals.filter(v => v < th)
    stats.push({
      upCount: ups.length,
      downCount: downs.length,
      avgUp: ups.length ? ups.reduce((s, v) => s + v, 0) / ups.length : null,
      avgDown: downs.length ? downs.reduce((s, v) => s + v, 0) / downs.length : null
    })
  }
  return stats
})

function cellClass(val) {
  if (val === null || val === undefined) return 'na'
  const th = threshold()
  return val > th ? 'up' : val < th ? 'down' : 'flat'
}

function formatCell(val) {
  if (val === null || val === undefined) return '-'
  // 跨品种比值：保留4位小数
  if (props.crossMode === 'ratio') return val.toFixed(4)
  // 价差（跨品种/跨月）：展示价差的涨跌值，正数带+号
  if (props.crossMode === 'spread') {
    return val > 0 ? `+${val.toFixed(2)}` : val.toFixed(2)
  }
  // 单合约：跟随指标模式
  if (props.indexMode === 'percent') {
    return val > 0 ? `+${val.toFixed(2)}%` : `${val.toFixed(2)}%`
  }
  return val > 0 ? `+${val.toFixed(0)}` : `${val.toFixed(0)}`
}

function exportCSV() {
  const unit = (!props.crossMode && props.indexMode === 'percent') ? '%' : ''
  const BOM = '\uFEFF'
  let csv = BOM

  // 表头
  const headers = ['合约']
  for (let m = 1; m <= 12; m++) headers.push(`${m}月`)
  csv += headers.join(',') + '\n'

  // 数据行
  for (const row of props.detailData.rows) {
    const cells = [row.contract]
    for (const val of row.values) {
      if (val === null || val === undefined) {
        cells.push('')
      } else {
        cells.push(`${val}${unit}`)
      }
    }
    csv += cells.join(',') + '\n'
  }

  // 统计行（与页面表格一致）
  if (props.detailData.rows.length) {
    const cntCells = ['上涨/下跌月数']
    const avgCells = ['平均涨/平均跌']
    for (const s of monthStats.value) {
      cntCells.push(`${s.upCount}/${s.downCount}`)
      avgCells.push(`${formatCell(s.avgUp)}/${formatCell(s.avgDown)}`)
    }
    csv += cntCells.join(',') + '\n'
    csv += avgCells.join(',') + '\n'
  }

  // 下载
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  const dateStr = new Date().toISOString().slice(0, 10)
  const modeLabel = props.crossMode === 'ratio'
    ? '比值'
    : props.crossMode === 'spread'
      ? '价差'
      : (props.indexMode === 'percent' ? '百分比' : '涨跌值')
  link.href = url
  link.download = `${props.symbolCode}_月度明细_${modeLabel}_${dateStr}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
</script>

<style scoped>
.table-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 4px;
  overflow: hidden;
  transition: background-color 0.25s ease, border-color 0.25s ease;
}

.table-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 18px;
  border-bottom: 1px solid var(--border-light);
}

.table-header-left {
  display: flex;
  align-items: center;
  gap: 18px;
  flex-wrap: wrap;
}

.table-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.index-mode-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
}

.index-mode-label {
  font-size: 12px;
  color: var(--text-tertiary);
  white-space: nowrap;
}

.mode-btn {
  padding: 3px 12px;
  font-size: 12px;
  color: var(--text-666);
  background: var(--bg-card);
  border: 1px solid var(--border-ctrl);
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.mode-btn:first-of-type {
  border-radius: 3px 0 0 3px;
}

.mode-btn:last-of-type {
  border-radius: 0 3px 3px 0;
  margin-left: -1px;
}

.mode-btn:hover {
  color: var(--accent);
  border-color: var(--accent);
}

.mode-btn.active {
  position: relative;
  color: #fff;
  background: var(--accent);
  border-color: var(--accent);
  z-index: 1;
}

.export-btn {
  padding: 4px 14px;
  font-size: 12px;
  color: var(--accent);
  background: var(--bg-card);
  border: 1px solid var(--accent);
  border-radius: 3px;
  cursor: pointer;
  transition: all 0.2s;
}

.export-btn:hover {
  background: var(--accent-bg);
}

.table-wrap {
  overflow: auto;
  padding: 0 12px 14px;
}

.detail-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  margin-top: 10px;
  font-size: 13px;
}

.detail-table th,
.detail-table td {
  padding: 8px;
  text-align: center;
  white-space: nowrap;
  border-bottom: 1px solid var(--border-cell);
  border-right: 1px solid var(--border-cell);
}

/* 表头吸顶 */
.detail-table thead th {
  position: sticky;
  top: 0;
  z-index: 3;
  background: var(--bg-header);
  font-weight: 600;
  color: var(--text-secondary);
  padding: 9px 8px;
  border-top: 1px solid var(--border-cell);
}

/* 合约列吸左 */
.detail-table th.contract-col,
.detail-table td.contract-cell {
  position: sticky;
  left: 0;
  z-index: 2;
  border-left: 1px solid var(--border-cell);
}

/* 左上角表头同时吸顶吸左，层级最高 */
.detail-table th.contract-col {
  z-index: 4;
}

.contract-col {
  min-width: 90px;
}

.month-col {
  min-width: 72px;
}

.contract-cell {
  font-weight: 600;
  color: var(--text-primary);
  background: var(--bg-header);
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 12px;
}

.value-cell {
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 12px;
  font-weight: 500;
}

/* 红涨绿跌（明暗主题均使用对应变量，夜间为高亮红绿） */
.value-cell.up {
  color: var(--up-text);
  background: var(--up-bg);
}

.value-cell.down {
  color: var(--down-text);
  background: var(--down-bg);
}

.value-cell.flat {
  color: var(--flat-text);
  background: var(--flat-bg);
}

.value-cell.na {
  color: var(--na-text);
  background: var(--bg-card);
}

.empty-cell {
  color: var(--text-tertiary);
  padding: 30px 0 !important;
}

/* 底部统计行 */
.stats-row td {
  background: var(--bg-header);
}

.stats-row:first-child td {
  border-top: 2px solid var(--stats-border);
}

.stats-label {
  color: var(--text-secondary);
}

.stats-cell {
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 12px;
  font-weight: 600;
}

.stat-up {
  color: var(--up-text);
}

.stat-down {
  color: var(--down-text);
}

.stat-sep {
  color: var(--stats-sep);
  margin: 0 2px;
  font-weight: 400;
}

/* ===== 移动端适配 ===== */
@media (max-width: 768px) {
  .table-header {
    padding: 10px 12px;
    flex-wrap: wrap;
    gap: 8px;
  }

  .table-header-left {
    gap: 10px;
  }

  .table-title {
    font-size: 13px;
  }

  .detail-table {
    font-size: 12px;
  }

  .detail-table th,
  .detail-table td {
    padding: 6px;
  }

  .contract-col {
    min-width: 82px;
  }

  .month-col {
    min-width: 58px;
  }
}
</style>
