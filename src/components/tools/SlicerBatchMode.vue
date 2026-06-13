<template>
  <div class="slicer-batch-mode">
    <BatchPolicyCard :mode="mode" :target-value="targetValue" />
  </div>
</template>

<script setup lang="ts">
import BatchPolicyCard from '../workspace/BatchPolicyCard.vue';

defineProps<{
  mode: 'duration' | 'size';
  targetValue: number;
}>();
</script>

<style scoped>
.slicer-batch-mode { flex: 1; display: flex; flex-direction: column; }
</style>
