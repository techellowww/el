'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore, useChatStore } from '@/lib/store';
import {
  MessageSquare,
  X,
  Send,
  Users,
  Hash,
  Briefcase,
  Building,
  Edit2,
  Trash2,
  Circle,
  RefreshCw,
} from 'lucide-react';

interface ChatUser {
  id: string;
  name: string;
  displayName?: string | null;
  role: string;
  employeeId: string;
  avatarUrl?: string | null;
}

interface MessageItem {
  id: string;
  conversationId: string;
  content?: string;
  message?: string;
  senderId: string;
  senderType?: 'TEAM' | 'CLIENT';
  clientSenderName?: string | null;
  sender: ChatUser;
  isEdited: boolean;
  isDeleted: boolean;
  createdAt: string;
}

interface ConversationItem {
  id: string;
  name?: string | null;
  title?: string | null;
  type: string;
  projectId?: string | null;
  lastMessage?: MessageItem | null;
  totalMessages: number;
  unreadCount?: number;
  updatedAt: string;
}

const CHAT_SERVER_URL = process.env.NEXT_PUBLIC_CHAT_SERVER_URL || 'http://localhost:5001';

function playNotificationTone() {
  try {
    if (typeof window === 'undefined') return;
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime);
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.3);
  } catch {}
}

