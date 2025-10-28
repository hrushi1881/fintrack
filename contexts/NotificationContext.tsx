import React, { createContext, useContext, useState, ReactNode } from 'react';
import NotificationPopup from '@/components/NotificationPopup';

interface NotificationData {
  type: 'success' | 'error' | 'info';
  title: string;
  amount?: number;
  currency?: string;
  description?: string;
  account?: string;
  date?: string;
  duration?: number;
}

interface NotificationContextType {
  showNotification: (data: NotificationData) => void;
  hideNotification: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

interface NotificationProviderProps {
  children: ReactNode;
}

export function NotificationProvider({ children }: NotificationProviderProps) {
  const [notification, setNotification] = useState<NotificationData | null>(null);
  const [visible, setVisible] = useState(false);

  const showNotification = (data: NotificationData) => {
    setNotification(data);
    setVisible(true);
  };

  const hideNotification = () => {
    setVisible(false);
    setNotification(null);
  };

  const value: NotificationContextType = {
    showNotification,
    hideNotification,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
      {notification && (
        <NotificationPopup
          visible={visible}
          onClose={hideNotification}
          type={notification.type}
          title={notification.title}
          amount={notification.amount}
          currency={notification.currency}
          description={notification.description}
          account={notification.account}
          date={notification.date}
          duration={notification.duration}
        />
      )}
    </NotificationContext.Provider>
  );
}

export function useNotification(): NotificationContextType {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
}
