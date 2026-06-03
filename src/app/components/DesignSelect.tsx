import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

export interface DesignSelectOption<T extends string | number> {
  value: T;
  label: string;
  disabled?: boolean;
}

interface DesignSelectProps<T extends string | number> {
  value: T;
  options: DesignSelectOption<T>[];
  onChange: (value: T) => void;
  placeholder?: string;
  disabled?: boolean;
  compact?: boolean;
  mono?: boolean;
  fullWidth?: boolean;
  minWidth?: number;
  height?: number;
}

interface MenuPosition {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
}

export function DesignSelect<T extends string | number>({
  value,
  options,
  onChange,
  placeholder,
  disabled = false,
  compact = false,
  mono = false,
  fullWidth = false,
  minWidth,
  height,
}: DesignSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const selectedOption = useMemo(
    () => options.find(option => option.value === value),
    [options, value],
  );

  const updatePosition = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const gutter = 8;
    const menuPadding = 8;
    const optionHeight = compact ? 30 : 34;
    const naturalHeight = options.length * optionHeight + menuPadding;
    const availableBelow = Math.max(0, window.innerHeight - rect.bottom - gutter);
    const availableAbove = Math.max(0, rect.top - gutter);
    const openDown = availableBelow >= Math.min(naturalHeight, 180) || availableBelow >= availableAbove;
    const availableSpace = openDown ? availableBelow : availableAbove;
    const maxHeight = Math.min(naturalHeight, availableSpace, Math.max(0, window.innerHeight - gutter * 2));
    const width = Math.min(rect.width, Math.max(0, window.innerWidth - gutter * 2));
    const left = Math.min(
      Math.max(gutter, rect.left),
      Math.max(gutter, window.innerWidth - gutter - width),
    );

    setMenuPosition({
      top: openDown ? rect.bottom : Math.max(gutter, rect.top - maxHeight),
      left,
      width,
      maxHeight,
    });
  };

  useLayoutEffect(() => {
    if (open) updatePosition();
  }, [open, options.length]);

  useEffect(() => {
    if (!open) return;

    const closeOnOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const controlHeight = height ?? (compact ? 34 : 39);
  const borderRadius = compact ? 14 : 20;
  const fontSize = compact ? 12 : 13;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(isOpen => !isOpen)}
        onKeyDown={event => {
          if ((event.key === "Enter" || event.key === " ") && !disabled) {
            event.preventDefault();
            setOpen(isOpen => !isOpen);
          }
        }}
        className="flex items-center justify-between gap-3 border outline-none transition-all"
        style={{
          width: fullWidth ? "100%" : undefined,
          minWidth,
          height: controlHeight,
          padding: compact ? "0 10px 0 12px" : "0 14px 0 16px",
          borderRadius,
          backgroundColor: "var(--input-background)",
          borderColor: open ? "var(--primary)" : "var(--border)",
          color: selectedOption ? "var(--foreground)" : "var(--muted-foreground)",
          fontFamily: mono ? "var(--font-mono, 'JetBrains Mono', monospace)" : "inherit",
          fontSize,
          opacity: disabled ? 0.55 : 1,
          boxShadow: open
            ? "0 0 0 3px rgba(59,130,246,0.14), inset 0 1px 0 rgba(255,255,255,0.04)"
            : "inset 0 1px 0 rgba(255,255,255,0.04)",
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="min-w-0 truncate">{selectedOption?.label ?? placeholder ?? ""}</span>
        <ChevronDown
          size={compact ? 14 : 16}
          className="flex-shrink-0 transition-transform"
          style={{
            color: "var(--muted-foreground)",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
          }}
        />
      </button>

      {open && menuPosition && createPortal(
        <div
          ref={menuRef}
          role="listbox"
          className="fixed z-[100] overflow-y-auto border p-1"
          style={{
            top: menuPosition.top,
            left: menuPosition.left,
            width: menuPosition.width,
            maxHeight: menuPosition.maxHeight,
            borderRadius: compact ? 14 : 18,
            backgroundColor: "var(--popover)",
            borderColor: "var(--border)",
            color: "var(--popover-foreground)",
            boxShadow: "0 18px 44px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.04)",
          }}
        >
          {options.map(option => {
            const isSelected = option.value === value;
            return (
              <button
                key={String(option.value)}
                type="button"
                disabled={option.disabled}
                role="option"
                aria-selected={isSelected}
                className="flex w-full items-center justify-between gap-2 transition-colors"
                style={{
                  minHeight: compact ? 30 : 34,
                  padding: compact ? "0 8px" : "0 10px",
                  borderRadius: compact ? 10 : 12,
                  backgroundColor: isSelected ? "var(--accent)" : "transparent",
                  color: isSelected ? "var(--primary)" : "var(--foreground)",
                  fontFamily: mono ? "var(--font-mono, 'JetBrains Mono', monospace)" : "inherit",
                  fontSize,
                  opacity: option.disabled ? 0.5 : 1,
                }}
                onMouseEnter={event => {
                  if (!isSelected && !option.disabled) {
                    event.currentTarget.style.backgroundColor = "var(--muted)";
                  }
                }}
                onMouseLeave={event => {
                  event.currentTarget.style.backgroundColor = isSelected ? "var(--accent)" : "transparent";
                }}
                onClick={() => {
                  if (option.disabled) return;
                  onChange(option.value);
                  setOpen(false);
                  triggerRef.current?.focus();
                }}
              >
                <span className="min-w-0 truncate text-left">{option.label}</span>
                {isSelected && <Check size={compact ? 13 : 14} className="flex-shrink-0" />}
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </>
  );
}
