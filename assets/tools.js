/*
 * Tool interactivity.
 *
 * Every tool page already contains a complete, correct result in HTML before
 * this file loads — a worked example with real numbers, rendered by the build.
 * This script only recalculates when someone changes an input. With JavaScript
 * off (or on a crawler that does not run it), the page still answers.
 *
 * The maths below is a deliberate second implementation of apps/site/lib. A
 * test (test/client-parity.test.ts) asserts the two agree on the reference
 * values, so a change to one that is not made to the other fails the build
 * rather than shipping a page whose printed example contradicts its widget.
 */
(function () {
  'use strict';

  var KM_PER_MILE = 1.609344;
  var DISTANCES = {
    '5k': 5,
    '10k': 10,
    'half-marathon': 21.0975,
    marathon: 42.195,
  };
  var LABELS = {
    '5k': '5K',
    '10k': '10K',
    'half-marathon': 'half marathon',
    marathon: 'marathon',
  };

  function pad(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function formatDuration(totalSeconds) {
    var s = Math.round(totalSeconds);
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    var sec = s % 60;
    return h > 0 ? h + ':' + pad(m) + ':' + pad(sec) : m + ':' + pad(sec);
  }

  function parseDuration(text) {
    var parts = String(text)
      .trim()
      .split(/[:.\s-]+/)
      .map(Number);
    if (
      !parts.length ||
      parts.some(function (n) {
        return !isFinite(n);
      })
    )
      return null;
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 1) return parts[0] * 60;
    return null;
  }

  function formatPace(secondsPerKm) {
    return (
      formatDuration(secondsPerKm) + '/km (' + formatDuration(secondsPerKm * KM_PER_MILE) + '/mi)'
    );
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function table(headers, rows, caption) {
    var wrap = el('div', 'table-scroll');
    var t = el('table');
    if (caption) t.appendChild(el('caption', null, caption));
    var thead = el('thead');
    var hr = el('tr');
    headers.forEach(function (h) {
      var th = el('th', null, h);
      th.setAttribute('scope', 'col');
      hr.appendChild(th);
    });
    thead.appendChild(hr);
    t.appendChild(thead);
    var tbody = el('tbody');
    rows.forEach(function (row) {
      var tr = el('tr');
      row.forEach(function (cell) {
        tr.appendChild(el('td', null, cell));
      });
      tbody.appendChild(tr);
    });
    t.appendChild(tbody);
    wrap.appendChild(t);
    return wrap;
  }

  /* ————— pace calculator ————— */

  function paceCalculator(root) {
    var result = root.querySelector('[data-result]');
    var distanceInput = root.querySelector('[name=distance]');
    var timeInput = root.querySelector('[name=time]');

    function update() {
      var km = DISTANCES[distanceInput.value];
      var seconds = parseDuration(timeInput.value);
      if (!km || seconds === null || seconds <= 0) return;
      var perKm = seconds / km;

      result.innerHTML = '';
      result.appendChild(
        el(
          'p',
          'headline',
          formatDuration(seconds) +
            ' for the ' +
            LABELS[distanceInput.value] +
            ' is ' +
            formatPace(perKm) +
            '.',
        ),
      );

      var rows = [];
      var whole = Math.floor(km);
      for (var n = 1; n <= whole; n += 1) {
        rows.push([String(n) + ' km', formatDuration(perKm), formatDuration(perKm * n)]);
      }
      if (km - whole > 0.01) {
        rows.push([
          km.toFixed(3) + ' km',
          formatDuration(perKm * (km - whole)),
          formatDuration(seconds),
        ]);
      }
      result.appendChild(table(['Split', 'Pace', 'Elapsed'], rows, 'Even splits, per kilometre.'));

      var halfway = seconds / 2;
      var negativeFirst = halfway * 1.02;
      result.appendChild(
        el(
          'p',
          null,
          'Halfway on even pace: ' +
            formatDuration(halfway) +
            '. On a 2% negative split, go through halfway at ' +
            formatDuration(negativeFirst) +
            ' and run the second half in ' +
            formatDuration(seconds - negativeFirst) +
            '.',
        ),
      );
    }

    root.addEventListener('input', update);
    root.addEventListener('change', update);
  }

  /* ————— race predictor ————— */

  function riegel(t1, d1, d2, exponent) {
    return t1 * Math.pow(d2 / d1, exponent);
  }

  function vo2AtVelocity(v) {
    return -4.6 + 0.182258 * v + 0.000104 * v * v;
  }

  function fractionOfVo2max(minutes) {
    return (
      0.8 + 0.1894393 * Math.exp(-0.012778 * minutes) + 0.2989558 * Math.exp(-0.1932605 * minutes)
    );
  }

  function vdotFromRace(metres, seconds) {
    var minutes = seconds / 60;
    return vo2AtVelocity(metres / minutes) / fractionOfVo2max(minutes);
  }

  function timeForVdot(vdot, metres) {
    var low = 60;
    var high = 36000;
    for (var i = 0; i < 200; i += 1) {
      var mid = (low + high) / 2;
      var value = vdotFromRace(metres, mid);
      if (Math.abs(value - vdot) < 0.01) return mid;
      if (value > vdot) low = mid;
      else high = mid;
    }
    return (low + high) / 2;
  }

  function cameronFactor(miles) {
    return 13.49681 - 0.048865 * miles + 2.438936 / Math.pow(miles, 0.7905);
  }

  function cameronPredict(t1, m1, m2) {
    var mi1 = m1 / 1609.344;
    var mi2 = m2 / 1609.344;
    return (t1 / mi1) * (cameronFactor(mi1) / cameronFactor(mi2)) * mi2;
  }

  function racePredictor(root) {
    var result = root.querySelector('[data-result]');
    var distanceInput = root.querySelector('[name=distance]');
    var timeInput = root.querySelector('[name=time]');

    function update() {
      var km = DISTANCES[distanceInput.value];
      var seconds = parseDuration(timeInput.value);
      if (!km || seconds === null || seconds <= 0) return;
      var metres = km * 1000;

      var targets = ['5k', '10k', 'half-marathon', 'marathon'];
      var rows = targets.map(function (key) {
        var d2 = DISTANCES[key] * 1000;
        var r = Math.round(riegel(seconds, metres, d2, 1.06));
        var v = Math.round(timeForVdot(vdotFromRace(metres, seconds), d2));
        var c = Math.round(cameronPredict(seconds, metres, d2));
        var lo = Math.min(r, v, c);
        var hi = Math.max(r, v, c);
        return [
          LABELS[key],
          formatDuration(r),
          formatDuration(v),
          formatDuration(c),
          formatDuration(hi - lo),
        ];
      });

      result.innerHTML = '';
      result.appendChild(
        el(
          'p',
          'headline',
          'From ' +
            formatDuration(seconds) +
            ' for the ' +
            LABELS[distanceInput.value] +
            ', VDOT ' +
            vdotFromRace(metres, seconds).toFixed(1) +
            '.',
        ),
      );
      result.appendChild(
        table(
          ['Distance', 'Riegel', 'VDOT', 'Cameron', 'Spread'],
          rows,
          'Three published models, and how far apart they are.',
        ),
      );
    }

    root.addEventListener('input', update);
    root.addEventListener('change', update);
  }

  /* ————— heart-rate zones ————— */

  function heartRateZones(root) {
    var result = root.querySelector('[data-result]');
    var ageInput = root.querySelector('[name=age]');
    var restInput = root.querySelector('[name=resting]');
    var maxInput = root.querySelector('[name=observed]');
    var sexInput = root.querySelector('[name=sex]');

    var BANDS = [
      ['1 — very light', 50, 60],
      ['2 — easy', 60, 70],
      ['3 — moderate', 70, 80],
      ['4 — hard', 80, 90],
      ['5 — maximum', 90, 100],
    ];

    function update() {
      var age = Number(ageInput.value);
      if (!isFinite(age) || age < 10 || age > 100) return;
      var resting = Number(restInput.value) || null;
      var observed = Number(maxInput.value) || null;
      var female = sexInput && sexInput.value === 'female';

      var estimates = [
        ['220 − age', 220 - age],
        ['Tanaka (208 − 0.7 × age)', 208 - 0.7 * age],
        ['Gellish (207 − 0.7 × age)', 207 - 0.7 * age],
        ['Nes (211 − 0.64 × age)', 211 - 0.64 * age],
      ];
      if (female) estimates.push(['Gulati, women (206 − 0.88 × age)', 206 - 0.88 * age]);

      var values = estimates.map(function (e) {
        return e[1];
      });
      var spread = Math.max.apply(null, values) - Math.min.apply(null, values);
      var max = observed || 208 - 0.7 * age;

      result.innerHTML = '';
      result.appendChild(
        el(
          'p',
          'headline',
          observed
            ? 'Using your observed max of ' + observed + ' bpm.'
            : 'No observed max entered, so these zones use Tanaka: ' +
                Math.round(208 - 0.7 * age) +
                ' bpm. The formulas below disagree by ' +
                spread.toFixed(1) +
                ' bpm at your age.',
        ),
      );
      result.appendChild(
        table(
          ['Method', 'Estimated max (bpm)'],
          estimates.map(function (e) {
            return [e[0], String(Math.round(e[1]))];
          }),
          'Five ways to guess one number.',
        ),
      );
      result.appendChild(
        table(
          ['Zone', '% of max', 'bpm'],
          BANDS.map(function (b) {
            return [
              b[0],
              b[1] + '–' + b[2] + '%',
              Math.round((b[1] / 100) * max) + '–' + Math.round((b[2] / 100) * max),
            ];
          }),
          'Percent-of-max zones — what most watches ship with.',
        ),
      );
      if (resting) {
        result.appendChild(
          table(
            ['Zone', '% of reserve', 'bpm'],
            BANDS.map(function (b) {
              return [
                b[0],
                b[1] + '–' + b[2] + '%',
                Math.round(resting + (b[1] / 100) * (max - resting)) +
                  '–' +
                  Math.round(resting + (b[2] / 100) * (max - resting)),
              ];
            }),
            'Karvonen zones, using your resting heart rate of ' + resting + ' bpm.',
          ),
        );
      }
    }

    root.addEventListener('input', update);
    root.addEventListener('change', update);
  }

  var TOOLS = {
    'pace-calculator': paceCalculator,
    'race-predictor': racePredictor,
    'heart-rate-zones': heartRateZones,
  };

  document.querySelectorAll('[data-tool]').forEach(function (root) {
    var fn = TOOLS[root.getAttribute('data-tool')];
    if (fn) fn(root);
  });

  // Exposed only so test/client-parity.test.ts can check this file against
  // apps/site/lib. Nothing on a page reads it.
  window.__plainWordsTools = {
    KM_PER_MILE: KM_PER_MILE,
    DISTANCES: DISTANCES,
    formatDuration: formatDuration,
    parseDuration: parseDuration,
    formatPace: formatPace,
    riegel: riegel,
    vdotFromRace: vdotFromRace,
    timeForVdot: timeForVdot,
    cameronPredict: cameronPredict,
  };
})();
