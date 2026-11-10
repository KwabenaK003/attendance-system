import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ChangeEventHandler } from "react";
import { createPortal } from "react-dom";
import { addDays, addMonths, endOfMonth, endOfWeek, format, isAfter, isBefore, isSameDay, isSameMonth, isToday, isValid, parseISO, startOfMonth, startOfWeek } from "date-fns";
import { Calendar, ChevronLeft, ChevronRight } from "./solar";

type Props = {
  value: string;
  onChange: ChangeEventHandler<HTMLInputElement>;
  className?: string;
  id?: string;
  "aria-label"?: string;
  disabled?: boolean;
  min?: string;
  max?: string;
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function CustomDatePicker({ value, onChange, className = "input", id, "aria-label": ariaLabel, disabled, min, max }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const selectedDate = value ? parseISO(value) : null;
  const validSelectedDate = selectedDate && isValid(selectedDate) ? selectedDate : null;
  const [visibleMonth, setVisibleMonth] = useState(startOfMonth(validSelectedDate || new Date()));
  const [activeDate, setActiveDate] = useState(validSelectedDate || new Date());
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const days = useMemo(() => {
    const first = startOfWeek(startOfMonth(visibleMonth), { weekStartsOn: 1 });
    const last = endOfWeek(endOfMonth(visibleMonth), { weekStartsOn: 1 });
    return Array.from({ length: Math.round((last.getTime() - first.getTime()) / 86400000) + 1 }, (_, index) => addDays(first, index));
  }, [visibleMonth]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node) && !popup.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
        return;
      }
      const steps: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
      if (steps[event.key]) {
        event.preventDefault();
        const nextDate = addDays(activeDate, steps[event.key]);
        setActiveDate(nextDate);
        if (!isSameMonth(nextDate, visibleMonth)) setVisibleMonth(startOfMonth(nextDate));
        requestAnimationFrame(() => popup.current?.querySelector<HTMLButtonElement>(`[data-day="${format(nextDate, "yyyy-MM-dd")}"]`)?.focus());
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, activeDate, visibleMonth]);

  function openPicker() {
    if (disabled || !trigger.current) return;
    const rect = trigger.current.getBoundingClientRect();
    const width = 288;
    const height = 340;
    const above = window.innerHeight - rect.bottom < height + 12;
    setPosition({
      top: above ? Math.max(8, rect.top - height - 4) : Math.min(window.innerHeight - height - 8, rect.bottom + 4),
      left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
    });
    const date = validSelectedDate || new Date();
    setVisibleMonth(startOfMonth(date));
    setActiveDate(date);
    setOpen(true);
  }

  function selectDate(date: Date) {
    const nextValue = format(date, "yyyy-MM-dd");
    const event = { target: { value: nextValue }, currentTarget: { value: nextValue } } as ChangeEvent<HTMLInputElement>;
    onChange(event);
    setOpen(false);
    trigger.current?.focus();
  }

  function moveFocus(date: Date) {
    setActiveDate(date);
    if (!isSameMonth(date, visibleMonth)) setVisibleMonth(startOfMonth(date));
    requestAnimationFrame(() => popup.current?.querySelector<HTMLButtonElement>(`[data-day="${format(date, "yyyy-MM-dd")}"]`)?.focus());
  }

  function changeMonth(offset: number) {
    const nextMonth = startOfMonth(addMonths(visibleMonth, offset));
    setVisibleMonth(nextMonth);
    setActiveDate(nextMonth);
  }

  return (
    <div ref={root} className="relative">
      <button
        ref={trigger}
        id={id}
        type="button"
        className={`input date-picker-trigger ${className}`}
        aria-label={ariaLabel || "Choose date"}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => open ? setOpen(false) : openPicker()}
      >
        <span>{validSelectedDate ? format(validSelectedDate, "MMM d, yyyy") : "Select date"}</span>
        <Calendar className="h-4 w-4 shrink-0 text-ink-muted" />
      </button>
      {open && createPortal(
        <div ref={popup} role="dialog" aria-label="Choose a date" className="date-picker-popup" style={position}>
          <div className="mb-2 flex items-center justify-between">
            <button type="button" className="flex h-8 w-8 items-center justify-center rounded-md text-ink-muted hover:bg-page-bg" aria-label="Previous month" onClick={() => changeMonth(-1)}><ChevronLeft className="h-4 w-4" /></button>
            <h2 className="text-sm font-semibold text-ink">{format(visibleMonth, "MMMM yyyy")}</h2>
            <button type="button" className="flex h-8 w-8 items-center justify-center rounded-md text-ink-muted hover:bg-page-bg" aria-label="Next month" onClick={() => changeMonth(1)}><ChevronRight className="h-4 w-4" /></button>
          </div>
          <table className="date-picker-grid" role="grid">
            <thead><tr>{WEEKDAYS.map((day) => <th key={day} scope="col" abbr={day}>{day.slice(0, 1)}</th>)}</tr></thead>
            <tbody>
              {Array.from({ length: Math.ceil(days.length / 7) }, (_, row) => (
                <tr key={row} role="row">
                  {days.slice(row * 7, row * 7 + 7).map((day) => {
                    const beforeMin = min ? isBefore(day, parseISO(min)) : false;
                    const afterMax = max ? isAfter(day, parseISO(max)) : false;
                    return (
                      <td key={day.toISOString()} role="gridcell">
                        <button
                          type="button"
                          data-day={format(day, "yyyy-MM-dd")}
                          data-selected={Boolean(validSelectedDate && isSameDay(day, validSelectedDate))}
                          data-outside={!isSameMonth(day, visibleMonth)}
                          aria-label={format(day, "EEEE, MMMM d, yyyy")}
                          aria-current={isToday(day) ? "date" : undefined}
                          aria-pressed={Boolean(validSelectedDate && isSameDay(day, validSelectedDate))}
                          tabIndex={isSameDay(day, activeDate) ? 0 : -1}
                          disabled={beforeMin || afterMax}
                          className="date-picker-day"
                          onFocus={() => setActiveDate(day)}
                          onClick={() => selectDate(day)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectDate(day); }
                            if (event.key === "Home") { event.preventDefault(); moveFocus(addDays(day, -((day.getDay() + 6) % 7))); }
                            if (event.key === "End") { event.preventDefault(); moveFocus(addDays(day, 6 - ((day.getDay() + 6) % 7))); }
                          }}
                        >{format(day, "d")}</button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
        document.body,
      )}
    </div>
  );
}
