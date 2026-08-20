// Chưa có component nào được đưa vào gói này.
//
// `export {}` là thứ biến file rỗng thành một MODULE: thiếu nó thì
// `export * from './components/index'` ở `index.ts` báo TS2306 "is not a
// module", và cả `pnpm build-types` của workspace đỏ theo (`QA-5`).
export {};
