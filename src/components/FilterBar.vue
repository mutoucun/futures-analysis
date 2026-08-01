<template>
  <div class="filter-bar">
    <!-- 第一行：分析类型 -->
    <div class="filter-row">
      <span class="filter-label">分析类型：</span>
      <div class="radio-group">
        <label
          v-for="item in analyzeTypes"
          :key="item.value"
          :class="['radio-item', { active: analyzeType === item.value }]"
        >
          <input
            type="radio"
            :value="item.value"
            v-model="analyzeType"
            class="radio-input"
          />
          {{ item.label }}
        </label>
      </div>
      <span v-if="isCrossMonth" class="type-hint">同品种两个到期月份合约的价差</span>
      <span v-else-if="isCrossSymbol" class="type-hint">请选择两个品种进行对比</span>
    </div>

    <!-- 第二行：筛选控件 + 查询按钮 -->
    <div class="filter-row">
      <div class="filter-selects" :class="{ disabled: !controlsEnabled }">
        <!-- 品种选择：单合约/跨月 用一个品种；跨品种用两个品种 -->
        <div class="select-item">
          <span class="select-label">{{ isCrossSymbol ? '品种A：' : '品种：' }}</span>
          <SymbolSelect v-model="symbol" :disabled="!controlsEnabled" />
        </div>
        <div v-if="isCrossSymbol" class="select-item">
          <span class="select-label">品种B：</span>
          <SymbolSelect v-model="symbolB" :disabled="!controlsEnabled" />
        </div>

        <!-- 合约月份：跨月价差选两个月份，其余选一个 -->
        <template v-if="isCrossMonth">
          <div class="select-item">
            <span class="select-label">月份A：</span>
            <select v-model="contractMonth" :disabled="!controlsEnabled" class="select-ctrl">
              <option v-for="m in contractMonths" :key="m" :value="m">{{ m }}</option>
            </select>
          </div>
          <div class="select-item">
            <span class="select-label">月份B：</span>
            <select v-model="contractMonthB" :disabled="!controlsEnabled" class="select-ctrl">
              <option v-for="m in contractMonths" :key="m" :value="m">{{ m }}</option>
            </select>
          </div>
          <span class="spread-note">价差 = A − B</span>
        </template>
        <div v-else class="select-item">
          <span class="select-label">合约月份：</span>
          <select v-model="contractMonth" :disabled="!controlsEnabled" class="select-ctrl">
            <option v-for="m in contractMonths" :key="m" :value="m">{{ m }}</option>
          </select>
        </div>

        <div class="select-item">
          <span class="select-label">年份范围：</span>
          <select v-model="yearRange" :disabled="!controlsEnabled" class="select-ctrl">
            <option v-for="yr in yearRanges" :key="yr.value" :value="yr.value">
              {{ yr.label }}
            </option>
          </select>
        </div>

        <button class="query-btn" :disabled="!controlsEnabled" @click="handleQuery">查询</button>

        <button class="save-fav-btn" :disabled="!controlsEnabled" @click="emit('save')" title="将当前查询条件收藏">☆ 收藏</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import SymbolSelect from './SymbolSelect.vue'
import { CONTRACT_MONTHS, YEAR_RANGES } from '../mock/data.js'

const props = defineProps({
  initialSymbol: { type: String, default: 'RB' }
})

const emit = defineEmits(['query', 'save'])

const analyzeTypes = [
  { value: 'single', label: '单合约' },
  { value: 'crossMonth', label: '跨月价差' },
  { value: 'crossSymbol', label: '跨品种价差' },
  { value: 'crossRatio', label: '跨品种比值' }
]

const analyzeType = ref('single')
const symbol = ref(props.initialSymbol)
const symbolB = ref('HC')
const contractMonth = ref('09')
const contractMonthB = ref('01')
const yearRange = ref('all')

const contractMonths = CONTRACT_MONTHS
const yearRanges = YEAR_RANGES

const isCrossMonth = computed(() => analyzeType.value === 'crossMonth')
const isCrossSymbol = computed(
  () => analyzeType.value === 'crossSymbol' || analyzeType.value === 'crossRatio'
)
// 四种分析模式均可用
const controlsEnabled = computed(() => true)
// 派生计算类型：跨品种比值为 ratio，其余跨模式为 spread（价差）
const crossMode = computed(() =>
  analyzeType.value === 'crossRatio' ? 'ratio' : 'spread'
)

// 外部（左侧列表）切换品种时同步到品种
watch(() => props.initialSymbol, (val) => {
  if (val && val !== symbol.value) {
    symbol.value = val
  }
})

function handleQuery() {
  emit('query', buildQuery())
}

// 收集当前筛选参数（收藏 / 复用）
function buildQuery() {
  return {
    analyzeType: analyzeType.value,
    symbol: symbol.value,
    symbolB: symbolB.value,
    crossMode: crossMode.value,
    contractMonth: contractMonth.value,
    contractMonthB: contractMonthB.value,
    yearRange: yearRange.value
  }
}

