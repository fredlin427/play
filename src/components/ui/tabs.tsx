"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

interface TabsProps {
  value: string;
  onValueChange: (value: string) => void;
  children: React.ReactNode;
  className?: string;
}

interface TabsListProps {
  children: React.ReactNode;
  className?: string;
}

interface TabsTriggerProps {
  value: string;
  children: React.ReactNode;
  className?: string;
  activeValue?: string;
  onClick?: () => void;
}

interface TabsContentProps {
  value: string;
  children: React.ReactNode;
  className?: string;
  activeValue?: string;
}

function Tabs({ value, onValueChange, children, className }: TabsProps) {
  return (
    <div className={className} data-active={value}>
      {React.Children.map(children, (child) => {
        if (React.isValidElement(child)) {
          return React.cloneElement(child as React.ReactElement<{ activeValue?: string; onValueChange?: (v: string) => void }>, {
            activeValue: value,
            onValueChange,
          });
        }
        return child;
      })}
    </div>
  );
}

function TabsList({ children, className, activeValue, onValueChange }: TabsListProps & { activeValue?: string; onValueChange?: (v: string) => void }) {
  return (
    <div className={cn("inline-flex h-9 items-center justify-center rounded-lg bg-gray-100 p-1 text-gray-500", className)}>
      {React.Children.map(children, (child) => {
        if (React.isValidElement(child)) {
          return React.cloneElement(child as React.ReactElement<TabsTriggerProps>, {
            activeValue,
            onClick: onValueChange ? () => onValueChange((child.props as TabsTriggerProps).value) : undefined,
          });
        }
        return child;
      })}
    </div>
  );
}

function TabsTrigger({ value, children, className, activeValue, onClick }: TabsTriggerProps) {
  const isActive = activeValue === value;
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium transition-all",
        isActive ? "bg-white text-gray-900 shadow-sm" : "hover:text-gray-700",
        className
      )}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function TabsContent({ value, children, className, activeValue }: TabsContentProps) {
  if (activeValue !== value) return null;
  return <div className={cn("mt-2", className)}>{children}</div>;
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
