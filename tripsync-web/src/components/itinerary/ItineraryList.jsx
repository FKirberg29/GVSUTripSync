/**
 * ItineraryList Component
 * 
 * Displays a draggable list of itinerary items for a selected day with drag-and-drop reordering,
 * inline notes editing, weather chips, comments, and change indicators. Supports moving items
 * between days and deleting items.
 */

import { useState } from "react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import Comments from "../Comments.jsx";
import { MAX_LENGTHS } from "../../utils/validation.js";
import styles from "./ItineraryList.module.css";

/**
 * Renders draggable itinerary list for a selected day
 * @param {Array} items - Array of itinerary items for the selected day
 * @param {string} activePlaceId - Currently active place ID
 * @param {Object} weatherByItem - Map of item ID to weather data
 * @param {string} tempUnit - Temperature unit to display
 * @param {Array} allDays - Array of all day numbers
 * @param {Object} dayLabels - Map of day number to day label
 * @param {number} selectedDay - Currently selected day number
 * @param {string} tripId - Trip ID
 * @param {Function} onDragEnd - Callback when drag ends, receives drag result
 * @param {Function} onItemClick - Callback when item is clicked, receives item and index
 * @param {Function} onWeatherClick - Callback when weather chip is clicked, receives item
 * @param {Function} onMoveItemToDay - Callback to move item to different day, receives item and day number
 * @param {Function} onDeleteItem - Callback to delete item, receives item ID
 * @param {Function} onUpdateNotes - Callback to update item notes, receives item ID and notes text
 * @param {Function} onCommentsClick - Callback when comments button is clicked, receives item ID
 * @param {Map} changedItems - Map of itemId to change info { type, actorId, timestamp }
 */
