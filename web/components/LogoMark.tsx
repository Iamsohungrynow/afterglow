/**
 * The Afterglow mark: a half sun resting on the horizon, crowned by a tapering crescent of the
 * light that lingers after the close. Drawn on a 64 grid and cropped to its bounds (52 x 28), so
 * `size` is the rendered width and the height follows. Below 24px it switches to a heavier
 * optical cut so the strokes survive. Colour comes from `currentColor` (amber by default).
 */
export function LogoMark({
  size = 32,
  className = "text-glow",
  title,
}: {
  size?: number;
  className?: string;
  title?: string;
}) {
  const small = size < 24;
  return (
    <svg
      viewBox="6 20 52 29"
      width={size}
      height={(size * 29) / 52}
      fill="currentColor"
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      {small ? (
        <>
          <path d="M10 42A22 22 0 0 1 54 42A23.36 23.36 0 0 0 10 42Z" />
          <path d="M21 42A11 11 0 0 1 43 42Z" />
          <rect x="8" y="45" width="48" height="4" />
        </>
      ) : (
        <>
          <path d="M10 42A22 22 0 0 1 54 42A22.74 22.74 0 0 0 10 42Z" />
          <path d="M21.5 42A10.5 10.5 0 0 1 42.5 42Z" />
          <rect x="6" y="45" width="52" height="3" />
        </>
      )}
    </svg>
  );
}
