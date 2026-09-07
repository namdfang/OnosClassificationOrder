'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Copy } from 'lucide-react';

/** Khối lệnh/payload copy được — nền tối cố định (cả light mode) để tách giá trị máy-đọc khỏi chữ người-đọc. */
export function ApiCodeBlock({ code, label }: { code: string; label?: string }) {
  const { t } = useTranslation('customerPortal');
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="rounded-lg border border-[#2a2340] bg-[#160f22] overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b border-[#2a2340]">
        <span className="font-mono text-[10px] uppercase tracking-wider text-[#a89bbd]">{label}</span>
        <button type="button" onClick={copy} className="inline-flex items-center gap-1 text-[10px] text-[#d9cfe8] hover:text-white" title={t('apiAccess.copied')}>
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? t('apiAccess.copied') : ''}
        </button>
      </div>
      <pre className="px-3 py-2.5 overflow-x-auto text-[11.5px] leading-relaxed font-mono text-[#f1e9ee] whitespace-pre">{code}</pre>
    </div>
  );
}
