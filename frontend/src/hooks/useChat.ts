'use client';

import { useChatStore } from '@/lib/store';

export function useChat() {
  const chat = useChatStore();

  return {
    isOpen: chat.isOpen,
    activeConvId: chat.activeConvId,
    unreadCounts: chat.unreadCounts,
    totalUnreadCount: chat.totalUnreadCount,
    onlineCount: chat.onlineCount,
    isConnected: chat.isConnected,
    setIsOpen: chat.setIsOpen,
    openChat: chat.openChat,
    toggleChat: chat.toggleChat,
    closeChat: chat.closeChat,
    setActiveConvId: chat.setActiveConvId,
    setAllUnreadCounts: chat.setAllUnreadCounts,
    incrementUnreadForConv: chat.incrementUnreadForConv,
    clearUnreadForConv: chat.clearUnreadForConv,
    setOnlineCount: chat.setOnlineCount,
    setIsConnected: chat.setIsConnected,
  };
}

export default useChat;
