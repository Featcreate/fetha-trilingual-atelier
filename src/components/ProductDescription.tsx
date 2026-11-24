import { useEffect, useRef, useState } from "react";

export function ProductDescription({
  text,
  moreLabel,
  lessLabel,
  className = "mt-2",
  textClassName = "text-sm leading-6 text-muted-foreground",
}: {
  text: string;
  moreLabel: string;
  lessLabel: string;
  className?: string;
  textClassName?: string;
}) {
  const descriptionRef = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [canExpand, setCanExpand] = useState(false);

  useEffect(() => {
    const element = descriptionRef.current;
    if (!element) return;

    const measure = () => {
      const previous = {
        display: element.style.display,
        webkitLineClamp: element.style.webkitLineClamp,
        webkitBoxOrient: element.style.webkitBoxOrient,
        overflow: element.style.overflow,
      };

      element.style.display = "block";
      element.style.webkitLineClamp = "unset";
      element.style.webkitBoxOrient = "initial";
      element.style.overflow = "visible";

      const fullHeight = element.scrollHeight;
      const lineHeight = Number.parseFloat(window.getComputedStyle(element).lineHeight);
      const twoLineHeight = Number.isFinite(lineHeight) ? lineHeight * 2 : 48;

      element.style.display = previous.display;
      element.style.webkitLineClamp = previous.webkitLineClamp;
      element.style.webkitBoxOrient = previous.webkitBoxOrient;
      element.style.overflow = previous.overflow;

      setCanExpand(fullHeight > twoLineHeight + 1);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [text, expanded]);

  return (
    <div className={className}>
      <p
        ref={descriptionRef}
        className={textClassName}
        style={
          expanded
            ? { whiteSpace: "pre-wrap" }
            : {
                display: "-webkit-box",
                WebkitBoxOrient: "vertical",
                WebkitLineClamp: 2,
                overflow: "hidden",
              }
        }
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