export default function ItineraryList({
  items,
  activePlaceId,
  weatherByItem,
  tempUnit,
  allDays,
  dayLabels,
  selectedDay,
  tripId,
  onDragEnd,
  onItemClick,
  onWeatherClick,
  onMoveItemToDay,
  onDeleteItem,
  onUpdateNotes,
  onCommentsClick,
  changedItems = new Map(), // Map of itemId -> { type, actorId, timestamp }
}) {
  // Tracks which items have expanded notes for inline editing
  const [expandedNotes, setExpandedNotes] = useState(new Set());
  // Tracks notes text being edited for each item (itemId -> notes text)
  const [editingNotes, setEditingNotes] = useState(new Map());
  // Tracks which item has comments panel open
  const [commentsOpenForItem, setCommentsOpenForItem] = useState(null);
  
  return (
    <div className="td-itinerary-scroll">
      <DragDropContext onDragStart={() => {}} onDragEnd={onDragEnd}>
        <Droppable droppableId={`itinerary-day-${selectedDay}`}>
          {(provided) => (
            <ul
              {...provided.droppableProps}
              ref={provided.innerRef}
              className={styles.list}
            >
              {items.map((item, index) => {
                const isActive = item.placeId === activePlaceId;
                const wi = weatherByItem[item.id];
                const changeInfo = changedItems.get(item.id);
                const changeType = changeInfo?.type;

                // Determines CSS class based on change type for visual feedback
                let changeClass = "";
                if (changeType === "add") changeClass = styles.rowChangedAdd;
                else if (changeType === "remove") changeClass = styles.rowChangedRemove;
                else if (changeType === "move" || changeType === "reorder") changeClass = styles.rowChangedMove;

                const chip =
                  wi?.status === "ready" ? (
                    <button
                      className={styles.weatherChipTiny}
                      title={wi.source === "cache" ? "Forecast (cached) — click for details" : "Forecast — click for details"}
                      onClick={(e) => {
                        e.stopPropagation();
                        onWeatherClick?.(item);
                      }}
                    >
                      {wi.iconUri ? (
                        <img alt="" src={wi.iconUri} className={styles.weatherIcon} loading="lazy" />
                      ) : null}
                      <span>{wi.max}{tempUnit}</span>
                    </button>
                  ) : wi?.status === "loading" ? (
                    <span className={styles.chipLoading}>…</span>
                  ) : null;

                return (
                  <Draggable key={item.id} draggableId={item.id} index={index}>
                    {(provided) => (
                      <li
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        {...provided.dragHandleProps}
                        onClick={() => onItemClick?.(item, index)}
                        className={`${styles.row} ${isActive ? styles.isActive : ""} ${changeInfo ? styles.rowChanged : ""} ${changeClass}`}
                        style={provided.draggableProps.style}
                      >
                        {changeInfo && <div className={styles.changeIndicator} title="Recently changed" />}
                        <div className={styles.rowContent}>
                          <div className={styles.rowLeft}>
                            <div className={`${styles.pillNumber} ${isActive ? styles.pillActive : ""}`} title="Order within day">
                              {index + 1}
                            </div>

                            <div className={styles.rowText}>
                              <div className={styles.rowTitle}>
                                {item.title || item.address || "Untitled"}
                              </div>
                              <div className={styles.notesContainer}>
                                {expandedNotes.has(item.id) ? (
                                  // Expanded notes view with inline textarea editing
                                  <div className={styles.notesExpanded}>
                                    <textarea
                                      className={styles.notesTextarea}
                                      value={editingNotes.get(item.id) ?? (item.notes || "")}
                                      onChange={(e) => {
                                        const value = e.target.value;
                                        // Validates length before updating state
                                        if (value.length <= MAX_LENGTHS.NOTES) {
                                          const newMap = new Map(editingNotes);
                                          newMap.set(item.id, value);
                                          setEditingNotes(newMap);
                                        } else {
                                          alert(`Notes cannot exceed ${MAX_LENGTHS.NOTES} characters`);
                                        }
                                      }}
                                      onClick={(e) => e.stopPropagation()}
                                      // Saves notes to Firestore when textarea loses focus
                                      onBlur={async () => {
                                        const notes = editingNotes.get(item.id) ?? (item.notes || "");
                                        if (notes !== (item.notes || "")) {
                                          await onUpdateNotes?.(item.id, notes);
                                        }
                                        // Clears editing state after saving
                                        const newMap = new Map(editingNotes);
                                        newMap.delete(item.id);
                                        setEditingNotes(newMap);
                                      }}
                                      placeholder="Add notes about what you'll be doing here..."
                                      rows={3}
                                      maxLength={MAX_LENGTHS.NOTES}
                                    />
                                    <button
                                      className={styles.notesCollapseBtn}
                                      onClick={async (e) => {
                                        e.stopPropagation();
                                        // Saves notes before collapsing
                                        const notes = editingNotes.get(item.id) ?? (item.notes || "");
                                        if (notes !== (item.notes || "")) {
                                          await onUpdateNotes?.(item.id, notes);
                                        }
                                        // Collapses notes view
                                        const newSet = new Set(expandedNotes);
                                        newSet.delete(item.id);
                                        setExpandedNotes(newSet);
                                        // Clears editing state after saving
                                        const newMap = new Map(editingNotes);
                                        newMap.delete(item.id);
                                        setEditingNotes(newMap);
                                      }}
                                      title="Collapse notes"
                                    >
                                      Collapse
                                    </button>
                                  </div>
                                ) : (
                                  // Collapsed notes view showing preview or placeholder
                                  <div
                                    className={styles.notesCollapsed}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      // Expands notes view for editing
                                      const newSet = new Set(expandedNotes);
                                      newSet.add(item.id);
                                      setExpandedNotes(newSet);
                                      // Initializes editing state with current notes value
                                      if (!editingNotes.has(item.id)) {
                                        const newMap = new Map(editingNotes);
                                        newMap.set(item.id, item.notes || "");
                                        setEditingNotes(newMap);
                                      }
                                    }}
                                  >
                                    {item.notes ? (
                                      <span className={styles.notesPreview}>
                                        {item.notes.length > 60
                                          ? `${item.notes.substring(0, 60)}...`
                                          : item.notes}
                                      </span>
                                    ) : (
                                      <span className={styles.notesPlaceholder}>
                                        Click to add notes...
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className={styles.rowActions}>
                            <div className={styles.rowActionsLeft}>
                              {chip}

                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (onCommentsClick) {
                                    onCommentsClick(item.id);
                                  } else {
                                    setCommentsOpenForItem(item.id);
                                  }
                                }}
                                className="td-btn td-btn-outline"
                                title="View/add comments"
                                style={{ fontSize: "12px", padding: "4px 8px" }}
                              >
                                Comments
                              </button>

                              <select
                                value={item.day ?? 1}
                                onChange={(e) => onMoveItemToDay?.(item, Number(e.target.value))}
                                onClick={(e) => e.stopPropagation()}
                                className="td-select td-select-sm"
                                title="Move this stop to another day"
                              >
                                {allDays.map((d) => (
                                  <option key={d} value={d}>
                                    {`Day ${d}${dayLabels?.[d] ? ` — ${dayLabels[d]}` : ""}`}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className={styles.rowActionsRight}>
                              <button
                                onClick={(e) => { e.stopPropagation(); onDeleteItem?.(item.id); }}
                                className="td-btn td-btn-danger"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        </div>
                      </li>
                    )}
                  </Draggable>
                );
              })}
              {provided.placeholder}
            </ul>
          )}
        </Droppable>
      </DragDropContext>
      
      {commentsOpenForItem && tripId && (
        <Comments
          tripId={tripId}
          itemId={commentsOpenForItem}
          onClose={() => setCommentsOpenForItem(null)}
        />
      )}
    </div>
  );
}