export function ChatDrawer() {
  const { user, token, fetchUser } = useAuthStore();
  const tokenFetchAttemptedRef = useRef(false);
  const {
    isOpen,
    setIsOpen,
    activeConvId,
    setActiveConvId,
    unreadCounts,
    totalUnreadCount,
    setAllUnreadCounts,
    incrementUnreadForConv,
    clearUnreadForConv,
  } = useChatStore();

  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [inputContent, setInputContent] = useState('');
  const [onlineUsers, setOnlineUsers] = useState<ChatUser[]>([]);
  const [showPresence, setShowPresence] = useState(false);
  const [typingUsers, setTypingUsers] = useState<{ [userId: string]: string }>({});
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');

  const socketRef = useRef<Socket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const activeConvIdRef = useRef<string | null>(activeConvId);
  const isOpenRef = useRef<boolean>(isOpen);

  // Keep refs synchronized with state so socket listeners access latest values without teardown
  activeConvIdRef.current = activeConvId;
  isOpenRef.current = isOpen;

  // Update document title when unread messages arrive
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const baseTitle = 'ClientHub';
    if (totalUnreadCount > 0) {
      document.title = `(${totalUnreadCount > 99 ? '99+' : totalUnreadCount}) ${baseTitle}`;
    } else {
      document.title = baseTitle;
    }
  }, [totalUnreadCount]);

  // Mark conversation read helper
  const markConversationRead = useCallback((convId: string) => {
    if (!convId) return;
    clearUnreadForConv(convId);
    if (socketRef.current?.connected) {
      socketRef.current.emit('mark_read', { conversationId: convId });
    }
    fetch('/api/chat/unread', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId: convId }),
    }).catch(() => {});
  }, [clearUnreadForConv]);

  // Fetch conversations list via HTTP API (guarantees conversations load on serverless / Vercel)
  const fetchConversationsHttp = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch('/api/chat/conversations');
      if (!res.ok) return;
      const data = await res.json();
      if (data?.success && Array.isArray(data.conversations)) {
        setConversations(data.conversations);

        const counts: Record<string, number> = {};
        data.conversations.forEach((c: any) => {
          if (isOpenRef.current && activeConvIdRef.current === c.id) {
            counts[c.id] = 0;
          } else {
            counts[c.id] = c.unreadCount || 0;
          }
        });
        setAllUnreadCounts(counts);

        // Auto-select conversation if none selected or if unread conversation exists
        if (data.conversations.length > 0) {
          const currentId = activeConvIdRef.current;
          const exists = data.conversations.some((c: any) => c.id === currentId);
          const unreadConv = data.conversations.find((c: any) => (c.unreadCount || 0) > 0);

          if (!currentId || !exists) {
            const nextId = unreadConv ? unreadConv.id : data.conversations[0].id;
            setActiveConvId(nextId);
          } else if (unreadConv && currentId === 'general' && unreadConv.id !== 'general') {
            const genConv = data.conversations.find((c: any) => c.id === 'general');
            if (!genConv || (genConv.unreadCount || 0) === 0) {
              setActiveConvId(unreadConv.id);
            }
          }
        }
      }
    } catch (err) {
      console.warn('[Chat HTTP conversations fetch error]:', err);
    }
  }, [user, setAllUnreadCounts, setActiveConvId]);

  // Fetch messages for active conversation via HTTP API
  const fetchMessagesHttp = useCallback(async (convId: string) => {
    if (!user || !convId) return;
    try {
      const res = await fetch(`/api/chat/messages?conversationId=${encodeURIComponent(convId)}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data?.success && Array.isArray(data.messages)) {
        if (activeConvIdRef.current === convId) {
          setMessages(data.messages);
        }
      }
    } catch (err) {
      console.warn('[Chat HTTP messages fetch error]:', err);
    }
  }, [user]);

  // When drawer opens, fetch latest conversations and messages for active channel, and mark as read
  useEffect(() => {
    if (isOpen) {
      fetchConversationsHttp();
      if (activeConvId) {
        fetchMessagesHttp(activeConvId);
        markConversationRead(activeConvId);
      }
    }
  }, [isOpen, activeConvId, fetchConversationsHttp, fetchMessagesHttp, markConversationRead]);

  // Sync on window focus / visibility change: if drawer is open on active conversation, mark as read
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleFocus = () => {
      if (isOpenRef.current && activeConvIdRef.current) {
        markConversationRead(activeConvIdRef.current);
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleFocus);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleFocus);
    };
  }, [markConversationRead]);

  // Periodic fallback sync with /api/chat/unread & conversations to keep unread badges and messages up-to-date
  useEffect(() => {
    if (!user) return;

    let isMounted = true;
    const fetchUnreadCounts = async () => {
      try {
        const res = await fetch('/api/chat/unread');
        if (!res.ok) return;
        const data = await res.json();
        if (data.success && data.unreadCounts && isMounted) {
          const counts = { ...data.unreadCounts };
          // If active conversation is currently open and focused, keep its count 0
          if (isOpenRef.current && activeConvIdRef.current) {
            counts[activeConvIdRef.current] = 0;
          }
          setAllUnreadCounts(counts);
        }
      } catch {}
    };

    // Initial sync
    fetchUnreadCounts();
    if (isOpenRef.current) {
      fetchConversationsHttp();
    }

    // Sync every 15 seconds
    const interval = setInterval(() => {
      fetchUnreadCounts();
      if (isOpenRef.current) {
        fetchConversationsHttp();
      }
    }, 15000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [user, setAllUnreadCounts, fetchConversationsHttp]);

  // Polling for messages when drawer is open and WebSocket is disconnected (serverless fallback)
  useEffect(() => {
    if (!isOpen || !activeConvId) return;

    const interval = setInterval(() => {
      if (!socketRef.current?.connected && isOpenRef.current && activeConvIdRef.current) {
        fetchMessagesHttp(activeConvIdRef.current);
      }
    }, 3500);

    return () => clearInterval(interval);
  }, [isOpen, activeConvId, fetchMessagesHttp]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // If user is authenticated but token not yet in store, fetch it once
  useEffect(() => {
    if (user && !token && !tokenFetchAttemptedRef.current) {
      tokenFetchAttemptedRef.current = true;
      fetchUser();
    } else if (!user) {
      tokenFetchAttemptedRef.current = false;
    }
  }, [user, token, fetchUser]);

  // Connect to dedicated Socket.IO chat server
  const connectSocket = useCallback(() => {
    if (!user) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      setIsConnected(false);
      return;
    }

    if (socketRef.current?.connected) {
      return;
    }

    if (
      typeof window !== 'undefined' &&
      !['localhost', '127.0.0.1'].includes(window.location.hostname) &&
      (CHAT_SERVER_URL.includes('localhost') || CHAT_SERVER_URL.includes('127.0.0.1'))
    ) {
      // In production deployment without a configured remote chat server URL, skip connecting to localhost
      return;
    }

    setIsConnecting(true);

    const socket = io(CHAT_SERVER_URL, {
      auth: token ? { token } : {},
      withCredentials: true,
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 15,
      reconnectionDelay: 1500,
      timeout: 10000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
      setIsConnecting(false);
      useChatStore.getState().setIsConnected(true);
      // Fetch available conversations and initial unread counts
      socket.emit('get_conversations', (res: any) => {
        if (res?.success && res.conversations) {
          setConversations(res.conversations);
          const initialCounts: Record<string, number> = {};
          res.conversations.forEach((c: any) => {
            if (isOpenRef.current && activeConvIdRef.current === c.id) {
              initialCounts[c.id] = 0;
            } else {
              initialCounts[c.id] = c.unreadCount || 0;
            }
          });
          setAllUnreadCounts(initialCounts);

          if (
            res.conversations.length > 0 &&
            (!activeConvIdRef.current || !res.conversations.some((c: any) => c.id === activeConvIdRef.current))
          ) {
            setActiveConvId(res.conversations[0].id);
          }
        }
      });
    });

    socket.on('connect_error', (err) => {
      console.warn('[Chat Socket Connect Error]:', err.message);
      setIsConnected(false);
      setIsConnecting(false);
      useChatStore.getState().setIsConnected(false);
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
      setIsConnecting(false);
      useChatStore.getState().setIsConnected(false);
    });

    socket.on('presence_list', (data: { onlineUsers: ChatUser[] }) => {
      setOnlineUsers(data.onlineUsers || []);
      useChatStore.getState().setOnlineCount(data.onlineUsers?.length || 0);
    });

    socket.on('presence_update', (data: { onlineUsers: ChatUser[] }) => {
      if (data.onlineUsers) {
        setOnlineUsers(data.onlineUsers);
        useChatStore.getState().setOnlineCount(data.onlineUsers.length);
      }
    });

    socket.on('conversations_list', (data: { conversations: ConversationItem[] }) => {
      setConversations(data.conversations || []);
      const initialCounts: Record<string, number> = {};
      data.conversations?.forEach((c: any) => {
        if (isOpenRef.current && activeConvIdRef.current === c.id) {
          initialCounts[c.id] = 0;
        } else {
          initialCounts[c.id] = c.unreadCount || 0;
        }
      });
      setAllUnreadCounts(initialCounts);

      if (
        data.conversations?.length > 0 &&
        (!activeConvIdRef.current || !data.conversations.some((c: any) => c.id === activeConvIdRef.current))
      ) {
        setActiveConvId(data.conversations[0].id);
      }
    });

    socket.on('chat_history', (data: { conversationId: string; messages: MessageItem[] }) => {
      if (data.conversationId === activeConvIdRef.current) {
        setMessages(data.messages || []);
      }
    });

    socket.on('new_message', (data: { conversationId: string; message: MessageItem }) => {
      // Permission check: employees only process messages for general or assigned conversations
      if (user?.role === 'EMPLOYEE' && data.conversationId !== 'general') {
        const isPermitted = conversations.some((c) => c.id === data.conversationId);
        if (!isPermitted) {
          return;
        }
      }
      const isFromMe = (data.message.senderType === 'TEAM' || !data.message.senderType) && data.message.senderId === user.id;
      const isDocFocused = typeof document !== 'undefined' ? (!document.hidden && document.hasFocus()) : true;
      const isCurrentlyViewed = isOpenRef.current && activeConvIdRef.current === data.conversationId && isDocFocused;

      if (data.conversationId === activeConvIdRef.current) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === data.message.id)) return prev;
          return [...prev, data.message];
        });
      }

      if (isCurrentlyViewed) {
        // Active view: mark as read immediately
        socket.emit('mark_read', { conversationId: data.conversationId });
      } else if (!isFromMe) {
        // Message sent and NOT viewed: increment notification count
        incrementUnreadForConv(data.conversationId);
        playNotificationTone();
      }

      // Update last message and unread count in conversation list
      setConversations((prev) => {
        const exists = prev.some((c) => c.id === data.conversationId);
        if (!exists) {
          socketRef.current?.emit('get_conversations');
          return prev;
        }
        return prev.map((c) =>
          c.id === data.conversationId
            ? {
                ...c,
                lastMessage: data.message,
                totalMessages: c.totalMessages + 1,
                unreadCount: isCurrentlyViewed ? 0 : (c.unreadCount || 0) + 1,
                updatedAt: data.message.createdAt,
              }
            : c
        );
      });
    });

    socket.on('user_typing', (data: { conversationId: string; userId: string; userName: string; isTyping: boolean }) => {
      if (data.conversationId === activeConvIdRef.current && data.userId !== user.id) {
        setTypingUsers((prev) => {
          const next = { ...prev };
          if (data.isTyping) {
            next[data.userId] = data.userName;
          } else {
            delete next[data.userId];
          }
          return next;
        });
      }
    });

    socket.on('message_updated', (data: { conversationId: string; message: MessageItem }) => {
      if (data.conversationId === activeConvIdRef.current) {
        setMessages((prev) =>
          prev.map((m) => (m.id === data.message.id ? data.message : m))
        );
      }
    });

    socket.on('message_deleted', (data: { conversationId: string; messageId: string }) => {
      if (data.conversationId === activeConvIdRef.current) {
        setMessages((prev) => prev.filter((m) => m.id !== data.messageId));
      }
    });
  }, [user, token, incrementUnreadForConv, setAllUnreadCounts, setActiveConvId]);

  useEffect(() => {
    connectSocket();

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [connectSocket]);

  // When active conversation changes, join room, load messages, and mark as viewed
  useEffect(() => {
    if (!activeConvId) return;

    // Clear previous channel messages immediately to prevent cross-channel bleed
    setMessages([]);

    if (socketRef.current?.connected) {
      socketRef.current.emit('join_room', { conversationId: activeConvId }, (res: any) => {
        if (res?.success && res.messages) {
          setMessages(res.messages);
        }
      });
    }

    // Always fetch messages via HTTP to ensure message history is loaded regardless of socket connection
    fetchMessagesHttp(activeConvId);

    if (isOpenRef.current) {
      markConversationRead(activeConvId);
    }

    setTypingUsers({});
  }, [activeConvId, fetchMessagesHttp, markConversationRead]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = inputContent.trim();
    if (!content || !activeConvId) return;

    // Staff/Employee check: ensure staff can only send to assigned client channels or general
    if (user?.role === 'EMPLOYEE' && activeConvId !== 'general') {
      const isPermitted = conversations.some((c) => c.id === activeConvId);
      if (!isPermitted) return;
    }

    setInputContent('');

    if (socketRef.current?.connected) {
      socketRef.current.emit('send_message', {
        conversationId: activeConvId,
        content,
      });

      // Stop typing indicator
      socketRef.current.emit('typing', {
        conversationId: activeConvId,
        isTyping: false,
      });
    } else {
      // HTTP fallback for serverless deployments
      try {
        const res = await fetch('/api/chat/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversationId: activeConvId,
            content,
          }),
        });
        const data = await res.json();
        if (data?.success && data.message) {
          setMessages((prev) => {
            if (prev.some((m) => m.id === data.message.id)) return prev;
            return [...prev, data.message];
          });
          setConversations((prev) =>
            prev.map((c) =>
              c.id === activeConvId
                ? {
                    ...c,
                    lastMessage: data.message,
                    totalMessages: c.totalMessages + 1,
                    updatedAt: data.message.createdAt,
                  }
                : c
            )
          );
        }
      } catch (err) {
        console.error('[Chat send message error]:', err);
      }
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputContent(e.target.value);

    if (!socketRef.current || !activeConvId) return;

    socketRef.current.emit('typing', {
      conversationId: activeConvId,
      isTyping: true,
    });

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socketRef.current?.emit('typing', {
        conversationId: activeConvId,
        isTyping: false,
      });
    }, 2000);
  };

  const handleSaveEdit = async (messageId: string) => {
    const trimmed = editContent.trim();
    if (!trimmed) return;

    if (socketRef.current?.connected) {
      socketRef.current.emit('edit_message', {
        messageId,
        newContent: trimmed,
      });
    } else {
      try {
        const res = await fetch('/api/chat/messages', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messageId, newContent: trimmed }),
        });
        if (res.ok) {
          setMessages((prev) =>
            prev.map((m) => (m.id === messageId ? { ...m, content: trimmed, message: trimmed, isEdited: true } : m))
          );
        }
      } catch (err) {
        console.error('[Chat edit message error]:', err);
      }
    }
    setEditingMessageId(null);
    setEditContent('');
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (!confirm('Delete this message for everyone?')) return;

    if (socketRef.current?.connected) {
      socketRef.current.emit('delete_message', { messageId });
    } else {
      try {
        const res = await fetch(`/api/chat/messages?messageId=${encodeURIComponent(messageId)}`, {
          method: 'DELETE',
        });
        if (res.ok) {
          setMessages((prev) => prev.filter((m) => m.id !== messageId));
        }
      } catch (err) {
        console.error('[Chat delete message error]:', err);
      }
    }
  };

  if (!user) return null;

  const sortedConversations = React.useMemo(() => {
    return [...conversations].sort((a, b) => {
      const unreadA = unreadCounts[a.id] || 0;
      const unreadB = unreadCounts[b.id] || 0;
      if (unreadA > 0 && unreadB === 0) return -1;
      if (unreadB > 0 && unreadA === 0) return 1;
      if (unreadA > 0 && unreadB > 0) return unreadB - unreadA;
      return new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime();
    });
  }, [conversations, unreadCounts]);

  const activeConv = conversations.find((c) => c.id === activeConvId);
  const typingList = Object.values(typingUsers);

  if (!isOpen) return null;

  return (
    <>
      {/* Mobile & Tablet Backdrop overlay */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs transition-opacity"
        onClick={() => setIsOpen(false)}
        aria-hidden="true"
      />

      <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-[480px] bg-white border-l border-border shadow-2xl flex flex-col transition-transform duration-300">
          {/* Header */}
          <div className="h-16 px-5 border-b border-border flex items-center justify-between shrink-0 bg-white">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary-subtle border border-blue-200 flex items-center justify-center text-primary">
                <MessageSquare className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-text-primary text-sm leading-tight flex items-center gap-2">
                  <span>Real-time Workspace Chat</span>
                  <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-success' : 'bg-emerald-500'}`} />
                </h3>
                <p className="text-[11px] text-text-secondary">
                  {isConnected
                    ? 'Connected to dedicated chat server'
                    : isConnecting
                    ? 'Connecting...'
                    : 'Active Workspace Chat (Cloud Sync)'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  connectSocket();
                  fetchConversationsHttp();
                  if (activeConvId) fetchMessagesHttp(activeConvId);
                }}
                className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-text-secondary hover:text-text-primary transition"
                title="Refresh chat"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={() => setShowPresence((prev) => !prev)}
                className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-medium text-text-secondary flex items-center gap-1.5 transition cursor-pointer"
                title="View Online Members"
              >
                <Users className="w-3.5 h-3.5 text-success" />
                <span>{onlineUsers.length > 0 ? onlineUsers.length : 1} Online</span>
              </button>

              <button
                onClick={() => setIsOpen(false)}
                className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-text-secondary hover:text-text-primary flex items-center justify-center transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Online Users Flyout */}
          {showPresence && (
            <div className="bg-slate-50 border-b border-border p-3 max-h-48 overflow-y-auto">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
                  Active Team Members ({onlineUsers.length})
                </span>
                <button
                  onClick={() => setShowPresence(false)}
                  className="text-xs text-text-secondary hover:text-text-primary cursor-pointer"
                >
                  Close
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {onlineUsers.map((u) => (
                  <div
                    key={u.id}
                    className="flex items-center gap-2 p-1.5 rounded-lg bg-white border border-border text-xs"
                  >
                    <span className="w-2 h-2 rounded-full bg-success shrink-0" />
                    <span className="font-medium text-text-primary truncate">{u.name}</span>
                    <span className="text-[10px] text-text-secondary uppercase font-mono ml-auto">
                      {u.role}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Channel Selector Pills */}
          <div className="p-3 border-b border-border flex items-center gap-2 overflow-x-auto bg-slate-50/70">
            {sortedConversations.map((conv) => {
              const isActive = conv.id === activeConvId;
              const unread = unreadCounts[conv.id] || 0;
              return (
                <button
                  key={conv.id}
                  id={`channel-pill-${conv.id}`}
                  data-testid={`channel-pill-${conv.id}`}
                  onClick={() => {
                    setActiveConvId(conv.id);
                    markConversationRead(conv.id);
                    fetchMessagesHttp(conv.id);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition flex items-center gap-1.5 cursor-pointer relative ${
                    isActive
                      ? 'bg-primary text-white shadow-sm'
                      : unread > 0
                      ? 'bg-rose-50 text-rose-800 border border-rose-300 hover:bg-rose-100 font-semibold shadow-xs'
                      : 'bg-white text-text-secondary hover:bg-slate-100 hover:text-text-primary border border-border'
                  }`}
                >
                  {conv.type === 'PROJECT' ? (
                    <Briefcase className="w-3 h-3" />
                  ) : conv.type === 'CLIENT' ? (
                    <Building className="w-3 h-3" />
                  ) : (
                    <Hash className="w-3 h-3" />
                  )}
                  <span>{conv.name || conv.title || 'Conversation'}</span>
                  {unread > 0 && (
                    <span
                      id={`channel-unread-${conv.id}`}
                      data-testid={`channel-unread-${conv.id}`}
                      className="ml-1 px-1.5 py-0.2 rounded-full bg-rose-500 text-white text-[10px] font-bold shrink-0 shadow-sm animate-pulse"
                    >
                      {unread > 99 ? '99+' : unread}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Active Channel Header Info */}
          <div className="px-4 py-2 bg-slate-50 border-b border-border flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5 font-semibold text-text-primary truncate">
              {activeConv?.type === 'PROJECT' ? (
                <Briefcase className="w-3.5 h-3.5 text-primary shrink-0" />
              ) : activeConv?.type === 'CLIENT' ? (
                <Building className="w-3.5 h-3.5 text-primary shrink-0" />
              ) : (
                <Hash className="w-3.5 h-3.5 text-primary shrink-0" />
              )}
              <span className="truncate">{activeConv?.name || activeConv?.title || 'General Team Chat'}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200/80 text-text-secondary uppercase font-mono shrink-0">
                {activeConv?.type === 'GENERAL' ? 'TEAM' : activeConv?.type || 'CHANNEL'}
              </span>
            </div>
            <span className="text-[11px] text-text-secondary shrink-0 font-medium">
              {messages.length} message{messages.length === 1 ? '' : 's'}
            </span>
          </div>

          {/* Messages Feed */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-app-background">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-text-secondary">
                <div className="w-12 h-12 rounded-2xl bg-white border border-border flex items-center justify-center text-slate-400 mb-3 shadow-sm">
                  <MessageSquare className="w-6 h-6" />
                </div>
                <h4 className="font-semibold text-text-primary text-sm mb-1">
                  {activeConv?.name || activeConv?.title || 'Room is quiet'}
                </h4>
                <p className="text-xs text-text-secondary max-w-xs">
                  No messages in this channel yet. Say hello to your team!
                </p>
              </div>
            ) : (
              messages.map((msg) => {
                const isClient = msg.senderType === 'CLIENT' || msg.sender?.role === 'CLIENT' || (!msg.senderId && !!msg.clientSenderName);
                const isMine = !isClient && msg.senderId === user.id;
                const isEditing = editingMessageId === msg.id;
                const senderName = isClient
                  ? (msg.clientSenderName || msg.sender?.name || 'Client')
                  : (msg.sender?.displayName || msg.sender?.name || 'Team Member');
                const senderRole = isClient ? 'CLIENT' : (msg.sender?.role || 'STAFF');

                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
                  >
                    <div className="flex items-center gap-1.5 text-[11px] text-text-secondary mb-1 px-1">
                      <span className="font-semibold text-text-primary">{senderName}</span>
                      <span
                        className={`text-[9px] px-1.5 py-0.2 rounded font-mono uppercase font-bold tracking-wider ${
                          isClient
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                            : 'bg-slate-200 text-text-secondary'
                        }`}
                      >
                        {senderRole}
                      </span>
                      <span>•</span>
                      <span>
                        {new Date(msg.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      {msg.isEdited && <span className="text-[10px] text-text-secondary">(edited)</span>}
                    </div>

                    <div
                      className={`group relative max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed shadow-sm ${
                        isMine
                          ? 'bg-primary text-white rounded-br-xs'
                          : isClient
                          ? 'bg-emerald-50 text-text-primary border border-emerald-200 rounded-bl-xs'
                          : 'bg-white text-text-primary border border-border rounded-bl-xs'
                      }`}
                    >
                      {isEditing ? (
                        <div className="space-y-2">
                          <input
                            type="text"
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            className="w-full bg-slate-100 border border-border rounded px-2 py-1 text-text-primary text-xs focus:outline-none focus:border-primary"
                            autoFocus
                          />
                          <div className="flex justify-end gap-1.5">
                            <button
                              onClick={() => {
                                setEditingMessageId(null);
                                setEditContent('');
                              }}
                              className="px-2 py-0.5 rounded text-[10px] bg-slate-200 text-text-secondary hover:text-text-primary"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => handleSaveEdit(msg.id)}
                              className="px-2 py-0.5 rounded text-[10px] bg-primary text-white"
                            >
                              Save
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="whitespace-pre-wrap break-words">{msg.content || msg.message}</p>

                          {/* Quick Message Actions */}
                          {(isMine || user.role === 'ADMIN') && (
                            <div
                              className={`absolute top-1 hidden group-hover:flex items-center gap-1 p-1 rounded-lg bg-white border border-border shadow-md text-text-secondary ${
                                isMine ? '-left-16' : '-right-16'
                              }`}
                            >
                              {isMine && (
                                <button
                                  onClick={() => {
                                    setEditingMessageId(msg.id);
                                    setEditContent(msg.content || msg.message || '');
                                  }}
                                  className="p-1 hover:text-primary transition rounded"
                                  title="Edit message"
                                >
                                  <Edit2 className="w-3 h-3" />
                                </button>
                              )}
                              <button
                                onClick={() => handleDeleteMessage(msg.id)}
                                className="p-1 hover:text-error transition rounded"
                                title="Delete message"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Typing Indicator */}
          {typingList.length > 0 && (
            <div className="px-5 py-1.5 bg-slate-50 border-t border-border flex items-center gap-2 helper-text text-text-secondary">
              <span className="flex gap-1 items-center">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" />
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce [animation-delay:0.2s]" />
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce [animation-delay:0.4s]" />
              </span>
              <span className="italic">{typingList.join(', ')} typing...</span>
            </div>
          )}

          {/* Message Input Box */}
          <div className="p-4 bg-white border-t border-border shrink-0">
            <form onSubmit={handleSendMessage} className="flex items-center gap-2">
              <input
                type="text"
                value={inputContent}
                onChange={handleInputChange}
                placeholder={
                  activeConv
                    ? `Message ${activeConv.name || activeConv.title}...`
                    : 'Select a channel to chat...'
                }
                disabled={!activeConvId}
                className="flex-1 bg-slate-50 border border-border rounded-xl px-4 py-2.5 text-xs text-text-primary placeholder:text-slate-400 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!inputContent.trim() || !activeConvId}
                className="w-10 h-10 rounded-xl bg-primary hover:bg-primary-hover disabled:opacity-50 text-white flex items-center justify-center transition shadow-sm cursor-pointer shrink-0"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
    </>
  );
}

/**
 * Topbar Team Chat button that replaces the old topbar timer widget.
 * Features real-time unread badge, active drawer indicator, and online teammate counter.
 */
export function TeamChatButton({ compact = false }: { compact?: boolean }) {
  const { isOpen, setIsOpen, totalUnreadCount, onlineCount, isConnected } = useChatStore();

  if (compact) {
    return (
      <button
        id="team-chat-toggle-btn-mobile"
        data-testid="team-chat-toggle-btn-mobile"
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`relative p-2 rounded-xl border transition shadow-xs cursor-pointer ${
          isOpen
            ? 'bg-primary text-white border-primary shadow-blue-500/20'
            : totalUnreadCount > 0
            ? 'bg-rose-50 text-rose-600 border-rose-300 hover:bg-rose-100 shadow-xs'
            : 'bg-primary-subtle text-primary border-blue-200 hover:bg-blue-100'
        }`}
        aria-label="Toggle Team Chat"
        title={totalUnreadCount > 0 ? `Team Chat (${totalUnreadCount} unread)` : 'Team Chat'}
      >
        <MessageSquare className="w-4 h-4" />
        {totalUnreadCount > 0 && (
          <span
            id="team-chat-unread-count-mobile"
            data-testid="team-chat-unread-count-mobile"
            className="absolute -top-1.5 -right-1.5 min-w-4 h-4 px-1 bg-rose-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center animate-pulse border-2 border-white shadow-xs"
          >
            {totalUnreadCount > 99 ? '99+' : totalUnreadCount}
          </span>
        )}
      </button>
    );
  }

  return (
    <button
      id="team-chat-toggle-btn"
      data-testid="team-chat-toggle-btn"
      type="button"
      onClick={() => setIsOpen((prev) => !prev)}
      className={`flex items-center gap-2.5 px-3 py-1.5 rounded-xl border transition shadow-xs cursor-pointer text-xs font-medium ${
        isOpen
          ? 'bg-primary text-white border-primary shadow-blue-500/20'
          : totalUnreadCount > 0
          ? 'bg-rose-50 text-rose-700 border-rose-300 hover:bg-rose-100 shadow-rose-500/10'
          : 'bg-primary-subtle hover:bg-blue-100/80 text-primary border-blue-200'
      }`}
      aria-label="Toggle Real-time Team Chat"
      title={totalUnreadCount > 0 ? `Team Chat (${totalUnreadCount} unread message${totalUnreadCount === 1 ? '' : 's'})` : 'Toggle Team Chat'}
    >
      <div className="relative flex items-center">
        <MessageSquare className={`w-3.5 h-3.5 ${isOpen ? 'text-white' : totalUnreadCount > 0 ? 'text-rose-600' : 'text-primary'}`} />
        {totalUnreadCount > 0 && (
          <span
            id="team-chat-icon-badge"
            data-testid="team-chat-unread-count"
            className="absolute -top-2 -right-2.5 min-w-4 h-4 px-1 bg-rose-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse border border-white shadow-xs"
          >
            {totalUnreadCount > 99 ? '99+' : totalUnreadCount}
          </span>
        )}
      </div>
      <span className={`font-semibold ${isOpen ? 'text-white' : totalUnreadCount > 0 ? 'text-rose-900' : 'text-text-primary'}`}>
        Team Chat
      </span>
      {totalUnreadCount > 0 && (
        <span
          id="team-chat-count-pill"
          data-testid="team-chat-count-pill"
          className="px-1.5 py-0.2 rounded-full bg-rose-500 text-white text-[10px] font-bold shadow-xs animate-pulse"
        >
          {totalUnreadCount > 99 ? '99+' : `${totalUnreadCount} new`}
        </span>
      )}
      <span
        className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-mono ${
          isOpen
            ? 'bg-white/20 text-white'
            : totalUnreadCount > 0
            ? 'bg-white border border-rose-200 text-rose-700'
            : 'bg-white border border-blue-200 text-text-secondary'
        }`}
      >
        <Circle
          className={`w-1.5 h-1.5 fill-current ${
            isConnected
              ? isOpen
                ? 'text-green-300'
                : 'text-success'
              : isOpen
              ? 'text-amber-200'
              : 'text-amber-500'
          }`}
        />
        <span>{onlineCount}</span>
      </span>
    </button>
  );
}

/**
 * Floating Chat Quick Action Button placed at bottom-right corner.
 * Shows glowing message count if any new message is received until opened.
 */
export function FloatingChatButton() {
  const { isOpen, setIsOpen, totalUnreadCount, isConnected } = useChatStore();

  if (isOpen) return null;

  return (
    <button
      id="floating-team-chat-btn"
      data-testid="floating-team-chat-btn"
      type="button"
      onClick={() => setIsOpen(true)}
      aria-label="Open Team Chat"
      title={
        totalUnreadCount > 0
          ? `Team Chat (${totalUnreadCount} unread message${totalUnreadCount === 1 ? '' : 's'})`
          : 'Open Team Chat'
      }
      className={`fixed bottom-6 right-6 z-40 flex items-center gap-2.5 px-4 py-3 rounded-full shadow-2xl transition-all duration-300 cursor-pointer hover:scale-105 active:scale-95 border ${
        totalUnreadCount > 0
          ? 'bg-rose-600 hover:bg-rose-700 text-white border-rose-500 shadow-rose-600/30 ring-4 ring-rose-400/30 animate-bounce'
          : 'bg-primary hover:bg-primary-hover text-white border-blue-600 shadow-primary/30'
      }`}
    >
      <div className="relative flex items-center justify-center">
        <MessageSquare className="w-5 h-5 fill-current" />
        {totalUnreadCount > 0 && (
          <span
            id="floating-chat-unread-badge"
            data-testid="floating-chat-unread-badge"
            className="absolute -top-3 -right-3 min-w-5 h-5 px-1 bg-white text-rose-600 text-xs font-black rounded-full flex items-center justify-center border-2 border-rose-600 shadow-md animate-pulse"
          >
            {totalUnreadCount > 99 ? '99+' : totalUnreadCount}
          </span>
        )}
      </div>

      <span className="font-bold text-xs tracking-wide">
        Chat
      </span>

      {totalUnreadCount > 0 ? (
        <span
          id="floating-chat-count-label"
          data-testid="floating-chat-count-label"
          className="bg-white/20 text-white text-[11px] font-bold px-2 py-0.5 rounded-full"
        >
          {totalUnreadCount > 99 ? '99+' : `${totalUnreadCount} new`}
        </span>
      ) : (
        <span
          className="w-2 h-2 rounded-full bg-emerald-500"
          title={isConnected ? 'Chat Connected' : 'Chat Active'}
        />
      )}
    </button>
  );
}
