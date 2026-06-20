import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import { Onboarding } from '../popup/Onboarding';
import { BrandMark } from '../popup/icons';
import '../popup/style.css';

function OnboardingPage() {
  const [done, setDone] = useState(false);
  return (
    <div className="yti-ob-page">
      {done ? (
        <div className="yti-ob">
          <div className="yti-ob-body yti-scan-state">
            <BrandMark size={42} />
            <h1 style={{ margin: '8px 0 0', fontWeight: 500 }}>You're all set</h1>
            <p className="yti-ob-sub" style={{ textAlign: 'center' }}>
              Antechamber is now watching your YouTube. It'll tag videos, gate distractions, and keep learning from your
              corrections.
            </p>
            <button
              type="button"
              className="yti-btn yti-btn-primary"
              onClick={() => {
                location.href = 'https://www.youtube.com/';
              }}
            >
              Open YouTube
            </button>
          </div>
        </div>
      ) : (
        <Onboarding onDone={() => setDone(true)} />
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <OnboardingPage />
  </React.StrictMode>,
);
