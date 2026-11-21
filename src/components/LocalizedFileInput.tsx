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
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        className="rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold hover:border-coral disabled:opacity-50"
      >
        {buttonLabel}
      </button>
      <span className="min-w-0 break-all text-xs text-muted-foreground" aria-live="polite">
        {selectedNames.length ? selectedNames.join(", ") : emptyLabel}
      </span>
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
        className="sr-only"
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
    </div>
  );
}
