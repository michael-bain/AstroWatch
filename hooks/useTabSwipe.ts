import { useRef, useMemo } from 'react';
import { PanResponder } from 'react-native';

const MIN_DX = 60;
const HORIZONTAL_BIAS = 1.5; // |dx| must exceed |dy| * this factor

interface Options {
  onSwipeLeft?: (() => void) | null;
  onSwipeRight?: (() => void) | null;
  disabled?: boolean;
}

export function useTabSwipe({ onSwipeLeft, onSwipeRight, disabled = false }: Options) {
  // Refs so the memoized PanResponder always reads the latest values
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;
  const leftRef = useRef(onSwipeLeft);
  leftRef.current = onSwipeLeft;
  const rightRef = useRef(onSwipeRight);
  rightRef.current = onSwipeRight;

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        // Do not claim on initial touch — only claim once movement is clearly horizontal
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, { dx, dy }) => {
          if (disabledRef.current) return false;
          return Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * HORIZONTAL_BIAS;
        },
        onPanResponderRelease: (_, { dx, dy }) => {
          if (disabledRef.current) return;
          if (Math.abs(dx) < MIN_DX) return;
          if (Math.abs(dx) <= Math.abs(dy) * HORIZONTAL_BIAS) return;
          if (dx < 0 && leftRef.current) leftRef.current();
          if (dx > 0 && rightRef.current) rightRef.current();
        },
        onPanResponderTerminationRequest: () => true,
      }),
    [],
  );

  return panResponder.panHandlers;
}
