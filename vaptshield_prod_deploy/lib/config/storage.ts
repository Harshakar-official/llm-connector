export const STORAGE_BUCKETS = {
  AVATARS: process.env.STORAGE_BUCKET_AVATARS || 'avatars',
  POC_FILES: process.env.STORAGE_BUCKET_POC_FILES || 'poc-files',
  REPORTS: process.env.STORAGE_BUCKET_REPORTS || 'reports',
} as const

export type StorageBucket = (typeof STORAGE_BUCKETS)[keyof typeof STORAGE_BUCKETS]
