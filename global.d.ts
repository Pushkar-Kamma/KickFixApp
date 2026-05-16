// Tells TypeScript that this module exists, even if it lacks official types.
declare module 'react-native-vision-camera-mlkit' {
    export function usePoseDetection(options?: any): {
      poseDetection: (frame: any) => any;
    };
  }


declare module '@env' {
  export const SUPABASE_URL: string;
  export const SUPABASE_ANON_KEY: string;
  export const SENTRY_DSN: string;
}
