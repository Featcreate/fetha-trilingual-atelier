import { useEffect, useRef, useState, type ChangeEventHandler } from "react";

type LocalizedFileInputProps = {
  id: string;
  name?: string;
  accept?: string;
  multiple?: boolean;
  required?: boolean;
  disabled?: boolean;
  buttonLabel: string;
  emptyLabel: string;
  clearAfterChange?: boolean;
  onChange?: ChangeEventHandler<HTMLInputElement>;
};

export function LocalizedFileInput({
  id,
  name,
  accept,
  multiple = false,
  required = false,
  disabled = false,
  buttonLabel,
  emptyLabel,
  clearAfterChange = false,
  onChange,
}: LocalizedFileInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedNames, setSelectedNames] = useState<string[]>([]);

  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form) return;
    const reset = () => setSelectedNames([]);
    form.addEventListener("reset", reset);
    return () => form.removeEventListener("reset", reset);
  }, []);

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <label
        htmlFor={id}
        className="relative inline-flex cursor-pointer items-center rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold hover:border-coral focus-within:outline-none focus-within:ring-2 focus-within:ring-coral"
      >
        {buttonLabel}
        <input
          ref={inputRef}
          id={id}
          name={name}
          type="file"
          accept={accept}
          multiple={multiple}
          required={required}
          disabled={disabled}
          aria-label={buttonLabel}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
          onChange={(event) => {
            const files = Array.from(event.currentTarget.files ?? []);
            setSelectedNames(files.map((file) => file.name));
            onChange?.(event);
            if (clearAfterChange) {
              event.currentTarget.value = "";
              setSelectedNames([]);
            }
          }}
        />
      </label>
      <span className="min-w-0 break-all text-xs text-muted-foreground" aria-live="polite">
        {selectedNames.length ? selectedNames.join(", ") : emptyLabel}
      </span>
    </div>
  );
}
