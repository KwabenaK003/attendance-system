import { useState, useCallback } from "react";

export function useGeolocation() {
  const [location, setLocation] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const getLocation = useCallback(() => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        const err = "Geolocation is not supported by your browser";
        setError(err);
        reject(err);
        return;
      }
      setLoading(true);
      setError(null);
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const loc = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
          };
          // Reverse geocode via free API
          try {
            const res = await fetch(
              `https://nominatim.openstreetmap.org/reverse?lat=${loc.latitude}&lon=${loc.longitude}&format=json`
            );
            const data = await res.json();
            loc.location_name =
              data.address?.city ||
              data.address?.town ||
              data.address?.suburb ||
              data.display_name?.split(",")[0] ||
              `${loc.latitude.toFixed(4)}, ${loc.longitude.toFixed(4)}`;
          } catch {
            loc.location_name = `${loc.latitude.toFixed(4)}, ${loc.longitude.toFixed(4)}`;
          }
          setLocation(loc);
          setLoading(false);
          resolve(loc);
        },
        (err) => {
          const msg = err.code === 1
            ? "Location permission denied"
            : err.code === 2
            ? "Location unavailable"
            : "Location request timed out";
          setError(msg);
          setLoading(false);
          reject(msg);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    });
  }, []);

  return { location, error, loading, getLocation };
}
