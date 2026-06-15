import React from 'react';
import { Spinner } from '../common/Spinner';

export default function Loading() {
  return (
    <div className="w-full h-full flex flex-col justify-center items-center p-16 gap-3">
      <Spinner size={32} className="text-foreground" />
      <span className="text-sm text-muted-foreground">Loading...</span>
    </div>
  );
}
