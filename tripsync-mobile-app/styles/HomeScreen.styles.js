/**
 * HomeScreen Styles
 * 
 * Style definitions for the HomeScreen component including:
 * - Container and layout styles
 * - Dropdown picker styles
 * - Button styles (primary, disabled)
 * - Empty state styles (no trips message)
 * - Loading indicator styles
 */

import { StyleSheet } from 'react-native';
import { theme } from '../theme';

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  heading: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
    color: theme.textDark,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 24,
    lineHeight: 20,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  dropdown: {
    borderColor: theme.accent,
    marginBottom: 20,
  },
  dropdownContainer: {
    borderColor: theme.accent,
  },
  primaryButton: {
    backgroundColor: theme.accent,
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 20,
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
    opacity: 0.6,
  },
  buttonText: {
    color: theme.textLight,
    fontWeight: 'bold',
    fontSize: 16,
  },
  noTripsContainer: {
    backgroundColor: '#fff',
    padding: 32,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 20,
    elevation: 2,
  },
  noTripsIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  noTripsHeading: {
    fontSize: 20,
    fontWeight: 'bold',
    color: theme.textDark,
    marginBottom: 8,
  },
  noTripsText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
  },
  logoutButton: {
    marginTop: 32,
    padding: 16,
    alignItems: 'center',
  },
  logoutText: {
    color: '#B00020',
    fontSize: 16,
    fontWeight: '600',
  },
});
