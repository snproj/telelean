/**
 * Press, click or drag (spec v4 CM-7, A21): a press becomes a drag once the pointer has moved CLICK_SLOP px or more
 * from where it went down, and stays a drag even if it comes back. A right press released before that is a click (the
 * right-click menu); a right drag only pans, and a left drag on a card moves it.
 */

/** CM-7: "Without movement" means less than 4 px between press and release. */
export const CLICK_SLOP = 4;

export interface PressPoint {
  x: number;
  y: number;
}

/** Whether `point` is CLICK_SLOP px or more away from `start`. */
export function beyondSlop(start: PressPoint, point: PressPoint, slop = CLICK_SLOP): boolean {
  return Math.hypot(point.x - start.x, point.y - start.y) >= slop;
}

/** One press of a pointer: where it started, where it is, and whether it has become a drag. */
export class PressTracker {
  private dragged = false;
  private last: PressPoint;

  constructor(
    readonly start: PressPoint,
    private readonly slop = CLICK_SLOP,
  ) {
    this.last = start;
  }

  /** Records a move; returns the movement since the previous one (zero until the press is a drag). */
  move(point: PressPoint): { dx: number; dy: number; started: boolean } {
    if (!this.dragged) {
      if (!beyondSlop(this.start, point, this.slop)) return { dx: 0, dy: 0, started: false };
      this.dragged = true;
      // The first drag step covers everything since the press, so a pan or a move follows the pointer exactly.
      const first = { dx: point.x - this.start.x, dy: point.y - this.start.y, started: true };
      this.last = point;
      return first;
    }
    const step = { dx: point.x - this.last.x, dy: point.y - this.last.y, started: false };
    this.last = point;
    return step;
  }

  /** The press has become a drag (it moved CLICK_SLOP px or more at some point). */
  get dragging(): boolean {
    return this.dragged;
  }

  /** Movement from the press to the last recorded point. */
  get total(): { dx: number; dy: number } {
    return { dx: this.last.x - this.start.x, dy: this.last.y - this.start.y };
  }

  /** A release here is a click: the press never became a drag, and the release is within the slop. */
  isClick(release: PressPoint): boolean {
    return !this.dragged && !beyondSlop(this.start, release, this.slop);
  }
}
