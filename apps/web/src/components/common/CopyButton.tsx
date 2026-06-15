import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/utils/cn';

interface CopyButtonProps {
  value: string;
  className?: string;
  iconSize?: number;
  label?: string;
}

/**
 * Inline copy button. Uses native HTML `title` instead of Radix Tooltip for
 * zero render cost — important when rendered hundreds of times per page (e.g.
 * inside table cells).
 */
export function CopyButton({ value, className, iconSize = 12, label }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // no-op
    }
  };

  const titleText = copied ? 'Đã copy!' : label ? `Copy ${label}` : 'Copy';

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={titleText}
      className={cn(
        'inline-flex items-center justify-center rounded p-0.5 hover:bg-muted transition-colors bg-transparent border-none cursor-pointer text-muted-foreground hover:text-foreground align-middle',
        className,
      )}
    >
      {copied ? <Check size={iconSize} className="text-emerald-500" /> : <Copy size={iconSize} />}
    </button>
  );
}
