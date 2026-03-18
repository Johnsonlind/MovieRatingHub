// ==========================================
// 卡片式标签组件
// ==========================================
import type { ReactNode } from 'react';
import { cn } from '../../utils/utils';

export interface CardTabItem {
  id: string;
  label: ReactNode;
}

interface CardTabsProps {
  tabs: CardTabItem[];
  activeId: string;
  onChange: (id: string) => void;
  className?: string;
}

export function CardTabs({ tabs, activeId, onChange, className }: CardTabsProps) {
  if (!tabs || tabs.length === 0) return null;

  return (
    <div
      className={cn(
        'overflow-x-auto px-1 pb-1 scrollbar-gentle',
        className,
      )}
    >
      <div className="flex gap-2 border-b border-gray-200 dark:border-gray-800 min-w-0">
        {tabs.map((tab) => {
          const isActive = tab.id === activeId;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChange(tab.id)}
              className={cn(
                'flex-shrink-0 px-3 py-2 sm:px-4 text-sm font-medium rounded-t-xl transition-all duration-150',
                'border border-transparent border-b-0',
              isActive
                ? 'bg-white dark:bg-gray-900 text-blue-600 dark:text-blue-400 shadow-sm -mb-px border-gray-200 dark:border-gray-700'
                : 'bg-gray-100/70 dark:bg-gray-900/20 text-gray-600 dark:text-gray-400 hover:text-blue-500 hover:bg-gray-100 dark:hover:bg-gray-800/60',
            )}
          >
            {tab.label}
          </button>
        );
      })}
      </div>
    </div>
  );
}

