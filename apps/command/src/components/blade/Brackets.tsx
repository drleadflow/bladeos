export function Brackets({ color = "#DC2626" }: { color?: string }) {
  const c = color;
  return (
    <>
      {/* corner brackets with tiny dots */}
      {[
        { top: 4, left: 4, b: ["top", "left"] },
        { top: 4, right: 4, b: ["top", "right"] },
        { bottom: 4, left: 4, b: ["bottom", "left"] },
        { bottom: 4, right: 4, b: ["bottom", "right"] },
      ].map((p, i) => (
        <span
          key={i}
          className="pointer-events-none absolute h-3 w-3"
          style={{
            top: p.top,
            left: p.left,
            right: p.right,
            bottom: p.bottom,
            borderTop: p.b.includes("top") ? `1px solid ${c}` : undefined,
            borderBottom: p.b.includes("bottom") ? `1px solid ${c}` : undefined,
            borderLeft: p.b.includes("left") ? `1px solid ${c}` : undefined,
            borderRight: p.b.includes("right") ? `1px solid ${c}` : undefined,
            opacity: 0.85,
          }}
        >
          <span
            className="absolute h-[3px] w-[3px] rounded-full"
            style={{
              background: c,
              boxShadow: `0 0 6px ${c}`,
              top: p.b.includes("top") ? -1.5 : "auto",
              bottom: p.b.includes("bottom") ? -1.5 : "auto",
              left: p.b.includes("left") ? -1.5 : "auto",
              right: p.b.includes("right") ? -1.5 : "auto",
            }}
          />
        </span>
      ))}
    </>
  );
}
