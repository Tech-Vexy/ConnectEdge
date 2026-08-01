// screens/Hubs.tsx — Community Hubs & Local Events Screen
import React, { useState } from 'react'
import {
  View, Text, StyleSheet, FlatList, Pressable, TextInput, Modal, ScrollView,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { useStore } from '../store'
import { TabBar, type TabId } from '../components/TabBar'
import { HubCard } from '../components/HubCard'
import { EventCard } from '../components/EventCard'
import { colors, typography, fontSizes, spacing, radius, gradients } from '../theme'
import { HapticFeedback } from '../lib/haptics'

export default function Hubs({ activeTab, onTabChange }: {
  activeTab: TabId
  onTabChange: (t: TabId) => void
}) {
  const { hubs, events, toggleJoinHub, toggleRSVPEvent, createEvent } = useStore()

  const [subTab, setSubTab] = useState<'hubs' | 'events'>('hubs')
  const [modalVisible, setModalVisible] = useState(false)

  // Event Form State
  const [evtTitle, setEvtTitle]       = useState('')
  const [evtDesc, setEvtDesc]         = useState('')
  const [evtLocation, setEvtLocation] = useState('')
  const [evtDate, setEvtDate]         = useState('')
  const [evtCategory, setEvtCategory] = useState('Tech & Social')

  const hubList = Array.from(hubs.values())
  const eventList = Array.from(events.values())

  const handleCreateEvent = () => {
    if (!evtTitle || !evtLocation || !evtDate) return
    HapticFeedback.success()
    createEvent(evtTitle, evtDesc, evtLocation, evtDate, evtCategory)
    setEvtTitle('')
    setEvtDesc('')
    setEvtLocation('')
    setEvtDate('')
    setModalVisible(false)
  }

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <LinearGradient
              colors={gradients.brand}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.logoWrap}
            >
              <Text style={styles.logo}>Community Hubs</Text>
            </LinearGradient>
          </View>

          {subTab === 'events' && (
            <Pressable
              style={styles.createBtn}
              onPress={() => {
                HapticFeedback.light()
                setModalVisible(true)
              }}
            >
              <Text style={styles.createBtnText}>+ Host Event</Text>
            </Pressable>
          )}
        </View>

        {/* Subtab Toggle (Hubs vs Events) */}
        <View style={styles.toggleBar}>
          <Pressable
            style={[styles.toggleBtn, subTab === 'hubs' && styles.toggleBtnActive]}
            onPress={() => {
              HapticFeedback.light()
              setSubTab('hubs')
            }}
          >
            <Text style={[styles.toggleText, subTab === 'hubs' && styles.toggleTextActive]}>
              🏰 Interest Hubs ({hubList.length})
            </Text>
          </Pressable>

          <Pressable
            style={[styles.toggleBtn, subTab === 'events' && styles.toggleBtnActive]}
            onPress={() => {
              HapticFeedback.light()
              setSubTab('events')
            }}
          >
            <Text style={[styles.toggleText, subTab === 'events' && styles.toggleTextActive]}>
              🎉 Local Meetups ({eventList.length})
            </Text>
          </Pressable>
        </View>

        {/* Content List */}
        {subTab === 'hubs' ? (
          <FlatList
            data={hubList}
            keyExtractor={item => item.id}
            renderItem={({ item }) => (
              <HubCard hub={item} onToggleJoin={toggleJoinHub} />
            )}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />
        ) : (
          <FlatList
            data={eventList}
            keyExtractor={item => item.id}
            renderItem={({ item }) => (
              <EventCard event={item} onToggleRSVP={toggleRSVPEvent} />
            )}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />
        )}
      </SafeAreaView>

      <TabBar active={activeTab} onChange={onTabChange} />

      {/* Host Event Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <ScrollView contentContainerStyle={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Host a Local Meetup</Text>
              <Pressable onPress={() => setModalVisible(false)}>
                <Text style={styles.closeBtn}>✕</Text>
              </Pressable>
            </View>

            <TextInput
              style={styles.input}
              placeholder="Event Title (e.g. Campus Board Game Night)"
              placeholderTextColor={colors.textMuted}
              value={evtTitle}
              onChangeText={setEvtTitle}
            />

            <TextInput
              style={styles.input}
              placeholder="Location or Venue (e.g. Student Center Lounge)"
              placeholderTextColor={colors.textMuted}
              value={evtLocation}
              onChangeText={setEvtLocation}
            />

            <TextInput
              style={styles.input}
              placeholder="Date & Time (e.g. Friday 6:00 PM)"
              placeholderTextColor={colors.textMuted}
              value={evtDate}
              onChangeText={setEvtDate}
            />

            <TextInput
              style={[styles.input, styles.multilineInput]}
              placeholder="Event Details / What to bring..."
              placeholderTextColor={colors.textMuted}
              multiline
              value={evtDesc}
              onChangeText={setEvtDesc}
            />

            <Pressable
              style={[styles.submitBtn, (!evtTitle || !evtLocation || !evtDate) && styles.submitBtnDisabled]}
              onPress={handleCreateEvent}
              disabled={!evtTitle || !evtLocation || !evtDate}
            >
              <Text style={styles.submitBtnText}>Broadcast Event to Mesh</Text>
            </Pressable>
          </ScrollView>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  safeArea: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  titleRow: {},
  logoWrap: { borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  logo: { ...typography.heading, fontSize: fontSizes.lg, color: '#FFF' },
  createBtn: {
    backgroundColor: colors.pulse,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  createBtnText: { ...typography.label, fontSize: fontSizes.xs, color: '#FFF' },

  toggleBar: {
    flexDirection: 'row',
    marginHorizontal: spacing.lg,
    marginVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.full,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  toggleBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  toggleBtnActive: {
    backgroundColor: colors.pulse,
  },
  toggleText: {
    ...typography.label,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  toggleTextActive: {
    color: '#FFF',
    fontWeight: '700',
  },

  listContent: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalTitle: { ...typography.heading, fontSize: fontSizes.lg, color: colors.textPrimary },
  closeBtn: { fontSize: 20, color: colors.textMuted },

  input: {
    ...typography.body,
    fontSize: fontSizes.sm,
    color: colors.textPrimary,
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  multilineInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },

  submitBtn: {
    backgroundColor: colors.pulse,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { ...typography.heading, fontSize: fontSizes.md, color: '#FFF' },
})
