/// <reference types="vite/client" />

// Electron API types
interface ElectronAPI {
  saveFile: (filePath: string, content: string) => Promise<{ success: boolean; error?: string }>;
  readFile: (filePath: string) => Promise<{ success: boolean; content?: string; error?: string }>;
  showOpenDialog: (options: any) => Promise<any>;
  saveBinaryFile: (filePath: string, base64Content: string) => Promise<{ success: boolean; error?: string }>;
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

// Image imports
declare module '*.png' {
  const src: string;
  export default src;
}

export {};
