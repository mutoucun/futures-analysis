<template>
  <div class="fav-bar">
    <span class="fav-bar-label">收藏夹</span>

    <div v-if="!favorites.length" class="fav-empty">
      暂无收藏，点击筛选区「☆ 收藏」把常用查询保存到这里（可拖拽调整顺序）
    </div>

    <div v-else class="fav-items">
      <template v-for="node in favorites" :key="node.id">
        <!-- 文件夹 -->
        <div
          v-if="node.type === 'folder'"
          :class="['fav-node', dropClass(node.id), { dragging: dragId === node.id }]"
          draggable="true"
          @mouseenter="hoverId = node.id"
          @mouseleave="hoverId = hoverId === node.id ? '' : hoverId"
          @dragstart="onDragStart(node.id, $event)"
          @dragend="onDragEnd"
          @dragover="onDragOver($event, node.id, 'horizontal')"
          @drop="onDrop($event, node.id, 'horizontal')"
        >
          <button
            :class="['fav-chip', 'folder-chip', { open: openFolderId === node.id }]"
            title="点击展开 / 拖动排序"
            @click="toggleFolder(node.id)"
          >
            <span class="chip-icon">📁</span>
            <span class="chip-name">{{ node.name }}</span>
            <span class="chip-count">{{ node.children.length }}</span>
            <span :class="['chip-caret', { up: openFolderId === node.id }]"></span>
          </button>

          <span v-show="hoverId === node.id && dragId !== node.id" class="chip-ctrl">
            <button class="ctrl-btn danger" title="删除文件夹" @click.stop="del(node.id)">✕</button>
          </span>

          <!-- 文件夹下拉 -->
          <div v-if="openFolderId === node.id" class="folder-dropdown">
            <div
              v-for="item in node.children"
              :key="item.id"
              :class="['folder-item', dropClass(item.id), { dragging: dragId === item.id }]"
              draggable="true"
              @mouseenter="hoverId = item.id"
              @mouseleave="hoverId = hoverId === item.id ? '' : hoverId"
              @dragstart.stop="onDragStart(item.id, $event)"
              @dragend.stop="onDragEnd"
              @dragover.stop="onDragOver($event, item.id, 'vertical')"
              @drop="onDragOverDrop($event, item.id, 'vertical')"
            >
              <button class="fi-name" title="点击查询 / 拖动排序" @click="run(item)">⭐ {{ item.name }}</button>
              <span v-show="hoverId === item.id && dragId !== item.id" class="fi-ctrl">
                <button class="ctrl-btn danger" title="删除" @click.stop="del(item.id)">✕</button>
              </span>
            </div>
            <div v-if="!node.children.length" class="folder-empty">（空文件夹）</div>
          </div>
        </div>

        <!-- 顶层收藏项 -->
        <div
          v-else
          :class="['fav-node', dropClass(node.id), { dragging: dragId === node.id }]"
          draggable="true"
          @mouseenter="hoverId = node.id"
          @mouseleave="hoverId = hoverId === node.id ? '' : hoverId"
          @dragstart="onDragStart(node.id, $event)"
          @dragend="onDragEnd"
          @dragover="onDragOver($event, node.id, 'horizontal')"
          @drop="onDrop($event, node.id, 'horizontal')"
        >
          <button class="fav-chip item-chip" title="点击查询 / 拖动排序" @click="run(node)">
            <span class="chip-icon">⭐</span>
            <span class="chip-name">{{ node.name }}</span>
          </button>
          <span v-show="hoverId === node.id && dragId !== node.id" class="chip-ctrl">
            <button class="ctrl-btn danger" title="删除" @click.stop="del(node.id)">✕</button>
          </span>
        </div>
      </template>
    </div>

    <!-- 点击空白处关闭文件夹下拉 -->
    <div v-if="openFolderId" class="dropdown-backdrop" @click="openFolderId = ''"></div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const props = defineProps({
  // 收藏节点数组：文件夹 { id, type:'folder', name, children } / 收藏项 { id, type:'item', name, query }
  favorites: { type: Array, default: () => [] }
})

