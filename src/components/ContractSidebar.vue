<template>
  <aside :class="['contract-sidebar', { open }]">
    <div class="sidebar-header">
      <span class="sidebar-title">合约列表</span>
    </div>
    <div class="sidebar-tabs">
      <button
        :class="['tab-btn', { active: activeTab === 'exchange' }]"
        @click="activeTab = 'exchange'"
      >按交易所</button>
      <button
        :class="['tab-btn', { active: activeTab === 'category' }]"
        @click="activeTab = 'category'"
      >按品种类别</button>
    </div>
    <div class="sidebar-search">
      <input
        v-model="searchText"
        type="text"
        placeholder="搜索品种名称/代码"
        class="search-input"
      />
    </div>
    <div class="sidebar-list">
      <!-- 按交易所分组 -->
      <template v-if="activeTab === 'exchange'">
        <div v-for="group in exchangeGroups" :key="group.code" class="symbol-group">
          <div class="group-header" @click="toggleGroup(group.code)">
            <span :class="['arrow', { expanded: expandedGroups.includes(group.code) }]">&#9654;</span>
            <span class="group-name">{{ group.name }}</span>
            <span class="group-count">{{ group.symbols.length }}</span>
          </div>
          <transition name="collapse">
            <div v-show="expandedGroups.includes(group.code)" class="group-body">
              <div
                v-for="sym in group.symbols"
                :key="sym.code"
                :class="['symbol-item', { active: sym.code === selectedSymbol }]"
                @click="selectSymbol(sym)"
              >
                <span class="sym-name">{{ sym.name }}</span>
                <span class="sym-code">{{ sym.code }}</span>
              </div>
            </div>
          </transition>
        </div>
      </template>
      <!-- 按品种类别分组 -->
      <template v-else>
        <div v-for="group in categoryGroups" :key="group.category" class="symbol-group">
          <div class="group-header" @click="toggleGroup('cat-' + group.category)">
            <span :class="['arrow', { expanded: expandedGroups.includes('cat-' + group.category) }]">&#9654;</span>
            <span class="group-name">{{ group.category }}</span>
            <span class="group-count">{{ group.symbols.length }}</span>
          </div>
          <transition name="collapse">
            <div v-show="expandedGroups.includes('cat-' + group.category)" class="group-body">
              <div
                v-for="sym in group.symbols"
                :key="sym.code"
                :class="['symbol-item', { active: sym.code === selectedSymbol }]"
                @click="selectSymbol(sym)"
              >
                <span class="sym-name">{{ sym.name }}</span>
                <span class="sym-code">{{ sym.code }}</span>
              </div>
            </div>
          </transition>
        </div>
      </template>
    </div>
  </aside>
  <!-- 移动端抽屉遮罩：点击关闭（桌面端 display:none） -->
  <div v-if="open" class="sidebar-backdrop" @click="emit('close')"></div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { EXCHANGES, CATEGORIES } from '../mock/data.js'

const props = defineProps({
  selectedSymbol: { type: String, default: 'RB' },
  // 移动端抽屉开关（桌面端 CSS 忽略该状态，恒为展开）
  open: { type: Boolean, default: true }
})

const emit = defineEmits(['select', 'close'])

const activeTab = ref('exchange')
const searchText = ref('')
const expandedGroups = ref(['SHFE'])

const filterSymbols = (symbols) => {
  if (!searchText.value.trim()) return symbols
  const kw = searchText.value.trim().toLowerCase()
  return symbols.filter(s =>
    s.name.toLowerCase().includes(kw) || s.code.toLowerCase().includes(kw)
  )
}

const exchangeGroups = computed(() => {
  return EXCHANGES
    .map(ex => ({
      code: ex.code,
      name: `${ex.name}`,
      symbols: filterSymbols(ex.symbols)
    }))
    .filter(g => g.symbols.length > 0)
})

const categoryGroups = computed(() => {
  const allSymbols = []
  for (const ex of EXCHANGES) {
    for (const sym of ex.symbols) {
      allSymbols.push({ ...sym, exchangeName: ex.name })
    }
  }
  return CATEGORIES
    .map(cat => ({
      category: cat,
      symbols: filterSymbols(allSymbols.filter(s => s.category === cat))
    }))
    .filter(g => g.symbols.length > 0)
})

