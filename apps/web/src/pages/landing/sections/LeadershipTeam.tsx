import React from 'react';
import { useTranslation } from 'react-i18next';

import Reveal from '@/components/public/Reveal';
import SectionHeading from '@/components/public/SectionHeading';

import claudeVlandisUrl from '@/assets/images/team/claude-vlandis.jpg';
import jacobShapiraUrl from '@/assets/images/team/jacob-shapira.jpg';
import soiLeUrl from '@/assets/images/team/soi-le.jpg';
import thuyNguyenUrl from '@/assets/images/team/thuy-nguyen.jpg';

/**
 * Đội ngũ lãnh đạo — dữ liệu thật lấy từ trang thương hiệu onosglobal.com.
 *
 * `photo` để `undefined` nghĩa là CHƯA có ảnh chân dung xác thực của người đó —
 * khi đó hiển thị vòng chữ cái đầu thay vì ảnh. TUYỆT ĐỐI không lấp chỗ trống
 * bằng ảnh mẫu của theme hay ảnh stock: gắn mặt người lạ vào tên người thật
 * trên trang public là sai. Có ảnh thật thì thêm vào `assets/images/team/` rồi
 * trỏ `photo` vào đây.
 */
const MEMBERS: { key: string; photo?: string; initials: string }[] = [
  { key: 'claudeVlandis', photo: claudeVlandisUrl, initials: 'CV' },
  { key: 'ricardoBialystocki', initials: 'RB' },
  { key: 'ricardoCastillo', initials: 'RC' },
  { key: 'thuyNguyen', photo: thuyNguyenUrl, initials: 'TN' },
  { key: 'jacobShapira', photo: jacobShapiraUrl, initials: 'JS' },
  { key: 'soiLe', photo: soiLeUrl, initials: 'SL' },
];

/** Bo góc lệch (trên-trái + dưới-phải) — hình khối ảnh đặc trưng của nhận diện Onos. */
const SHAPE = 'rounded-tl-[2.75rem] rounded-br-[2.75rem]';

function LeadershipTeam() {
  const { t } = useTranslation('landing');

  return (
    <section id="team" className="scroll-mt-24 bg-slate-50/70">
      <div className="mx-auto max-w-6xl px-4 py-20 lg:py-24">
        <SectionHeading
          eyebrow={t('team.eyebrow')}
          lead={t('team.titleLead')}
          accent={t('team.titleAccent')}
          subtitle={t('team.subtitle')}
        />

        <ul className="mt-14 grid grid-cols-2 gap-x-5 gap-y-9 sm:grid-cols-3 lg:grid-cols-6">
          {MEMBERS.map(({ key, photo, initials }, index) => {
            const name = t(`team.members.${key}.name`);

            return (
              <Reveal key={key} delay={(index % 3) * 80}>
                <li className="text-center">
                  {photo ? (
                    <img
                      src={photo}
                      alt={name}
                      loading="lazy"
                      decoding="async"
                      width={300}
                      height={330}
                      className={`${SHAPE} aspect-[10/11] w-full object-cover`}
                    />
                  ) : (
                    <span
                      aria-hidden="true"
                      className={`${SHAPE} flex aspect-[10/11] w-full items-center justify-center bg-brand-100 font-display text-3xl font-medium text-brand-700`}
                    >
                      {initials}
                    </span>
                  )}

                  <h3 className="mt-4 font-display text-base font-medium leading-snug text-[#0f110f]">{name}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">{t(`team.members.${key}.role`)}</p>
                </li>
              </Reveal>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

export default LeadershipTeam;
