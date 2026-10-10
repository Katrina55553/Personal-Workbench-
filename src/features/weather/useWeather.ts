import { useEffect, useState, useSyncExternalStore } from 'react';
import { WeatherController } from './controller';

export function useWeather() {
  const [controller] = useState(() => new WeatherController());
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  useEffect(() => {
    controller.start();
    return () => controller.stop();
  }, [controller]);
  return {
    ...state,
    refresh: controller.refresh,
    locate: controller.locate,
    selectLocation: controller.selectLocation,
  };
}
