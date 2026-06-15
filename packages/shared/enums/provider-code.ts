export const ProviderCode = {
  PRINTSEL: 'PRINTSEL',
  BEEFUN: 'BEEFUN',
  ONOS: 'ONOS',
  FLASHSHIP: 'FLASHSHIP',
  PRINTCARE: 'PRINTCARE',
  BURGERPRINTS: 'BURGERPRINTS',
  GEARMENT: 'GEARMENT',
  PRINTWAY: 'PRINTWAY',
  CUSTOMCAT: 'CUSTOMCAT',
  PRINTIFY: 'PRINTIFY',
  DreamShip: 'DreamShip',
  EGFULFILL: 'EGFULFILL',
  MERCHIZE: 'MERCHIZE',
  MKP: 'MKP',

  SwiftPOD: 'SwiftPOD',
  VietAnh: 'VietAnh',
  PrinteesHub: 'PrinteesHub',
  Fastex: 'Fastex',
  HP: 'HP',
  OrsomeUS: 'OrsomeUS',

  Varldens: 'Varldens',

  PunchNeedle: 'PunchNeedle',

  DangHai: 'DangHai',
  EFex: 'EFex',
  Kelvin: 'Kelvin',
  KelvinTX: 'KelvinTX',
  DonDang: 'DonDang',
  HubFulfill: 'HubFulfill',
  DangQuang: 'DangQuang',

  PrintDoors: 'PrintDoors',

  // China
  POD5: 'POD5',
  AliceXu: 'AliceXu',
  HongPhuc: 'HongPhuc',
  CatKiss: 'CatKiss',
  ZBear: 'ZBear',
  Lucky: 'Lucky',
  ToAddit: 'ToAddit',
  MOC: 'MOC',
  1688: '1688',
  Falcon: 'Falcon',

  Sunshine: 'Sunshine',
} as const;
export type ProviderCode = (typeof ProviderCode)[keyof typeof ProviderCode];

export const ProviderIcon: Record<ProviderCode, string> = {
  PRINTSEL: 'https://i.ibb.co/rZktqKF/printsel.png',
  BEEFUN: 'https://www.beefun.vn/wp-content/uploads/2022/07/cropped-favicon-beefun-02-32x32.png',
  ONOS: 'https://www.google.com/s2/favicons?sz=32&domain_url=https%3A%2F%2Fonospod.com%2F',
  FLASHSHIP: 'https://www.google.com/s2/favicons?sz=32&domain_url=https%3A%2F%2Fflashship.net%2F',
  PRINTCARE:
    'https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://monsterdtg.com&size=32',
  BURGERPRINTS: 'https://i0.wp.com/burgerprints.com/wp-content/uploads/2023/09/cropped-favicon.png?fit=32%2C32&ssl=1',
  GEARMENT: 'https://www.google.com/s2/favicons?sz=32&domain_url=https%3A%2F%2Fgearment.com%2F',
  PRINTWAY: 'https://www.google.com/s2/favicons?sz=48&domain_url=https%3A%2F%2Fprintway.io%2F',
  CUSTOMCAT: 'https://www.google.com/s2/favicons?sz=32&domain_url=https%3A%2F%2Fcustomcat.com%2F',
  PRINTIFY: 'https://www.google.com/s2/favicons?sz=32&domain_url=https%3A%2F%2Fprintify.com%2F',
  DreamShip: 'https://www.google.com/s2/favicons?sz=32&domain_url=https%3A%2F%2Fdreamship.com%2F',
  EGFULFILL:
    'https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://egfulfill.com/&size=32',
  MERCHIZE:
    'https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://merchize.com/&size=32',
  MKP: 'https://www.google.com/s2/favicons?sz=32&domain_url=https%3A%2F%2Fmkt.city%2F',
  SwiftPOD:
    'https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://www.swiftpod.com/&size=32',

  Varldens: `https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://varldens.com/&size=32`,

  DangHai: `https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://haidang.vn/&size=32`,
  EFex: `https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://efex.vn/&size=32`,
  Kelvin: `https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://kelvin.com/&size=32`,
  KelvinTX: `https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://kelvin.com/&size=32`,
  DonDang: `https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://dingdong.com/&size=32`,
  HubFulfill: `https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://hubfulfill.com/&size=32`,

  // custom
  POD5: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRxIt_Ss4uRCtX9GRu3T-TBQAGCn1GUBp8jbA&s',
  AliceXu: 'https://i.ibb.co/1J1ZYJ5/logo-com-editor-colors.webp',
  HongPhuc:
    'https://brandcentral.hp.com/etc.clientlibs/hp-brand-central/clientlibs/clientlib-site/resources/asset/favicon/favicon.ico',
  CatKiss:
    'https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://catkissfish.com/&size=32',
  ZBear: 'ZBear',
  Lucky:
    'https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://luckybrand.com/&size=32',

  Sunshine:
    'https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://sunshinegroup.vn/&size=32',
  ToAddit:
    'https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://toaddit.com/&size=32',
  MOC: 'https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://moc.com/&size=32',
  1688: 'https://i.ibb.co/KW4ZV2w/favicon-16x16.png',
  PrintDoors:
    'https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://test.com/&size=32',
};

export const ProviderType = {
  Factory: 'Factory',
  Stock: 'Stock',
  // Dropship: 'Dropship',
};

export type ProviderType = (typeof ProviderType)[keyof typeof ProviderType];
