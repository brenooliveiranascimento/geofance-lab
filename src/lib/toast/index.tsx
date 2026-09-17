import React, {
  createContext,
  useCallback,
  useMemo,
  useContext,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  View,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, radius, fontSize } from '@src/theme';

export type ToastType = 'error' | 'success' | 'warning';

export interface ToastOptions {
  message: string;
  type?: ToastType;
  duration?: number;
}

interface ToastState {
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  show: (opts: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TYPE_CONFIG: Record<ToastType, { border: string; icon: string; color: string }> = {
  error: { border: colors.error, icon: '⚠', color: colors.error },
  success: { border: colors.success, icon: '✓', color: colors.success },
  warning: { border: colors.warning, icon: 'ℹ', color: colors.warning },
};

export function ToastProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { top } = useSafeAreaInsets();
  const [toast, setToast] = useState<ToastState | null>(null);
  const translateY = useRef(new Animated.Value(-100)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const hideTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hide = useCallback(() => {
    Animated.parallel([
      Animated.timing(translateY, { toValue: -100, duration: 250, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }),
    ]).start(() => setToast(null));
  }, [translateY, opacity]);

  const show = useCallback(
    ({ message, type = 'error', duration = 3000 }: ToastOptions) => {
      if (hideTimeout.current) clearTimeout(hideTimeout.current);

      setToast({ message, type });

      translateY.setValue(-100);
      opacity.setValue(0);

      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          bounciness: 4,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();

      hideTimeout.current = setTimeout(hide, duration);
    },
    [translateY, opacity, hide],
  );

  const cfg = toast ? TYPE_CONFIG[toast.type] : null;
  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      <View style={styles.root}>
        {children}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.container,
            {
              top: top + (Platform.OS === 'android' ? 8 : 4),
              transform: [{ translateY }],
              opacity,
            },
          ]}
        >
          {cfg && (
            <View style={[styles.pill, { borderColor: cfg.border }]}>
              <Text style={[styles.icon, { color: cfg.color }]}>{cfg.icon}</Text>
              <Text style={styles.message} numberOfLines={2}>
                {toast?.message}
              </Text>
            </View>
          )}
        </Animated.View>
      </View>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  container: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    zIndex: 9999,
    elevation: 9999,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    width: '100%',
    backgroundColor: colors.surfaceElevated,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  icon: {
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  message: {
    flex: 1,
    fontSize: fontSize.sm,
    fontWeight: '500',
    lineHeight: 20,
    color: colors.text,
  },
});
