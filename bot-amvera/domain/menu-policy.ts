export function shouldShowManagerMenu(isOwner: boolean, hasAccessibleGroup: boolean): boolean {
  return isOwner || hasAccessibleGroup;
}
