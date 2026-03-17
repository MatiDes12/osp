"use client";

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";

interface VirtualListProps<T> {
  /** The full list of items to virtualize. */
  readonly items: readonly T[];
  /** Fixed pixel height of each item row. */
  readonly itemHeight: number;
  /** Fixed pixel height of the scrollable container. Use 0 for "fill parent". */
  readonly containerHeight?: number;
  /** Extra items to render above and below the visible viewport. */
  readonly overscan?: number;
  /** Render function for a single item. */
  readonly renderItem: (item: T, index: number) => ReactNode;
  /** Content shown when the items array is empty. */
  readonly emptyState?: ReactNode;
  /** Optional className applied to the outer scrollable container. */
  readonly className?: string;
  /** Called when the user scrolls near the bottom. Use for infinite scroll / load more. */
  readonly onLoadMore?: () => void;
  /** Pixel distance from bottom that triggers onLoadMore. Default 100. */
  readonly loadMoreThreshold?: number;
  /** Whether a load-more fetch is currently in progress. */
  readonly isLoadingMore?: boolean;
}

/**
 * Lightweight virtual scrolling component.
 *
 * Only renders items within the visible viewport (plus an overscan buffer),
 * keeping DOM node count constant regardless of total list size.
 */
export function VirtualList<T>({
  items,
  itemHeight,
  containerHeight = 0,
  overscan = 5,
  renderItem,
  emptyState,
  className,
  onLoadMore,
  loadMoreThreshold = 100,
  isLoadingMore = false,
}: VirtualListProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [measuredHeight, setMeasuredHeight] = useState(0);

  // Use ResizeObserver to measure the container when containerHeight is 0
  useEffect(() => {
    if (containerHeight > 0) return;
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setMeasuredHeight(entry.contentRect.height);
      }
    });

    observer.observe(el);
    // Seed initial value
    setMeasuredHeight(el.clientHeight);

    return () => observer.disconnect();
  }, [containerHeight]);

  const viewportHeight = containerHeight > 0 ? containerHeight : measuredHeight;
  const totalHeight = items.length * itemHeight;

  // Calculate visible range
  const { startIndex, endIndex } = useMemo(() => {
    if (viewportHeight === 0) {
      return { startIndex: 0, endIndex: 0 };
    }
    const rawStart = Math.floor(scrollTop / itemHeight);
    const rawEnd = Math.ceil((scrollTop + viewportHeight) / itemHeight);
    return {
      startIndex: Math.max(0, rawStart - overscan),
      endIndex: Math.min(items.length, rawEnd + overscan),
    };
  }, [scrollTop, viewportHeight, itemHeight, items.length, overscan]);

  // Throttled scroll handler using requestAnimationFrame
  const rafRef = useRef<number | null>(null);
  const loadMoreCalledRef = useRef(false);

  const handleScroll = useCallback(() => {
    if (rafRef.current !== null) return;

    rafRef.current = requestAnimationFrame(() => {
      const el = containerRef.current;
      if (el) {
        setScrollTop(el.scrollTop);

        // Infinite scroll trigger
        if (onLoadMore && !isLoadingMore) {
          const distanceFromBottom =
            el.scrollHeight - el.scrollTop - el.clientHeight;
          if (distanceFromBottom < loadMoreThreshold) {
            if (!loadMoreCalledRef.current) {
              loadMoreCalledRef.current = true;
              onLoadMore();
            }
          } else {
            loadMoreCalledRef.current = false;
          }
        }
      }
      rafRef.current = null;
    });
  }, [onLoadMore, isLoadingMore, loadMoreThreshold]);

  // Reset the load-more guard when items change (new page arrived)
  useEffect(() => {
    loadMoreCalledRef.current = false;
  }, [items.length]);

  // Clean up rAF on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  if (items.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  const visibleItems = items.slice(startIndex, endIndex);
  const topSpacer = startIndex * itemHeight;
  const bottomSpacer = (items.length - endIndex) * itemHeight;

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className={className}
      style={
        containerHeight > 0
          ? { height: containerHeight, overflow: "auto" }
          : { flex: 1, overflow: "auto" }
      }
    >
      {/* Top spacer */}
      <div style={{ height: topSpacer }} />

      {/* Visible items */}
      {visibleItems.map((item, i) => {
        const absoluteIndex = startIndex + i;
        return (
          <div
            key={absoluteIndex}
            style={{ height: itemHeight }}
          >
            {renderItem(item, absoluteIndex)}
          </div>
        );
      })}

      {/* Bottom spacer */}
      <div style={{ height: bottomSpacer }} />

      {/* Loading indicator for infinite scroll */}
      {isLoadingMore && (
        <div className="flex items-center justify-center py-4">
          <div className="h-5 w-5 border-2 border-zinc-600 border-t-transparent rounded-full animate-spin" />
          <span className="ml-2 text-xs text-zinc-500">Loading more...</span>
        </div>
      )}
    </div>
  );
}
