// Cross-platform confirm: native Alert (styled, cancelable), web window.confirm
// (react-native-web's Alert is a silent no-op).

import { Alert, Platform } from 'react-native';

export function confirmAction(params: {
  title: string;
  message?: string;
  confirmText: string;
  destructive?: boolean;
}): Promise<boolean> {
  if (Platform.OS === 'web') {
    // eslint-disable-next-line no-alert
    return Promise.resolve(window.confirm(`${params.title}${params.message ? `\n\n${params.message}` : ''}`));
  }
  return new Promise((resolve) => {
    Alert.alert(params.title, params.message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      {
        text: params.confirmText,
        style: params.destructive ? 'destructive' : 'default',
        onPress: () => resolve(true),
      },
    ]);
  });
}
