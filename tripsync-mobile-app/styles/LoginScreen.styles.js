/**
 * LoginScreen Styles
 * 
 * Style definitions for the LoginScreen component including:
 * - Container and layout styles
 * - Input field styles
 * - Button styles (email login and Google sign-in)
 * - Title and informational text styles
 */

import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#E9F5F2',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#264653',
    marginBottom: 30
  },
  input: {
    width: '100%',
    height: 50,
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 15,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#ccc'
  },
  button: {
    width: '100%',
    backgroundColor: '#2A9D8F',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center'
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold'
  },
  infoText: {
    color: '#666',
    marginTop: 20,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  }
});
