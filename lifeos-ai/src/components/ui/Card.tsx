import React from "react";

type CardProps = React.HTMLAttributes<HTMLDivElement>;

export function Card({ children, className = "", ...props }: CardProps) {
  return (
    <div className={`lo-card ${className}`} {...props}>
      {children}
    </div>
  );
}