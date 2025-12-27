import { useState } from 'react'
import { motion } from 'framer-motion'
import { Send, Phone, MoreVertical } from 'lucide-react'
import { mockMessages, nearbyMechanics } from '../data/mockData'

export default function ChatScreen() {
  const [message, setMessage] = useState('')
  const mechanic = nearbyMechanics[0]

  return (
    <div className="max-w-md mx-auto px-5 py-6 flex flex-col h-[calc(100vh-120px)]">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass rounded-2xl p-4 mb-4 flex items-center justify-between"
      >
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-full bg-gradient-to-br from-iris-500/30 to-iris-600/20 border border-iris-500/30 flex items-center justify-center">
            <span className="text-iris-200 text-sm font-semibold">{mechanic.initials}</span>
          </div>
          <div>
            <h3 className="text-white font-medium text-sm">{mechanic.name}</h3>
            <p className="text-emerald-400 text-xs flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />
              Active now
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="w-9 h-9 rounded-xl bg-iris-500/20 flex items-center justify-center"
          >
            <Phone size={16} strokeWidth={1.5} className="text-iris-300" />
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center"
          >
            <MoreVertical size={16} strokeWidth={1.5} className="text-white/50" />
          </motion.button>
        </div>
      </motion.div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-3 mb-4 hide-scrollbar">
        {mockMessages.map((msg, i) => {
          const isUser = msg.senderId === 'user'
          return (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] px-4 py-3 rounded-2xl ${
                  isUser
                    ? 'bg-iris-500/30 rounded-br-md'
                    : 'glass rounded-bl-md'
                }`}
              >
                <p className="text-white/90 text-sm">{msg.content}</p>
                <p className="text-white/30 text-[10px] mt-1 text-right">
                  {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </motion.div>
          )
        })}
      </div>

      {/* Input */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass rounded-2xl p-3 flex items-center gap-3"
      >
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Type a message..."
          className="flex-1 bg-transparent border-none outline-none text-white/90 text-sm placeholder:text-white/30"
        />
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="w-9 h-9 rounded-xl bg-iris-500 flex items-center justify-center"
        >
          <Send size={16} strokeWidth={1.5} className="text-white" />
        </motion.button>
      </motion.div>
    </div>
  )
}



