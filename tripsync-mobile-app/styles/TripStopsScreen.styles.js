/**
 * TripStopsScreen Styles
 * 
 * Style definitions for the TripStopsScreen component including:
 * - Container and layout styles
 * - Day selector header and navigation styles
 * - Day card styles (horizontal scrollable cards)
 * - Day picker modal styles
 * - Stop item list styles with numbered markers
 * - Loading and empty state styles
 */

import { StyleSheet } from 'react-native';
import { theme } from '../theme';

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
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
  daySelectorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    paddingVertical: 16,
    paddingHorizontal: 12,
  },
  navButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  navButtonDisabled: {
    opacity: 0.3,
  },
  currentDayInfo: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  currentDayNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: theme.textDark,
    marginBottom: 4,
  },
  currentDayLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.accent,
    marginBottom: 2,
  },
  currentDayDate: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  currentDayCount: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  dayCardsContainer: {
    backgroundColor: '#f5f5f5',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    maxHeight: 100,
  },
  dayCardsContent: {
    paddingHorizontal: 8,
    paddingVertical: 12,
  },
  dayCard: {
    width: 100,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginHorizontal: 4,
    borderWidth: 2,
    borderColor: 'transparent',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  dayCardActive: {
    borderColor: theme.accent,
    backgroundColor: '#f0f8f7',
  },
  dayCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  dayCardNumber: {
    fontSize: 14,
    fontWeight: 'bold',
    color: theme.textDark,
  },
  dayCardNumberActive: {
    color: theme.accent,
  },
  dayCardBadge: {
    backgroundColor: theme.accent,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  dayCardBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: theme.textLight,
  },
  dayCardLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginBottom: 2,
  },
  dayCardLabelActive: {
    color: theme.accent,
  },
  dayCardDate: {
    fontSize: 10,
    color: '#999',
  },
  dayCardDateActive: {
    color: '#666',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
    paddingBottom: 32,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: theme.textDark,
  },
  modalScrollView: {
    maxHeight: 400,
  },
  modalDayItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  modalDayItemActive: {
    backgroundColor: '#f0f8f7',
  },
  modalDayItemLeft: {
    flex: 1,
  },
  modalDayItemNumber: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.textDark,
    marginBottom: 4,
  },
  modalDayItemNumberActive: {
    color: theme.accent,
  },
  modalDayItemLabel: {
    fontSize: 14,
    color: theme.accent,
    marginBottom: 2,
  },
  modalDayItemDate: {
    fontSize: 12,
    color: '#666',
  },
  modalDayItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  modalDayItemCount: {
    backgroundColor: theme.accent,
    borderRadius: 10,
    minWidth: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    marginRight: 8,
  },
  modalDayItemCountText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: theme.textLight,
  },
  modalCloseButton: {
    backgroundColor: theme.accent,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    marginHorizontal: 20,
    marginTop: 16,
  },
  modalCloseButtonText: {
    color: theme.textLight,
    fontSize: 16,
    fontWeight: 'bold',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: theme.textDark,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
  },
  listContent: {
    padding: 16,
  },
  stopItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  stopNumberContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  stopNumber: {
    color: theme.textLight,
    fontSize: 16,
    fontWeight: 'bold',
  },
  stopContent: {
    flex: 1,
  },
  stopTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.textDark,
    marginBottom: 4,
  },
  stopAddress: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  stopNotes: {
    fontSize: 14,
    color: theme.textDark,
    marginTop: 4,
  },
  contentIndicators: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 8,
  },
  contentIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  contentIndicatorText: {
    fontSize: 12,
    color: theme.accent,
    fontWeight: '600',
  },
  mediaIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  mediaCount: {
    fontSize: 12,
    color: theme.accent,
    marginLeft: 4,
    fontWeight: '600',
  },
});
