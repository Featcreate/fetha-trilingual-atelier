import { useEffect, useRef, useState } from "react";

export function ProductDescription({
  text,
  moreLabel,
  lessLabel,
}: {
  text: string;
  moreLabel: string;
  lessLabel: string;
}) {
  const descriptionRef = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [canExpand, setCanExpand] = useState(false);

  useEffect(() => {
    const element = descriptionRef.current;
    if (!element) return;

    const measure = () => {
      const wasClamped = element.classList.contains("line-clamp-2");
      if (wasClamped) element.classList.remove("line-clamp-2");
      const fullHeight = element.scrollHeight;
      if (wasClamped) element.classList.add("line-clamp-2");

      const lineHeight = Number.parseFloat(window.getComputedStyle(element).lineHeight);
      const twoLineHeight = Number.isFinite(lineHeight) ? lineHeight * 2 : 40;
      setCanExpand(fullHeight > twoLineHeight + 1);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [text]);

  return (
    <div className="mt-2">
      <p
        ref={descriptionRef}
        className={`text-sm text-muted-foreground ${expanded ? "whitespace-pre-wrap" : "line-clamp-2"}`}
      >
        {text}
      </p>
      {canExpand && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((current) => !current)}
          className="mt-1 text-xs font-semibold text-coral hover:underline"
        >
          {expanded ? lessLabel : moreLabel}
        </button>
      )}
    </div>
  );
}
