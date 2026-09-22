// Split-screen viewport math for local co-op (1-4 players).
//
// computeRects returns WebGL viewport/scissor rects: origin bottom-left,
// y-up - the OPPOSITE of CSS/DOM's top-left, y-down convention. Every rect
// here is in that WebGL space; toCssRect() is the one place that converts to
// the top-left space HUD DOM elements need.
//
// Slot order = join order = array index, and slots map to screen quadrants
// in reading order (top-left, top-right, bottom-left, bottom-right), with 3P
// using a top-pair + full-width-bottom layout instead of a blank quadrant.
(function (global) {
  function computeRects(playerCount, w, h) {
    switch (playerCount) {
      case 0:
      case 1:
        return [{ x: 0, y: 0, w, h }];
      case 2:
        // Left/right vertical split - P1 left, P2 right.
        return [
          { x: 0, y: 0, w: w / 2, h },
          { x: w / 2, y: 0, w: w / 2, h },
        ];
      case 3:
        // Top pair side-by-side, one full-width viewport across the bottom.
        // y:h/2 is the TOP half in WebGL's y-up space.
        return [
          { x: 0, y: h / 2, w: w / 2, h: h / 2 },
          { x: w / 2, y: h / 2, w: w / 2, h: h / 2 },
          { x: 0, y: 0, w, h: h / 2 },
        ];
      default:
        // 2x2 grid.
        return [
          { x: 0, y: h / 2, w: w / 2, h: h / 2 },
          { x: w / 2, y: h / 2, w: w / 2, h: h / 2 },
          { x: 0, y: 0, w: w / 2, h: h / 2 },
          { x: w / 2, y: 0, w: w / 2, h: h / 2 },
        ];
    }
  }

  // Converts one WebGL-space rect into a CSS top-left-origin {left,top,width,height}
  // (in px), for positioning a per-player HUD DOM clone or a divider strip.
  function toCssRect(rect, canvasHeightPx) {
    return {
      left: rect.x,
      top: canvasHeightPx - rect.y - rect.h,
      width: rect.w,
      height: rect.h,
    };
  }

  global.HT = global.HT || {};
  global.HT.Viewport = { computeRects, toCssRect };
})(window);
