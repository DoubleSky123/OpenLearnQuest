import React, { Component, Suspense, lazy, useState, useCallback } from 'react';
import { useAuth } from './contexts/AuthContext';
import { useEmotion } from './contexts/EmotionContext';
import { progressApi, emotionApi, authApi } from './services/api';
import { EMOTIONS } from './services/adaptiveEngine';

import AuthPage from './components/AuthPage';
import ModuleSelector from './components/ModuleSelector';
import ModuleWelcomePage from './components/ModuleWelcomePage';
import TutorialIntroPage from './components/TutorialIntroPage';
import ModeSelector from './components/ModeSelector';
import OperationSkillTree from './components/OperationSkillTree';
import DailyChallenge from './components/DailyChallenge';
import MistakeBook from './components/MistakeBook';
import Leaderboard from './components/Leaderboard';
import EmotionCheckIn from './components/EmotionCheckIn';
import AgenticSession from './components/AgenticSession';
import AdminDashboard from './components/AdminDashboard';
import { hasWebGL } from './city/webgl';

// Home is the student's 3D city (three.js loads only here, after login).
const CityHome = lazy(() => import('./city/CityHome'));

// If the city can't load (chunk or GL failure), home falls back to the module menu.
class CityBoundary extends Component {
  constructor(props) { super(props); this.state = { failed: false }; }
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFail(); }
  render() { return this.state.failed ? null : this.props.children; }
}

function CityLoading() {
  return (
    <div className="min-h-screen bg-sky-100 flex items-center justify-center">
      <div className="text-sky-900 text-lg font-medium">Loading your city…</div>
    </div>
  );
}

export default function App() {
  const { user, loading, logout, updateXP, patchUser } = useAuth();
  const { setEmotion } = useEmotion();

  const [screen,            setScreen]            = useState('menu');
  const [moduleId,          setModuleId]          = useState('singly');
  const [gameMode,          setGameMode]          = useState('stress-free');
  const [chosenOperation,   setChosenOperation]   = useState(null);
  const [cityOk,            setCityOk]            = useState(hasWebGL);
  const [mistakesBack,      setMistakesBack]      = useState('path');

  const openMistakes = (from) => { setMistakesBack(from); setScreen('mistake-book'); };

  const handleXpGained = useCallback(async (amount) => {
    try {
      const res = await progressApi.addXP(amount);
      updateXP(res.xp);
    } catch { /* best-effort */ }
  }, [updateXP]);

  // Onboarding persistence — stored in the user record (backend), not localStorage
  const isOnboardingDone = (mod) => mod === 'singly' ? !!user?.onboarding_singly_done : false;
  const markOnboardingDone = useCallback((mod) => {
    authApi.completeOnboarding(mod).catch(() => {}); // best-effort, UI state already updated
  }, []);

  const handlePostEmotion = (emotion) => {
    if (emotion) {
      setEmotion(emotion, 'self-report');
      emotionApi.logSelfReport({ emotion }).catch(() => {});
    }
    setScreen('path');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-900 to-purple-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading…</div>
      </div>
    );
  }

  if (!user) return <AuthPage />;
  if (user.is_admin) return <AdminDashboard onBack={logout} />;

  // ── Screens ──────────────────────────────────────────────────────────────────

  // Module welcome + beginner/experienced gate
  if (screen === 'module-welcome')
    return (
      <ModuleWelcomePage
        onBeginner={() => setScreen('tutorial-intro')}
        onExperienced={() => {
          patchUser({ onboarding_singly_done: true });
          markOnboardingDone(moduleId);
          setScreen('path');
        }}
        onBack={() => setScreen('school')}
      />
    );

  // Tutorial slides (beginner path — egg reveal is at the end of TutorialIntroPage)
  if (screen === 'tutorial-intro')
    return (
      <TutorialIntroPage
        xp={user.xp}
        onBack={() => setScreen('module-welcome')}
        onComplete={() => {
          patchUser({ onboarding_singly_done: true });
          markOnboardingDone(moduleId);
          setScreen('path');
        }}
      />
    );

  // Post-session emotion check-in
  if (screen === 'emotion-post')
    return (
      <EmotionCheckIn
        onConfirm={handlePostEmotion}
        onSkip={() => handlePostEmotion(null)}
      />
    );

  if (screen === 'mistake-book')
    return <MistakeBook onBack={() => setScreen(mistakesBack)} />;

  if (screen === 'leaderboard')
    return <Leaderboard onBack={() => setScreen('path')} />;

  if (screen === 'daily-challenge')
    return <DailyChallenge xp={user.xp} onBack={() => setScreen('path')} />;

  // Operation skill tree (choose operation + mode)
  if (screen === 'path')
    return (
      <OperationSkillTree
        moduleId={moduleId}
        xp={user.xp}
        onStart={(mode, operation) => {
          setGameMode(mode);
          setChosenOperation(operation);
          setScreen('session');
        }}
        onBack={() => setScreen('school')}
        onDailyChallenge={moduleId === 'singly' ? () => setScreen('daily-challenge') : undefined}
        onMistakeBook={() => openMistakes('path')}
        onLeaderboard={() => setScreen('leaderboard')}
      />
    );

  // AI-driven game session
  if (screen === 'session')
    return (
      <AgenticSession
        moduleId={moduleId}
        xp={user.xp}
        mode={gameMode}
        operation={chosenOperation}
        onBack={() => setScreen('path')}
        onXpGained={handleXpGained}
        onComplete={() => setScreen('emotion-post')}
      />
    );

  // The school: the module menu, i.e. the original learning flow
  const school = (
    <ModuleSelector
      xp={user.xp}
      username={user.username}
      onSelect={(mod) => { setModuleId(mod); setScreen(isOnboardingDone(mod) ? 'path' : 'module-welcome'); }}
      onMistakeBook={() => openMistakes(cityOk ? 'school' : 'menu')}
      onLogout={logout}
      onBack={cityOk ? () => setScreen('menu') : undefined}
    />
  );
  if (screen === 'school' || !cityOk) return school;

  // Default: home, the student's city
  return (
    <CityBoundary onFail={() => setCityOk(false)}>
      <Suspense fallback={<CityLoading />}>
        <CityHome
          username={user.username}
          xp={user.xp}
          onEnterSchool={() => setScreen('school')}
          onMistakeBook={() => openMistakes('menu')}
          onLogout={logout}
          onFail={() => setCityOk(false)}
        />
      </Suspense>
    </CityBoundary>
  );
}
