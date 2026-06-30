export const EMOTIONS = {
  ENGAGED:    'engaged',
  CONFUSED:   'confused',
  FRUSTRATED: 'frustrated',
  BORED:      'bored',
};

export function getAdaptiveConfig(emotion) {
  switch (emotion) {

    case EMOTIONS.CONFUSED:
      return {
        emotion:             EMOTIONS.CONFUSED,
        label:               'Confused',
        showJeopardyBonus:   false,
        showTutorialLinks:   true,   // surface tutorial slides overlay
        encouragingMessages: false,
        petMessages: [
          "Let's break this down step by step 🔍",
          "Not sure? Check the tutorial link above!",
          "Think about what each pointer points to.",
          "Take it slow — what needs to happen first?",
          "You'll get it — trace through the logic. 💡",
        ],
        accentColor: '#3B82F6',
        accentLabel: 'Guided Mode',
      };

    case EMOTIONS.FRUSTRATED:
      return {
        emotion:             EMOTIONS.FRUSTRATED,
        label:               'Frustrated',
        showJeopardyBonus:   false,
        showTutorialLinks:   false,
        encouragingMessages: true,   // extra encouragement banners
        petMessages: [
          "Take a deep breath — you've got this! 🌟",
          "No rush, we'll figure this out together.",
          "One step at a time. You're doing great!",
          "Mistakes are how we learn. Keep going!",
          "I believe in you! Go at your own pace. 💙",
        ],
        accentColor: '#EF4444',
        accentLabel: 'Relaxed Mode',
      };

    case EMOTIONS.BORED:
      return {
        emotion:             EMOTIONS.BORED,
        label:               'Bored',
        showJeopardyBonus:   true,
        showTutorialLinks:   false,
        encouragingMessages: false,
        petMessages: [
          "Let's kick it up a notch! ⚡",
          "Too easy? Bonus challenge unlocked!",
          "Speed round — can you keep up?",
          "Push through! You've got this!",
          "Level up your game! 🚀",
        ],
        accentColor: '#F59E0B',
        accentLabel: 'Challenge Mode',
      };

    default: // EMOTIONS.ENGAGED
      return {
        emotion:             EMOTIONS.ENGAGED,
        label:               'Engaged',
        showJeopardyBonus:   false,
        showTutorialLinks:   false,
        encouragingMessages: false,
        petMessages: [
          "You're in the zone! Keep it up! ✨",
          "Solid work — keep the momentum going.",
          "Nice! That's exactly right.",
          "Perfect pointer logic! 🎯",
          "You're getting really good at this!",
        ],
        accentColor: '#7C3AED',
        accentLabel: 'Normal Mode',
      };
  }
}

export function getRandomPetMessage(config) {
  const msgs = config?.petMessages ?? [];
  if (!msgs.length) return '';
  return msgs[Math.floor(Math.random() * msgs.length)];
}
