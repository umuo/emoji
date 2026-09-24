"use client";

type SecondsInputProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  disabled: boolean;
  onCommit: (value: number) => void;
};

export function SecondsInput({ label, value, min, max, disabled, onCommit }: SecondsInputProps) {
  const displayedValue = Number(value.toFixed(3));

  return (
    <label className="seconds-input">
      <input
        key={value}
        type="number"
        inputMode="decimal"
        aria-label={`${label}（秒）`}
        min={min}
        max={Number(max.toFixed(3))}
        step="any"
        defaultValue={displayedValue}
        disabled={disabled}
        onBlur={(event) => {
          const entered = event.currentTarget.valueAsNumber;
          // Keep the original precision when the displayed value was not edited.
          const next = Number.isFinite(entered) && entered !== displayedValue
            ? Math.min(max, Math.max(min, entered))
            : value;
          event.currentTarget.value = String(Number(next.toFixed(3)));
          if (next !== value) onCommit(next);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          } else if (event.key === "Escape") {
            event.currentTarget.value = String(displayedValue);
            event.currentTarget.blur();
          }
        }}
      />
      <span aria-hidden="true">秒</span>
    </label>
  );
}
