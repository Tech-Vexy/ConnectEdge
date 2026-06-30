// components/ErrorBoundary.tsx
import React from 'react'
import { View, Text, StyleSheet, Pressable } from 'react-native'
import { colors, typography, spacing, fontSizes, radius } from '../theme'

interface Props { children: React.ReactNode; fallback?: string }
interface State { error: Error | null }

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // In production: send to Sentry / Bugsnag / logfire
    console.error('ErrorBoundary caught:', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <View style={styles.container}>
          <Text style={styles.glyph}>⊗</Text>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.message}>
            {this.props.fallback ?? this.state.error.message}
          </Text>
          <Pressable
            style={styles.button}
            onPress={() => this.setState({ error: null })}
          >
            <Text style={styles.buttonText}>Try again</Text>
          </Pressable>
        </View>
      )
    }
    return this.props.children
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: colors.bg,
    alignItems: 'center', justifyContent: 'center',
    padding: spacing.xl, gap: spacing.md,
  },
  glyph:   { fontSize: 36, color: colors.textMuted },
  title:   { ...typography.label, fontSize: fontSizes.lg, color: colors.textSecondary },
  message: { ...typography.mono, fontSize: fontSizes.xs, color: colors.textMuted, textAlign: 'center', lineHeight: 18 },
  button: {
    marginTop: spacing.md, paddingVertical: spacing.md, paddingHorizontal: spacing.xl,
    borderRadius: radius.md, borderWidth: 0.5, borderColor: colors.border,
  },
  buttonText: { ...typography.label, fontSize: fontSizes.md, color: colors.textSecondary },
})
