<template>
  <div class="symbol-select" :class="{ open: open }" ref="rootRef">
    <div
      class="select-trigger"
      :class="{ disabled: disabled }"
      @click="toggle"
    >
      <span class="selected-text" :class="{ placeholder: !modelValue }">
        {{ displayLabel || placeholder }}
      </span>
      <span class="caret" :class="{ up: open }"></span>
    </div>

    <div v-if="open && !disabled" class="select-dropdown">
      <input
        ref="searchInputRef"
        v-model="query"
        class="search-input"
        placeholder="名称 / 代码 / 拼音 / 首字母"
        @keydown="onKeydown"
      />
      <div class="option-list">
        <template v-for="group in groupedResults" :key="group.category">
          <div class="opt-group-title">{{ group.category }}</div>
          <div
            v-for="sym in group.symbols"
            :key="sym.code"
            class="opt-item"
            :class="{
              active: sym.code === modelValue,
              highlighted: flatIndex(sym) === highlightIdx
            }"
            @mouseenter="highlightIdx = flatIndex(sym)"
            @click="select(sym)"
          >
            <span class="opt-name">{{ sym.name }}</span>
            <span class="opt-code">{{ sym.code }}</span>
          </div>
        </template>
        <div v-if="flatList.length === 0" class="no-result">无匹配品种</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { searchSymbols, findSymbol, CATEGORIES } from '../mock/data.js'

const props = defineProps({
  modelValue: { type: String, default: '' },
  placeholder: { type: String, default: '请选择品种' },
  disabled: { type: Boolean, default: false }
})

const emit = defineEmits(['update:modelValue'])

const rootRef = ref(null)
const searchInputRef = ref(null)
const open = ref(false)
const query = ref('')
const highlightIdx = ref(0)

const displayLabel = computed(() => {
  if (!props.modelValue) return ''
  const sym = findSymbol(props.modelValue)
  return sym ? `${sym.name} ${sym.code}` : props.modelValue
})

// 搜索结果（按类别分组展示，与左侧列表分类一致）
const flatList = computed(() => searchSymbols(query.value))

const groupedResults = computed(() => {
  return CATEGORIES
    .map(cat => ({
      category: cat,
      symbols: flatList.value.filter(s => s.category === cat)
    }))
    .filter(g => g.symbols.length > 0)
})

function flatIndex(sym) {
  return flatList.value.findIndex(s => s.code === sym.code)
}

function toggle() {
  if (props.disabled) return
  open.value = !open.value
  if (open.value) {
    query.value = ''
    highlightIdx.value = 0
    nextTick(() => searchInputRef.value && searchInputRef.value.focus())
  }
}

function close() {
  open.value = false
}

function select(sym) {
  emit('update:modelValue', sym.code)
  close()
}

function onKeydown(e) {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    highlightIdx.value = (highlightIdx.value + 1) % Math.max(flatList.value.length, 1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    highlightIdx.value = (highlightIdx.value - 1 + flatList.value.length) % Math.max(flatList.value.length, 1)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    const sym = flatList.value[highlightIdx.value]
    if (sym) select(sym)
  } else if (e.key === 'Escape') {
    close()
  }
}

// 点击组件外部时关闭下拉
function onDocClick(e) {
  if (rootRef.value && !rootRef.value.contains(e.target)) {
    close()
  }
}

watch(query, () => { highlightIdx.value = 0 })

onMounted(() => document.addEventListener('mousedown', onDocClick))
onBeforeUnmount(() => document.removeEventListener('mousedown', onDocClick))
</script>

<style scoped>
.symbol-select {
  position: relative;
  display: inline-block;
  min-width: 130px;
}

.select-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 5px 10px;
  font-size: 13px;
  border: 1px solid var(--border-ctrl);
  border-radius: 3px;
  background: var(--bg-card);
  color: var(--text-primary);
  cursor: pointer;
  transition: border-color 0.2s, background 0.25s, color 0.25s;
  user-select: none;
  white-space: nowrap;
}

.select-trigger:hover:not(.disabled) {
  border-color: var(--accent);
}

.symbol-select.open .select-trigger {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-focus);
}

.select-trigger.disabled {
  background: var(--bg-disabled);
  color: var(--text-disabled);
  cursor: not-allowed;
}

.selected-text.placeholder {
  color: var(--text-disabled);
}

.caret {
  width: 0;
  height: 0;
  border-left: 4px solid transparent;
  border-right: 4px solid transparent;
  border-top: 5px solid var(--caret);
  transition: transform 0.2s;
}

.caret.up {
  transform: rotate(180deg);
}

.select-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 100;
  width: 240px;
  background: var(--bg-card);
  border: 1px solid var(--border-dropdown);
  border-radius: 4px;
  box-shadow: var(--shadow);
  overflow: hidden;
}

.search-input {
  width: 100%;
  padding: 8px 10px;
  font-size: 12px;
  border: none;
  border-bottom: 1px solid var(--border-light);
  outline: none;
  box-sizing: border-box;
  background: var(--bg-card);
  color: var(--text-primary);
}

.search-input::placeholder {
  color: var(--text-placeholder);
}

.option-list {
  max-height: 280px;
  overflow-y: auto;
  padding: 4px 0;
}

.opt-group-title {
  padding: 6px 12px 3px;
  font-size: 11px;
  color: var(--text-tertiary);
  font-weight: 600;
  background: var(--bg-header);
  position: sticky;
  top: 0;
}

.opt-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.12s;
}

.opt-item.highlighted {
  background: var(--bg-active);
}

.opt-item.active {
  background: var(--bg-active-strong);
}

.opt-item.active .opt-name {
  color: var(--accent);
  font-weight: 600;
}

.opt-name {
  color: var(--text-444);
}

.opt-code {
  font-size: 11px;
  color: var(--text-tertiary);
  font-family: 'Consolas', 'Monaco', monospace;
}

.no-result {
  padding: 20px 0;
  text-align: center;
  font-size: 12px;
  color: var(--text-disabled);
}
</style>
