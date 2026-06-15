export function assertSameType<T, U extends T>(): void {
  // This function only compiles if U is assignable to T
}
