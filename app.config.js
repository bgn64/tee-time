const appJson = require('./app.json');

module.exports = ({ config }) => {
  const googleMapsApiKey =
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY;
  const expo = appJson.expo;
  const androidConfig = {
    ...(expo.android?.config ?? {}),
    ...(googleMapsApiKey ? { googleMaps: { apiKey: googleMapsApiKey } } : {}),
  };

  return {
    ...config,
    ...expo,
    android: {
      ...expo.android,
      ...(Object.keys(androidConfig).length > 0 ? { config: androidConfig } : {}),
    },
  };
};
