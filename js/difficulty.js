// AI difficulty catalog for Race mode. Each entry tunes how the AI racer in
// ai.js drives - speedMult scales its boat's top speed/accel (via the same
// mult.speed the boat catalog uses), turnGain controls how sharply it
// corrects toward its steering target, curveCaution controls how hard it
// brakes for upcoming bends, and boostThreshold is the minimum boost fuel it
// requires before using boost (lower = boosts more often).
(function (global) {

  const DIFFICULTIES = [
    {
      id: 'easy',
      name: 'Easy',
      description: 'A relaxed rival that leaves room for mistakes.',
      speedMult: 0.85,
      turnGain: 1.8,
      curveCaution: 0.8,
      boostThreshold: 55,
    },
    {
      id: 'medium',
      name: 'Medium',
      description: 'A steady, competitive rival.',
      speedMult: 1.1,
      turnGain: 2.4,
      curveCaution: 0.6,
      boostThreshold: 35,
    },
    {
      id: 'hard',
      name: 'Hard',
      description: 'An aggressive rival that rarely lets off the throttle - and isn\'t above a raw engine advantage to stay ahead.',
      // Deliberately not "fair": this is well beyond what any boat's own
      // mult.speed range (0.8-1.12) could reach on its own, so a Hard AI is
      // a real threat no matter which boat it's assigned or which boat the
      // player picked - see createRacers() in ai.js, which multiplies this
      // straight into the AI's own boat.mult.speed.
      speedMult: 1.45,
      turnGain: 3.0,
      curveCaution: 0.4,
      boostThreshold: 15,
    },
  ];

  function getById(id) {
    return DIFFICULTIES.find((d) => d.id === id) || DIFFICULTIES[1];
  }

  global.HT = global.HT || {};
  global.HT.Difficulty = { list: DIFFICULTIES, getById };
})(window);
