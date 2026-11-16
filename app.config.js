// Adds the web base path when the app is hosted in a sub-folder (GitHub Pages serves it at /Stanza).
// Phone builds never set EXPO_BASE_URL, so they are unchanged.
module.exports = ({ config }) => ({
  ...config,
  experiments: {
    ...config.experiments,
    ...(process.env.EXPO_BASE_URL ? { baseUrl: process.env.EXPO_BASE_URL } : {}),
  },
});
