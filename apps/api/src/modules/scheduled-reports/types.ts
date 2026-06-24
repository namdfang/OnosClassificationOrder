export type ReportSlot = 'morning' | 'noon' | 'evening';

export type ReportPeriod = {
  from: Date;
  to: Date;
  slot: ReportSlot;
  slotLabel: string;
};

export type DesignerRow = {
  userId: string;
  fullName: string;
  totalInShift: number;
  doneInShift: number;
  assignedNow: number;
  inProgressNow: number;
  reworkNow: number;
};

export type DesignerReportData = {
  rows: DesignerRow[];
  totals: {
    totalInShift: number;
    doneInShift: number;
    assignedNow: number;
    inProgressNow: number;
    reworkNow: number;
  };
  unassignedNow: number;
  activeInProgress: number;
  activeRework: number;
};

export type FactoryRow = {
  factoryId: string;
  name: string;
  shortName: string;
  total: number;
  notPrinted: number;
  printed: number;
  error: number;
  transferredIn: number;
  transferredOut: number;
};

export type FactoryReportData = {
  rows: FactoryRow[];
  totals: {
    total: number;
    notPrinted: number;
    printed: number;
    error: number;
    transferredIn: number;
    transferredOut: number;
  };
  unmapped: number;
};

export type ErrorUrgencyBucket = {
  new: number;
  attention: number;
  urgent: number;
  critical: number;
};

export type ErrorTopCode = {
  code: string;
  name: string;
  count: number;
};

export type ErrorReportData = {
  total: number;
  bySource: {
    designer: number;
    factory: number;
    unknown: number;
  };
  urgency: ErrorUrgencyBucket;
  topCodes: ErrorTopCode[];
};
