import React from 'react';
import { useTranslation } from 'react-i18next';
import { UploadCloud } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import { Hint } from './Hint';

interface FileUrlOrUploadInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

/**
 * Input cho field kiểu "file" (mockup/design) ở Customer Portal — hỗ trợ dán
 * URL (đường dẫn hoạt động) song song với nút "Tải file lên". Nút upload hiện
 * DISABLED — chưa có storage backend nên chưa nhận file thật, chỉ mở sẵn chỗ
 * trên UI + giải thích, tránh phải đổi lại giao diện khi bật upload sau này.
 */
export function FileUrlOrUploadInput({ value, onChange, placeholder, className }: FileUrlOrUploadInputProps) {
  const { t } = useTranslation('customerPortal');

  return (
    <div className={className}>
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="h-10 flex-1"
        />
        <Hint content={t('fileInput.uploadUnavailable')}>
          <Button type="button" variant="outline" size="icon" className="h-10 w-10 shrink-0" disabled>
            <UploadCloud size={16} className="text-muted-foreground" />
          </Button>
        </Hint>
      </div>
    </div>
  );
}
