export interface MultiSelectHandler {
  handleClick: (event: MouseEvent, itemId: string) => string[];
}

export function createMultiSelectHandler(
  allItems: string[],
  selectedItems: string[]
): MultiSelectHandler {
  let lastClickedId: string | null = null;

  return {
    handleClick(event: MouseEvent, itemId: string): string[] {
      if (event.ctrlKey || event.metaKey) {
        const index = selectedItems.indexOf(itemId);
        if (index >= 0) {
          return selectedItems.filter(id => id !== itemId);
        } else {
          return [...selectedItems, itemId];
        }
      }

      if (event.shiftKey && lastClickedId && selectedItems.length > 0) {
        const lastIndex = allItems.indexOf(lastClickedId);
        const currentIndex = allItems.indexOf(itemId);
        if (lastIndex >= 0 && currentIndex >= 0) {
          const start = Math.min(lastIndex, currentIndex);
          const end = Math.max(lastIndex, currentIndex);
          return allItems.slice(start, end + 1);
        }
      }

      lastClickedId = itemId;
      return [itemId];
    }
  };
}
