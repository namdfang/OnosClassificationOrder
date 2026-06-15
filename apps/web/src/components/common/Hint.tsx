import React from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface HintProps {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  asChild?: boolean;
  delayDuration?: number;
  /**
   * Force using Radix Tooltip even if content is a string.
   * By default string content uses native HTML `title` for zero-cost rendering.
   */
  forceRich?: boolean;
}

/**
 * Tooltip wrapper for inline values.
 *
 * Performance:
 * - When `content` is a string and child is a valid React element, this clones
 *   the child with a `title` attribute (native browser tooltip, zero JS cost).
 * - When `content` is JSX or `forceRich` is set, falls back to Radix Tooltip.
 *
 * In large lists (e.g. tables with hundreds of cells), the string short-circuit
 * is critical — each Radix Tooltip attaches event listeners and portal state,
 * which adds up fast.
 */
export function Hint({
  content,
  children,
  side = 'top',
  asChild = true,
  delayDuration = 200,
  forceRich = false,
}: HintProps) {
  if (!content) return <>{children}</>;

  // Fast path: string content → native HTML title (zero cost)
  if (!forceRich && typeof content === 'string' && React.isValidElement(children)) {
    const child = children as React.ReactElement<{ title?: string }>;
    return React.cloneElement(child, { title: child.props.title ?? content });
  }

  // Slow path: rich JSX content → Radix Tooltip
  return (
    <Tooltip delayDuration={delayDuration}>
      <TooltipTrigger asChild={asChild}>
        {asChild ? (children as React.ReactElement) : <span>{children}</span>}
      </TooltipTrigger>
      <TooltipContent side={side} className="max-w-xs">
        {content}
      </TooltipContent>
    </Tooltip>
  );
}
