import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';

interface Props {
  label: string;
  isToday: boolean;
  onPrev: () => void;
  onNext: () => void;
  onLabelPress?: () => void;
  onBackToToday: () => void;
}

const ARROW_SLOT = 72; // wider touch target for arrows
const HEADER_H = 52;

export default function TabHeader({
  label,
  isToday,
  onPrev,
  onNext,
  onLabelPress,
}: Props) {
  return (
    <>
      <View style={styles.header}>
        {/*
          Date label: absolutely positioned, inset by ARROW_SLOT on each side
          so it never overlaps the arrow touch areas.
        */}
        <View
          style={[
            StyleSheet.absoluteFillObject,
            { left: ARROW_SLOT, right: ARROW_SLOT },
          ]}
          pointerEvents="box-none"
        >
          <TouchableOpacity
            style={styles.centerTouchable}
            onPress={onLabelPress}
            activeOpacity={1}
          >
            <Text style={[styles.label, !isToday && styles.labelNotToday]}>
              {label}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Left arrow — full ARROW_SLOT width, full header height */}
        <TouchableOpacity style={styles.leftArrow} onPress={onPrev} activeOpacity={1}>
          <ChevronLeft size={26} color="#000" strokeWidth={2.5} />
        </TouchableOpacity>

        {/* Spacer keeps right arrow pushed to the end */}
        <View style={styles.spacer} />

        {/* Right arrow — full ARROW_SLOT width, full header height */}
        <TouchableOpacity style={styles.rightArrow} onPress={onNext} activeOpacity={1}>
          <ChevronRight size={26} color="#000" strokeWidth={2.5} />
        </TouchableOpacity>
      </View>

      <View style={styles.divider} />
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    height: HEADER_H,
  },
  leftArrow: {
    width: ARROW_SLOT,
    height: HEADER_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spacer: {
    flex: 1,
  },
  rightArrow: {
    width: ARROW_SLOT,
    height: HEADER_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerTouchable: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 21,
    fontWeight: '700',
    color: '#000',
    letterSpacing: 0.3,
  },
  labelNotToday: {
    fontWeight: '400',
  },
  divider: {
    height: 3,
    backgroundColor: '#000',
  },
});
