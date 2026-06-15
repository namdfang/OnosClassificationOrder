export enum IssueStatus {
  Opening = 'Opening',
  Approved = 'Approved',
  Rejected = 'Rejected',
  OnHold = 'OnHold',
  Completed = 'Completed',
  Cancelled = 'Cancelled',
}

export enum IssueType {
  ImageQuality = 'Image quality (color/appearance)',
  ItemDamaged = 'Item damaged',
  ItemMissing = 'Item missing',
  ItemNotExpected = 'Item not as expected',
  NoUpdateFromCarrier = 'No update from carrier',
  OrderLateProduction = 'Order Late production',
  ShippingProblem = 'Shipping problem',
  WrongItemSize = 'Wrong item size/type received',
  WrongPrint = 'Wrong print delivered',
  ShippingToWrongAddress = 'Shipping to wrong address',
  SizeNotExpected = 'Size not as expected',
  PrintMissing = 'Print missing (front/back)',
  RequestUnlockOrder = 'Request unlock order',
  AnotherReason = 'Another reason',
  CancelByBuyer = 'Cancel by buyer',
  RelabelFBA = 'Relabel FBA',
}

export enum IssueSolution {
  Refund = 'Refund',
  Reject = 'Replace',
}
