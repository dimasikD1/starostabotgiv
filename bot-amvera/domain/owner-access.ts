export function isOwnerId(userId: string | number, ownerIds: readonly string[]): boolean {
  return ownerIds.includes(String(userId));
}
