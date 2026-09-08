/**
 * The hero artwork, composed entirely in CSS (see the hero-* classes in
 * globals.css): a graded dusk sky, two minted discs settling into a lit
 * violet field, scattered blossom highlights and a fine grain pass.
 *
 * Layer order matters here — the far bank sits behind the discs and the
 * near bank is drawn over their lower edge, so the blooms genuinely
 * overlap the metal instead of the discs floating on top of a flat wash.
 *
 * Purely decorative: it carries no information, so it is hidden from
 * assistive technology and sits behind the hero copy.
 */
export function HeroVisual() {
  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden">
      <div className="hero-sky absolute inset-0" />
      <div className="hero-field-back absolute inset-x-0 bottom-0 h-[72%]" />
      <div className="hero-blossoms-far absolute inset-x-0 bottom-0 h-[48%]" />

      <div className="absolute bottom-[12%] left-[-4%] h-20 w-28 -rotate-[16deg] sm:bottom-[19%] sm:left-[6%] sm:h-32 sm:w-48 lg:h-40 lg:w-60">
        <div className="hero-coin-edge absolute inset-0 translate-y-[7px]" />
        <div className="hero-coin absolute inset-0">
          <div className="hero-coin-face absolute inset-x-[9%] inset-y-[13%]" />
        </div>
      </div>
      <div className="absolute bottom-[16%] right-[-5%] h-16 w-24 rotate-[11deg] sm:bottom-[23%] sm:right-[5%] sm:h-28 sm:w-40 lg:h-32 lg:w-48">
        <div className="hero-coin-edge absolute inset-0 translate-y-[6px]" />
        <div className="hero-coin hero-coin-dark absolute inset-0">
          <div className="hero-coin-face absolute inset-x-[9%] inset-y-[13%]" />
        </div>
      </div>

      <div className="hero-field-front absolute inset-x-0 bottom-0 h-[40%]" />
      <div className="hero-blossoms-near absolute inset-x-0 bottom-0 h-[30%]" />
      <div className="hero-understory absolute inset-x-0 bottom-0 h-[22%]" />
      <div className="hero-grain pointer-events-none absolute inset-0 opacity-[0.12] mix-blend-overlay" />
    </div>
  );
}
