export interface Service {
  id: string;
  pid: number;
  name: string;
  runtime: string;
  command: string;
  cwd: string;
  ports: number[];
  addresses: string[];
  cpu: number;
  memory: number;
  uptime: number;
  startedAt: string;
  canStop: boolean;
  protected: boolean;
  development: boolean;
}
export interface Activity {
  id: string;
  name: string;
  pid: number;
  ports: number[];
  at: string;
  action: "stopped" | "forced";
}
export interface Preferences {
  refreshSeconds: number;
  launchAtLogin: boolean;
  showOther: boolean;
  longRunningHours: number;
}
export interface Snapshot {
  services: Service[];
  history: Activity[];
  preferences: Preferences;
  scannedAt: string;
  hostname: string;
  error?: string;
}
export interface StopResult {
  status: "stopped" | "cancelled" | "still-running";
  name?: string;
}
export interface DevDockAPI {
  snapshot(): Promise<Snapshot>;
  stop(id: string, force?: boolean): Promise<StopResult>;
  preferences(value: Partial<Preferences>): Promise<Preferences>;
  open(port: number): Promise<void>;
  reveal(id: string): Promise<void>;
  clearHistory(): Promise<void>;
  onChange(callback: (snapshot: Snapshot) => void): () => void;
}
