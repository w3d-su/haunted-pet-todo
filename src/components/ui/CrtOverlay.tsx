export function CrtOverlay() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-50">
      <div className="crt-scanlines absolute inset-0" />
      <div className="crt-vignette absolute inset-0" />
    </div>
  );
}
