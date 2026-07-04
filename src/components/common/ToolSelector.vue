<template>
  <div class="tool-selector" v-click-outside="closeDropdown">
    <button type="button" class="selector-trigger" @click="toggleDropdown" :disabled="disabled">
      <span class="trigger-label">{{ selectedLabel }}</span>
      <span class="trigger-icon" :class="{ open: isOpen }">▼</span>
    </button>

    <Transition name="dropdown">
      <div v-if="isOpen" class="selector-dropdown">
        <div
          v-for="option in options"
          :key="option.value"
          class="dropdown-option"
          :class="{ active: option.value === modelValue }"
          @click="selectOption(option.value)"
        >
          {{ option.label }}
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';

interface ToolOption {
  value: string;
  label: string;
}

interface Props {
  modelValue: string;
  options: ToolOption[];
  disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false
});

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

const isOpen = ref(false);

const selectedLabel = computed(() => {
  return props.options.find(opt => opt.value === props.modelValue)?.label || '';
});

function toggleDropdown() {
  if (props.disabled) return;
  isOpen.value = !isOpen.value;
}

function closeDropdown() {
  isOpen.value = false;
}

function selectOption(value: string) {
  emit('update:modelValue', value);
  closeDropdown();
}

// v-click-outside 指令
const vClickOutside = {
  mounted(el: HTMLElement, binding: any) {
    el.clickOutsideEvent = (event: MouseEvent) => {
      if (!(el === event.target || el.contains(event.target as Node))) {
        binding.value(event);
      }
    };
    document.addEventListener('click', el.clickOutsideEvent);
  },
  unmounted(el: HTMLElement & { clickOutsideEvent?: (e: MouseEvent) => void }) {
    if (el.clickOutsideEvent) {
      document.removeEventListener('click', el.clickOutsideEvent);
    }
  },
};
</script>

<style scoped>
.tool-selector {
  position: relative;
  width: 100%;
}

.selector-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  height: 40px;
  padding: 0 12px;
  background: rgba(30, 30, 35, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  color: var(--vt-text);
  cursor: pointer;
  transition: all 200ms ease;
}

.selector-trigger:hover:not(:disabled) {
  border-color: rgba(91, 66, 243, 0.5);
  background: rgba(30, 30, 35, 0.8);
}

.selector-trigger:focus,
.selector-trigger.open {
  border-color: rgba(91, 66, 243, 0.6);
  box-shadow: 0 0 0 1px rgba(91, 66, 243, 0.3);
}

.selector-trigger:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.trigger-label {
  flex: 1;
  text-align: left;
  color: #ffffff;
}

.trigger-icon {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.5);
  transition: transform 300ms cubic-bezier(0.4, 0, 0.2, 1);
}

.trigger-icon.open {
  transform: rotate(180deg);
}

.selector-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  padding: 4px;
  background: #1e1e1e;
  backdrop-filter: blur(40px) saturate(180%);
  -webkit-backdrop-filter: blur(40px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
  overflow: hidden;
  z-index: 1000;
}

.dropdown-option {
  padding: 10px 12px;
  margin: 0;
  font-size: 14px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.9);
  cursor: pointer;
  transition: all 150ms ease;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-radius: 6px;
}

.dropdown-option:hover:not(.active) {
  background: rgba(255, 255, 255, 0.05);
}

.dropdown-option.active {
  background: rgba(91, 66, 243, 0.15);
  color: #ffffff;
}

.dropdown-option.active::after {
  content: '✓';
  color: #5b42f3;
  font-size: 16px;
  font-weight: 700;
}

/* 弹性动画 */
.dropdown-enter-active {
  transition: all 250ms cubic-bezier(0.34, 1.56, 0.64, 1);
}

.dropdown-leave-active {
  transition: all 180ms cubic-bezier(0.4, 0, 1, 1);
}

.dropdown-enter-from {
  opacity: 0;
  transform: scale(0.92) translateY(-12px);
}

.dropdown-leave-to {
  opacity: 0;
  transform: scale(0.94) translateY(-6px);
}
</style>
