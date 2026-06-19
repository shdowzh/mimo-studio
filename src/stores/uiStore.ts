import { create } from 'zustand'
import type { ViewId } from '@/lib/types'

type SettingsTab = 'appearance' | 'providers' | 'about'

interface UIState {
  // Navigation
  currentView: ViewId
  setCurrentView: (view: ViewId) => void

  // Settings sub-tab
  settingsTab: SettingsTab
  setSettingsTab: (tab: SettingsTab) => void

  // Sidebar
  sidebarCollapsed: boolean
  sidebarPinned: boolean
  toggleSidebar: () => void
  setSidebarPinned: (pinned: boolean) => void

  // Chat sub-panel
  conversationListOpen: boolean
  toggleConversationList: () => void

  // Modals
  activeModal: string | null
  modalData: unknown
  openModal: (modal: string, data?: unknown) => void
  closeModal: () => void

  // Toast notifications
  toasts: Array<{ id: string; message: string; type: 'success' | 'error' | 'info' }>
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void
  removeToast: (id: string) => void
}

export const useUIStore = create<UIState>()((set) => ({
  currentView: 'chat',
  setCurrentView: (view) => set({ currentView: view }),

  settingsTab: 'appearance',
  setSettingsTab: (tab) => set({ settingsTab: tab }),

  sidebarCollapsed: true,
  sidebarPinned: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setSidebarPinned: (pinned) => set({ sidebarPinned: pinned }),

  conversationListOpen: true,
  toggleConversationList: () => set((s) => ({ conversationListOpen: !s.conversationListOpen })),

  activeModal: null,
  modalData: null,
  openModal: (modal, data) => set({ activeModal: modal, modalData: data }),
  closeModal: () => set({ activeModal: null, modalData: null }),

  toasts: [],
  addToast: (message, type = 'info') => {
    const id = Math.random().toString(36).slice(2)
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }))
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
    }, 4000)
  },
  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))
