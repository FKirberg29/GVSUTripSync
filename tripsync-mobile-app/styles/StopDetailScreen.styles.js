/**
 * StopDetailScreen Styles
 * 
 * Style definitions for the StopDetailScreen component including:
 * - Container and layout styles
 * - Header styles for stop title and address
 * - Notes input styles
 * - Media gallery styles (grid layout, upload overlays, progress indicators)
 * - Button styles (add media, save)
 * - Loading and empty state styles
 */

import { StyleSheet } from 'react-native';
import { theme } from '../theme';

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },
  content: {
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.background,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: theme.textDark,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.background,
  },
  emptyText: {
    fontSize: 16,
    color: theme.textDark,
  },
  header: {
    marginBottom: 24,
  },
  stopTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: theme.textDark,
    marginBottom: 8,
  },
  stopAddress: {
    fontSize: 14,
    color: '#666',
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.textDark,
    marginBottom: 12,
  },
  notesInput: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: theme.textDark,
    minHeight: 120,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  addMediaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.accent,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  addMediaText: {
    color: theme.textLight,
    fontWeight: '600',
  },
  mediaContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  mediaItem: {
    width: '47%',
    aspectRatio: 1,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  mediaPreview: {
    width: '100%',
    height: '100%',
    backgroundColor: '#f0f0f0',
  },
  removeMediaButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  uploadProgressText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
    marginTop: 8,
  },
  emptyMediaContainer: {
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#e0e0e0',
    borderStyle: 'dashed',
  },
  emptyMediaText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.textDark,
    marginTop: 12,
  },
  emptyMediaSubtext: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  saveButton: {
    backgroundColor: theme.accent,
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 32,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: theme.textLight,
    fontSize: 18,
    fontWeight: 'bold',
  },
});
