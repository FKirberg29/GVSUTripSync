/**
 * Calendar Component
 * 
 * Date picker calendar component that displays a month view with selectable dates.
 * Supports minimum and maximum date constraints and displays the selected date.
 */

import React, { useState } from "react";
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, format, isSameMonth, isSameDay, addMonths, subMonths, isToday } from "date-fns";
import "./Calendar.css";

/**
 * Renders a calendar date picker
 * @param {string|null} value - Selected date in "yyyy-MM-dd" format
 * @param {Function} onChange - Callback function called when a date is selected, receives date string
 * @param {string} label - Optional label to display above the calendar
 * @param {Date|string} minDate - Optional minimum selectable date
 * @param {Date|string} maxDate - Optional maximum selectable date
 */
export default function Calendar({ value, onChange, label, minDate, maxDate }) {
  const [currentMonth, setCurrentMonth] = useState(value ? new Date(value) : new Date());

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const handleDateClick = (day) => {
    // Check if date is within allowed range
    if (minDate) {
      const minDateObj = minDate instanceof Date ? minDate : new Date(minDate);
      const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate());
      const minDateStart = new Date(minDateObj.getFullYear(), minDateObj.getMonth(), minDateObj.getDate());
      if (dayStart < minDateStart) return;
    }
    if (maxDate) {
      const maxDateObj = maxDate instanceof Date ? maxDate : new Date(maxDate);
      const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate());
      const maxDateStart = new Date(maxDateObj.getFullYear(), maxDateObj.getMonth(), maxDateObj.getDate());
      if (dayStart > maxDateStart) return;
    }
    
    onChange(format(day, "yyyy-MM-dd"));
  };

  const handlePrevMonth = () => {
    setCurrentMonth(subMonths(currentMonth, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth(addMonths(currentMonth, 1));
  };

  const selectedDate = value ? new Date(value) : null;

  return (
    <div className="calendar-container">
      {label && <div className="calendar-label">{label}</div>}
      <div className="calendar">
        <div className="calendar-header">
          <button 
            type="button"
            className="calendar-nav-btn" 
            onClick={handlePrevMonth}
            aria-label="Previous month"
          >
            ‹
          </button>
          <div className="calendar-month-year">
            {format(currentMonth, "MMMM yyyy")}
          </div>
          <button 
            type="button"
            className="calendar-nav-btn" 
            onClick={handleNextMonth}
            aria-label="Next month"
          >
            ›
          </button>
        </div>
        
        <div className="calendar-weekdays">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
            <div key={day} className="calendar-weekday">
              {day}
            </div>
          ))}
        </div>
        
        <div className="calendar-days">
          {days.map((day, idx) => {
            const isCurrentMonth = isSameMonth(day, currentMonth);
            const isSelected = selectedDate && isSameDay(day, selectedDate);
            const isTodayDate = isToday(day);
            
            // Check if date is disabled
            let isDisabled = false;
            if (minDate) {
              const minDateObj = minDate instanceof Date ? minDate : new Date(minDate);
              const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate());
              const minDateStart = new Date(minDateObj.getFullYear(), minDateObj.getMonth(), minDateObj.getDate());
              if (dayStart < minDateStart) isDisabled = true;
            }
            if (maxDate) {
              const maxDateObj = maxDate instanceof Date ? maxDate : new Date(maxDate);
              const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate());
              const maxDateStart = new Date(maxDateObj.getFullYear(), maxDateObj.getMonth(), maxDateObj.getDate());
              if (dayStart > maxDateStart) isDisabled = true;
            }
            
            return (
              <button
                key={idx}
                type="button"
                className={`calendar-day ${!isCurrentMonth ? "calendar-day-other-month" : ""} ${isSelected ? "calendar-day-selected" : ""} ${isTodayDate ? "calendar-day-today" : ""} ${isDisabled ? "calendar-day-disabled" : ""}`}
                onClick={() => handleDateClick(day)}
                disabled={isDisabled}
              >
                {format(day, "d")}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

