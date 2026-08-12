import * as React from "react";
import { cn } from "@/lib/utils";
import { ChevronUp, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";

interface NumberInputProps extends Omit<React.ComponentProps<"input">, "type"> {
  /** Class applied to the outer wrapper (e.g. `ml-auto inline-flex`). */
  containerClassName?: string;
}

/**
 * Number input with a custom, application-styled stepper.
 *
 * Native browser spin buttons are hidden via global CSS
 * (src/app/globals.css); two custom chevron buttons sit inside the right edge
 * of the field. The underlying element keeps `type="number"`, so keyboard
 * behavior is untouched — ArrowUp/ArrowDown still step the value natively and
 * text selection/editing behaves exactly as before. Arrow clicks preserve
 * `min`/`max`/`step` and emit a standard change event through `onChange`.
 *
 * This is a controlled component: pass both `value` and `onChange` (the
 * stepper buttons emit a change event carrying `e.target.value` as a string).
 */
const NumberInput = React.forwardRef<HTMLInputElement, NumberInputProps>(
  function NumberInput(
    { className, containerClassName, value, onChange, min, max, step, ...props },
    ref
  ) {
    const minNum =
      min !== undefined && Number.isFinite(Number(min)) ? Number(min) : undefined;
    const maxNum =
      max !== undefined && Number.isFinite(Number(max)) ? Number(max) : undefined;
    const stepNum =
      step === "any" || !Number.isFinite(Number(step)) || Number(step) <= 0
        ? 1
        : Number(step);

    const clamp = (n: number) => {
      let next = n;
      if (minNum !== undefined) next = Math.max(minNum, next);
      if (maxNum !== undefined) next = Math.min(maxNum, next);
      return Math.round(next * 1e6) / 1e6;
    };

    const emitChange = (next: number) => {
      const stringValue = String(next);
      if (onChange) {
        // Standard change-event contract: consumers read `e.target.value`,
        // so a minimal event shape keeps every existing onChange working.
        onChange({
          target: { value: stringValue },
          currentTarget: { value: stringValue },
        } as unknown as React.ChangeEvent<HTMLInputElement>);
      }
    };

    const stepBy = (direction: 1 | -1) => {
      const raw = String(value ?? "");
      const parsed = Number(raw.trim() === "" ? NaN : raw);
      const base = Number.isFinite(parsed) ? parsed : (minNum ?? 0);
      emitChange(clamp(base + direction * stepNum));
    };

    const isDisabled = props.disabled || props.readOnly;

    return (
      <div className={cn("relative flex", containerClassName)}>
        <Input
          ref={ref}
          type="number"
          value={value}
          onChange={onChange}
          min={min}
          max={max}
          step={step}
          className={cn("pr-7", className)}
          {...props}
        />
        {/* Custom stepper strip — inset 1px so the input's border stays intact.
            Buttons are pointer-only (tabIndex -1); keyboard users keep the
            input's native ArrowUp/ArrowDown stepping. */}
        <div className="absolute inset-y-px right-px flex w-6 flex-col divide-y divide-border/70 border-l border-border/70">
          {([
            { direction: 1 as const, label: "Increase value", Icon: ChevronUp },
            { direction: -1 as const, label: "Decrease value", Icon: ChevronDown },
          ]).map(({ direction, label, Icon }) => (
            <button
              key={label}
              type="button"
              tabIndex={-1}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => stepBy(direction)}
              disabled={isDisabled}
              aria-label={label}
              className="flex w-full flex-1 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
            >
              <Icon className="size-3" />
            </button>
          ))}
        </div>
      </div>
    );
  }
);

export { NumberInput };
