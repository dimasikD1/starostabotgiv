declare module './ruc.mjs' {
  export function getSchedule(
    group: string,
    days?: number,
    startDate?: string
  ): Promise<unknown>;
}
