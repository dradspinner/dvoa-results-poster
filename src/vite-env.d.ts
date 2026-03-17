/// <reference types="vite/client" />

// Electron API types
interface ElectronAPI {
  saveFile: (filePath: string, content: string) => Promise<{ success: boolean; error?: string }>;
  readFile: (filePath: string) => Promise<{ success: boolean; content?: string; error?: string }>;
  showSaveDialog: (options: any) => Promise<any>;
  showOpenDialog: (options: any) => Promise<any>;
  saveRunnerDatabase: (filePath: string, content: string) => Promise<boolean>;
  loadRunnerDatabase: (filePath: string) => Promise<string | null>;
  openExternal: (path: string) => Promise<{ success: boolean; error?: string }>;
  platform: string;
  isElectron: boolean;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
    electron?: ElectronAPI;
  }
}

// SQL file imports
declare module '*.sql?raw' {
  const content: string;
  export default content;
}

// Image imports
declare module '*.png' {
  const src: string;
  export default src;
}

export {};
