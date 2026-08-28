import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Copy } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';

/**
 * Khối lệnh/payload copy-được — dùng chung cho trang API & Webhook và trang
 * Tài liệu API của Customer Portal. Nền tối cố định (cả light mode) để tách
 * hẳn giá trị máy-đọc khỏi chữ người-đọc.
 */
export function ApiCodeBlock({ code, label }: { code: string; label?: string }) {
  const { t } = useTranslation('customerPortal');
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    toast.success(t('apiAccess.copied'));
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950 overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b border-slate-800">
        <span className="font-mono text-[11px] uppercase tracking-wider text-slate-400">{label}</span>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-slate-300 hover:text-white hover:bg-slate-800"
          onClick={handleCopy}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
        </Button>
      </div>
      <pre className="px-3 py-2.5 overflow-x-auto text-[12px] leading-relaxed font-mono text-slate-100 whitespace-pre">
        {code}
      </pre>
    </div>
  );
}
