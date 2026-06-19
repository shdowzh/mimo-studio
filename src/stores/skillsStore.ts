// 技能全局状态 — SkillsView 与全局搜索共享
import { create } from 'zustand'
import { mimoClient } from '@/lib/mimoClient'
import { isElectron, getAPI } from '@/lib/ipc'
import type { SkillInfo } from '@/lib/mimoTypes'

export interface SkillsState {
  skills: SkillInfo[]
  loading: boolean
  serverConnected: boolean
  loadSkills: () => Promise<void>
  setServerConnected: (connected: boolean) => void
}

export const useSkillsStore = create<SkillsState>()((set, get) => ({
  skills: [],
  loading: false,
  serverConnected: false,

  setServerConnected: (connected) => {
    const prev = get().serverConnected
    set({ serverConnected: connected })
    if (connected && !prev) {
      get().loadSkills()
    }
  },

  loadSkills: async () => {
    if (get().loading) return
    set({ loading: true })
    try {
      const available = await mimoClient.isAvailable()
      set({ serverConnected: available })
      let data: SkillInfo[] = []
      if (available) {
        data = await mimoClient.listSkills()
      } else if (isElectron()) {
        data = await getAPI().files.readSkills()
      }
      set({ skills: data || [] })
    } catch {
      if (isElectron()) {
        try {
          const data = await getAPI().files.readSkills()
          set({ skills: data || [] })
        } catch {
          set({ skills: [] })
        }
      } else {
        set({ skills: [] })
      }
    } finally {
      set({ loading: false })
    }
  },
}))
