export type MiniAppHttpMethod = 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | string;

const managerWriteRoutes = new Set<string>([
  'DELETE /api/students',
  'POST /api/announcements',
  'POST /api/homework-media-upload',
  'POST /api/homework',
  'PUT /api/homework',
  'DELETE /api/homework',
  'POST /api/attendance'
]);

/** Indicates whether a Mini App route changes group data and therefore needs manager authorization. */
export function isMiniAppManagerWriteRoute(method: MiniAppHttpMethod, pathname: string): boolean {
  return managerWriteRoutes.has(String(method).toUpperCase() + ' ' + String(pathname));
}

/** Identifies API paths that require a selected, accessible study group. */
export function isMiniAppGroupScopedRoute(pathname: string): boolean {
  return pathname !== '/api/groups' && pathname !== '/api/telegram-chats';
}
