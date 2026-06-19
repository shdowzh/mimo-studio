import type { ReactNode } from 'react'
import Sidebar from '@/components/Sidebar'
import AppHeader from './AppHeader'

interface AppLayoutProps {
  children: ReactNode
}

export default function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="flex flex-col h-screen bg-mc-bg text-mc-text overflow-hidden">
      <AppHeader />
      <div className="flex flex-1 min-h-0">
        <Sidebar />
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {children}
        </main>
      </div>
    </div>
  )
}
