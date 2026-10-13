export interface AlarmPlugin {
  schedule(options: { id: string; at: number; title: string }): Promise<void>
  cancel(options: { id: string }): Promise<void>
  ping(): Promise<void>
  status(): Promise<{ exact: boolean; notifications: boolean }>
  openAppSettings(): Promise<void>
}
