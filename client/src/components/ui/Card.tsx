import React from 'react';
import clsx from 'clsx';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
}

export const Card: React.FC<CardProps> = ({ children, className, ...props }) => {
  return (
    <div
      className={clsx('bg-white rounded-xl shadow-sm border border-gray-100 p-6', className)}
      {...props}
    >
      {children}
    </div>
  );
};