function toggleGroup(key) {
  const idx = expandedGroups.value.indexOf(key)
  if (idx >= 0) {
    expandedGroups.value.splice(idx, 1)
  } else {
    expandedGroups.value.push(key)
  }
}

function selectSymbol(sym) {
  emit('select', sym.code)
}
</script>

<style scoped>
.contract-sidebar {
  width: 220px;
  min-width: 220px;
  background: var(--bg-card);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  transition: background-color 0.25s ease, border-color 0.25s ease;
}

.sidebar-header {
  padding: 12px 14px 8px;
  border-bottom: 1px solid var(--border-light);
}

.sidebar-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.sidebar-tabs {
  display: flex;
  padding: 8px 10px 0;
  gap: 4px;
}

.tab-btn {
  flex: 1;
  padding: 6px 0;
  font-size: 12px;
  border: 1px solid var(--border-ctrl);
  background: var(--bg-card);
  color: var(--text-666);
  cursor: pointer;
  border-radius: 3px;
  transition: all 0.2s;
}

.tab-btn.active {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

.tab-btn:hover:not(.active) {
  border-color: var(--accent);
  color: var(--accent);
}

.sidebar-search {
  padding: 8px 10px;
}

.search-input {
  width: 100%;
  padding: 6px 10px;
  font-size: 12px;
  border: 1px solid var(--border-ctrl);
  border-radius: 3px;
  outline: none;
  box-sizing: border-box;
  background: var(--bg-card);
  color: var(--text-primary);
  transition: border-color 0.2s;
}

.search-input::placeholder {
  color: var(--text-tertiary);
}

.search-input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-focus);
}

.sidebar-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 0 12px;
}

.symbol-group {
  border-bottom: 1px solid var(--border-group);
}

.group-header {
  display: flex;
  align-items: center;
  padding: 9px 12px;
  cursor: pointer;
  user-select: none;
  transition: background 0.15s;
}

.group-header:hover {
  background: var(--bg-hover);
}

.arrow {
  font-size: 9px;
  color: var(--text-tertiary);
  margin-right: 8px;
  transition: transform 0.2s;
  display: inline-block;
}

.arrow.expanded {
  transform: rotate(90deg);
}

.group-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  flex: 1;
}

.group-count {
  font-size: 11px;
  color: var(--text-tertiary);
  background: var(--badge-bg);
  border-radius: 8px;
  padding: 1px 7px;
}

.group-body {
  overflow: hidden;
}

.symbol-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 7px 12px 7px 30px;
  cursor: pointer;
  transition: background 0.15s;
}

.symbol-item:hover {
  background: var(--bg-active);
}

.symbol-item.active {
  background: var(--bg-active-strong);
  border-right: 3px solid var(--accent);
}

.symbol-item.active .sym-name {
  color: var(--accent);
  font-weight: 600;
}

.sym-name {
  font-size: 13px;
  color: var(--text-444);
}

.sym-code {
  font-size: 11px;
  color: var(--text-tertiary);
  font-family: 'Consolas', 'Monaco', monospace;
}

.collapse-enter-active,
.collapse-leave-active {
  transition: all 0.2s ease;
}

.collapse-enter-from,
.collapse-leave-to {
  opacity: 0;
}

/* 移动端抽屉遮罩：桌面端隐藏 */
.sidebar-backdrop {
  display: none;
}

/* ===== 移动端：侧边栏抽屉化 ===== */
@media (max-width: 768px) {
  .contract-sidebar {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    z-index: 50;
    width: 264px;
    min-width: 264px;
    transform: translateX(-100%);
    transition: transform 0.25s ease;
  }

  .contract-sidebar.open {
    transform: translateX(0);
    box-shadow: var(--shadow);
  }

  .sidebar-backdrop {
    display: block;
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 45;
    background: rgba(0, 0, 0, 0.45);
  }
}
</style>
