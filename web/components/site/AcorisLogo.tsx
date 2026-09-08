import Image from "next/image";

/**
 * The Acoris mascot mark. Decorative by default (`alt=""`) because every
 * placement sits beside the "Acoris" wordmark, which already carries the
 * name for assistive technology — a duplicate label there is noise.
 */
export function AcorisLogo({
  className = "h-7 w-7",
  priority = false,
}: {
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src="/acoris-logo.png"
      alt=""
      width={512}
      height={512}
      priority={priority}
      className={className}
    />
  );
}