// 用查询参数回填筛选控件（点击收藏夹时恢复界面）
function applyQuery(q) {
  if (!q) return
  analyzeType.value = q.analyzeType
  symbol.value = q.symbol
  if (q.symbolB) symbolB.value = q.symbolB
  contractMonth.value = q.contractMonth
  if (q.contractMonthB) contractMonthB.value = q.contractMonthB
  yearRange.value = q.yearRange
}

// 暴露当前参数供父组件使用（defineExpose 的 ref 经模板引用自动解包）
defineExpose({ symbol, symbolB, contractMonth, contractMonthB, yearRange, analyzeType, crossMode, getQuery: buildQuery, applyQuery })
</script>

<style scoped>
.filter-bar {
  background: var(--bg-card);
  border-radius: 4px;
  padding: 14px 18px;
  border: 1px solid var(--border);
  transition: background-color 0.25s ease, border-color 0.25s ease;
}

.filter-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.filter-row + .filter-row {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px dashed var(--border-light);
}

.filter-label {
  font-size: 13px;
  color: var(--text-secondary);
  white-space: nowrap;
  font-weight: 500;
}

.radio-group {
  display: flex;
  gap: 2px;
}

.radio-item {
  display: inline-flex;
  align-items: center;
  padding: 5px 12px;
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
  border: 1px solid var(--border-ctrl);
  border-radius: 3px;
  margin-right: 6px;
  transition: all 0.2s;
  user-select: none;
  white-space: nowrap;
}

.radio-item:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.radio-item.active {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

.radio-input {
  display: none;
}

.type-hint {
  font-size: 12px;
  color: var(--text-tertiary);
  margin-left: 10px;
}

.spread-note {
  font-size: 12px;
  color: var(--accent);
  background: var(--accent-bg);
  border-radius: 3px;
  padding: 3px 8px;
  white-space: nowrap;
}

.filter-selects {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}

.filter-selects.disabled {
  opacity: 0.5;
  pointer-events: none;
}

.select-item {
  display: flex;
  align-items: center;
  white-space: nowrap;
}

.select-label {
  font-size: 13px;
  color: var(--text-secondary);
}

.select-ctrl {
  padding: 5px 28px 5px 10px;
  font-size: 13px;
  border: 1px solid var(--border-ctrl);
  border-radius: 3px;
  background: var(--bg-card);
  color: var(--text-primary);
  outline: none;
  cursor: pointer;
  appearance: none;
  -webkit-appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23999'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 10px center;
  transition: border-color 0.2s;
}

/* 夜间模式下箭头使用浅色，保证下拉指示可见 */
html.dark .select-ctrl {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%237d8798'/%3E%3C/svg%3E");
}

.select-ctrl:hover {
  border-color: var(--accent);
}

.select-ctrl:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-focus);
}

.select-ctrl:disabled {
  background-color: var(--bg-disabled);
  color: var(--text-disabled);
  cursor: not-allowed;
}

.query-btn {
  padding: 8px 38px;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 2px;
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.2s, box-shadow 0.2s;
  white-space: nowrap;
  box-shadow: 0 2px 8px var(--accent-focus);
}

.query-btn:hover:not(:disabled) {
  background: var(--accent-hover);
}

.query-btn:active:not(:disabled) {
  background: var(--accent-active);
}

.query-btn:disabled {
  background: var(--accent-disabled-bg);
  cursor: not-allowed;
}

.save-fav-btn {
  padding: 8px 18px;
  font-size: 13px;
  color: var(--accent);
  background: var(--bg-card);
  border: 1px solid var(--accent-border);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.save-fav-btn:hover:not(:disabled) {
  background: var(--accent-bg);
  border-color: var(--accent);
}

.save-fav-btn:disabled {
  color: var(--text-disabled);
  border-color: var(--border);
  background: var(--bg-disabled);
  cursor: not-allowed;
}

/* ===== 移动端适配 ===== */
@media (max-width: 768px) {
  .filter-bar {
    padding: 10px 12px;
  }

  .radio-item {
    padding: 7px 11px;
  }

  /* 选择器两列网格，下拉框撑满剩余宽度 */
  .filter-selects {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    width: 100%;
  }

  .select-item {
    min-width: 0;
  }

  .select-ctrl {
    flex: 1;
    min-width: 0;
    font-size: 14px;
    padding: 8px 28px 8px 10px;
  }

  .spread-note {
    grid-column: 1 / -1;
  }

  /* 查询 / 收藏按钮通栏，触控友好 */
  .query-btn {
    grid-column: 1 / -1;
    width: 100%;
    padding: 10px 0;
  }

  .save-fav-btn {
    grid-column: 1 / -1;
    width: 100%;
    padding: 9px 0;
  }
}
</style>
