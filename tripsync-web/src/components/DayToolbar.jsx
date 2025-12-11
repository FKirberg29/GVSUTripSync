/**
 * DayToolbar Component
 * 
 * Toolbar for managing trip days with day selection, day actions (add, rename, delete),
 * and navigation buttons for activity feed, chat, and members panel.
 */

export default function DayToolbar({
  selectedDay,
  allDays,
  dayLabels,
  onChangeDay,
  onAddDay,
  onRenameDay,
  onDeleteDay,
  onShowActivityFeed,
  onShowChat,
  onShowMembers,
}) {
  return (
    <div className="td-toolbar">
      <div className="td-toolbar-left">
      <label className="td-label">
        Day:&nbsp;
        <select
          value={selectedDay}
          onChange={(e) => onChangeDay?.(Number(e.target.value))}
          className="td-select"
        >
          {allDays.map((d) => (
            <option key={d} value={d}>
              {`Day ${d}${dayLabels?.[d] ? ` — ${dayLabels[d]}` : ""}`}
            </option>
          ))}
        </select>
      </label>

        <div className="td-toolbar-day-actions">
      <button className="td-btn td-btn-dashed" onClick={onAddDay} title="Create and switch to a new day">
        + Day
      </button>

      <button className="td-btn td-btn-outline" onClick={onRenameDay} title="Rename this day (stored as a label)">
        Rename Day
      </button>

      <button
        className="td-btn td-btn-danger-outline"
        onClick={onDeleteDay}
        title="Delete this day (deletes its stops and shifts later days)"
      >
        Delete Day
      </button>
        </div>
      </div>

      <div className="td-toolbar-right">
        <button className="td-btn" onClick={onShowActivityFeed} title="View activity feed">
          Activity
        </button>
        <button className="td-btn" onClick={onShowChat} title="Open trip chat">
          Chat
        </button>
        <button className="td-btn" onClick={onShowMembers} title="Manage members & send invites">
          Members
        </button>
      </div>
    </div>
  );
}

