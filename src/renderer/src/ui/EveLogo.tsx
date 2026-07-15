import blackMark from "../assets/eve-mark-black.png";
import whiteMark from "../assets/eve-mark-white.png";

/**
 * The Eve wordmark (the "EVE" three-bar + slash logo).
 *
 * @remarks
 * Rendered from the official mark. `variant` picks black (for light surfaces,
 * the default) or white (for dark surfaces). The mark is ~3.19:1, so set a
 * height and let width auto-size.
 */
export function EveLogo({
  className = "h-4 w-auto",
  variant = "black",
}: {
  className?: string;
  variant?: "black" | "white";
}): JSX.Element {
  return (
    <img
      src={variant === "white" ? whiteMark : blackMark}
      alt="Eve"
      draggable={false}
      className={className}
    />
  );
}
