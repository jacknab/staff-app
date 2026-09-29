const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);
const defaultResolveRequest = config.resolver.resolveRequest;
const useExpoGoPreview = process.env.EXPO_PUBLIC_EXPO_GO_PREVIEW === '1';

if (useExpoGoPreview) {
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    if (moduleName === '@stripe/stripe-terminal-react-native') {
      return {
        filePath: path.resolve(__dirname, 'lib/stripe-terminal-expo-go-mock.tsx'),
        type: 'sourceFile',
      };
    }

    return defaultResolveRequest
      ? defaultResolveRequest(context, moduleName, platform)
      : context.resolveRequest(context, moduleName, platform);
  };
}

module.exports = config;
