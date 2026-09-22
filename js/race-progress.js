// Shared lap/checkpoint/finish advancement - the single rulebook both
// js/ai.js (AI racers) and js/main.js (human players, one entry per joined
// co-op player) advance their own racer objects through each frame, so the
// two never carry separately-maintained copies of the same rule that could
// silently drift apart.
//
// entry needs exactly: { finished, nextCheckpointIdx, lap }. track needs
// { checkpoints, loop, totalLaps }. callbacks (all optional) fire on the
// specific transition that happened this call: onCheckpoint (passed a
// non-final gate), onLap (completed a lap with more left to go), onFinish
// (crossed the finish line / completed the last lap - entry.finished is
// already true by the time this fires).
(function (global) {
  function advanceCheckpointProgress(entry, track, nearestT, callbacks) {
    if (entry.finished) return;
    const cps = track.checkpoints;
    const cp = cps[entry.nextCheckpointIdx];
    let d = Math.abs(nearestT - cp.t);
    if (track.loop) d = Math.min(d, 1 - d);
    if (d >= 0.015) return;

    if (track.loop) {
      if (entry.nextCheckpointIdx === 0) {
        entry.lap += 1;
        if (entry.lap > track.totalLaps) {
          entry.finished = true;
          if (callbacks && callbacks.onFinish) callbacks.onFinish(entry);
        } else if (callbacks && callbacks.onLap) callbacks.onLap(entry);
      } else if (callbacks && callbacks.onCheckpoint) callbacks.onCheckpoint(entry);
      entry.nextCheckpointIdx = (entry.nextCheckpointIdx + 1) % cps.length;
    } else if (entry.nextCheckpointIdx === cps.length - 1) {
      entry.finished = true;
      if (callbacks && callbacks.onFinish) callbacks.onFinish(entry);
    } else {
      if (callbacks && callbacks.onCheckpoint) callbacks.onCheckpoint(entry);
      entry.nextCheckpointIdx += 1;
    }
  }

  global.HT = global.HT || {};
  global.HT.RaceProgress = { advanceCheckpointProgress };
})(window);
