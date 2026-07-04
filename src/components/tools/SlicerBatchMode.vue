<template>
  <div class="slicer-batch-mode">
    <BatchPolicyCard
      :mode="mode"
      :target-value="targetValue"
      :enabled-modes="enabledModes"
      :duration-display="durationDisplay"
      :duration-unit="durationUnit"
      :size-value="sizeValue"
      :use-overlap-handles="useOverlapHandles"
      :overlap-duration="overlapDuration"
    />
  </div>
</template>

<script setup lang="ts">
import BatchPolicyCard from '../workspace/BatchPolicyCard.vue';

defineProps<{
  mode: 'duration' | 'size';
  targetValue: number;
  enabledModes?: { duration: boolean; size: boolean };
  durationDisplay?: number;
  durationUnit?: 'minutes' | 'seconds';
  sizeValue?: number;
  useOverlapHandles?: boolean;
  overlapDuration?: number;
}>();
</script>

<style scoped>
.slicer-batch-mode { flex: 1; display: flex; flex-direction: column; }
</style>
