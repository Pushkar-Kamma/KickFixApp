// Tells TypeScript that this module exists, even if it lacks official types.
declare module 'react-native-vision-camera-mlkit' {
    export function usePoseDetection(options?: any): {
      poseDetection: (frame: any) => any;
    };
  }