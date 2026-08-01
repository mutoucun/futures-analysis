<template>
  <div v-if="visible" class="dialog-overlay" @click.self="cancel">
    <div class="dialog-card">
      <div class="dialog-title">收藏查询</div>

      <div class="dialog-field">
        <label class="dialog-label">名称：</label>
        <input
          ref="nameInputRef"
          v-model="name"
          class="dialog-input"
          placeholder="收藏名称"
          maxlength="30"
        />
      </div>

      <div class="dialog-field">
        <label class="dialog-label">文件夹：</label>
        <div class="folder-options">
          <label class="folder-opt">
            <input type="radio" v-model="folderChoice" value="__none__" />
            <span>不放入文件夹（直接显示在收藏夹栏）</span>
          </label>
          <label v-for="f in folders" :key="f.id" class="folder-opt">
            <input type="radio" v-model="folderChoice" :value="f.id" />
            <span class="folder-opt-name">📁 {{ f.name }}</span>
            <span class="folder-opt-count">{{ f.children.length }}</span>
          </label>
          <label class="folder-opt">
            <input type="radio" v-model="folderChoice" value="__new__" />
            <span class="folder-opt-new">＋ 新建文件夹</span>
          </label>
        </div>
        <input
          v-if="folderChoice === '__new__'"
          v-model="newFolderName"
          class="dialog-input new-folder-input"
          placeholder="输入新文件夹名称，如：豆粕-菜粕"
          maxlength="20"
        />
      </div>

      <div class="dialog-actions">
        <button class="dialog-btn primary" :disabled="!canConfirm" @click="confirm">确定</button>
        <button class="dialog-btn" @click="cancel">取消</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
  defaultName: { type: String, default: '' },
  // 仅文件夹节点：[{ id, name, children: [] }]
  folders: { type: Array, default: () => [] }
})

const emit = defineEmits(['confirm', 'cancel'])

const name = ref('')
const newFolderName = ref('')
// '__none__' = 不放入文件夹 | '__new__' = 新建文件夹 | 其余为已有文件夹 id
const folderChoice = ref('__none__')
const nameInputRef = ref(null)

const canConfirm = computed(() => {
  if (!name.value.trim()) return false
  if (folderChoice.value === '__new__' && !newFolderName.value.trim()) return false
  return true
})

// 每次打开时重置表单：名称取自动生成的默认名，文件夹默认选中第一个（无则"不放入文件夹"）
watch(() => props.visible, (val) => {
  if (val) {
    name.value = props.defaultName
    newFolderName.value = ''
    folderChoice.value = props.folders.length ? props.folders[0].id : '__none__'
    nextTick(() => nameInputRef.value && nameInputRef.value.select())
  }
})

function confirm() {
  if (!canConfirm.value) return
  emit('confirm', {
    name: name.value.trim(),
    folderId: folderChoice.value,
    newFolderName: newFolderName.value.trim()
  })
}

function cancel() {
  emit('cancel')
}
</script>

<style scoped>
.dialog-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
}

.dialog-card {
  width: 420px;
  max-width: calc(100vw - 40px);
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 6px;
  box-shadow: var(--shadow);
  padding: 20px 22px;
}

.dialog-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 16px;
}

.dialog-field {
  margin-bottom: 14px;
}

.dialog-label {
  display: block;
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.dialog-input {
  width: 100%;
  padding: 7px 10px;
  font-size: 13px;
  color: var(--text-primary);
  background: var(--bg-card);
  border: 1px solid var(--border-ctrl);
  border-radius: 3px;
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.dialog-input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-focus);
}

.folder-options {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 180px;
  overflow-y: auto;
  border: 1px solid var(--border-light);
  border-radius: 3px;
  padding: 6px;
}

.folder-opt {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  font-size: 13px;
  color: var(--text-444);
  border-radius: 3px;
  cursor: pointer;
  transition: background 0.15s;
}

.folder-opt:hover {
  background: var(--bg-hover);
}

.folder-opt input[type="radio"] {
  accent-color: var(--accent);
}

.folder-opt-name {
  flex: 1;
}

.folder-opt-count {
  font-size: 11px;
  color: var(--text-tertiary);
  background: var(--badge-bg);
  border-radius: 8px;
  padding: 1px 7px;
}

.folder-opt-new {
  color: var(--accent);
}

.new-folder-input {
  margin-top: 8px;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 18px;
}

.dialog-btn {
  padding: 6px 20px;
  font-size: 13px;
  border-radius: 3px;
  cursor: pointer;
  transition: all 0.2s;
  color: var(--text-secondary);
  background: var(--bg-card);
  border: 1px solid var(--border-ctrl);
}

.dialog-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.dialog-btn.primary {
  color: #fff;
  background: var(--accent);
  border-color: var(--accent);
}

.dialog-btn.primary:hover:not(:disabled) {
  background: var(--accent-hover);
}

.dialog-btn.primary:disabled {
  background: var(--accent-disabled-bg);
  border-color: var(--accent-disabled-bg);
  cursor: not-allowed;
}
</style>