const emit = defineEmits(['run', 'reorder', 'delete'])

const openFolderId = ref('')
const hoverId = ref('')
// 拖拽排序状态：dragId=被拖节点；dropHint={ id, pos } 指示线落点
const dragId = ref('')
const dropHint = ref(null)

function toggleFolder(id) {
  openFolderId.value = openFolderId.value === id ? '' : id
}

function run(item) {
  openFolderId.value = ''
  emit('run', item.query)
}

function del(id) {
  emit('delete', id)
}

// ===== 拖拽排序 =====
function onDragStart(id, e) {
  dragId.value = id
  dropHint.value = null
  e.dataTransfer.effectAllowed = 'move'
  // Firefox 需要 setData 才能触发拖拽
  e.dataTransfer.setData('text/plain', id)
}

function onDragEnd() {
  dragId.value = ''
  dropHint.value = null
}

function calcPos(e, orientation) {
  const rect = e.currentTarget.getBoundingClientRect()
  return orientation === 'horizontal'
    ? (e.clientX < rect.left + rect.width / 2 ? 'before' : 'after')
    : (e.clientY < rect.top + rect.height / 2 ? 'before' : 'after')
}

function onDragOver(e, targetId, orientation) {
  e.preventDefault()
  e.dataTransfer.dropEffect = 'move'
  if (!dragId.value || dragId.value === targetId) return
  dropHint.value = { id: targetId, pos: calcPos(e, orientation) }
}

function onDrop(e, targetId, orientation) {
  e.preventDefault()
  if (!dragId.value || dragId.value === targetId) return
  emit('reorder', { dragId: dragId.value, targetId, pos: calcPos(e, orientation) })
  dragId.value = ''
  dropHint.value = null
}

// 文件夹内下拉项的 drop（带 .stop 防止冒泡到外层文件夹节点）
function onDragOverDrop(e, targetId, orientation) {
  e.stopPropagation()
  onDrop(e, targetId, orientation)
}

function dropClass(id) {
  if (!dropHint.value || dropHint.value.id !== id) return ''
  return dropHint.value.pos === 'before' ? 'drop-before' : 'drop-after'
}
</script>

<style scoped>
.fav-bar {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 7px 14px;
  margin-top: 10px;
  transition: background-color 0.25s ease, border-color 0.25s ease;
  overflow: visible;
}

.fav-bar-label {
  font-size: 12px;
  color: var(--text-tertiary);
  white-space: nowrap;
  font-weight: 500;
}

.fav-empty {
  font-size: 12px;
  color: var(--text-placeholder);
}

.fav-items {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  flex: 1;
  min-width: 0;
}

.fav-node {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 2px;
}

.fav-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  font-size: 12px;
  color: var(--text-secondary);
  background: var(--bg-header);
  border: 1px solid var(--border-light);
  border-radius: 3px;
  cursor: grab;
  transition: all 0.15s;
  white-space: nowrap;
  max-width: 220px;
  user-select: none;
}

.fav-chip:active {
  cursor: grabbing;
}

.fav-chip:hover {
  color: var(--accent);
  border-color: var(--accent-border);
  background: var(--accent-bg);
}

.fav-chip.folder-chip.open {
  color: var(--accent);
  border-color: var(--accent);
  background: var(--accent-bg);
}

.chip-icon {
  font-size: 12px;
  line-height: 1;
}

.chip-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chip-count {
  font-size: 10px;
  color: var(--text-tertiary);
  background: var(--badge-bg);
  border-radius: 8px;
  padding: 0 6px;
  line-height: 15px;
}

.chip-caret {
  width: 0;
  height: 0;
  border-left: 3.5px solid transparent;
  border-right: 3.5px solid transparent;
  border-top: 4px solid var(--caret);
  transition: transform 0.2s;
}

