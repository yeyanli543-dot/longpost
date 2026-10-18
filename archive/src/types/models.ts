export interface LocalDocument {
  id: string;
  title: string;
  content: string;
  version: number;
  updatedAt: string;
  deleted?: boolean;
  dirty?: boolean;
}

export interface AiEngineConfig {
  mode: 'cloud' | 'custom';
  apiKey?: string;
  customBaseUrl?: string;
  model?: string;
}

export interface WebDavConfig {
  endpoint: string;
  username: string;
  password: string;
  basePath?: string;
  autoSync?: boolean;
}

export interface AppSettings {
  aiConfig: AiEngineConfig;
  webdavConfig?: WebDavConfig;
  theme?: 'apple' | 'google';
  fontSize?: number;
}
