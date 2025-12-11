/**
 * SettingsScreen Styles
 * 
 * Style definitions for the SettingsScreen component including:
 * - Container and layout styles
 * - Label and button row styles for settings options
 */

import { StyleSheet } from 'react-native';
import { theme } from '../theme';

export const styles = StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: theme.background,
    flex: 1,
  },
  label: {
    fontSize: 18,
    marginBottom: 12,
    color: theme.textDark,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
  },
});
