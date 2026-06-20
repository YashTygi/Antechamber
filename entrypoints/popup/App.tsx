import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import type { UserProfile } from '@/lib/types';
import { profileItem } from '@/lib/storage';
import { Dashboard } from './Dashboard';
import { BrandMark } from './icons';

function openOnboarding() {
  void browser.tabs.create({ url: browser.runtime.getURL('/onboarding.html') });
  window.close();
}

function App() {
  // undefined = still loading, null = not onboarded yet
  const [profile, setProfile] = useState<UserProfile | null | undefined>(undefined);

  useEffect(() => {
    profileItem.getValue().then(setProfile);
    const unwatch = profileItem.watch(setProfile);
    return () => unwatch();
  }, []);

  if (profile === undefined) {
    return (
      <div className="yti-pop">
        <div className="yti-splash">
          <BrandMark size={40} />
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="yti-pop">
        <div className="yti-setup">
          <BrandMark size={40} />
          <div className="yti-setup-title">Let’s set up Antechamber</div>
          <div className="yti-setup-sub">A quick setup reads your homepage and learns what you care about.</div>
          <button type="button" className="yti-btn yti-btn-primary" onClick={openOnboarding}>
            Start setup
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="yti-pop">
      <Dashboard profile={profile} onReset={() => setProfile(null)} />
    </div>
  );
}

export default App;
