import { useState, useEffect } from 'react'
import { isElectron, getAPI } from '@/lib/ipc'
import { Plug, Plus, Circle, Trash2 } from 'lucide-react'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'
import type { McpServer } from '@/lib/types'

export default function McpView() {
  const [servers, setServers] = useState<McpServer[]>([])
  const [loading, setLoading] = useState(true)
  const [addModalOpen, setAddModalOpen] = useState(false)

  // Form state
  const [formName, setFormName] = useState('')
  const [formType, setFormType] = useState<'stdio' | 'http'>('stdio')
  const [formCommand, setFormCommand] = useState('')
  const [formUrl, setFormUrl] = useState('')

  useEffect(() => {
    loadServers()
  }, [])

  const loadServers = async () => {
    if (!isElectron()) { setLoading(false); return }
    const raw = await getAPI().settings.get('mcpServers')
    const data = raw ? JSON.parse(raw) : []
    setServers(data || [])
    setLoading(false)
  }

  const handleAdd = async () => {
    if (!isElectron() || !formName.trim()) return
    const raw = await getAPI().settings.get('mcpServers')
    const servers = raw ? JSON.parse(raw) : []
    servers.push({
      id: `mcp-${Date.now()}`,
      name: formName,
      type: formType,
      command: formType === 'stdio' ? formCommand : undefined,
      url: formType === 'http' ? formUrl : undefined,
      enabled: true,
      status: 'stopped',
    })
    await getAPI().settings.set('mcpServers', JSON.stringify(servers))
    setAddModalOpen(false)
    setFormName('')
    setFormCommand('')
    setFormUrl('')
    loadServers()
  }

  const handleDelete = async (id: string) => {
    if (!isElectron()) return
    const raw = await getAPI().settings.get('mcpServers')
    const servers = (raw ? JSON.parse(raw) : []).filter((s: any) => s.id !== id)
    await getAPI().settings.set('mcpServers', JSON.stringify(servers))
    loadServers()
  }

  const handleToggle = async (server: McpServer) => {
    if (!isElectron()) return
    const raw = await getAPI().settings.get('mcpServers')
    const servers = (raw ? JSON.parse(raw) : []).map((s: any) =>
      s.id === server.id ? { ...s, enabled: !server.enabled } : s)
    await getAPI().settings.set('mcpServers', JSON.stringify(servers))
    loadServers()
  }

  const statusColors: Record<string, string> = {
    running: 'bg-mc-success',
    stopped: 'bg-mc-text-muted',
    error: 'bg-mc-error',
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between h-10 px-4 border-b border-mc-border-subtle">
        <div className="flex items-center gap-2">
          <Plug size={14} strokeWidth={1.5} className="text-mc-text-muted" />
          <span className="text-xs font-medium text-mc-text-secondary">MCP 服务器</span>
        </div>
        <Button variant="ghost" size="sm" icon={<Plus size={12} />} onClick={() => setAddModalOpen(true)}>
          添加
        </Button>
      </div>

      {/* Server list */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-xs text-mc-text-muted">加载中...</p>
          </div>
        ) : servers.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center space-y-2">
              <Plug size={24} strokeWidth={1} className="text-mc-text-muted mx-auto" />
              <p className="text-xs text-mc-text-muted">暂无 MCP 服务器</p>
              <p className="text-[10px] text-mc-text-muted">添加 MCP 服务器以扩展 Agent 能力</p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {servers.map((server) => (
              <div key={server.id} className="mc-card p-3 flex items-center gap-3">
                <Circle size={8} className={`flex-shrink-0 ${statusColors[server.status] || 'bg-mc-text-muted'}`} fill="currentColor" />
                <div className="flex-1 min-w-0">
                  <h4 className="text-xs font-medium text-mc-text">{server.name}</h4>
                  <p className="text-[10px] text-mc-text-muted truncate">
                    {server.type === 'stdio' ? server.command : server.url}
                  </p>
                </div>
                <button
                  onClick={() => handleToggle(server)}
                  className={`text-[10px] px-2 py-0.5 rounded ${server.enabled ? 'text-mc-success bg-mc-success/10' : 'text-mc-text-muted bg-mc-elevated'}`}
                >
                  {server.enabled ? '启用' : '禁用'}
                </button>
                <button
                  onClick={() => handleDelete(server.id)}
                  className="p-1 text-mc-text-muted hover:text-mc-error transition-colors"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add server modal */}
      <Modal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        title="添加 MCP 服务器"
      >
        <div className="space-y-4">
          <Input label="名称" value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="my-server" />
          <div className="space-y-1">
            <label className="block text-xs font-medium text-mc-text-secondary">类型</label>
            <div className="flex gap-2">
              <button
                onClick={() => setFormType('stdio')}
                className={`px-3 py-1.5 text-xs rounded-md ${formType === 'stdio' ? 'bg-mc-elevated text-mc-text' : 'text-mc-text-muted hover:bg-mc-hover'}`}
              >
                stdio
              </button>
              <button
                onClick={() => setFormType('http')}
                className={`px-3 py-1.5 text-xs rounded-md ${formType === 'http' ? 'bg-mc-elevated text-mc-text' : 'text-mc-text-muted hover:bg-mc-hover'}`}
              >
                HTTP
              </button>
            </div>
          </div>
          {formType === 'stdio' ? (
            <Input label="命令" value={formCommand} onChange={(e) => setFormCommand(e.target.value)} placeholder="npx -y @some/mcp-server" />
          ) : (
            <Input label="URL" value={formUrl} onChange={(e) => setFormUrl(e.target.value)} placeholder="http://localhost:3000/mcp" />
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setAddModalOpen(false)}>取消</Button>
            <Button variant="primary" size="sm" onClick={handleAdd}>添加</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
