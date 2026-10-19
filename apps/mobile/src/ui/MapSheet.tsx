import {
  type ComponentRef,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  type LayoutChangeEvent,
  Keyboard,
  PanResponder,
  ScrollView,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import { useTheme } from '@/theme/theme';

import { Sheet } from './Sheet';
import {
  availableHeight,
  keyboardOverlap,
  nearestSnap,
  releaseVelocity,
  resolveSnapHeights,
  type SnapPoint,
} from './sheet-snap';

export type { SnapPoint } from './sheet-snap';

interface MapSheetProps {
  children: ReactNode;
  /**
   * Pinned under the content and visible at every snap point (the big next
   * action). The sheet never gets shorter than the handle plus the footer.
   */
  footer?: ReactNode;
  /** Ascending. Default `['peek', 'half', 'full']` (30%, 55%, 100% of the space under the top controls row). */
  snapPoints?: readonly SnapPoint[];
  /** The snap point shown first (index into `snapPoints`). Default: the lowest. */
  defaultIndex?: number;
  /** Controlled snap index. When it changes, the sheet moves there. */
  index?: number;
  /** Called when the sheet settles on a snap point, after a drag or an accessibility action. */
  onIndexChange?: (index: number) => void;
  testID?: string;
}

const DEFAULT_SNAPS: readonly SnapPoint[] = ['peek', 'half', 'full'];
/** Top padding (10), handle (5) and its gap (16) of `Sheet`. */
const HANDLE_AREA = 31;
/** A drag has to move this far (px) before the sheet takes the gesture from its content. */
const DRAG_SLOP = 6;

/**
 * The bottom sheet of the map-first shell: a `Sheet` that drags between snap
 * points. Place it as a child of `MapScreen` (it positions itself at the
 * bottom of its parent). Built on RN `Animated` + `PanResponder` only, so it
 * works on web and native alike.
 *
 * The content scrolls only at the highest snap point, so the inner scroll
 * never fights the drag; at the top of the scroll, pulling down drags the
 * sheet again. Safe-area insets and the keyboard are respected.
 */
export function MapSheet({
  children,
  footer,
  snapPoints = DEFAULT_SNAPS,
  defaultIndex = 0,
  index: controlledIndex,
  onIndexChange,
  testID = 'map-sheet',
}: MapSheetProps) {
  const t = useTheme();
  const insets = useContext(SafeAreaInsetsContext) ?? { top: 0, bottom: 0, left: 0, right: 0 };
  const root = useRef<ComponentRef<typeof View>>(null);
  const [containerHeight, setContainerHeight] = useState(0);
  const [footerHeight, setFooterHeight] = useState(0);
  const [overlap, setOverlap] = useState(0);
  const [ownIndex, setOwnIndex] = useState(defaultIndex);
  const index = controlledIndex ?? ownIndex;
  const last = snapPoints.length - 1;

  const available = availableHeight(containerHeight, {
    keyboardOverlap: overlap,
    topInset: insets.top,
  });
  const minHeight = HANDLE_AREA + footerHeight;
  const heights = useMemo(
    () => resolveSnapHeights(snapPoints, { available, minHeight }),
    [snapPoints, available, minHeight],
  );
  const target = heights[Math.min(index, last)] ?? minHeight;

  // The height is animated on the JS thread: the footer must stay at the
  // bottom of a sheet whose height changes, and a transform would hide it.
  const [height] = useState(() => new Animated.Value(target));
  const current = useRef(target);
  useEffect(() => {
    const id = height.addListener(({ value }) => {
      current.current = value;
    });
    return () => height.removeListener(id);
  }, [height]);

  const animateTo = useCallback(
    (to: number) => {
      Animated.spring(height, {
        toValue: to,
        useNativeDriver: false,
        bounciness: 0,
        speed: 16,
      }).start();
    },
    [height],
  );
  // Jump to the first real size instead of springing up from nothing.
  const placed = useRef(false);
  const measured = containerHeight > 0 && (!footer || footerHeight > 0);
  useEffect(() => {
    if (!measured) return;
    if (placed.current) animateTo(target);
    else height.setValue(target);
    placed.current = true;
  }, [animateTo, height, measured, target]);

  const heightsRef = useRef(heights);
  const indexRef = useRef(index);
  const scrollY = useRef(0);
  const dragStart = useRef(0);
  const lastMove = useRef(0);
  const lastRef = useRef(last);

  const settle = useCallback(
    (next: number) => {
      const clamped = Math.min(last, Math.max(0, next));
      if (clamped !== indexRef.current) {
        setOwnIndex(clamped);
        onIndexChange?.(clamped);
      } else {
        // Same snap point: the effect won't run, so spring back here.
        animateTo(heightsRef.current[clamped] ?? 0);
      }
    },
    [animateTo, last, onIndexChange],
  );

  const settleRef = useRef(settle);
  useEffect(() => {
    heightsRef.current = heights;
    indexRef.current = index;
    lastRef.current = last;
    settleRef.current = settle;
  });

  // Created once; its handlers only read refs, and only when a gesture runs.
  const makePan = (claimOnStart: boolean) =>
    PanResponder.create({
      // The handle takes the gesture at once: on web the pointer is only followed
      // while it is over the view that has the gesture, and a quick drag leaves the sheet.
      onStartShouldSetPanResponder: () => claimOnStart,
      onMoveShouldSetPanResponderCapture: (_e, g) => {
        if (Math.abs(g.dy) < DRAG_SLOP || Math.abs(g.dy) < Math.abs(g.dx)) return false;
        // At the top snap point the content scrolls; only a pull down from its top drags the sheet.
        if (indexRef.current >= lastRef.current) return scrollY.current <= 0 && g.dy > 0;
        return true;
      },
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        height.stopAnimation();
        dragStart.current = current.current;
      },
      onPanResponderMove: (_e, g) => {
        const all = heightsRef.current;
        const low = all[0] ?? 0;
        const high = all[all.length - 1] ?? low;
        lastMove.current = Date.now();
        height.setValue(Math.min(high, Math.max(low, dragStart.current - g.dy)));
      },
      onPanResponderRelease: (_e, g) => {
        settleRef.current(
          nearestSnap(
            heightsRef.current,
            current.current,
            releaseVelocity(g.vy, Date.now() - lastMove.current),
          ),
        );
      },
      onPanResponderTerminate: () => {
        settleRef.current(nearestSnap(heightsRef.current, current.current, 0));
      },
    });
  // eslint-disable-next-line react-hooks/refs -- the lint sees the refs captured by the handlers as render-time reads
  const [pan] = useState(() => makePan(false));
  // eslint-disable-next-line react-hooks/refs -- same
  const [handlePan] = useState(() => makePan(true));

  // Lift the sheet above the keyboard. Measured against the window so a
  // platform that already resized the screen for the keyboard counts as 0.
  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', (e) => {
      const view = root.current;
      if (!view || typeof view.measureInWindow !== 'function') {
        setOverlap(e.endCoordinates.height);
        return;
      }
      view.measureInWindow((_x, y, _w, h) =>
        setOverlap(keyboardOverlap(e.endCoordinates.screenY, y + h)),
      );
    });
    const hidden = Keyboard.addListener('keyboardDidHide', () => setOverlap(0));
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);

  const onLayout = (e: LayoutChangeEvent) => setContainerHeight(e.nativeEvent.layout.height);
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollY.current = e.nativeEvent.contentOffset.y;
  };
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
  // Back at a lower snap point the content starts from the top again.
  useEffect(() => {
    if (index < last) {
      scrollY.current = 0;
      scroller.current?.scrollTo({ y: 0, animated: false });
    }
  }, [index, last]);

  const keyboardUp = overlap > 0;
  const footerPadding = keyboardUp ? t.space[3] : Math.max(insets.bottom, t.space[4]);

  return (
    <View
      ref={root}
      style={StyleSheet.absoluteFill}
      pointerEvents="box-none"
      onLayout={onLayout}
      testID={testID}
    >
      <Animated.View
        {...pan.panHandlers}
        style={[styles.sheet, { height, bottom: overlap }]}
        testID={`${testID}-panel`}
      >
        <Sheet
          grabber={false}
          style={[styles.card, { paddingHorizontal: t.space[5] }]}
          testID={`${testID}-card`}
        >
          <View
            {...handlePan.panHandlers}
            style={styles.handleZone}
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel="Sheet size"
            accessibilityValue={{ now: index + 1, min: 1, max: snapPoints.length }}
            accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
            onAccessibilityAction={(e) =>
              settle(index + (e.nativeEvent.actionName === 'increment' ? 1 : -1))
            }
            testID={`${testID}-grabber`}
          >
            <View style={[styles.bar, { backgroundColor: t.color.grab }]} />
          </View>
          <ScrollView
            ref={scroller}
            style={styles.content}
            contentContainerStyle={{ paddingBottom: footer ? t.space[3] : footerPadding }}
            scrollEnabled={index >= last}
            onScroll={onScroll}
            scrollEventThrottle={16}
            bounces={false}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            testID={`${testID}-content`}
          >
            {children}
          </ScrollView>
          {footer ? (
            <View
              style={{ paddingTop: t.space[2], paddingBottom: footerPadding }}
              onLayout={(e) => setFooterHeight(e.nativeEvent.layout.height)}
              testID={`${testID}-footer`}
            >
              {footer}
            </View>
          ) : null}
        </Sheet>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { position: 'absolute', left: 0, right: 0 },
  card: { flex: 1, paddingBottom: 0, overflow: 'hidden' },
  // A taller hit area than the 5px bar; the negative margin keeps the layout of `Sheet`.
  handleZone: {
    alignItems: 'center',
    paddingVertical: 8,
    marginTop: -8,
    marginBottom: 8,
    userSelect: 'none',
  },
  bar: { width: 40, height: 5, borderRadius: 3 },
  content: { flex: 1 },
});
