import React, { useState } from 'react';
import { motion } from 'framer-motion';

interface Tab {
  id: string;
  label: string;
  icon?: React.ElementType;
}

interface TabsProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  className?: string;
  variant?: 'default' | 'pills';
}

export const Tabs: React.FC<TabsProps> = ({
  tabs,
  activeTab,
  onTabChange,
  className,
  variant = 'default',
}) => {
  const baseStyles = 'flex items-center gap-1 p-1 rounded-xl';
  const containerStyles = variant === 'default' 
    ? 'bg-surface-dark border border-surface-light' 
    : 'bg-transparent';

  return (
    <div className={`${baseStyles} ${containerStyles} ${className || ''}`}>
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        const Icon = tab.icon;
        
        return (
          <motion.button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`relative flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              isActive
                ? 'text-white'
                : 'text-text-dark hover:text-text-light'
            }`}
            whileTap={{ scale: 0.97 }}
          >
            {isActive && (
              <motion.div
                layoutId="activeTab"
                className="absolute inset-0 bg-primary rounded-lg"
                transition={{ type: 'spring', stiffness: 500, damping: 35 }}
              />
            )}
            <span className="relative z-10 flex items-center gap-2">
              {Icon && <Icon size={16} />}
              {tab.label}
            </span>
          </motion.button>
        );
      })}
    </div>
  );
};

interface SegmentedControlProps {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export const SegmentedControl: React.FC<SegmentedControlProps> = ({
  options,
  value,
  onChange,
  className,
}) => {
  return (
    <div className={`flex items-center p-1 bg-surface-dark rounded-xl border border-surface-light ${className || ''}`}>
      {options.map((option) => {
        const isActive = option.value === value;
        
        return (
          <motion.button
            key={option.value}
            onClick={() => onChange(option.value)}
            className={`relative flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              isActive ? 'text-white' : 'text-text-dark'
            }`}
            whileTap={{ scale: 0.98 }}
          >
            {isActive && (
              <motion.div
                layoutId="activeSegment"
                className="absolute inset-0 bg-primary/80 rounded-lg"
                transition={{ type: 'spring', stiffness: 500, damping: 35 }}
              />
            )}
            <span className="relative z-10">{option.label}</span>
          </motion.button>
        );
      })}
    </div>
  );
};
