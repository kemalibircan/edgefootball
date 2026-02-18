import React, {createContext, useContext, useState, useCallback} from 'react';
import {Toast} from '../components/common/Toast';

type ToastType = 'success' | 'error' | 'warning' | 'info';

type ToastOptions = {
  message: string;
  type?: ToastType;
  duration?: number;
};

type ToastContextType = {
  showToast: (options: ToastOptions) => void;
  showSuccess: (message: string) => void;
  showError: (message: string) => void;
  showWarning: (message: string) => void;
  showInfo: (message: string) => void;
};

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({children}: {children: React.ReactNode}) {
  const [toast, setToast] = useState<ToastOptions & {visible: boolean}>({
    message: '',
    type: 'info',
    duration: 3000,
    visible: false,
  });

  const showToast = useCallback(({message, type = 'info', duration = 3000}: ToastOptions) => {
    setToast({message, type, duration, visible: true});
  }, []);

  const showSuccess = useCallback((message: string) => {
    showToast({message, type: 'success'});
  }, [showToast]);

  const showError = useCallback((message: string) => {
    showToast({message, type: 'error'});
  }, [showToast]);

  const showWarning = useCallback((message: string) => {
    showToast({message, type: 'warning'});
  }, [showToast]);

  const showInfo = useCallback((message: string) => {
    showToast({message, type: 'info'});
  }, [showToast]);

  const hideToast = useCallback(() => {
    setToast(prev => ({...prev, visible: false}));
  }, []);

  return (
    <ToastContext.Provider
      value={{
        showToast,
        showSuccess,
        showError,
        showWarning,
        showInfo,
      }}>
      {children}
      <Toast
        message={toast.message}
        type={toast.type}
        duration={toast.duration}
        visible={toast.visible}
        onHide={hideToast}
      />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
}
