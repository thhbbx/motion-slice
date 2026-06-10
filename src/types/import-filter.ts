export interface ImportFilterConfig {
  enableSizeFilter: boolean;
  minSizeMB: number;
  maxSizeMB: number;
  enableDurationFilter: boolean;
  minDurationSec: number;
  maxDurationSec: number;
  enableFormatFilter: boolean;
  allowedFormats: string[];
}

export interface ImportFilterResult {
  acceptedFiles: string[];
  rejectedFiles: string[];
  summary: string;
}
