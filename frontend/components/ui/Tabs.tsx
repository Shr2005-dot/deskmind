import React from "react";

interface TabsProps {
  items: { id: string; label: string; icon?: React.ReactNode }[];
  activeId: string;
  onChange: (id: string) => void;
}

export function Tabs({ items, activeId, onChange }: TabsProps) {
  return (
    <div className="border-b border-border">
      <nav className="flex gap-1" aria-label="Tabs">
        {items.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`
              relative px-4 py-2.5 text-sm font-medium transition-colors duration-150 ease-out
              rounded-t-lg
              ${
                activeId === tab.id
                  ? "text-primary-700 bg-primary-50"
                  : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
              }
            `}
          >
            {tab.icon && <span className="mr-1.5">{tab.icon}</span>}
            {tab.label}
            {activeId === tab.id && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-600 rounded-t-full" />
            )}
          </button>
        ))}
      </nav>
    </div>
  );
}
