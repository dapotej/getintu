// Metro finds the monorepo's packages (Expo sets up workspaces itself from SDK 52).
const { getDefaultConfig } = require("expo/metro-config");

module.exports = getDefaultConfig(__dirname);
