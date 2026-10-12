import React from 'react';
import clsx from 'clsx';

interface StatusDotProps {
  connected: boolean;
  stale?: boolean;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const StatusDot: React.FC<StatusDotProps> = ({
  connected,
  stale = false,
  className,
  size = 'md',
}) => {
  const sizeClasses = {
    sm: 'w-2 h-2',
    md: 'w-2.5 h-2.5',
    lg: 'w-3 h-3',
  };

  let colorClass = 'bg-red-500 ring-red-200';
  if (connected) {
    if (stale) {
      colorClass = 'bg-amber-400 ring-amber-200';
    } else {
      colorClass = 'bg-green-500 ring-green-200';
    }
  }

  return (
    <span
      className={clsx(
        'inline-block rounded-full ring-4 transition-all duration-300',
        sizeClasses[size],
        colorClass,
        className
      )}
      aria-hidden="true"
    />
  );
};
