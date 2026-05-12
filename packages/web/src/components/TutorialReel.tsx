import React, { useState } from 'react';

export function TutorialReel() {
  const [reelKey, setReelKey] = useState(0);
  const [paused, setPaused] = useState(false);
  const playState = paused ? 'paused' : 'running';

  return (
    <section
      key={reelKey}
      className="tutorial-reel"
      dir="rtl"
      aria-label={'\u0634\u0631\u062d \u0633\u0631\u064a\u0639 \u0644\u0637\u0631\u064a\u0642\u0629 \u0627\u0644\u0644\u0639\u0628'}
      style={{ '--tutorial-play-state': playState } as React.CSSProperties}
    >
      <p className="sr-only">
        &#x627;&#x62f;&#x62e;&#x644; &#x627;&#x644;&#x643;&#x648;&#x62f;&#x60c; &#x627;&#x62e;&#x62a;&#x631; &#x627;&#x644;&#x62a;&#x635;&#x646;&#x64a;&#x641;&#x60c; &#x627;&#x643;&#x62a;&#x628; &#x625;&#x62c;&#x627;&#x628;&#x629; &#x645;&#x62e;&#x627;&#x62f;&#x639;&#x629;&#x60c; &#x635;&#x648;&#x651;&#x62a; &#x644;&#x644;&#x635;&#x62d;&#x64a;&#x62d;&#x60c; &#x648;&#x627;&#x643;&#x633;&#x628; &#x627;&#x644;&#x646;&#x642;&#x627;&#x637;.
      </p>
      <div className="tutorial-stage" aria-hidden="true">
        <div className="tutorial-progress" />

        <div className="tutorial-scene tutorial-scene-1">
          <div className="tutorial-game-snapshot tutorial-tv-lobby-snapshot">
            <div className="tutorial-mini-panel tutorial-mini-join">
              <h4>&#x627;&#x646;&#x636;&#x645; &#x644;&#x644;&#x639;&#x628;&#x629;</h4>
              <div className="tutorial-mini-qr">
                <span />
                <span />
                <span />
                <span />
                <span />
                <span />
              </div>
              <p>&#x627;&#x645;&#x633;&#x62d; &#x627;&#x644;&#x643;&#x648;&#x62f; &#x644;&#x644;&#x627;&#x646;&#x636;&#x645;&#x627;&#x645;</p>
              <strong>FQSH42</strong>
            </div>
            <div className="tutorial-mini-panel tutorial-mini-players">
              <div className="tutorial-mini-panel-head">
                <h4>&#x627;&#x644;&#x644;&#x627;&#x639;&#x628;&#x64a;&#x646;</h4>
                <b>4 / 10</b>
              </div>
              <div className="tutorial-mini-player-row">
                <span className="tutorial-mini-avatar tutorial-mini-avatar-1">1</span>
                <span>&#x646;&#x648;&#x631;&#x627;</span>
                <i />
              </div>
              <div className="tutorial-mini-player-row">
                <span className="tutorial-mini-avatar tutorial-mini-avatar-2">2</span>
                <span>&#x633;&#x627;&#x644;&#x645;</span>
                <i />
              </div>
              <div className="tutorial-mini-player-row">
                <span className="tutorial-mini-avatar tutorial-mini-avatar-3">3</span>
                <span>&#x644;&#x64a;&#x627;&#x646;</span>
                <i />
              </div>
              <div className="tutorial-mini-player-row">
                <span className="tutorial-mini-avatar tutorial-mini-avatar-4">4</span>
                <span>&#x639;&#x645;&#x631;</span>
                <i />
              </div>
            </div>
          </div>
        </div>

        <div className="tutorial-scene tutorial-scene-2">
          <div className="tutorial-game-snapshot tutorial-category-snapshot">
            <div className="tutorial-mini-phone-screen">
              <p className="tutorial-mini-eyebrow">&#x627;&#x62e;&#x62a;&#x64a;&#x627;&#x631; &#x627;&#x644;&#x641;&#x626;&#x629; - &#x627;&#x644;&#x62c;&#x648;&#x644;&#x629; 1/3</p>
              <h4>&#x627;&#x62e;&#x62a;&#x631; &#x641;&#x626;&#x629; &#x627;&#x644;&#x633;&#x624;&#x627;&#x644;</h4>
              <p className="tutorial-mini-muted">&#x64a;&#x646;&#x62a;&#x647;&#x64a; &#x627;&#x644;&#x627;&#x62e;&#x62a;&#x64a;&#x627;&#x631; &#x62a;&#x644;&#x642;&#x627;&#x626;&#x64a;&#x627;&#x64b; &#x62e;&#x644;&#x627;&#x644; 12 &#x62b;&#x648;&#x627;&#x646;&#x64d;</p>
              <button className="tutorial-mini-category is-selected">&#x631;&#x64a;&#x627;&#x636;&#x629;</button>
              <button className="tutorial-mini-category">&#x623;&#x641;&#x644;&#x627;&#x645;</button>
              <button className="tutorial-mini-category">&#x639;&#x644;&#x648;&#x645;</button>
              <button className="tutorial-mini-primary">&#x645;&#x62a;&#x627;&#x628;&#x639;&#x629;</button>
            </div>
          </div>
        </div>

        <div className="tutorial-scene tutorial-scene-3">
          <div className="tutorial-game-snapshot tutorial-answering-snapshot">
            <div className="tutorial-mini-tv">
              <div className="tutorial-mini-tv-head">
                <span>&#x627;&#x644;&#x62c;&#x648;&#x644;&#x629; 1 / 3 &#x2022; &#x633;&#x624;&#x627;&#x644; 1 / 3</span>
                <b>&#x643;&#x648;&#x62f;: FQSH42</b>
              </div>
              <div className="tutorial-mini-timer"><span /></div>
              <p className="tutorial-mini-instruction">&#x1f3ad; &#x627;&#x643;&#x62a;&#x628; &#x643;&#x630;&#x628;&#x629; &#x645;&#x642;&#x646;&#x639;&#x629;!</p>
              <div className="tutorial-mini-question">&#x645;&#x627; &#x627;&#x633;&#x645; &#x627;&#x644;&#x645;&#x62f;&#x64a;&#x646;&#x629; &#x627;&#x644;&#x62a;&#x64a; &#x628;&#x646;&#x64a;&#x62a; &#x62a;&#x62d;&#x62a; &#x627;&#x644;&#x623;&#x631;&#x636;&#x61f;</div>
            </div>
            <div className="tutorial-mini-player-card">
              <div className="tutorial-mini-stage-pill">&#x627;&#x644;&#x62c;&#x648;&#x644;&#x629; 1 / 3 &#x2022; &#x633;&#x624;&#x627;&#x644; 1 / 3</div>
              <div className="tutorial-mini-input">&#x627;&#x643;&#x62a;&#x628; &#x643;&#x630;&#x628;&#x62a;&#x643;...</div>
              <button className="tutorial-mini-primary">&#x625;&#x631;&#x633;&#x627;&#x644;</button>
            </div>
          </div>
        </div>

        <div className="tutorial-scene tutorial-scene-4">
          <div className="tutorial-game-snapshot tutorial-voting-snapshot">
            <div className="tutorial-mini-tv">
              <div className="tutorial-mini-tv-head">
                <span>&#x627;&#x644;&#x62c;&#x648;&#x644;&#x629; 1 / 3 &#x2022; &#x633;&#x624;&#x627;&#x644; 1 / 3</span>
                <b>&#x643;&#x648;&#x62f;: FQSH42</b>
              </div>
              <div className="tutorial-mini-timer"><span className="is-voting" /></div>
              <p className="tutorial-mini-instruction is-cyan">&#x1f5f3;&#xfe0f; &#x635;&#x648;&#x651;&#x62a; &#x644;&#x644;&#x625;&#x62c;&#x627;&#x628;&#x629; &#x627;&#x644;&#x635;&#x62d;&#x64a;&#x62d;&#x629;!</p>
              <div className="tutorial-mini-answer-grid">
                <span>&#x627;&#x644;&#x642;&#x645;&#x631; &#x627;&#x644;&#x623;&#x632;&#x631;&#x642;</span>
                <span>&#x646;&#x647;&#x631; &#x642;&#x62f;&#x64a;&#x645;</span>
                <span>&#x645;&#x62f;&#x64a;&#x646;&#x629; &#x645;&#x62e;&#x641;&#x64a;&#x629;</span>
                <span>&#x627;&#x644;&#x628;&#x64a;&#x62a; &#x627;&#x644;&#x623;&#x628;&#x64a;&#x636;</span>
              </div>
            </div>
            <div className="tutorial-mini-player-card">
              <p className="tutorial-mini-muted">&#x627;&#x62e;&#x62a;&#x631; &#x627;&#x644;&#x625;&#x62c;&#x627;&#x628;&#x629; &#x627;&#x644;&#x635;&#x62d;&#x64a;&#x62d;&#x629;</p>
              <button className="tutorial-mini-vote-option">&#x627;&#x644;&#x642;&#x645;&#x631; &#x627;&#x644;&#x623;&#x632;&#x631;&#x642;</button>
              <button className="tutorial-mini-vote-option is-selected">&#x646;&#x647;&#x631; &#x642;&#x62f;&#x64a;&#x645;</button>
              <button className="tutorial-mini-vote-option">&#x645;&#x62f;&#x64a;&#x646;&#x629; &#x645;&#x62e;&#x641;&#x64a;&#x629;</button>
            </div>
          </div>
        </div>

        <div className="tutorial-scene tutorial-scene-5">
          <div className="tutorial-game-snapshot tutorial-results-snapshot">
            <div className="tutorial-mini-reveal-card">
              <h4>&#x646;&#x647;&#x631; &#x642;&#x62f;&#x64a;&#x645;</h4>
              <p>&#x2705; &#x627;&#x644;&#x625;&#x62c;&#x627;&#x628;&#x629; &#x627;&#x644;&#x635;&#x62d;&#x64a;&#x62d;&#x629;!</p>
            </div>
            <div className="tutorial-mini-scoreboard">
              <h4>&#x1f3c6; &#x644;&#x648;&#x62d;&#x629; &#x627;&#x644;&#x645;&#x62a;&#x635;&#x62f;&#x631;&#x64a;&#x646;</h4>
              <div><span>1 &#x646;&#x648;&#x631;&#x627;</span><b>2500 &#x646;&#x642;&#x637;&#x629;</b></div>
              <div><span>2 &#x633;&#x627;&#x644;&#x645;</span><b>1500 &#x646;&#x642;&#x637;&#x629;</b></div>
              <div><span>3 &#x644;&#x64a;&#x627;&#x646;</span><b>500 &#x646;&#x642;&#x637;&#x629;</b></div>
            </div>
          </div>
        </div>
      </div>

      <div className="tutorial-copy">
        <div className="tutorial-copy-track" aria-hidden="true">
          <div className="tutorial-copy-item tutorial-copy-1">
            <h3>&#x627;&#x62f;&#x62e;&#x644; &#x627;&#x644;&#x643;&#x648;&#x62f;</h3>
            <p>&#x627;&#x645;&#x633;&#x62d; QR &#x623;&#x648; &#x627;&#x643;&#x62a;&#x628; &#x627;&#x644;&#x643;&#x648;&#x62f;. &#x643;&#x644; &#x644;&#x627;&#x639;&#x628; &#x64a;&#x62f;&#x62e;&#x644; &#x645;&#x646; &#x62c;&#x648;&#x627;&#x644;&#x647;&#x60c; &#x648;&#x627;&#x644;&#x62a;&#x644;&#x641;&#x632;&#x64a;&#x648;&#x646; &#x64a;&#x628;&#x642;&#x649; &#x644;&#x644;&#x639;&#x631;&#x636;.</p>
          </div>
          <div className="tutorial-copy-item tutorial-copy-2">
            <h3>&#x627;&#x62e;&#x62a;&#x631; &#x627;&#x644;&#x62a;&#x635;&#x646;&#x64a;&#x641;</h3>
            <p>&#x641;&#x64a; &#x628;&#x62f;&#x627;&#x64a;&#x629; &#x627;&#x644;&#x62c;&#x648;&#x644;&#x629; &#x64a;&#x62e;&#x62a;&#x627;&#x631; &#x627;&#x644;&#x645;&#x62a;&#x62d;&#x643;&#x645; &#x627;&#x644;&#x62a;&#x635;&#x646;&#x64a;&#x641;&#x60c; &#x62b;&#x645; &#x62a;&#x638;&#x647;&#x631; &#x627;&#x644;&#x623;&#x633;&#x626;&#x644;&#x629; &#x644;&#x644;&#x62c;&#x645;&#x64a;&#x639;.</p>
          </div>
          <div className="tutorial-copy-item tutorial-copy-3">
            <h3>&#x627;&#x643;&#x62a;&#x628; &#x625;&#x62c;&#x627;&#x628;&#x629; &#x645;&#x62e;&#x627;&#x62f;&#x639;&#x629;</h3>
            <p>&#x644;&#x627; &#x62a;&#x643;&#x62a;&#x628; &#x627;&#x644;&#x635;&#x62d;&#x64a;&#x62d;. &#x627;&#x643;&#x62a;&#x628; &#x62c;&#x648;&#x627;&#x628;&#x627; &#x64a;&#x628;&#x62f;&#x648; &#x645;&#x642;&#x646;&#x639;&#x627; &#x62d;&#x62a;&#x649; &#x64a;&#x635;&#x648;&#x62a; &#x644;&#x647; &#x627;&#x644;&#x622;&#x62e;&#x631;&#x648;&#x646;.</p>
          </div>
          <div className="tutorial-copy-item tutorial-copy-4">
            <h3>&#x635;&#x648;&#x651;&#x62a; &#x644;&#x644;&#x62c;&#x648;&#x627;&#x628; &#x627;&#x644;&#x635;&#x62d;&#x64a;&#x62d;</h3>
            <p>&#x627;&#x642;&#x631;&#x623; &#x643;&#x644; &#x627;&#x644;&#x625;&#x62c;&#x627;&#x628;&#x627;&#x62a; &#x648;&#x627;&#x62e;&#x62a;&#x631; &#x645;&#x627; &#x62a;&#x639;&#x62a;&#x642;&#x62f; &#x623;&#x646;&#x647; &#x627;&#x644;&#x635;&#x62d;&#x64a;&#x62d;. &#x644;&#x627; &#x64a;&#x645;&#x643;&#x646;&#x643; &#x627;&#x644;&#x62a;&#x635;&#x648;&#x64a;&#x62a; &#x644;&#x625;&#x62c;&#x627;&#x628;&#x62a;&#x643;.</p>
          </div>
          <div className="tutorial-copy-item tutorial-copy-5">
            <h3>&#x627;&#x644;&#x646;&#x642;&#x627;&#x637; &#x62a;&#x643;&#x634;&#x641; &#x627;&#x644;&#x62e;&#x62f;&#x639;&#x629;</h3>
            <p>&#x62a;&#x631;&#x628;&#x62d; &#x646;&#x642;&#x627;&#x637;&#x627; &#x639;&#x646;&#x62f;&#x645;&#x627; &#x62a;&#x62e;&#x645;&#x646; &#x627;&#x644;&#x635;&#x62d;&#x64a;&#x62d; &#x623;&#x648; &#x639;&#x646;&#x62f;&#x645;&#x627; &#x64a;&#x646;&#x62e;&#x62f;&#x639; &#x644;&#x627;&#x639;&#x628;&#x648;&#x646; &#x628;&#x625;&#x62c;&#x627;&#x628;&#x62a;&#x643;.</p>
          </div>
        </div>

        <div className="tutorial-controls">
          <button
            type="button"
            className="tutorial-control"
            onClick={() => {
              setReelKey((value) => value + 1);
              setPaused(false);
            }}
          >
            <span aria-hidden="true">&#8635;</span>
            <span>&#x625;&#x639;&#x627;&#x62f;&#x629;</span>
          </button>
          <button
            type="button"
            className="tutorial-control"
            onClick={() => setPaused((value) => !value)}
          >
            <span aria-hidden="true">{paused ? <>&#9654;</> : <>||</>}</span>
            <span>{paused ? <>&#x62a;&#x634;&#x63a;&#x64a;&#x644;</> : <>&#x625;&#x64a;&#x642;&#x627;&#x641;</>}</span>
          </button>
        </div>
      </div>
    </section>
  );
}
