import React from 'react';
import clsx from 'clsx';

export type BadgeVariant = 'normal' | 'full' | 'overlimit' | 'warning' | 'info';

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const Badge: React.FC<BadgeProps> = ({
  variant = 'normal',
  children,
  className,
  size = 'md',
}) => {
  const variantStyles: Record<BadgeVariant, string> = {
    normal: 'bg-green-50 text-green-700 border-green-200',
    full: 'bg-amber-50 text-amber-700 border-amber-200',
    overlimit: 'bg-red-50 text-red-700 border-red-200',
    warning: 'bg-yellow-50 text-yellow-800 border-yellow-200',
    info: 'bg-blue-50 text-blue-700 border-blue-200',
  };

  const sizeStyles = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-2.5 py-1',
    lg: 'text-base font-semibold px-4 py-1.5',
  };

  return (
    <span
      className={clsx(
        'inline-flex items-center justify-center font-medium rounded-full border transition-colors',
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
    >
      {children}
    </span>
  );
};
