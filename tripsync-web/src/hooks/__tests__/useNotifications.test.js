/**
 * Unit Tests for useNotifications and useItemChangeTracking Hooks
 * 
 * Tests functionality of notification management and item change tracking hooks.
 * Includes tests for toast creation, removal, timeout handling, and change tracking
 * with auto-removal functionality.
 */

import { renderHook, act } from '@testing-library/react';
import { useNotifications, useItemChangeTracking } from '../useNotifications';

describe('useNotifications', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('should initialize with empty toasts', () => {
    const { result } = renderHook(() => useNotifications());
    expect(result.current.toasts).toEqual([]);
  });

  it('should add a toast', () => {
    const { result } = renderHook(() => useNotifications());

    act(() => {
      result.current.addToast({
        message: 'Test message',
        type: 'info',
      });
    });

    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0].message).toBe('Test message');
    expect(result.current.toasts[0].type).toBe('info');
    expect(result.current.toasts[0].id).toBeDefined();
  });

  it('should add multiple toasts', () => {
    const { result } = renderHook(() => useNotifications());

    act(() => {
      result.current.addToast({ message: 'First' });
      result.current.addToast({ message: 'Second' });
    });

    expect(result.current.toasts).toHaveLength(2);
  });

  it('should remove a toast by id', () => {
    const { result } = renderHook(() => useNotifications());

    let toastId;
    act(() => {
      toastId = result.current.addToast({ message: 'Test' });
      result.current.addToast({ message: 'Test 2' });
    });

    expect(result.current.toasts).toHaveLength(2);

    act(() => {
      result.current.removeToast(toastId);
    });

    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0].message).toBe('Test 2');
  });

  it('should clear all toasts', () => {
    const { result } = renderHook(() => useNotifications());

    act(() => {
      result.current.addToast({ message: 'First' });
      result.current.addToast({ message: 'Second' });
    });

    expect(result.current.toasts).toHaveLength(2);

    act(() => {
      result.current.clearAll();
    });

    expect(result.current.toasts).toHaveLength(0);
  });

  it('should set default timeout', () => {
    const { result } = renderHook(() => useNotifications());

    act(() => {
      result.current.addToast({ message: 'Test' });
    });

    expect(result.current.toasts[0].timeout).toBe(5000);
  });

  it('should allow custom timeout', () => {
    const { result } = renderHook(() => useNotifications());

    act(() => {
      result.current.addToast({ message: 'Test', timeout: 10000 });
    });

    expect(result.current.toasts[0].timeout).toBe(10000);
  });
});

describe('useItemChangeTracking', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('should initialize with empty changed items', () => {
    const { result } = renderHook(() => useItemChangeTracking());
    expect(result.current.changedItems.size).toBe(0);
  });

  it('should mark item as changed', () => {
    const { result } = renderHook(() => useItemChangeTracking());

    act(() => {
      result.current.markItemChanged('item1', 'add', 'user123');
    });

    expect(result.current.changedItems.has('item1')).toBe(true);
    expect(result.current.changedItems.get('item1')).toEqual({
      type: 'add',
      actorId: 'user123',
      timestamp: expect.any(Number),
    });
  });

  it('should auto-remove change after 3 seconds', () => {
    const { result } = renderHook(() => useItemChangeTracking());

    act(() => {
      result.current.markItemChanged('item1', 'add');
    });

    expect(result.current.changedItems.has('item1')).toBe(true);

    act(() => {
      jest.advanceTimersByTime(3000);
    });

    expect(result.current.changedItems.has('item1')).toBe(false);
  });

  it('should clear existing timer when marking same item again', () => {
    const { result } = renderHook(() => useItemChangeTracking());

    act(() => {
      result.current.markItemChanged('item1', 'add');
    });

    act(() => {
      jest.advanceTimersByTime(2000);
      result.current.markItemChanged('item1', 'update');
    });

    // Should still be there after 2 more seconds (total 4, but reset)
    act(() => {
      jest.advanceTimersByTime(2000);
    });

    expect(result.current.changedItems.has('item1')).toBe(true);

    // Should be gone after 3 more seconds
    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(result.current.changedItems.has('item1')).toBe(false);
  });

  it('should clear item change manually', () => {
    const { result } = renderHook(() => useItemChangeTracking());

    act(() => {
      result.current.markItemChanged('item1', 'add');
    });

    expect(result.current.changedItems.has('item1')).toBe(true);

    act(() => {
      result.current.clearItemChange('item1');
    });

    expect(result.current.changedItems.has('item1')).toBe(false);
  });

  it('should clear all changes', () => {
    const { result } = renderHook(() => useItemChangeTracking());

    act(() => {
      result.current.markItemChanged('item1', 'add');
      result.current.markItemChanged('item2', 'update');
    });

    expect(result.current.changedItems.size).toBe(2);

    act(() => {
      result.current.clearAll();
    });

    expect(result.current.changedItems.size).toBe(0);
  });

  it('should handle different change types', () => {
    const { result } = renderHook(() => useItemChangeTracking());

    act(() => {
      result.current.markItemChanged('item1', 'add');
      result.current.markItemChanged('item2', 'remove');
      result.current.markItemChanged('item3', 'move');
      result.current.markItemChanged('item4', 'reorder');
    });

    expect(result.current.changedItems.get('item1').type).toBe('add');
    expect(result.current.changedItems.get('item2').type).toBe('remove');
    expect(result.current.changedItems.get('item3').type).toBe('move');
    expect(result.current.changedItems.get('item4').type).toBe('reorder');
  });
});

