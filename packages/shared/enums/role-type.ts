export enum RoleType {
  SuperAdmin = 'SuperAdmin',
  Admin = 'Admin',
  Seller = 'Seller',
  Manager = 'Manager',
  SellerManager = 'SellerManager',
  ProductManager = 'ProductManager',
  SupportManager = 'SupportManager',
  Support = 'Support',

  Developer = 'Developer',
  Shipment = 'Shipment',
  Provider = 'Provider',

  Accountant = 'Accountant',

  // Designer team — Leader assigns tasks + sees stats; Designer (sub) handles
  // their own tasks via /my-tasks. Migrate cũ: 1 user Designer → DesignerLeader.
  DesignerLeader = 'DesignerLeader',
  Designer = 'Designer',

  // Logistics
  Logistics = 'Logistics',
  Fulfillment = 'Fulfillment',

  Referrer = 'Referrer',

  // Tài khoản khách hàng (Customer Portal) — không phải nhân viên, không dùng
  // hệ thống permissionCodes nội bộ. Xem `customer-portal` module.
  Customer = 'Customer',
}
