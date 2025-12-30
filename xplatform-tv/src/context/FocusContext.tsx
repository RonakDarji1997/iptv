import React, {createContext, useContext, useState, useCallback} from 'react';
import {Platform} from 'react-native';

interface FocusContextType {
  focusedElement: string | null;
  setFocusedElement: (id: string | null) => void;
  isTVPlatform: boolean;
}

const FocusContext = createContext<FocusContextType | undefined>(undefined);

export const FocusProvider: React.FC<{children: React.ReactNode}> = ({
  children,
}) => {
  const [focusedElement, setFocusedElement] = useState<string | null>(null);
  const isTVPlatform = Platform.isTV;

  const handleSetFocus = useCallback((id: string | null) => {
    setFocusedElement(id);
  }, []);

  return (
    <FocusContext.Provider
      value={{
        focusedElement,
        setFocusedElement: handleSetFocus,
        isTVPlatform,
      }}>
      {children}
    </FocusContext.Provider>
  );
};

export const useFocus = () => {
  const context = useContext(FocusContext);
  if (context === undefined) {
    throw new Error('useFocus must be used within a FocusProvider');
  }
  return context;
};