.chip-caret.up {
  transform: rotate(180deg);
}

.chip-ctrl {
  display: inline-flex;
  align-items: center;
  gap: 1px;
}

.ctrl-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  font-size: 9px;
  line-height: 1;
  color: var(--text-tertiary);
  background: transparent;
  border: 1px solid var(--border-ctrl);
  border-radius: 3px;
  cursor: pointer;
  transition: all 0.15s;
  padding: 0;
}

.ctrl-btn.danger:hover {
  color: var(--up-text);
  border-color: var(--up-text);
  background: var(--up-bg);
}

/* 拖拽中的节点半透明 */
.fav-node.dragging,
.folder-item.dragging {
  opacity: 0.4;
}

/* 顶层横向拖拽指示线 */
.fav-node.drop-before::before,
.fav-node.drop-after::after {
  content: '';
  position: absolute;
  top: 2px;
  bottom: 2px;
  width: 2px;
  background: var(--accent);
  border-radius: 1px;
}

.fav-node.drop-before::before {
  left: -4px;
}

.fav-node.drop-after::after {
  right: -4px;
}

.folder-dropdown {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 200;
  min-width: 200px;
  max-width: 280px;
  background: var(--bg-card);
  border: 1px solid var(--border-dropdown);
  border-radius: 4px;
  box-shadow: var(--shadow);
  padding: 4px;
}

.folder-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 4px;
  border-radius: 3px;
}

.folder-item:hover {
  background: var(--bg-hover);
}

/* 文件夹内纵向拖拽指示线 */
.folder-item.drop-before::before,
.folder-item.drop-after::after {
  content: '';
  position: absolute;
  left: 6px;
  right: 6px;
  height: 2px;
  background: var(--accent);
  border-radius: 1px;
}

.folder-item.drop-before::before {
  top: -1px;
}

.folder-item.drop-after::after {
  bottom: -1px;
}

.fi-name {
  flex: 1;
  min-width: 0;
  text-align: left;
  padding: 5px 6px;
  font-size: 12px;
  color: var(--text-444);
  background: transparent;
  border: none;
  border-radius: 3px;
  cursor: grab;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: color 0.15s;
  user-select: none;
}

.fi-name:active {
  cursor: grabbing;
}

.fi-name:hover {
  color: var(--accent);
}

.fi-ctrl {
  display: inline-flex;
  align-items: center;
  gap: 1px;
  flex-shrink: 0;
}

.folder-empty {
  padding: 10px 8px;
  font-size: 12px;
  color: var(--text-placeholder);
  text-align: center;
}

.dropdown-backdrop {
  position: fixed;
  inset: 0;
  z-index: 150;
}

/* ===== 移动端适配 ===== */
@media (max-width: 768px) {
  .fav-bar {
    padding: 6px 10px;
    gap: 6px;
    flex-wrap: wrap;
  }

  .fav-bar-label {
    font-size: 11px;
    flex-shrink: 0;
  }

  .fav-empty {
    font-size: 11px;
    line-height: 1.4;
  }

  .fav-items {
    gap: 5px;
  }

  /* 触控友好的芯片尺寸 */
  .fav-chip {
    padding: 6px 10px;
    font-size: 12px;
    max-width: 180px;
  }

  /* 移动端无 hover，删除按钮常驻显示 */
  .chip-ctrl {
    display: inline-flex !important;
  }

  .ctrl-btn {
    width: 20px;
    height: 20px;
    font-size: 10px;
  }

  /* 文件夹下拉在移动端尽量宽 */
  .folder-dropdown {
    min-width: 180px;
    max-width: calc(100vw - 40px);
    left: auto;
    right: 0;
  }

  .fi-name {
    padding: 7px 6px;
    font-size: 13px;
  }

  .folder-item {
    padding: 3px 4px;
  }

  /* 文件夹内删除按钮也常驻 */
  .fi-ctrl {
    display: inline-flex !important;
  }
}
</style>
